const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/auth");
const { listPaymentsForUser } = require("../services/hedera/paymentService");

/**
 * @openapi
 * tags:
 *   - name: Payments
 *     description: Hedera payment history endpoints
 */

/**
 * @openapi
 * /payments/history:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment history for authenticated user
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Payment history
 *       401:
 *         description: Unauthorized
 */
router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const items = await listPaymentsForUser(req.user.id);

    return res.json({
      items: items.map((payment) => ({
        id: payment.id,
        toAgentId: payment.to_agent_id,
        taskExecutionId: payment.task_execution_id,
        amountHbar: Number(payment.amount_hbar),
        hederaTxId: payment.hedera_tx_id,
        paymentReference: payment.payment_reference,
        status: payment.status,
        metadata: payment.metadata,
        createdAt: payment.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;