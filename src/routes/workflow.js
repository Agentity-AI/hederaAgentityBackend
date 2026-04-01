const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const Agent = require("../models/agent");
const AgentWallet = require("../models/agentWallet");
const SimulationRun = require("../models/simulationRun");
const PaymentRecord = require("../models/paymentRecord");
const TaskExecution = require("../models/taskExecution");
const Alert = require("../models/alert");

/**
 * @openapi
 * tags:
 *   - name: Workflow
 *     description: Product-flow summary endpoints for dashboard onboarding
 */

router.get("/summary", requireAuth, async (req, res, next) => {
  try {
    const [
      totalAgents,
      verifiedAgents,
      linkedWallets,
      simulations,
      payments,
      tasks,
      alerts,
    ] = await Promise.all([
      Agent.count({ where: { creator_id: req.user.id } }),
      Agent.count({ where: { creator_id: req.user.id, status: "verified" } }),
      AgentWallet.count({
        include: [
          {
            model: Agent,
            as: "agent",
            attributes: [],
            required: true,
            where: { creator_id: req.user.id },
          },
        ],
        where: { status: "linked" },
      }),
      SimulationRun.count({ where: { user_id: req.user.id } }),
      PaymentRecord.count({ where: { from_user_id: req.user.id, status: "paid" } }),
      TaskExecution.count({ where: { requester_user_id: req.user.id, status: "completed" } }),
      Alert.count({ where: { user_id: req.user.id, status: "active" } }),
    ]);

    return res.json({
      summary: {
        totalAgents,
        verifiedAgents,
        linkedWallets,
        simulations,
        paidTransactions: payments,
        completedTasks: tasks,
        activeAlerts: alerts,
      },
      steps: [
        {
          key: "register-agent",
          completed: totalAgents > 0,
          endpoint: "POST /agents/register",
        },
        {
          key: "verify-agent",
          completed: verifiedAgents > 0,
          endpoint: "POST /agents/:id/verify",
        },
        {
          key: "link-wallet",
          completed: linkedWallets > 0,
          endpoint: "POST /wallets/link",
        },
        {
          key: "simulate",
          completed: simulations > 0,
          endpoint: "POST /simulation/run",
        },
        {
          key: "pay",
          completed: payments > 0,
          endpoint: "POST /tasks/:id/pay",
        },
        {
          key: "execute",
          completed: tasks > 0,
          endpoint: "POST /tasks/:id/execute",
        },
      ],
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
