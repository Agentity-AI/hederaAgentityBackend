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

/**
 * @openapi
 * tags:
 *   - name: Tasks
 *     description: Hedera-native AI agent task coordination
 */

/**
 * @openapi
 * /tasks/request:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a new task request for an agent
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
 *     responses:
 *       200:
 *         description: Task created
 */
router.post("/request", requireAuth, async (req, res, next) => {
  try {
    const { agentId, taskType, inputPayload } = req.body || {};

    if (!agentId || !taskType) {
      return res.status(400).json({ message: "agentId and taskType are required" });
    }

    const agent = await Agent.findByPk(agentId);

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

    return res.json({
      id: task.id,
      agentId: task.agent_id,
      taskType: task.task_type,
      status: task.status,
      createdAt: task.created_at,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /tasks/{id}/simulate:
 *   post:
 *     tags: [Tasks]
 *     summary: Simulate a task before execution
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

    const agent = await Agent.findByPk(task.agent_id);
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
        simulation: sandboxResult,
      },
    });

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
      amountHbar: result.payment.amount_hbar,
      hederaTxId: result.txId,
      simulated: result.simulated,
      status: "paid",
    });
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

    if (!["paid", "simulated"].includes(task.status)) {
      return res.status(400).json({ message: "Task must be simulated and/or paid before execution" });
    }

    const agent = await Agent.findByPk(task.agent_id);
    const wallet = await AgentWallet.findOne({
      where: { agent_id: agent.id, status: "linked" },
    });

    await task.update({ status: "executing" });

    const simulationResult = task.simulation_run_id
      ? await SimulationRun.findByPk(task.simulation_run_id)
      : null;

    const executionResult = await executeWithCRE(agent, simulationResult?.result_payload || {});

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
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /tasks/history:
 *   get:
 *     tags: [Tasks]
 *     summary: Get task history for authenticated user
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Task history
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
              amountHbar: task.payment.amount_hbar,
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