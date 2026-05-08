const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const { buildDashboard } = require("../services/dashboard/buildDashboard");

/**
 * @openapi
 * tags:
 *   - name: Dashboard
 *     description: User dashboard aggregation endpoints
 */

/**
 * @openapi
 * /dashboard/overview:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get dashboard overview for the authenticated user
 *     description: Requires auth (Bearer token or agentity_jwt cookie). The overview is built from the authenticated user's id in the JWT.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Dashboard overview
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email:
 *                   nullable: true
 *                   type: string
 *                   example: "user@mail.com"
 *                 name:
 *                   type: string
 *                   example: "John Doe"
 *                 Totalagent:
 *                   type: integer
 *                   example: 3
 *                 TotalvarifiedAgent:
 *                   type: integer
 *                   example: 2
 *                 activeSimulation:
 *                   type: integer
 *                   example: 1
 *                 VulnerabilitiesDetected:
 *                   type: integer
 *                   example: 0
 *                 TransactionsExecuted:
 *                   type: integer
 *                   example: 4
 *                 chart:
 *                   type: object
 *                   properties:
 *                     labels:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example:
 *                         - "2026-03-10"
 *                         - "2026-03-11"
 *                         - "2026-03-12"
 *                     Verification:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [1, 0, 1]
 *                     Vulnerability:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [0, 1, 0]
 *                 activeAgent:
 *                   nullable: true
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *                     agent_name:
 *                       type: string
 *                       example: "Treasury Risk Monitor"
 *                     status:
 *                       type: string
 *                       example: "verified"
 *                     fingerprint:
 *                       type: string
 *                       example: "b9e3f7d1a2c4"
 *                     public_key:
 *                       type: string
 *                       example: "0x9f3C2B4d7A8e5F1b2C3D4E5F6A7B8C9D0E1F2A3B"
 *                     blockchain_agent_id:
 *                       nullable: true
 *                       type: integer
 *                       example: 1
 *                     blockchain_tx_hash:
 *                       nullable: true
 *                       type: string
 *                       example: "0xabc123..."
 *                     blockchain_registered_at:
 *                       nullable: true
 *                       type: string
 *                       format: date-time
 *                       example: "2026-03-16T15:26:29.803Z"
 *                     blockchain_sync_status:
 *                       nullable: true
 *                       type: string
 *                       example: "synced"
 *                 RecentActivity:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "7b2f4b1a-0f2e-4b5a-bdb5-2d0f52ed7c5e"
 *                       action:
 *                         type: string
 *                         example: "agent_verify"
 *                       agent_id:
 *                         nullable: true
 *                         type: string
 *                         example: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *                       payload:
 *                         type: object
 *                         additionalProperties: true
 *                         example:
 *                           hederaSyncStatus: "synced"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-03-16T15:26:29.803Z"
 *                 recentActivity:
 *                   type: array
 *                   description: camelCase alias of `RecentActivity` for frontend convenience
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get("/overview", requireAuth, async (req, res, next) => {
  try {
    const dashboard = await buildDashboard(req.user);
    return res.json(dashboard);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
