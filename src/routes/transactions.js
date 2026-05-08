const express = require("express");
const router = express.Router();

const Agent = require("../models/agent");
const { requireAuth } = require("../middleware/auth");
const {
  createPolicy,
  formatTransaction,
  getTransactionForUser,
  listPoliciesForUser,
  listTransactionsForUser,
} = require("../services/transactions/transactionService");
const {
  ValidationError,
  optionalEnum,
  optionalFiniteNumber,
  optionalObject,
  optionalString,
  requireString,
  requireUuid,
} = require("../utils/validation");

function formatPolicy(policy) {
  const rules = policy.rules || {};

  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    status: policy.status,
    rules,
    agentId: rules.agentId || null,
    maxTransactionAmount:
      rules.maxTransactionAmount ?? rules.maxAmount ?? null,
    dailyLimit: rules.dailyLimit ?? null,
    requireManualApproval: Boolean(rules.requireManualApproval),
    autoRejectHighRisk: Boolean(rules.autoRejectHighRisk),
    policyEnabled:
      typeof rules.policyEnabled === "boolean"
        ? rules.policyEnabled
        : policy.status === "active",
    createdAt: policy.created_at,
    updatedAt: policy.updated_at,
  };
}

/**
 * @openapi
 * tags:
 *   - name: Transactions
 *     description: Unified transaction history and policy management
 */

/**
 * @openapi
 * /transactions/history:
 *   get:
 *     tags: [Transactions]
 *     summary: List transaction history for the authenticated user
 *     description: Returns normalized transaction records including payment and execution traces.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Transaction history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 2
 *                 totalVolume:
 *                   type: number
 *                   example: 16750.5
 *                 highRisk:
 *                   type: integer
 *                   example: 0
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       agentId:
 *                         nullable: true
 *                         type: string
 *                       agentName:
 *                         nullable: true
 *                         type: string
 *                       taskExecutionId:
 *                         nullable: true
 *                         type: string
 *                       paymentRecordId:
 *                         nullable: true
 *                         type: string
 *                       transactionType:
 *                         type: string
 *                         example: "payment"
 *                       displayType:
 *                         type: string
 *                         example: "Stake"
 *                       amount:
 *                         nullable: true
 *                         type: number
 *                       amountUnit:
 *                         nullable: true
 *                         type: string
 *                         example: "AVAX"
 *                       status:
 *                         type: string
 *                         example: "paid"
 *                       riskRating:
 *                         nullable: true
 *                         type: string
 *                       txHash:
 *                         nullable: true
 *                         type: string
 *                       metadata:
 *                         type: object
 *                         additionalProperties: true
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get("/history", requireAuth, async (req, res, next) => {
  try {
    const items = await listTransactionsForUser(req.user.id);
    const totalVolume = items.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const highRisk = items.filter(
      (item) =>
        ["high", "critical"].includes(String(item.risk_rating || "").toLowerCase()),
    ).length;

    return res.json({
      total: items.length,
      totalVolume: Number(totalVolume.toFixed(2)),
      highRisk,
      items: items.map(formatTransaction),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /transactions/policies:
 *   get:
 *     tags: [Transactions]
 *     summary: List transaction policies for the authenticated user
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Transaction policy list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 3
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       agentId:
 *                         nullable: true
 *                         type: string
 *                       maxTransactionAmount:
 *                         nullable: true
 *                         type: number
 *                       dailyLimit:
 *                         nullable: true
 *                         type: number
 *                       requireManualApproval:
 *                         type: boolean
 *                       autoRejectHighRisk:
 *                         type: boolean
 *                       policyEnabled:
 *                         type: boolean
 *       401:
 *         description: Unauthorized
 */
router.get("/policies", requireAuth, async (req, res, next) => {
  try {
    const items = await listPoliciesForUser(req.user.id);

    return res.json({
      total: items.length,
      items: items.map(formatPolicy),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /transactions/summary:
 *   get:
 *     tags: [Transactions]
 *     summary: Get payment and transaction summary cards for the authenticated user
 *     description: Returns aggregate counts and totals for the Payments & Transactions screen.
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Transaction summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalTransactions:
 *                   type: integer
 *                   example: 4
 *                 totalVolume:
 *                   type: number
 *                   example: 16750.5
 *                 highRisk:
 *                   type: integer
 *                   example: 0
 *                 activePolicies:
 *                   type: integer
 *                   example: 3
 *       401:
 *         description: Unauthorized
 */
router.get("/summary", requireAuth, async (req, res, next) => {
  try {
    const [transactions, policies] = await Promise.all([
      listTransactionsForUser(req.user.id),
      listPoliciesForUser(req.user.id),
    ]);

    const totalVolume = transactions.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
    const highRisk = transactions.filter(
      (item) =>
        ["high", "critical"].includes(String(item.risk_rating || "").toLowerCase()),
    ).length;
    const activePolicies = policies.filter(
      (item) => item.status === "active",
    ).length;

    return res.json({
      totalTransactions: transactions.length,
      totalVolume: Number(totalVolume.toFixed(2)),
      highRisk,
      activePolicies,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @openapi
 * /transactions/policies:
 *   post:
 *     tags: [Transactions]
 *     summary: Create a transaction policy
 *     description: |
 *       Creates a user-scoped transaction policy that can be used by the frontend
 *       for approvals, limits, or operational controls around agent transactions.
 *
 *       Frontend contract:
 *       - the policy modal should send `name`, optional `agentId`, `maxTransactionAmount`,
 *         `dailyLimit`, `requireManualApproval`, `autoRejectHighRisk`, and `policyEnabled`
 *       - `rules` is still supported for advanced use, but frontend clients do not need to
 *         build raw policy JSON manually anymore
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Default Treasury Policy"
 *               description:
 *                 type: string
 *                 example: "Policy used for standard payment and execution validation."
 *               agentId:
 *                 type: string
 *                 nullable: true
 *                 example: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *               maxTransactionAmount:
 *                 type: number
 *                 example: 1000
 *               dailyLimit:
 *                 type: number
 *                 example: 10000
 *               requireManualApproval:
 *                 type: boolean
 *                 example: true
 *               autoRejectHighRisk:
 *                 type: boolean
 *                 example: true
 *               policyEnabled:
 *                 type: boolean
 *                 example: true
 *               status:
 *                 type: string
 *                 enum: [active, disabled]
 *                 example: "active"
 *               rules:
 *                 type: object
 *                 additionalProperties: true
 *                 example:
 *                   maxAmount: 100
 *                   allowedTypes:
 *                     - "payment"
 *                     - "execution"
 *                 description: Advanced optional escape hatch. The backend also maps the modal fields above into this rules object automatically.
 *           examples:
 *             frontendPolicyPayload:
 *               summary: Recommended policy modal payload
 *               value:
 *                 name: "Standard Trading Policy"
 *                 agentId: "ac0d21d5-bb02-4d52-8004-4725488cf007"
 *                 maxTransactionAmount: 1000
 *                 dailyLimit: 10000
 *                 requireManualApproval: true
 *                 autoRejectHighRisk: true
 *                 policyEnabled: true
 *     responses:
 *       201:
 *         description: Transaction policy created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 description:
 *                   nullable: true
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "active"
 *                 rules:
 *                   type: object
 *                   additionalProperties: true
 *                 agentId:
 *                   nullable: true
 *                   type: string
 *                 maxTransactionAmount:
 *                   nullable: true
 *                   type: number
 *                 dailyLimit:
 *                   nullable: true
 *                   type: number
 *                 requireManualApproval:
 *                   type: boolean
 *                 autoRejectHighRisk:
 *                   type: boolean
 *                 policyEnabled:
 *                   type: boolean
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Missing required policy fields
 *       401:
 *         description: Unauthorized
 */
router.post("/policies", requireAuth, async (req, res, next) => {
  try {
    const agentId = req.body?.agentId
      ? requireUuid(req.body.agentId, "agentId")
      : null;
    const maxTransactionAmount = optionalFiniteNumber(
      req.body?.maxTransactionAmount,
      "maxTransactionAmount",
    );
    const dailyLimit = optionalFiniteNumber(req.body?.dailyLimit, "dailyLimit");
    const requireManualApproval =
      typeof req.body?.requireManualApproval === "boolean"
        ? req.body.requireManualApproval
        : false;
    const autoRejectHighRisk =
      typeof req.body?.autoRejectHighRisk === "boolean"
        ? req.body.autoRejectHighRisk
        : false;
    const policyEnabled =
      typeof req.body?.policyEnabled === "boolean"
        ? req.body.policyEnabled
        : true;
    const explicitRules = optionalObject(req.body?.rules, "rules") || {};

    if (agentId) {
      const agent = await Agent.findOne({
        where: {
          id: agentId,
          creator_id: req.user.id,
        },
      });

      if (!agent) {
        return res.status(404).json({ message: "Agent not found for this user" });
      }
    }

    const policy = await createPolicy({
      userId: req.user.id,
      name: requireString(req.body?.name, "name", { min: 2, max: 120 }),
      description: optionalString(req.body?.description, "description", {
        max: 500,
      }),
      rules: {
        ...explicitRules,
        agentId,
        maxTransactionAmount,
        dailyLimit,
        requireManualApproval,
        autoRejectHighRisk,
        policyEnabled,
      },
      status:
        optionalEnum(req.body?.status, "status", ["active", "disabled"]) ||
        (policyEnabled ? "active" : "disabled"),
    });

    return res.status(201).json(formatPolicy(policy));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

/**
 * @openapi
 * /transactions/{id}:
 *   get:
 *     tags: [Transactions]
 *     summary: Get transaction details by id
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction record UUID
 *     responses:
 *       200:
 *         description: Transaction details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 agentId:
 *                   nullable: true
 *                   type: string
 *                 displayType:
 *                   type: string
 *                 amount:
 *                   nullable: true
 *                   type: number
 *                 amountUnit:
 *                   nullable: true
 *                   type: string
 *                 riskRating:
 *                   nullable: true
 *                   type: string
 *                 status:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Transaction not found
 */
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const transaction = await getTransactionForUser(
      requireUuid(req.params.id, "id"),
      req.user.id,
    );

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    return res.json(formatTransaction(transaction));
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
});

module.exports = router;
