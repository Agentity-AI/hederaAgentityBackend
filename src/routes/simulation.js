const express = require("express");
const router = express.Router();

const { simulateAgent } = require("../services/sandbox/sandboxService");
const { logEvent } = require("../services/audit/logEvent");


/**
 * @openapi
 * tags:
 *   - name: Simulation
 *     description: Sandbox simulation endpoints
 */

/**
 * @openapi
 * /simulation/{id}:
 *   post:
 *     tags: [Simulation]
 *     summary: Simulate agent in sandbox container
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Agent UUID
 *     responses:
 *       200:
 *         description: Simulation result
 *       500:
 *         description: Simulation error
 */
router.post("/:id", async (req, res, next) => {
  try {
    const result = await simulateAgent(req.params.id);

    await logEvent(req, {
      action: "agent_simulate",
      agentId: req.params.id,
      payload: result,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
