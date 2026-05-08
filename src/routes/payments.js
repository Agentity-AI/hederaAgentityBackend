const express = require("express");
const router = express.Router();

const Agent = require("../models/agent");
const { requireAuth } = require("../middleware/auth");
const { listPaymentsForUser } = require("../services/hedera/paymentService");
const {
  buildKibblePaymentLink,
  resolveKibbleParams,
} = require("../services/payments/kibbleService");
const {
  ValidationError,
  optionalFiniteNumber,
  optionalString,
  optionalUrl,
  requireUuid,
} = require("../utils/validation");

async function findOwnedAgent(agentId, userId) {
  return Agent.findOne({
    where: {
      id: agentId,
      creator_id: userId,
    },
  });
}

function buildKibbleResponse(agent, kibbleParams) {
  return {
    agentId: agent.id,
    provider: "kibble",
    url: buildKibblePaymentLink(kibbleParams),
    destination: kibbleParams,
  };
}

/**
 * @openapi
 * tags:
 *   - name: Payments
 *     description: Hedera payment history endpoints and optional Kibble funding-link generation
 */

/**
 * @openapi
 * /payments/kibble-link:
 *   post:
 *     tags: [Payments]
 *     summary: Generate a Kibble funding link for an agent
 *     description: |
 *       Generates a Kibble cross-chain payment link for an authenticated user's agent.
 *       This is an optional funding UX for supported destination wallets and does not replace
 *       the app's native Hedera payment flow.
 *
 *       Kibble requires:
 *       - a destination chain id
 *       - a destination token address
 *       - a destination wallet address on a supported chain
 *
 *       Frontend usage:
 *       - call this endpoint when you want to show a "Fund this agent" button or QR/link
 *       - use the returned `url` directly in the browser
 *       - if the agent's registered `public_key` is not an EVM wallet, pass `toAddress` explicitly
 *
 *       Frontend note:
 *       - this endpoint is for optional agent funding links only
 *       - it does not replace the Hedera-native `/tasks/:id/pay` execution-payment flow
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentId]
 *             properties:
 *               agentId:
 *                 type: string
 *                 example: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *               toChain:
 *                 type: number
 *                 example: 8453
 *                 description: Destination chain id. If omitted, `KIBBLE_DEFAULT_TO_CHAIN` is used.
 *               toToken:
 *                 type: string
 *                 example: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *                 description: Destination token contract address. If omitted, `KIBBLE_DEFAULT_TO_TOKEN` is used.
 *               toAddress:
 *                 type: string
 *                 example: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68"
 *                 description: Optional override destination wallet. Needed when the agent's `public_key` is not an EVM address.
 *               toAmount:
 *                 type: string
 *                 example: "50"
 *                 description: Optional fixed requested amount in destination token units.
 *               minAmountUSD:
 *                 type: number
 *                 example: 10
 *                 description: Optional minimum payment value in USD.
 *               agentName:
 *                 type: string
 *                 example: "TradingBot"
 *               agentLogo:
 *                 type: string
 *                 example: "https://example.com/agent-logo.png"
 *           examples:
 *             frontendFundingPayload:
 *               summary: Recommended funding-link payload
 *               value:
 *                 agentId: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *                 toChain: 8453
 *                 toToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *                 toAddress: "0x42Ec816b0923eEF0c76589627107AdaBb749AB75"
 *                 toAmount: "10"
 *                 agentName: "Agentity Agent"
 *     responses:
 *       200:
 *         description: Kibble payment link generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 agentId:
 *                   type: string
 *                 url:
 *                   type: string
 *                   example: "https://kibble.sh/pay?toChain=8453&toToken=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913&toAddress=0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68&toAmount=50&agentName=TradingBot"
 *                 provider:
 *                   type: string
 *                   example: "kibble"
 *                 destination:
 *                   type: object
 *                   properties:
 *                     toChain:
 *                       type: number
 *                       example: 8453
 *                     toToken:
 *                       type: string
 *                     toAddress:
 *                       type: string
 *                     toAmount:
 *                       nullable: true
 *                       type: string
 *                     minAmountUSD:
 *                       nullable: true
 *                       type: number
 *                     agentName:
 *                       nullable: true
 *                       type: string
 *                     agentLogo:
 *                       nullable: true
 *                       type: string
 *       400:
 *         description: Missing or invalid Kibble destination parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Agent not found for the authenticated user
 */
router.post("/kibble-link", requireAuth, async (req, res, next) => {
  try {
    const agentId = requireUuid(req.body?.agentId, "agentId");

    const agent = await findOwnedAgent(agentId, req.user.id);

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const kibbleParams = resolveKibbleParams({
      agent,
      toChain: optionalFiniteNumber(req.body?.toChain, "toChain"),
      toToken: optionalString(req.body?.toToken, "toToken", { max: 255 }),
      toAddress: optionalString(req.body?.toAddress, "toAddress", { max: 255 }),
      toAmount: optionalString(req.body?.toAmount, "toAmount", { max: 40 }),
      minAmountUSD: optionalFiniteNumber(req.body?.minAmountUSD, "minAmountUSD"),
      agentName: optionalString(req.body?.agentName, "agentName", { max: 120 }),
      agentLogo: optionalUrl(req.body?.agentLogo, "agentLogo"),
    });

    return res.json(buildKibbleResponse(agent, kibbleParams));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }

    if (
      error.message?.includes("Kibble") ||
      error.message?.includes("toChain") ||
      error.message?.includes("toToken") ||
      error.message?.includes("toAddress")
    ) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

/**
 * @openapi
 * /payments/kibble-link/{agentId}:
 *   get:
 *     tags: [Payments]
 *     summary: Generate a Kibble funding link for an agent using query parameters
 *     description: |
 *       Read-friendly variant of the Kibble link endpoint for frontend pages or direct browser testing.
 *       Uses the same Kibble rules as `POST /payments/kibble-link`, but accepts optional parameters
 *       through the query string.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: agentId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: toChain
 *         required: false
 *         schema:
 *           type: number
 *           example: 8453
 *       - in: query
 *         name: toToken
 *         required: false
 *         schema:
 *           type: string
 *           example: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
 *       - in: query
 *         name: toAddress
 *         required: false
 *         schema:
 *           type: string
 *           example: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68"
 *       - in: query
 *         name: toAmount
 *         required: false
 *         schema:
 *           type: string
 *           example: "50"
 *       - in: query
 *         name: minAmountUSD
 *         required: false
 *         schema:
 *           type: number
 *           example: 10
 *       - in: query
 *         name: agentName
 *         required: false
 *         schema:
 *           type: string
 *           example: "TradingBot"
 *       - in: query
 *         name: agentLogo
 *         required: false
 *         schema:
 *           type: string
 *           example: "https://example.com/agent-logo.png"
 *     responses:
 *       200:
 *         description: Kibble payment link generated
 *       400:
 *         description: Missing or invalid Kibble destination parameters
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Agent not found for the authenticated user
 */
router.get("/kibble-link/:agentId", requireAuth, async (req, res, next) => {
  try {
    const agent = await findOwnedAgent(
      requireUuid(req.params.agentId, "agentId"),
      req.user.id,
    );

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const kibbleParams = resolveKibbleParams({
      agent,
      toChain: optionalFiniteNumber(req.query.toChain, "toChain"),
      toToken: optionalString(req.query.toToken, "toToken", { max: 255 }),
      toAddress: optionalString(req.query.toAddress, "toAddress", { max: 255 }),
      toAmount: optionalString(req.query.toAmount, "toAmount", { max: 40 }),
      minAmountUSD: optionalFiniteNumber(req.query.minAmountUSD, "minAmountUSD"),
      agentName: optionalString(req.query.agentName, "agentName", { max: 120 }),
      agentLogo: optionalUrl(req.query.agentLogo, "agentLogo"),
    });

    return res.json(buildKibbleResponse(agent, kibbleParams));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }

    if (
      error.message?.includes("Kibble") ||
      error.message?.includes("toChain") ||
      error.message?.includes("toToken") ||
      error.message?.includes("toAddress")
    ) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

/**
 * @openapi
 * /payments/history:
 *   get:
 *     tags: [Payments]
 *     summary: Get payment history for authenticated user
 *     description: Returns Hedera payment history for the logged-in user.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Payment history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "1d95072e-c995-4ecf-8f1a-5db5a3d8a111"
 *                       toAgentId:
 *                         type: string
 *                         example: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *                       taskExecutionId:
 *                         type: string
 *                         example: "9e75f7fd-fd1c-4b6d-91ab-3ecdb9d8d222"
 *                       amountHbar:
 *                         type: number
 *                         example: 1.5
 *                       hederaTxId:
 *                         nullable: true
 *                         type: string
 *                         example: "0.0.7148109@1710601234.123456789"
 *                       paymentReference:
 *                         nullable: true
 *                         type: string
 *                         example: "PAY-20260316-001"
 *                       status:
 *                         type: string
 *                         example: "paid"
 *                       metadata:
 *                         type: object
 *                         additionalProperties: true
 *                         example:
 *                           taskId: "9e75f7fd-fd1c-4b6d-91ab-3ecdb9d8d222"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2026-03-16T15:50:00.000Z"
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
