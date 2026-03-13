// src/routes/agents.js
// MODIFIED: POST /:id/verify now triggers:
//   1. HCS topic creation + AGENT_REGISTERED message (if first time)
//   2. Immediate trust score calculation + VERIFIED message on HCS
//   3. First scheduled reverification (fires in 1hr, then chains every 1hr)
//
// All other routes are unchanged from original.

const express = require("express");
const router  = express.Router();

const sequelize        = require("../config/database");
const Agent            = require("../models/agent");
const AgentMetadata    = require("../models/agentMetadata");
const AgentReputation  = require("../models/agentReputation");
const AgentBehaviorLog = require("../models/agentBehaviorLog");

const { requireAuth }        = require("../middleware/auth");
const { generateFingerprint } = require("../services/fingerprint");
const { logEvent }           = require("../services/audit/logEvent");

// ── NEW: Hedera services ───────────────────────────────────
const { ensureAgentRegistered, runImmediateVerification } = require("../services/hedera/hcsRegistryService");
const { scheduleReverification } = require("../services/hedera/hcsSchedulerService");

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function parseJsonMaybe(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try { return JSON.parse(value); } catch { return null; }
}

function normalizeRegisterPayload(body) {
  const agent_name = body.agent_name || body.agentName || body.name || null;
  const description = body.description || null;
  const agent_type  = body.agent_type || body.agentType || null;
  const public_key  = body.public_key || body.publicKey || body.wallet_address || body.walletAddress || null;
  const api_endpoint = body.api_endpoint || body.apiEndpoint || null;
  const model_name   = body.model_name || body.modelName || agent_type || "unknown";
  const version      = body.version || "unknown";
  const execution_environment = body.execution_environment || body.executionEnvironment || (api_endpoint ? "api" : "unknown");
  const metadata_json = parseJsonMaybe(body.metadata || body.metadata_json || body.metadataJson);
  return { agent_name, public_key, description, agent_type, api_endpoint, model_name, version, execution_environment, metadata_json };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /agents/register:
 *   post:
 *     tags: [Agents]
 *     summary: Register agent and tie it to the authenticated user
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [agentName, walletAddress]
 *             properties:
 *               agentName:     { type: string }
 *               walletAddress: { type: string }
 *               description:   { type: string }
 *               agentType:     { type: string }
 *               apiEndpoint:   { type: string }
 *               metadata:      { type: string }
 *     responses:
 *       201: { description: Agent created }
 *       409: { description: Agent already exists }
 */
router.post("/register", requireAuth, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const p = normalizeRegisterPayload(req.body || {});

    if (!p.agent_name || !p.public_key) {
      await transaction.rollback();
      return res.status(400).json({
        message: "agent_name (or agentName) and public_key (or walletAddress) are required",
      });
    }

    const existing = await Agent.findOne({ where: { public_key: p.public_key }, transaction });
    if (existing) {
      await transaction.rollback();
      return res.status(409).json({ message: "Agent already exists", agentId: existing.id });
    }

    const fingerprint = generateFingerprint(p.public_key);

    const agent = await Agent.create(
      { creator_id: req.user.id, agent_name: p.agent_name, public_key: p.public_key, fingerprint },
      { transaction }
    );

    await AgentMetadata.create(
      { agent_id: agent.id, model_name: p.model_name, version: p.version, execution_environment: p.execution_environment },
      { transaction }
    );

    await AgentReputation.create({ agent_id: agent.id, score: 0.0, risk_level: "low" }, { transaction });

    await AgentBehaviorLog.create(
      {
        agent_id: agent.id,
        event_type: "registration",
        event_payload: { description: p.description, agentType: p.agent_type, walletAddress: p.public_key, apiEndpoint: p.api_endpoint, metadata: p.metadata_json, creator_id: req.user.id },
        risk_score: 0.0,
      },
      { transaction }
    );

    await logEvent(req, {
      action: "agent_register",
      agentId: agent.id,
      payload: { description: p.description, agentType: p.agent_type, walletAddress: p.public_key, apiEndpoint: p.api_endpoint },
      transaction,
    });

    await transaction.commit();

    return res.status(201).json({
      id: agent.id,
      creator_id: agent.creator_id,
      agent_name: agent.agent_name,
      fingerprint: agent.fingerprint,
      public_key: agent.public_key,
      status: agent.status,
      description: p.description,
      agentType: p.agent_type,
      walletAddress: p.public_key,
      apiEndpoint: p.api_endpoint,
      metadata: p.metadata_json,
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
 *     responses:
 *       200: { description: List of current user's agents }
 */
router.get("/my", requireAuth, async (req, res) => {
  try {
    const agents = await Agent.findAll({
      where: { creator_id: req.user.id },
      include: [
        { model: AgentMetadata,   as: "metadata"   },
        { model: AgentReputation, as: "reputation" },
      ],
      order: [["createdAt", "DESC"]],
    });
    return res.json({ userId: req.user.id, total: agents.length, agents });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @openapi
 * /agents/user/{userId}:
 *   get:
 *     tags: [Agents]
 *     summary: Get agents registered by a given user id
 */
router.get("/user/:userId", async (req, res) => {
  try {
    const agents = await Agent.findAll({
      where: { creator_id: req.params.userId },
      include: [
        { model: AgentMetadata,   as: "metadata"   },
        { model: AgentReputation, as: "reputation" },
      ],
      order: [["createdAt", "DESC"]],
    });
    return res.json({ userId: req.params.userId, total: agents.length, agents });
  } catch {
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * @openapi
 * /agents/{id}:
 *   get:
 *     tags: [Agents]
 *     summary: Get agent by id (includes HCS registry info if available)
 */
router.get("/:id", async (req, res) => {
  try {
    const AgentHcsRegistry = require("../models/agentHcsRegistry");

    const agent = await Agent.findByPk(req.params.id, {
      include: [
        { model: AgentMetadata,    as: "metadata"     },
        { model: AgentReputation,  as: "reputation"   },
        { model: AgentHcsRegistry, as: "hcsRegistry"  },
      ],
    });

    if (!agent) return res.status(404).json({ message: "Agent not found" });

    await logEvent(req, { action: "agent_fetch", agentId: agent.id });
    res.json(agent);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ✦ MODIFIED VERIFY ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /agents/{id}/verify:
 *   post:
 *     tags: [Agents]
 *     summary: Verify agent — triggers immediate HCS verification + hourly auto-reverification
 *     description: |
 *       On first call:
 *         1. Creates a Hedera HCS topic for the agent (permanent on-chain identity)
 *         2. Submits AGENT_REGISTERED message to HCS
 *         3. Calculates trust score from simulation history
 *         4. Submits VERIFIED message to HCS (immediate — user clicked verify)
 *         5. Creates first Hedera scheduled transaction (fires in 1hr)
 *         6. Sets agent status to "verified"
 *
 *       On subsequent calls:
 *         - Re-runs verification with latest data
 *         - Resets the schedule chain
 *
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Verified — returns score + HCS topic + schedule info }
 *       404: { description: Agent not found }
 *       500: { description: Server error }
 */
router.post("/:id/verify", async (req, res) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    // ── Phase 1: Update DB status ──────────────────────────
    agent.status = "verified";
    await agent.save();

    // ── Phase 2: HCS — register topic (idempotent) ─────────
    let hcsResult   = null;
    let scheduleId  = null;
    let nextCheckAt = null;
    let hcsError    = null;

    try {
      // Creates HCS topic + submits AGENT_REGISTERED (safe to call multiple times)
      const registry = await ensureAgentRegistered(agent);

      // ── Phase 3: Immediate verification ───────────────────
      // Calculates score → submits VERIFIED to HCS → updates reputation
      hcsResult = await runImmediateVerification(agent, registry);

      // ── Phase 4: Schedule first 1hr reverification ────────
      // Fires at T+1hr → watcher detects → chains next schedule
      const intervalSeconds = parseInt(process.env.HEDERA_REVERIFY_INTERVAL_SECONDS || "3600");
      scheduleId  = await scheduleReverification(registry.hcs_topic_id, agent.id, intervalSeconds);
      nextCheckAt = new Date(Date.now() + intervalSeconds * 1_000).toISOString();

    } catch (hcsErr) {
      // HCS failure is non-fatal — DB verification still succeeds
      // Log it but don't fail the request
      hcsError = hcsErr.message;
      console.error("[verify] HCS error (non-fatal):", hcsErr.message);
    }

    // ── Phase 5: Behavior log (existing pattern) ───────────
    await AgentBehaviorLog.create({
      agent_id:      agent.id,
      event_type:    "verification",
      event_payload: {
        verified_at: new Date(),
        hcs_topic_id: hcsResult?.topicId ?? null,
        trust_score:  hcsResult?.score   ?? null,
        schedule_id:  scheduleId         ?? null,
      },
      risk_score: 0.0,
    });

    await logEvent(req, { action: "agent_verify", agentId: agent.id });

    // ── Response ───────────────────────────────────────────
    return res.json({
      message: "Agent verified",
      agent: {
        id:     agent.id,
        status: agent.status,
      },

      // HCS details (null if Hedera env vars not configured)
      hedera: hcsResult
        ? {
            topicId:           hcsResult.topicId,
            sequenceNumber:    hcsResult.sequenceNumber,
            trustScore:        hcsResult.score,
            isHealthy:         hcsResult.isHealthy,
            riskLevel:         hcsResult.riskLevel,
            verificationCount: hcsResult.verificationCount,
            scheduleId,
            nextCheckAt,
            hashscanUrl:       hcsResult.hashscanUrl,
          }
        : {
            error: hcsError || "Hedera not configured",
            note:  "Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in .env to enable on-chain verification",
          },
    });
  } catch (error) {
    console.error("[verify] Fatal error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @openapi
 * /agents/{id}/hcs-history:
 *   get:
 *     tags: [Agents]
 *     summary: Get full HCS topic history for an agent (from Hedera Mirror Node)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Full HCS message history }
 *       404: { description: Agent not found or not yet registered on HCS }
 */
router.get("/:id/hcs-history", async (req, res) => {
  try {
    const AgentHcsRegistry = require("../models/agentHcsRegistry");
    const { getAgentHistory } = require("../services/hedera/hcsRegistryService");

    const registry = await AgentHcsRegistry.findOne({
      where: { agent_id: req.params.id },
    });

    if (!registry) {
      return res.status(404).json({
        message: "Agent not registered on Hedera HCS yet. Call POST /agents/:id/verify first.",
      });
    }

    const history = await getAgentHistory(registry.hcs_topic_id);

    return res.json({
      agentId:     req.params.id,
      topicId:     registry.hcs_topic_id,
      hashscanUrl: `https://hashscan.io/${process.env.HEDERA_NETWORK || "testnet"}/topic/${registry.hcs_topic_id}`,
      messageCount: history.length,
      messages:    history,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
