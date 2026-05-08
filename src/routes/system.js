const express = require("express");
const router = express.Router();

const sequelize = require("../config/database");

/**
 * @openapi
 * tags:
 *   - name: System
 *     description: Runtime and network status endpoints
 */

/**
 * @openapi
 * /system/status:
 *   get:
 *     tags: [System]
 *     summary: Get runtime dependency status
 *     description: |
 *       Returns a lightweight environment-level health summary that helps the frontend
 *       and operators confirm whether major optional integrations are configured.
 *     responses:
 *       200:
 *         description: System status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 api:
 *                   type: string
 *                   example: "healthy"
 *                 database:
 *                   type: string
 *                   example: "connected"
 *                 hedera:
 *                   type: string
 *                   example: "configured"
 *                 cre:
 *                   type: string
 *                   example: "disabled"
 *                 network:
 *                   type: string
 *                   example: "testnet"
 */
router.get("/status", async (req, res) => {
  let database = "disconnected";

  try {
    await sequelize.authenticate();
    database = "connected";
  } catch {
    database = "disconnected";
  }

  return res.json({
    api: "healthy",
    database,
    hedera:
      process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY
        ? "configured"
        : "disabled",
    cre: process.env.CRE_WEBHOOK_URL ? "configured" : "disabled",
    network: process.env.HEDERA_NETWORK || "testnet",
  });
});

module.exports = router;
