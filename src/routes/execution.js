const express = require("express");
const router = express.Router();
const Agent = require("../models/agent");
const { simulateAgent } = require("../services/sandbox/sandboxService");
const { executeWithCRE } = require("../services/cre/creService");
const { logEvent } = require("../services/audit/logEvent");
const {
  logActionOnChain,
} = require("../services/blockchain/agentRegistryService");

/**
 * @openapi
 * tags:
 *   - name: Execution
 *     description: Agent execution via sandbox + CRE workflow + blockchain logging
 */

/**
 * @openapi
 * /execute/{id}:
 *   post:
 *     tags: [Execution]
 *     summary: Execute a verified agent
 *     description: Runs sandbox simulation, CRE execution, and writes action log on-chain if blockchain_agent_id exists.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Agent UUID
 *     responses:
 *       200:
 *         description: Simulation + execution + blockchain result
 *       400:
 *         description: Agent must be verified
 *       404:
 *         description: Agent not found
 */
router.post("/:id", async (req, res, next) => {
  try {
    const agent = await Agent.findByPk(req.params.id);

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    if (agent.status !== "verified") {
      return res.status(400).json({ message: "Agent must be verified" });
    }

    const simulationResult = await simulateAgent(agent.id);
    const executionResult = await executeWithCRE(agent, simulationResult);

    let blockchainResult = null;

    if (agent.blockchain_agent_id) {
      blockchainResult = await logActionOnChain({
        blockchainAgentId: agent.blockchain_agent_id,
        actionType: "execute_agent",
        actionPayload: {
          localAgentId: agent.id,
          fingerprint: agent.fingerprint,
          simulation: simulationResult,
          execution: executionResult,
        },
      });
    }

    await logEvent(req, {
      action: "agent_execute",
      agentId: agent.id,
      payload: {
        executionResult,
        blockchainResult,
      },
    });

    return res.json({
      simulation: simulationResult,
      execution: executionResult,
      blockchain: blockchainResult,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
