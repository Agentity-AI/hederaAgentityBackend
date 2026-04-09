const express = require("express");
const router = express.Router();

const Agent = require("../models/agent");
const AgentWallet = require("../models/agentWallet");
const TaskExecution = require("../models/taskExecution");
const SimulationRun = require("../models/simulationRun");
const PaymentRecord = require("../models/paymentRecord");
const { requireAuth } = require("../middleware/auth");
const { simulateAgent } = require("../services/sandbox/sandboxService");
const {
  createPaymentQuote,
  executeHederaPayment,
} = require("../services/hedera/paymentService");
const { signPayloadWithKms } = require("../services/aws/kmsService");
const { executeWithCRE } = require("../services/cre/creService");
const { logEvent } = require("../services/audit/logEvent");
const { createAlert } = require("../services/alerts/alertService");
const { buildSimulationAlert } = require("../services/alerts/alertUtils");
const { createTransactionRecord } = require("../services/transactions/transactionService");
const {
  ValidationError,
  optionalObject,
  requireString,
  requireUuid,
} = require("../utils/validation");

/**
 * @openapi
 * tags:
 *   - name: Tasks
 *     description: Hedera-native AI agent task coordination and execution lifecycle
 */

/**
 * @openapi
 * /tasks/request:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a new task request for an agent
 *     description: |
 *       Creates a task owned by the authenticated user.
 *       This is the first step in the task lifecycle:
 *       `request -> simulate -> pay -> execute`.
 *
 *       Frontend testing note:
 *       - use the returned `id` for the remaining `/simulate`, `/pay`, and `/execute` endpoints
 *       - `agentId` must belong to the authenticated user
 *       - for the current frontend, `taskType` should reflect the user action being requested,
 *         such as `execution`, `swap`, or another workflow-specific label
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentId, taskType]
 *             properties:
 *               agentId:
 *                 type: string
 *               taskType:
 *                 type: string
 *                 example: "execution"
 *               inputPayload:
 *                 type: object
 *                 additionalProperties: true
 *                 example:
 *                   target: "swap"
 *                   network: "hedera-testnet"
 *                   maxSlippageBps: 100
 *           examples:
 *             frontendTaskPayload:
 *               summary: Recommended task creation payload
 *               value:
 *                 agentId: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *                 taskType: "execution"
 *                 inputPayload:
 *                   target: "swap"
 *                   network: "hedera-testnet"
 *                   maxSlippageBps: 100
 *     responses:
 *       201:
 *         description: Task created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "9e75f7fd-fd1c-4b6d-91ab-3ecdb9d8d222"
 *                 agentId:
 *                   type: string
 *                   example: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *                 taskType:
 *                   type: string
 *                   example: "execution"
 *                 status:
 *                   type: string
 *                   example: "requested"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Missing required request fields
 *       401:
 *         description: Missing or invalid authentication token
 *       404:
 *         description: Agent not found for the authenticated user
 */
router.post("/request", requireAuth, async (req, res, next) => {
  try {
    const agentId = requireUuid(req.body?.agentId, "agentId");
    const taskType = requireString(req.body?.taskType, "taskType", {
      min: 2,
      max: 80,
    });
    const inputPayload = optionalObject(req.body?.inputPayload, "inputPayload") || {};

    const agent = await Agent.findOne({
      where: {
        id: agentId,
        creator_id: req.user.id,
      },
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const task = await TaskExecution.create({
      requester_user_id: req.user.id,
      agent_id: agent.id,
      task_type: taskType,
      input_payload: inputPayload || {},
      status: "requested",
    });

    await logEvent(req, {
      action: "task_request",
      agentId: agent.id,
      payload: {
        taskId: task.id,
        taskType,
      },
    });

    return res.status(201).json({
      id: task.id,
      agentId: task.agent_id,
      taskType: task.task_type,
      status: task.status,
      createdAt: task.created_at,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

/**
 * @openapi
 * /tasks/{id}/simulate:
 *   post:
 *     tags: [Tasks]
 *     summary: Simulate a task before execution
 *     description: |
 *       Runs a sandbox simulation for the selected task and stores the resulting
 *       risk metrics on the task record.
 *
 *       This endpoint may also create an alert when the simulation outcome crosses
 *       a risk threshold defined by the alert utilities.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Task simulated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 simulationRunId:
 *                   type: string
 *                 riskScore:
 *                   type: number
 *                   example: 35
 *                 vulnerabilitiesCount:
 *                   type: integer
 *                   example: 1
 *                 status:
 *                   type: string
 *                   example: "simulated"
 *                 result:
 *                   type: object
 *                   additionalProperties: true
 *       401:
 *         description: Missing or invalid authentication token
 *       404:
 *         description: Task or agent not found
 *       500:
 *         description: Simulation failed
 */
router.post("/:id/simulate", requireAuth, async (req, res, next) => {
  try {
    const task = await TaskExecution.findOne({
      where: {
        id: req.params.id,
        requester_user_id: req.user.id,
      },
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    const agent = await Agent.findOne({
      where: {
        id: task.agent_id,
        creator_id: req.user.id,
      },
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const sandboxResult = await simulateAgent(agent.id);

    const riskScore =
      typeof sandboxResult?.riskScore === "number"
        ? sandboxResult.riskScore
        : typeof sandboxResult?.risk_score === "number"
          ? sandboxResult.risk_score
          : Math.floor(Math.random() * 60) + 20;

    const vulnerabilitiesCount = Array.isArray(sandboxResult?.findings)
      ? sandboxResult.findings.length
      : sandboxResult?.vulnerabilities_count || (riskScore >= 40 ? 1 : 0);

    const simulation = await SimulationRun.create({
      user_id: req.user.id,
      agent_id: agent.id,
      scenario_type: task.task_type,
      risk_score: riskScore,
      vulnerabilities_count: vulnerabilitiesCount,
      status: "completed",
      result_payload: sandboxResult,
    });

    await task.update({
      simulation_run_id: simulation.id,
      status: "simulated",
      result_payload: {
        parameters: task.input_payload || {},
        simulation: sandboxResult,
      },
    });

    const alertPayload = buildSimulationAlert({
      riskScore,
      vulnerabilitiesCount,
    });

    if (alertPayload) {
      await createAlert({
        userId: req.user.id,
        agentId: agent.id,
        sourceId: simulation.id,
        sourceType: "simulation_run",
        metadata: {
          taskId: task.id,
          riskScore,
          vulnerabilitiesCount,
        },
        ...alertPayload,
      });
    }

    await logEvent(req, {
      action: "task_simulate",
      agentId: agent.id,
      payload: {
        taskId: task.id,
        simulationRunId: simulation.id,
        riskScore,
      },
    });

    return res.json({
      taskId: task.id,
      simulationRunId: simulation.id,
      riskScore,
      vulnerabilitiesCount,
      status: "simulated",
      result: sandboxResult,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /tasks/{id}/pay:
 *   post:
 *     tags: [Tasks]
 *     summary: Create and settle Hedera payment for a task
 *     description: |
 *       Creates a payment quote, attempts settlement, updates the task status,
 *       and writes a transaction record for downstream reporting.
 *
 *       Frontend testing note:
 *       - call this after simulation has completed
 *       - if Hedera is not configured, the backend may still mark the flow as simulated
 *       - payment failures can trigger alert creation
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Task paid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 paymentId:
 *                   type: string
 *                 amountHbar:
 *                   type: number
 *                   example: 0.5
 *                 hederaTxId:
 *                   nullable: true
 *                   type: string
 *                   example: "0.0.5001@1710000000.000000001"
 *                 simulated:
 *                   type: boolean
 *                   example: true
 *                 status:
 *                   type: string
 *                   example: "paid"
 *       401:
 *         description: Missing or invalid authentication token
 *       404:
 *         description: Task not found
 *       500:
 *         description: Payment or transaction persistence failed
 */
router.post("/:id/pay", requireAuth, async (req, res, next) => {
  try {
    const task = await TaskExecution.findOne({
      where: {
        id: req.params.id,
        requester_user_id: req.user.id,
      },
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.status !== "simulated") {
      return res.status(400).json({
        message: "Task must be simulated before payment",
      });
    }

    try {
      const quote = await createPaymentQuote({
        fromUserId: req.user.id,
        toAgentId: task.agent_id,
        taskExecutionId: task.id,
        taskType: task.task_type,
        metadata: {
          taskId: task.id,
        },
      });

      const result = await executeHederaPayment(quote);

      await task.update({
        payment_record_id: result.payment.id,
        status: "paid",
      });

      await createTransactionRecord({
        userId: req.user.id,
        agentId: task.agent_id,
        taskExecutionId: task.id,
        paymentRecordId: result.payment.id,
        transactionType: "payment",
        amount: result.payment.amount_hbar,
        status: result.payment.status,
        riskRating: result.simulated ? "medium" : "low",
        txHash: result.txId,
        validationSummary: {
          paymentReference: result.payment.payment_reference,
          simulated: result.simulated,
        },
        executionTrace: {
          paymentRecordId: result.payment.id,
          hederaTxId: result.txId,
        },
        metadata: {
          taskType: task.task_type,
        },
      });

      await logEvent(req, {
        action: "task_pay",
        agentId: task.agent_id,
        payload: {
          taskId: task.id,
          paymentId: result.payment.id,
          txId: result.txId,
          simulated: result.simulated,
        },
      });

      return res.json({
        taskId: task.id,
        paymentId: result.payment.id,
        amountHbar: Number(result.payment.amount_hbar),
        hederaTxId: result.txId,
        simulated: result.simulated,
        status: "paid",
      });
    } catch (paymentError) {
      await createAlert({
        userId: req.user.id,
        agentId: task.agent_id,
        sourceId: task.id,
        sourceType: "task_execution",
        title: "Task payment failed",
        severity: "high",
        type: "payment_failure",
        message: paymentError.message,
        metadata: {
          taskId: task.id,
          taskType: task.task_type,
        },
      });

      throw paymentError;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /tasks/{id}/execute:
 *   post:
 *     tags: [Tasks]
 *     summary: Execute a paid task through CRE and optional KMS audit
 *     description: |
 *       Executes a task after simulation and payment.
 *       The backend:
 *       - loads the related simulation result
 *       - calls the CRE execution service
 *       - signs the execution payload with KMS when a key is linked
 *       - stores a transaction record
 *       - raises a critical alert if execution fails
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Task executed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 taskId:
 *                   type: string
 *                 agentId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "completed"
 *                 execution:
 *                   type: object
 *                   additionalProperties: true
 *                 kms:
 *                   type: object
 *                   properties:
 *                     signature:
 *                       nullable: true
 *                       type: string
 *                     digest:
 *                       type: string
 *                     simulated:
 *                       type: boolean
 *                     auditId:
 *                       type: string
 *       400:
 *         description: Task is not yet eligible for execution
 *       401:
 *         description: Missing or invalid authentication token
 *       404:
 *         description: Task or agent not found
 *       500:
 *         description: CRE execution or KMS signing failed
 */
router.post("/:id/execute", requireAuth, async (req, res, next) => {
  try {
    const task = await TaskExecution.findOne({
      where: {
        id: req.params.id,
        requester_user_id: req.user.id,
      },
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (task.status !== "paid") {
      return res.status(400).json({
        message: "Task must be paid before execution",
      });
    }

    const agent = await Agent.findOne({
      where: {
        id: task.agent_id,
        creator_id: req.user.id,
      },
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const wallet = await AgentWallet.findOne({
      where: { agent_id: agent.id, status: "linked" },
    });

    await task.update({ status: "executing" });

    const simulationResult = task.simulation_run_id
      ? await SimulationRun.findByPk(task.simulation_run_id)
      : null;

    try {
      const executionResult = await executeWithCRE(
        agent,
        simulationResult?.result_payload || {},
      );

      const kmsResult = await signPayloadWithKms({
        userId: req.user.id,
        agentId: agent.id,
        kmsKeyId: wallet?.kms_key_id || null,
        payload: {
          taskId: task.id,
          agentId: agent.id,
          executionResult,
        },
      });

      await task.update({
        status: "completed",
        result_payload: {
          ...(task.result_payload || {}),
          execution: executionResult,
          kms: kmsResult,
        },
      });

      await createTransactionRecord({
        userId: req.user.id,
        agentId: agent.id,
        taskExecutionId: task.id,
        paymentRecordId: task.payment_record_id,
        transactionType: "execution",
        status: "completed",
        riskRating:
          simulationResult?.risk_score >= 70
            ? "high"
            : simulationResult?.risk_score >= 40
              ? "medium"
              : "low",
        txHash: executionResult?.txHash || executionResult?.transactionHash || null,
        validationSummary: {
          kmsAuditId: kmsResult.auditId,
          fallback: executionResult?.fallback || false,
        },
        executionTrace: executionResult,
        metadata: {
          taskType: task.task_type,
        },
      });

      await logEvent(req, {
        action: "task_execute",
        agentId: agent.id,
        payload: {
          taskId: task.id,
          kmsAuditId: kmsResult.auditId,
        },
      });

      return res.json({
        taskId: task.id,
        agentId: agent.id,
        status: "completed",
        execution: executionResult,
        kms: kmsResult,
      });
    } catch (executionError) {
      await task.update({ status: "failed" });

      await createAlert({
        userId: req.user.id,
        agentId: agent.id,
        sourceId: task.id,
        sourceType: "task_execution",
        title: "Task execution failed",
        severity: "critical",
        type: "execution_failure",
        message: executionError.message,
        metadata: {
          taskId: task.id,
          taskType: task.task_type,
        },
      });

      throw executionError;
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

/**
 * @openapi
 * /tasks/history:
 *   get:
 *     tags: [Tasks]
 *     summary: Get task history for authenticated user
 *     description: |
 *       Returns task execution history for the logged-in user in a normalized frontend-friendly shape.
 *       Use this endpoint for tables, activity feeds, and task lifecycle dashboards.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Task history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "9e75f7fd-fd1c-4b6d-91ab-3ecdb9d8d222"
 *                       agentId:
 *                         type: string
 *                         example: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *                       agentName:
 *                         nullable: true
 *                         type: string
 *                         example: "Treasury Risk Monitor"
 *                       taskType:
 *                         type: string
 *                         example: "execution"
 *                       status:
 *                         type: string
 *                         example: "completed"
 *                       payment:
 *                         nullable: true
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             example: "1d95072e-c995-4ecf-8f1a-5db5a3d8a111"
 *                           amountHbar:
 *                             type: number
 *                             example: 1.5
 *                           status:
 *                             type: string
 *                             example: "paid"
 *                           hederaTxId:
 *                             nullable: true
 *                             type: string
 *                             example: "0.0.7148109@1710601234.123456789"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-03-16T15:50:00.000Z"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to load task history
 */
router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const tasks = await TaskExecution.findAll({
      where: { requester_user_id: req.user.id },
      include: [
        {
          model: Agent,
          as: "agent",
          required: false,
          attributes: ["id", "agent_name", "status"],
        },
        {
          model: PaymentRecord,
          as: "payment",
          required: false,
          attributes: ["id", "amount_hbar", "status", "hedera_tx_id"],
        },
      ],
      order: [["created_at", "DESC"]],
      limit: 100,
    });

    return res.json({
      items: tasks.map((task) => ({
        id: task.id,
        agentId: task.agent_id,
        agentName: task.agent?.agent_name || null,
        taskType: task.task_type,
        status: task.status,
        payment: task.payment
          ? {
              id: task.payment.id,
              amountHbar: Number(task.payment.amount_hbar),
              status: task.payment.status,
              hederaTxId: task.payment.hedera_tx_id,
            }
          : null,
        createdAt: task.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
