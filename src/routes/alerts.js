const express = require("express");
const router = express.Router();

const Alert = require("../models/alert");
const { requireAuth } = require("../middleware/auth");
const { formatAlert } = require("../services/alerts/alertService");

/**
 * @openapi
 * tags:
 *   - name: Alerts
 *     description: Alert listing, summaries, and status management
 */

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const where = { user_id: req.user.id };

    if (req.query.status) {
      where.status = String(req.query.status).trim().toLowerCase();
    }

    if (req.query.severity) {
      where.severity = String(req.query.severity).trim().toLowerCase();
    }

    if (req.query.type) {
      where.type = String(req.query.type).trim().toLowerCase();
    }

    const items = await Alert.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit: 100,
    });

    return res.json({
      total: items.length,
      items: items.map(formatAlert),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/summary", requireAuth, async (req, res, next) => {
  try {
    const items = await Alert.findAll({
      where: { user_id: req.user.id },
      order: [["created_at", "DESC"]],
      limit: 100,
    });

    const summary = {
      total: items.length,
      active: 0,
      resolved: 0,
      dismissed: 0,
      bySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
    };

    for (const alert of items) {
      summary[alert.status] = (summary[alert.status] || 0) + 1;
      summary.bySeverity[alert.severity] =
        (summary.bySeverity[alert.severity] || 0) + 1;
    }

    return res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", requireAuth, async (req, res, next) => {
  try {
    const status = String(req.body?.status || "").trim().toLowerCase();

    if (!["active", "resolved", "dismissed"].includes(status)) {
      return res.status(400).json({
        message: "status must be one of: active, resolved, dismissed",
      });
    }

    const alert = await Alert.findOne({
      where: {
        id: req.params.id,
        user_id: req.user.id,
      },
    });

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    await alert.update({ status });

    return res.json(formatAlert(alert));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
