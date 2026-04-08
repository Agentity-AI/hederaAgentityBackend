const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");

const Agent = require("../models/agent");
const AgentWallet = require("../models/agentWallet");
const { requireAuth } = require("../middleware/auth");
const { logEvent } = require("../services/audit/logEvent");
const {
  ValidationError,
  requireHederaAccountId,
  requireString,
  requireUuid,
} = require("../utils/validation");

/**
 * @openapi
 * tags:
 *   - name: Wallets
 *     description: Hedera wallet linkage for agents
 */

/**
 * @openapi
 * /wallets/link:
 *   post:
 *     tags: [Wallets]
 *     summary: Link a Hedera wallet to an authenticated user's agent
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentId, hederaAccountId, hederaPublicKey]
 *             properties:
 *               agentId:
 *                 type: string
 *               hederaAccountId:
 *                 type: string
 *                 example: "0.0.123456"
 *               hederaPublicKey:
 *                 type: string
 *               kmsKeyId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Linked wallet
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 agentId:
 *                   type: string
 *                 hederaAccountId:
 *                   type: string
 *                   example: "0.0.8479610"
 *                 hederaPublicKey:
 *                   type: string
 *                 kmsKeyId:
 *                   nullable: true
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: "linked"
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Agent not found
 *       409:
 *         description: Hedera account already linked to another user's agent
 */
router.post("/link", requireAuth, async (req, res, next) => {
  try {
    const trimmedAgentId = requireUuid(req.body?.agentId, "agentId");
    const trimmedHederaAccountId = requireHederaAccountId(
      req.body?.hederaAccountId,
      "hederaAccountId",
    );
    const trimmedHederaPublicKey = requireString(
      req.body?.hederaPublicKey,
      "hederaPublicKey",
      { min: 16, max: 255 },
    );
    const trimmedKmsKeyId = req.body?.kmsKeyId
      ? requireString(req.body.kmsKeyId, "kmsKeyId", { min: 3, max: 255 })
      : null;

    const agent = await Agent.findOne({
      where: {
        id: trimmedAgentId,
        creator_id: req.user.id,
      },
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found for this user" });
    }

    const existingWalletForAgent = await AgentWallet.findOne({
      where: { agent_id: agent.id },
    });

    const existingWalletForAccount = await AgentWallet.findOne({
      where: {
        hedera_account_id: trimmedHederaAccountId,
        agent_id: { [Op.ne]: agent.id },
      },
      include: [
        {
          model: Agent,
          as: "agent",
          required: false,
          attributes: ["id", "creator_id"],
        },
      ],
    });

    if (
      existingWalletForAccount &&
      existingWalletForAccount.agent?.creator_id &&
      existingWalletForAccount.agent.creator_id !== req.user.id
    ) {
      return res.status(409).json({
        message: "This Hedera account is already linked to another user's agent",
      });
    }

    if (
      existingWalletForAgent &&
      existingWalletForAccount &&
      existingWalletForAgent.id !== existingWalletForAccount.id
    ) {
      await existingWalletForAgent.destroy();
    }

    if (existingWalletForAgent) {
      await existingWalletForAgent.update({
        hedera_account_id: trimmedHederaAccountId,
        hedera_public_key: trimmedHederaPublicKey,
        kms_key_id: trimmedKmsKeyId || null,
        status: "linked",
      });
    } else if (existingWalletForAccount) {
      await existingWalletForAccount.update({
        agent_id: agent.id,
        hedera_public_key: trimmedHederaPublicKey,
        kms_key_id: trimmedKmsKeyId || null,
        status: "linked",
      });
    } else {
      await AgentWallet.create({
        agent_id: agent.id,
        hedera_account_id: trimmedHederaAccountId,
        hedera_public_key: trimmedHederaPublicKey,
        kms_key_id: trimmedKmsKeyId || null,
        status: "linked",
      });
    }

    const wallet = await AgentWallet.findOne({
      where: { agent_id: agent.id },
    });

    await logEvent(req, {
      action: "wallet_link",
      agentId: agent.id,
      payload: {
        hederaAccountId: trimmedHederaAccountId,
        kmsKeyId: trimmedKmsKeyId || null,
      },
    });

    return res.json({
      id: wallet.id,
      agentId: wallet.agent_id,
      hederaAccountId: wallet.hedera_account_id,
      hederaPublicKey: wallet.hedera_public_key,
      kmsKeyId: wallet.kms_key_id,
      status: wallet.status,
      createdAt: wallet.created_at,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        message: error.message,
      });
    }

    if (error?.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        message:
          "Wallet link conflict detected. This Hedera account may already be linked.",
      });
    }

    next(error);
  }
});

module.exports = router;
