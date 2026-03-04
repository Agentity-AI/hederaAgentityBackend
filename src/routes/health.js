const express = require("express");
const router = express.Router();

/**
 * @openapi
 * tags:
 *   - name: Health
 *     description: Monitoring endpoints
 */

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Health check
 *     responses:
 *       200:
 *         description: OK
 *       500:
 *         description: Database disconnected
 */
router.get("/", async (req, res) => {
  // actual logic stays in app.js
  res.json({ ok: true });
});

module.exports = router;