const express = require("express");
const router = express.Router();

const Agent = require("../models/agent");
const AgentMetadata = require("../models/agentMetadata");
const AgentReputation = require("../models/agentReputation");
const AgentBehaviorLog = require("../models/agentBehaviorLog");

const { generateFingerprint } = require("../services/fingerprint");
const { logEvent } = require("../services/audit/logEvent");

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
  // Support both snake_case and camelCase from frontend
  const agent_name = body.agent_name || body.agentName || body.name || null;
  const description = body.description || null;
  const agent_type = body.agent_type || body.agentType || null;

  // Frontend uses walletAddress. Your system uses public_key.
  // We map walletAddress -> public_key to avoid schema changes.
  const public_key =
    body.public_key ||
    body.publicKey ||
    body.wallet_address ||
    body.walletAddress ||
    null;

  const api_endpoint = body.api_endpoint || body.apiEndpoint || null;

  // Old fields still supported (no conflict)
  const model_name =
    body.model_name || body.modelName || agent_type || "unknown";
  const version = body.version || "unknown";
  const execution_environment =
    body.execution_environment ||
    body.executionEnvironment ||
    (api_endpoint ? "api" : "unknown");

  const metadata_json = parseJsonMaybe(
    body.metadata || body.metadata_json || body.metadataJson,
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

router.post("/register", async (req, res) => {
  try {
    const p = normalizeRegisterPayload(req.body || {});

    if (!p.agent_name || !p.public_key) {
      return res.status(400).json({
        message:
          "agent_name (or agentName) and public_key (or walletAddress) are required",
      });
    }

    const existing = await Agent.findOne({
      where: { public_key: p.public_key },
    });
    if (existing) {
      return res
        .status(409)
        .json({ message: "Agent already exists", agentId: existing.id });
    }

    const fingerprint = generateFingerprint(p.public_key);

    const agent = await Agent.create({
      agent_name: p.agent_name,
      public_key: p.public_key,
      fingerprint,
    });

    // Keep existing tables unchanged:
    // Store structured form fields in AgentMetadata via existing columns (best-effort)
    await AgentMetadata.create({
      agent_id: agent.id,
      model_name: p.model_name,
      version: p.version,
      execution_environment: p.execution_environment,
    });

    await AgentReputation.create({
      agent_id: agent.id,
      score: 0.0,
      risk_level: "low",
    });

    // Persist the extra form fields safely (JSONB) without altering schema
    await AgentBehaviorLog.create({
      agent_id: agent.id,
      event_type: "registration",
      event_payload: {
        description: p.description,
        agentType: p.agent_type,
        walletAddress: p.public_key,
        apiEndpoint: p.api_endpoint,
        metadata: p.metadata_json,
      },
      risk_score: 0.0,
    });

    await logEvent(req, {
      action: "agent_register",
      agentId: agent.id,
      payload: {
        description: p.description,
        agentType: p.agent_type,
        walletAddress: p.public_key,
        apiEndpoint: p.api_endpoint,
      },
    });

    // Return a frontend-friendly response (no conflicts)
    return res.status(201).json({
      id: agent.id,
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
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
});

// Get Agent Profile
router.get("/:id", async (req, res) => {
  try {
    const agent = await Agent.findByPk(req.params.id, {
      include: [
        { model: AgentMetadata, as: "metadata" },
        { model: AgentReputation, as: "reputation" },
      ],
    });

    if (!agent) return res.status(404).json({ message: "Agent not found" });

    await logEvent(req, { action: "agent_fetch", agentId: agent.id });

    res.json(agent);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Verify Agent
router.post("/:id/verify", async (req, res) => {
  try {
    const agent = await Agent.findByPk(req.params.id);
    if (!agent) return res.status(404).json({ message: "Agent not found" });

    agent.status = "verified";
    await agent.save();

    await AgentBehaviorLog.create({
      agent_id: agent.id,
      event_type: "verification",
      event_payload: { verified_at: new Date() },
      risk_score: 0.0,
    });

    await logEvent(req, { action: "agent_verify", agentId: agent.id });

    res.json({ message: "Agent verified", agent });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
