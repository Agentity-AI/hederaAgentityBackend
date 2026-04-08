const express = require("express");
const router = express.Router();

const Alert = require("../models/alert");
const { requireAuth } = require("../middleware/auth");
const { formatAlert } = require("../services/alerts/alertService");
const { ValidationError, optionalEnum, requireUuid } = require("../utils/validation");

/**
 * @openapi
 * tags:
 *   - name: Alerts
 *     description: Alert listing, summaries, and status management
 */

/**
 * @openapi
 * /alerts:
 *   get:
 *     tags: [Alerts]
 *     summary: List alerts for the authenticated user
 *     description: |
 *       Returns up to 100 alerts for the current user ordered by newest first.
 *       Frontend clients can filter by `status`, `severity`, and `type` using query parameters.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [active, resolved, dismissed]
 *         description: Filter alerts by lifecycle status.
 *       - in: query
 *         name: severity
 *         required: false
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter alerts by severity.
 *       - in: query
 *         name: type
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter alerts by alert classification such as `payment_failure` or `contract_audit`.
 *     responses:
 *       200:
 *         description: Alert list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 2
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "3b4c37d1-95a4-4ee2-8c9f-49e1f45dc001"
 *                       title:
 *                         type: string
 *                         example: "Task execution failed"
 *                       message:
 *                         type: string
 *                         example: "CRE execution failed for the selected task."
 *                       severity:
 *                         type: string
 *                         example: "critical"
 *                       type:
 *                         type: string
 *                         example: "execution_failure"
 *                       status:
 *                         type: string
 *                         example: "active"
 *                       sourceId:
 *                         nullable: true
 *                         type: string
 *                         example: "4d65b25f-7dd2-4584-b8b7-5d42f5f50010"
 *                       sourceType:
 *                         nullable: true
 *                         type: string
 *                         example: "task_execution"
 *                       metadata:
 *                         type: object
 *                         additionalProperties: true
 *                       actionLinks:
 *                         type: object
 *                         properties:
 *                           resolve:
 *                             type: string
 *                             example: "/alerts/3b4c37d1-95a4-4ee2-8c9f-49e1f45dc001/status"
 *                           dismiss:
 *                             type: string
 *                             example: "/alerts/3b4c37d1-95a4-4ee2-8c9f-49e1f45dc001/status"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Missing or invalid authentication token
 *       500:
 *         description: Failed to load alerts
 */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const where = { user_id: req.user.id };

    if (req.query.status) {
      where.status =
        optionalEnum(req.query.status, "status", ["active", "resolved", "dismissed"]) ||
        undefined;
    }

    if (req.query.severity) {
      where.severity =
        optionalEnum(req.query.severity, "severity", [
          "low",
          "medium",
          "high",
          "critical",
        ]) || undefined;
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
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

/**
 * @openapi
 * /alerts/summary:
 *   get:
 *     tags: [Alerts]
 *     summary: Get alert totals grouped by status and severity
 *     description: |
 *       Returns a compact summary the frontend can use for dashboard badges,
 *       alert counters, and summary cards without loading the full alert list.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Alert summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 6
 *                 active:
 *                   type: integer
 *                   example: 2
 *                 resolved:
 *                   type: integer
 *                   example: 3
 *                 dismissed:
 *                   type: integer
 *                   example: 1
 *                 bySeverity:
 *                   type: object
 *                   properties:
 *                     low:
 *                       type: integer
 *                       example: 1
 *                     medium:
 *                       type: integer
 *                       example: 2
 *                     high:
 *                       type: integer
 *                       example: 2
 *                     critical:
 *                       type: integer
 *                       example: 1
 *                 critical:
 *                   type: integer
 *                   example: 1
 *       401:
 *         description: Missing or invalid authentication token
 *       500:
 *         description: Failed to build alert summary
 */
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
      critical: 0,
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

    summary.critical = summary.bySeverity.critical;

    return res.json(summary);
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /alerts/{id}/status:
 *   patch:
 *     tags: [Alerts]
 *     summary: Update the status of an alert
 *     description: |
 *       Used by the frontend to resolve or dismiss alerts after the user reviews them.
 *       Only alerts owned by the authenticated user can be updated.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Alert UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, resolved, dismissed]
 *                 example: "resolved"
 *     responses:
 *       200:
 *         description: Updated alert
 *       400:
 *         description: Invalid alert status supplied
 *       401:
 *         description: Missing or invalid authentication token
 *       404:
 *         description: Alert not found for the authenticated user
 */
router.patch("/:id/status", requireAuth, async (req, res, next) => {
  try {
    const status =
      optionalEnum(req.body?.status, "status", ["active", "resolved", "dismissed"]) || "";

    const alert = await Alert.findOne({
      where: {
        id: requireUuid(req.params.id, "id"),
        user_id: req.user.id,
      },
    });

    if (!alert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    await alert.update({ status });

    return res.json(formatAlert(alert));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

module.exports = router;
