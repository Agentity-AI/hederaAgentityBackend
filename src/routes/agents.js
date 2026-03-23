const express = require("express");
const router = express.Router();

const sequelize = require("../config/database");
const Agent = require("../models/agent");
const AgentMetadata = require("../models/agentMetadata");
const AgentReputation = require("../models/agentReputation");
const AgentBehaviorLog = require("../models/agentBehaviorLog");
const AgentHcsRegistry = require("../models/agentHcsRegistry");

const { requireAuth } = require("../middleware/auth");
const { generateFingerprint } = require("../services/fingerprint");
const { logEvent } = require("../services/audit/logEvent");
const {
  ensureAgentRegistered,
  runImmediateVerification,
  getAgentHistory,
} = require("../services/hedera/hcsRegistryService");
const {
  scheduleReverification,
} = require("../services/hedera/hcsSchedulerService");
const {
  linkWalletToAgent,
} = require("../services/hedera/walletLinkService");

function parseJsonMaybe(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeRegisterPayload(body) {
  const agent_name = body.agent_name || body.agentName || body.name || null;
  const description = body.description || null;
  const agent_type = body.agent_type || body.agentType || null;
  const public_key =
    body.public_key ||
    body.publicKey ||
    body.wallet_address ||
    body.walletAddress ||
    null;
  const api_endpoint = body.api_endpoint || body.apiEndpoint || null;
  const model_name =
    body.model_name || body.modelName || agent_type || "unknown";
  const version = body.version || "unknown";
  const execution_environment =
    body.execution_environment ||
    body.executionEnvironment ||
    (api_endpoint ? "api" : "unknown");
  const metadata_json = parseJsonMaybe(
    body.metadata || body.metadata_json || body.metadataJson
  );

  return {
    agent_name,
    public_key,
    description,
    agent_type,
    api_endpoint,
    model_name,
    version,
    execution_environment,
    metadata_json,
  };
}

function formatAgentResponse(agent) {
  const data = typeof agent.toJSON === "function" ? agent.toJSON() : agent;

  return {
    id: data.id,
    creatorId: data.creator_id,
    agentName: data.agent_name,
    publicKey: data.public_key,
    fingerprint: data.fingerprint,
    status: data.status,
    agentType: data.metadata?.model_name || null,
    description: data.description || null,
    apiEndpoint: data.api_endpoint || null,
    metadata: data.metadata
      ? {
          modelName: data.metadata.model_name,
          version: data.metadata.version,
          executionEnvironment: data.metadata.execution_environment,
        }
      : null,
    reputation: data.reputation
      ? {
          score: data.reputation.score,
          riskLevel: data.reputation.risk_level,
        }
      : null,
    hcs: data.hcsRegistry
      ? {
          topicId: data.hcsRegistry.hcs_topic_id,
          currentScore: data.hcsRegistry.current_score,
          currentRiskLevel: data.hcsRegistry.current_risk_level,
          verificationCount: data.hcsRegistry.verification_count,
          lastVerifiedAt: data.hcsRegistry.last_verified_at,
          nextScheduledAt: data.hcsRegistry.next_scheduled_at,
          status: data.hcsRegistry.status,
          hashscanUrl: `https://hashscan.io/${
            process.env.HEDERA_NETWORK || "testnet"
          }/topic/${data.hcsRegistry.hcs_topic_id}`,
        }
      : null,
    createdAt: data.createdAt,
  };
}

/**
 * @openapi
 * /agents/register:
 *   post:
 *     tags: [Agents]
 *     summary: Register agent and tie it to the authenticated user
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 */
router.post("/register", requireAuth, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const p = normalizeRegisterPayload(req.body || {});

    if (!p.agent_name || !p.public_key) {
      await transaction.rollback();
      return res.status(400).json({
        message:
          "agent_name (or agentName) and public_key (or walletAddress) are required",
      });
    }

    const existing = await Agent.findOne({
      where: { public_key: p.public_key },
      transaction,
    });

    if (existing) {
      await transaction.rollback();
      return res
        .status(409)
        .json({ message: "Agent already exists", agentId: existing.id });
    }

    const fingerprint = generateFingerprint(p.public_key);

    const agent = await Agent.create(
      {
        creator_id: req.user.id,
        agent_name: p.agent_name,
        public_key: p.public_key,
        fingerprint,
      },
      { transaction }
    );

    await AgentMetadata.create(
      {
        agent_id: agent.id,
        model_name: p.model_name,
        version: p.version,
        execution_environment: p.execution_environment,
      },
      { transaction }
    );

    await AgentReputation.create(
      {
        agent_id: agent.id,
        score: 0.0,
        risk_level: "low",
      },
      { transaction }
    );

    await AgentBehaviorLog.create(
      {
        agent_id: agent.id,
        event_type: "registration",
        event_payload: {
          description: p.description,
          agentType: p.agent_type,
          walletAddress: p.public_key,
          apiEndpoint: p.api_endpoint,
          metadata: p.metadata_json,
          creator_id: req.user.id,
        },
        risk_score: 0.0,
      },
      { transaction }
    );

    await logEvent(req, {
      action: "agent_register",
      agentId: agent.id,
      payload: {
        description: p.description,
        agentType: p.agent_type,
        walletAddress: p.public_key,
        apiEndpoint: p.api_endpoint,
      },
      transaction,
    });

    await transaction.commit();

    return res.status(201).json({
      id: agent.id,
      creatorId: agent.creator_id,
      agentName: agent.agent_name,
      publicKey: agent.public_key,
      fingerprint: agent.fingerprint,
      status: agent.status,
      agentType: p.agent_type,
      createdAt: agent.createdAt,
    });
  } catch (error) {
    await transaction.rollback();
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @openapi
 * /agents/my:
 *   get:
 *     tags: [Agents]
 *     summary: Get agents registered by the authenticated user
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 */
router.get("/my", requireAuth, async (req, res) => {
  try {
    const agents = await Agent.findAll({
      where: { creator_id: req.user.id },
      include: [
        { model: AgentMetadata, as: "metadata" },
        { model: AgentReputation, as: "reputation" },
        { model: AgentHcsRegistry, as: "hcsRegistry" },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      total: agents.length,
      items: agents.map(formatAgentResponse),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @openapi
 * /agents/{id}:
 *   get:
 *     tags: [Agents]
 *     summary: Get agent by id
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 */
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const agent = await Agent.findOne({
      where: {
        id: req.params.id,
        creator_id: req.user.id,
      },
      include: [
        { model: AgentMetadata, as: "metadata" },
        { model: AgentReputation, as: "reputation" },
        { model: AgentHcsRegistry, as: "hcsRegistry" },
      ],
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    await logEvent(req, {
      action: "agent_fetch",
      agentId: agent.id,
    });

    return res.json(formatAgentResponse(agent));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @openapi
 * /agents/{id}/verify:
 *   post:
 *     tags: [Agents]
 *     summary: Verify agent and sync with Hedera
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hederaAccountId:
 *                 type: string
 *               hederaPublicKey:
 *                 type: string
 *               kmsKeyId:
 *                 type: string
 */
router.post("/:id/verify", requireAuth, async (req, res) => {
  try {
    const agent = await Agent.findOne({
      where: {
        id: req.params.id,
        creator_id: req.user.id,
      },
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const { hederaAccountId, hederaPublicKey, kmsKeyId } = req.body || {};

    if (hederaAccountId && hederaPublicKey) {
      await linkWalletToAgent({
        agentId: agent.id,
        hederaAccountId,
        hederaPublicKey,
        kmsKeyId,
      });
    }

    agent.status = "verified";
    await agent.save();

    let hederaSyncStatus = "disabled";
    let hedera = null;

    try {
      const registry = await ensureAgentRegistered(agent);
      const hcsResult = await runImmediateVerification(agent, registry);

      const intervalSeconds = parseInt(
        process.env.HEDERA_REVERIFY_INTERVAL_SECONDS || "3600",
        10
      );

      const scheduleId = await scheduleReverification(
        registry.hcs_topic_id,
        agent.id,
        intervalSeconds
      );

      const nextCheckAt = new Date(
        Date.now() + intervalSeconds * 1000
      ).toISOString();

      hederaSyncStatus = "synced";
      hedera = {
        topicId: hcsResult.topicId,
        sequenceNumber: hcsResult.sequenceNumber,
        trustScore: hcsResult.score,
        isHealthy: hcsResult.isHealthy,
        riskLevel: hcsResult.riskLevel,
        verificationCount: hcsResult.verificationCount,
        scheduleId,
        nextCheckAt,
        hashscanUrl: hcsResult.hashscanUrl,
      };
    } catch (hcsErr) {
      hederaSyncStatus = "failed";
      hedera = {
        error: hcsErr.message,
        note: "Agent verification succeeded locally, but Hedera sync failed.",
      };
      console.error("[verify] HCS error (non-fatal):", hcsErr.message);
    }

    await AgentBehaviorLog.create({
      agent_id: agent.id,
      event_type: "verification",
      event_payload: {
        verified_at: new Date(),
        hedera_sync_status: hederaSyncStatus,
        hedera,
      },
      risk_score: 0.0,
    });

    await logEvent(req, {
      action: "agent_verify",
      agentId: agent.id,
      payload: {
        hederaSyncStatus,
      },
    });

    return res.json({
      success: true,
      message: "Agent verified successfully",
      verificationStatus: "verified",
      hederaSyncStatus,
      agent: {
        id: agent.id,
        status: agent.status,
      },
      hedera,
    });
  } catch (error) {
    console.error("[verify] Fatal error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @openapi
 * /agents/{id}/hcs-history:
 *   get:
 *     tags: [Agents]
 *     summary: Get Hedera HCS history for an agent
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 */
router.get("/:id/hcs-history", requireAuth, async (req, res) => {
  try {
    const agent = await Agent.findOne({
      where: {
        id: req.params.id,
        creator_id: req.user.id,
      },
    });

    if (!agent) {
      return res.status(404).json({ message: "Agent not found" });
    }

    const registry = await AgentHcsRegistry.findOne({
      where: { agent_id: agent.id },
    });

    if (!registry) {
      return res.status(404).json({
        message:
          "Agent not registered on Hedera HCS yet. Call POST /agents/:id/verify first.",
      });
    }

    const history = await getAgentHistory(registry.hcs_topic_id);

    return res.json({
      agentId: agent.id,
      topicId: registry.hcs_topic_id,
      hashscanUrl: `https://hashscan.io/${
        process.env.HEDERA_NETWORK || "testnet"
      }/topic/${registry.hcs_topic_id}`,
      messageCount: history.length,
      items: history.map((item) => ({
        sequenceNumber: item.sequenceNumber,
        consensusTimestamp: item.consensusTimestamp,
        type: item.content?.type || null,
        payload: item.content || {},
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;