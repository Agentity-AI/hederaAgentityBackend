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
 *     description: Requires auth (Bearer token or agentity_jwt cookie).
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Dashboard payload for frontend
 *       401:
 *         description: Unauthorized
 */
router.get("/overview", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const email = req.user.email;
    const name = req.user?.user_metadata?.name || req.user?.user_metadata?.full_name || "";

    const dashboard = await buildDashboard(userId, email, name);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

module.exports = router;