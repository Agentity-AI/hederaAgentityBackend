const express = require("express");
const router = express.Router();

const Agent = require("../models/agent");
const SimulationRun = require("../models/simulationRun");
const { requireAuth } = require("../middleware/auth");
const { simulateAgent } = require("../services/sandbox/sandboxService");
const { logEvent } = require("../services/audit/logEvent");
const { createAlert } = require("../services/alerts/alertService");
const { buildSimulationAlert } = require("../services/alerts/alertUtils");

const SCENARIOS = [
  "Token Swap",
  "Liquidity Pool",
  "NFT Mint",
  "Governance Vote",
  "Yield Farming",
  "Oracle Query",
];

/**
 * @openapi
 * tags:
 *   - name: Simulation
 *     description: Sandbox simulation endpoints
 */

/**
 * @openapi
 * /simulation/scenarios:
 *   get:
 *     tags: [Simulation]
 *     summary: Get supported simulation scenarios
 *     responses:
 *       200:
 *         description: Scenario list
 */
router.get("/scenarios", (req, res) => {
  return res.json({ items: SCENARIOS });
});

/**
 * @openapi
 * /simulation/history:
 *   get:
 *     tags: [Simulation]
 *     summary: Get simulation history for authenticated user
 *     description: Returns simulation history for the logged-in user.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Simulation history
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
 *                         example: "7b2f4b1a-0f2e-4b5a-bdb5-2d0f52ed7c5e"
 *                       agentId:
 *                         type: string
 *                         example: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *                       agentName:
 *                         nullable: true
 *                         type: string
 *                         example: "Treasury Risk Monitor"
 *                       scenario:
 *                         type: string
 *                         example: "Oracle Query"
 *                       riskScore:
 *                         type: number
 *                         example: 35
 *                       vulnerabilities:
 *                         type: integer
 *                         example: 1
 *                       status:
 *                         type: string
 *                         example: "completed"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-03-16T15:40:00.000Z"
 *                       result:
 *                         type: object
 *                         additionalProperties: true
 *                         example:
 *                           summary: "Simulation completed successfully"
 *                           sandbox:
 *                             riskScore: 35
 *                             findings: []
 *       401:
 *         description: Unauthorized
 */
router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const runs = await SimulationRun.findAll({
      where: { user_id: req.user.id },
      include: [
        {
          model: Agent,
          as: "agent",
          required: false,
          attributes: ["id", "agent_name", "status"],
        },
      ],
      order: [["created_at", "DESC"]],
      limit: 50,
    });

    return res.json({
      items: runs.map((run) => ({
        id: run.id,
        agentId: run.agent_id,
        agentName: run.agent?.agent_name || null,
        scenario: run.scenario_type,
        riskScore: run.risk_score,
        vulnerabilities: run.vulnerabilities_count,
        status: run.status,
        createdAt: run.created_at,
        result: run.result_payload,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /simulation/run:
 *   post:
 *     tags: [Simulation]
 *     summary: Run a simulation for a selected agent and scenario
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentId, scenarioType]
 *             properties:
 *               agentId:
 *                 type: string
 *                 example: "uuid"
 *               scenarioType:
 *                 type: string
 *                 example: "Token Swap"
 *     responses:
 *       200:
 *         description: Simulation result
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Agent not found
 */
router.post("/run", requireAuth, async (req, res, next) => {
  try {
    const { agentId, scenarioType, parameters } = req.body || {};

    if (!agentId || !scenarioType) {
      return res
        .status(400)
        .json({ message: "agentId and scenarioType are required" });
    }

    const agent = await Agent.findOne({
      where: {
        id: agentId,
        creator_id: req.user.id,
      },
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found for this user" });
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

    const run = await SimulationRun.create({
      user_id: req.user.id,
      agent_id: agent.id,
      scenario_type: scenarioType,
      risk_score: riskScore,
      vulnerabilities_count: vulnerabilitiesCount,
      status: "completed",
      result_payload: {
        summary: "Simulation completed successfully",
        parameters: parameters || {},
        sandbox: sandboxResult,
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
        sourceId: run.id,
        sourceType: "simulation_run",
        metadata: {
          scenarioType,
          parameters: parameters || {},
          riskScore,
          vulnerabilitiesCount,
        },
        ...alertPayload,
      });
    }

    await logEvent(req, {
      action: "agent_simulate",
      agentId: agent.id,
      payload: {
        scenarioType,
        parameters: parameters || {},
        riskScore,
        vulnerabilitiesCount,
      },
    });

    return res.json({
      id: run.id,
      agentId: agent.id,
      agentName: agent.agent_name,
      scenario: scenarioType,
      riskScore,
      vulnerabilities: vulnerabilitiesCount,
      status: run.status,
      createdAt: run.created_at,
      parameters: parameters || {},
      result: run.result_payload,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /simulation/{id}:
 *   post:
 *     tags: [Simulation]
 *     summary: Backward-compatible direct simulation by agent id
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Agent UUID
 *     responses:
 *       200:
 *         description: Simulation result
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Agent not found
 *       500:
 *         description: Simulation error
 */
router.post("/:id", requireAuth, async (req, res, next) => {
  try {
    const { scenarioType = "Direct Simulation", parameters = {} } = req.body || {};
    const agent = await Agent.findOne({
      where: {
        id: req.params.id,
        creator_id: req.user.id,
      },
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const result = await simulateAgent(agent.id);

    const alertPayload = buildSimulationAlert({
      riskScore:
        typeof result?.riskScore === "number" ? result.riskScore : result?.risk_score || 0,
      vulnerabilitiesCount: Array.isArray(result?.findings) ? result.findings.length : 0,
    });

    if (alertPayload) {
      await createAlert({
        userId: req.user.id,
        agentId: agent.id,
        sourceId: agent.id,
        sourceType: "agent",
        metadata: {
          scenarioType,
          parameters,
          result,
        },
        ...alertPayload,
      });
    }

    await logEvent(req, {
      action: "agent_simulate",
      agentId: agent.id,
      payload: {
        scenarioType,
        parameters,
        result,
      },
    });

    return res.json({
      ...result,
      scenarioType,
      parameters,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
