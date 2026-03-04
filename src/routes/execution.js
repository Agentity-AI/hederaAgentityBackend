const express = require("express");
const router = express.Router();
const Agent = require("../models/agent");
const { simulateAgent } = require("../services/sandbox/sandboxService");
const { executeWithCRE } = require("../services/cre/creService");
const { logEvent } = require("../services/audit/logEvent");


/**
 * @openapi
 * tags:
 *   - name: Execution
 *     description: Agent execution via sandbox + CRE workflow (fallback supported)
 */

/**
 * @openapi
 * /execute/{id}:
 *   post:
 *     tags: [Execution]
 *     summary: Execute a verified agent (simulate then CRE execute)
 *     description: Runs sandbox simulation first, then executes via CRE (or fallback if CRE webhook not set).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Agent UUID
 *     responses:
 *       200:
 *         description: Simulation + execution result
 *       400:
 *         description: Agent must be verified
 *       404:
 *         description: Agent not found
 */
router.post("/:id", async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);

    if (!agent || agent.status !== "verified") {
      return res.status(400).json({ message: "Agent must be verified" });
    }

    const simulationResult = await simulateAgent(agent.id);

    const executionResult = await executeWithCRE(agent, simulationResult);

    await logEvent(req, {
      action: "agent_execute",
      agentId: agent.id,
      payload: executionResult,
    });

    res.json({
      simulation: simulationResult,
      execution: executionResult,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
