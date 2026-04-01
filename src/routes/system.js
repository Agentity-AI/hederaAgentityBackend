const express = require("express");
const router = express.Router();

const sequelize = require("../config/database");

/**
 * @openapi
 * tags:
 *   - name: System
 *     description: Runtime and network status endpoints
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
