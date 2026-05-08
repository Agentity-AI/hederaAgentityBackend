// src/services/hedera/hcsRegistryService.js
//
// Core HCS service. Handles:
//   1. Creating per-agent HCS topic on first registration
//   2. Submitting HCS messages (REGISTERED, VERIFIED, REVERIFIED, FLAGGED)
//   3. Querying Mirror Node for full topic history
//   4. Calculating trust score from HCS messages + AgentBehaviorLogs
//
// Hedera HCS docs:   https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/create-a-topic
// Mirror Node docs:  https://docs.hedera.com/hedera/sdks-and-apis/rest-api#topics

"use strict";

const {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} = require("@hashgraph/sdk");

const { getHederaClient, getMirrorNodeUrl } = require("../../config/hederaClient");
const logger                                = require("../../config/logger");
const AgentHcsRegistry                      = require("../../models/agentHcsRegistry");
const AgentHcsMessage                       = require("../../models/agentHcsMessage");
const AgentBehaviorLog                      = require("../../models/agentBehaviorLog");
const AgentReputation                       = require("../../models/agentReputation");

// Minimum trust score to be considered "healthy"
const HEALTHY_THRESHOLD = parseInt(process.env.HEDERA_HEALTHY_THRESHOLD || "60");

async function persistAgentReputation(agentId, score, riskLevel) {
  const existing = await AgentReputation.findOne({
    where: { agent_id: agentId },
    order: [["updatedAt", "DESC"], ["createdAt", "DESC"]],
  });

  if (existing) {
    await existing.update({
      score,
      risk_level: riskLevel,
    });

    return existing;
  }

  return AgentReputation.create({
    agent_id: agentId,
    score,
    risk_level: riskLevel,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submits a JSON message to an HCS topic.
 * Returns { sequenceNumber, consensusTimestamp }.
 */
async function _submitMessage(topicId, messageObj) {
  const client = getHederaClient();

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(messageObj))
    .execute(client);

  const receipt = await tx.getReceipt(client);

  return {
    sequenceNumber:     receipt.topicSequenceNumber?.toNumber() ?? null,
    consensusTimestamp: new Date().toISOString(),
  };
}

/**
 * Fetches all HCS messages for a topic from the Mirror Node REST API.
 * Returns array of { sequenceNumber, consensusTimestamp, content }.
 *
 * Mirror Node docs: https://docs.hedera.com/hedera/sdks-and-apis/rest-api#topics
 */
async function _fetchTopicHistory(topicId) {
  const base = getMirrorNodeUrl();
  const url  = `${base}/topics/${topicId}/messages?order=asc&limit=100`;

  const res  = await fetch(url);
  if (!res.ok) {
    logger.error({ message: `[hcs] Mirror Node fetch failed for topic ${topicId}: ${res.status}` });
    return [];
  }

  const data = await res.json();
  return (data.messages || []).map((m) => {
    let content = {};
    try {
      content = JSON.parse(Buffer.from(m.message, "base64").toString("utf8"));
    } catch {
      content = { raw: m.message };
    }
    return {
      sequenceNumber:     m.sequence_number,
      consensusTimestamp: m.consensus_timestamp,
      content,
    };
  });
}

/**
 * Calculates a trust score (0–100) from:
 *   - HCS local message history (verifications + flags)
 *   - AgentBehaviorLog simulation risk scores
 *   - AgentReputation current score
 */
async function _calculateTrustScore(agentId, hcsMessages) {
  let score = 75; // sensible base

  // ── 1. Verification pass rate ──────────────────────────
  const verifications = hcsMessages.filter((m) =>
    ["VERIFIED", "REVERIFIED"].includes(m.message_type)
  );
  const recentPasses = verifications
    .slice(-5)
    .filter((m) => m.is_healthy).length;
  score += recentPasses * 3; // up to +15

  // ── 2. Flag penalty ────────────────────────────────────
  const flagCount = hcsMessages.filter((m) => m.message_type === "AGENT_FLAGGED").length;
  score -= flagCount * 15;

  // ── 3. Simulation risk scores from AgentBehaviorLog ────
  const simLogs = await AgentBehaviorLog.findAll({
    where: { agent_id: agentId, event_type: "simulation" },
    order: [["createdAt", "DESC"]],
    limit: 10,
  });

  if (simLogs.length > 0) {
    const avgRisk = simLogs.reduce((sum, log) => {
      const rs = parseFloat(log.risk_score) || 0;
      // Normalise: risk_score may be 0–1 or 0–100
      const normalised = rs <= 1 ? rs * 100 : rs;
      return sum + normalised;
    }, 0) / simLogs.length;

    // Deduct up to 30 points for high simulation risk
    score -= Math.floor(avgRisk * 0.3);
  }

  // ── 4. Blend with existing AgentReputation score ───────
  const reputation = await AgentReputation.findOne({ where: { agent_id: agentId } });
  if (reputation && reputation.score > 0) {
    // Weighted average: 70% new calc, 30% existing reputation
    score = Math.round(score * 0.7 + reputation.score * 0.3);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Risk level label from trust score.
 */
function _riskLevel(score) {
  if (score >= 85) return "safe";
  if (score >= 70) return "low";
  if (score >= 50) return "medium";
  return "high";
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensures an agent has an HCS topic and AGENT_REGISTERED message.
 * Idempotent — safe to call multiple times.
 *
 * @param {object} agent  - Agent Sequelize model instance
 * @returns {AgentHcsRegistry} - the registry row
 */
async function ensureAgentRegistered(agent) {
  // Already registered?
  const existing = await AgentHcsRegistry.findOne({
    where: { agent_id: agent.id },
  });
  if (existing) return existing;

  const client = getHederaClient();

  // ── 1. Create a dedicated HCS topic for this agent ─────
  const topicTx = await new TopicCreateTransaction()
    .setTopicMemo(`Agentity Registry: ${agent.agent_name} (${agent.id})`)
    .execute(client);

  const topicReceipt  = await topicTx.getReceipt(client);
  const agentTopicId  = topicReceipt.topicId.toString();

  logger.info({ message: `[hcs] Topic created for agent ${agent.id}: ${agentTopicId}` });

  // ── 2. Submit AGENT_REGISTERED to per-agent topic ──────
  const regMessage = {
    type:         "AGENT_REGISTERED",
    agentId:      agent.id,
    agentName:    agent.agent_name,
    fingerprint:  agent.fingerprint,
    publicKey:    agent.public_key,
    timestamp:    new Date().toISOString(),
    platform:     "Agentity",
    version:      "1.0",
  };

  const regReceipt = await _submitMessage(agentTopicId, regMessage);

  // ── 3. Submit to global registry topic (if configured) ─
  let globalSeq = null;
  const globalTopicId = process.env.HEDERA_GLOBAL_REGISTRY_TOPIC_ID;
  if (globalTopicId) {
    try {
      const globalReceipt = await _submitMessage(globalTopicId, {
        type:        "AGENT_REGISTERED",
        agentId:     agent.id,
        agentName:   agent.agent_name,
        agentTopicId,
        timestamp:   new Date().toISOString(),
      });
      globalSeq = globalReceipt.sequenceNumber;
    } catch (err) {
      logger.error({ message: `[hcs] Failed to log to global registry topic: ${err.message}` });
    }
  }

  // ── 4. Persist to DB ───────────────────────────────────
  const registry = await AgentHcsRegistry.create({
    agent_id:           agent.id,
    hcs_topic_id:       agentTopicId,
    global_registry_seq: globalSeq,
    status:             "registered",
  });

  // Mirror the message locally
  await AgentHcsMessage.create({
    agent_id:           agent.id,
    hcs_topic_id:       agentTopicId,
    sequence_number:    regReceipt.sequenceNumber,
    message_type:       "AGENT_REGISTERED",
    message_payload:    regMessage,
    consensus_timestamp: regReceipt.consensusTimestamp,
  });

  logger.info({ message: `[hcs] Agent ${agent.id} registered on HCS topic ${agentTopicId}` });

  return registry;
}

/**
 * Runs an IMMEDIATE verification when the user clicks Verify.
 * Calculates trust score, submits VERIFIED message to HCS,
 * updates AgentReputation, and returns the full result.
 *
 * @param {object} agent    - Agent Sequelize model instance
 * @param {object} registry - AgentHcsRegistry instance (from ensureAgentRegistered)
 * @returns {object} - verification result payload
 */
async function runImmediateVerification(agent, registry) {
  // Get existing local HCS messages for score calculation
  const existingMessages = await AgentHcsMessage.findAll({
    where: { agent_id: agent.id },
    order: [["created_at", "ASC"]],
  });

  const score     = await _calculateTrustScore(agent.id, existingMessages);
  const isHealthy = score >= HEALTHY_THRESHOLD;
  const riskLevel = _riskLevel(score);

  const verifiedMessage = {
    type:         "VERIFIED",
    agentId:      agent.id,
    agentName:    agent.agent_name,
    score,
    isHealthy,
    riskLevel,
    method:       "manual-trigger",   // user clicked Verify
    timestamp:    new Date().toISOString(),
    verificationCount: (registry.verification_count || 0) + 1,
  };

  // Submit to HCS
  const receipt = await _submitMessage(registry.hcs_topic_id, verifiedMessage);

  // Mirror locally
  await AgentHcsMessage.create({
    agent_id:           agent.id,
    hcs_topic_id:       registry.hcs_topic_id,
    sequence_number:    receipt.sequenceNumber,
    message_type:       "VERIFIED",
    message_payload:    verifiedMessage,
    consensus_timestamp: receipt.consensusTimestamp,
    score,
    is_healthy:         isHealthy,
    score_delta:        null, // first verification — no delta
  });

  // Update AgentHcsRegistry
  await registry.update({
    current_score:      score,
    current_risk_level: riskLevel,
    last_verified_at:   new Date(),
    verification_count: (registry.verification_count || 0) + 1,
    status:             isHealthy ? "verified" : "flagged",
  });

  // Update AgentReputation to match
  await persistAgentReputation(agent.id, score, riskLevel);

  logger.info({
    message: `[hcs] Agent ${agent.id} verified — score: ${score}, healthy: ${isHealthy}`,
  });

  return {
    topicId:            registry.hcs_topic_id,
    sequenceNumber:     receipt.sequenceNumber,
    consensusTimestamp: receipt.consensusTimestamp,
    score,
    isHealthy,
    riskLevel,
    verificationCount:  registry.verification_count + 1,
    hashscanUrl:        `https://hashscan.io/${process.env.HEDERA_NETWORK || "testnet"}/topic/${registry.hcs_topic_id}`,
  };
}

/**
 * Runs a SCHEDULED reverification (triggered by watcher detecting
 * a REVERIFICATION_TRIGGERED HCS message).
 *
 * Calculates new score, submits REVERIFIED (or AGENT_FLAGGED) to HCS,
 * updates DB, and returns result.
 *
 * @param {string} agentId
 * @param {AgentHcsRegistry} registry
 * @returns {object}
 */
async function runScheduledReverification(agentId, registry) {
  const Agent = require("../../models/agent");
  const agent = await Agent.findByPk(agentId);
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  // Get current local message history for score calculation
  const messages = await AgentHcsMessage.findAll({
    where: { agent_id: agentId },
    order: [["created_at", "ASC"]],
  });

  const score     = await _calculateTrustScore(agentId, messages);
  const isHealthy = score >= HEALTHY_THRESHOLD;
  const riskLevel = _riskLevel(score);

  // Calculate delta vs last verification
  const lastVerified = messages
    .filter((m) => ["VERIFIED", "REVERIFIED"].includes(m.message_type))
    .slice(-1)[0];
  const scoreDelta = lastVerified?.score != null ? score - lastVerified.score : null;

  const reverifiedMessage = {
    type:         "REVERIFIED",
    agentId,
    agentName:    agent.agent_name,
    score,
    scoreDelta,
    isHealthy,
    riskLevel,
    method:       "scheduled-auto",
    timestamp:    new Date().toISOString(),
    verificationCount: (registry.verification_count || 0) + 1,
  };

  const receipt = await _submitMessage(registry.hcs_topic_id, reverifiedMessage);

  await AgentHcsMessage.create({
    agent_id:           agentId,
    hcs_topic_id:       registry.hcs_topic_id,
    sequence_number:    receipt.sequenceNumber,
    message_type:       "REVERIFIED",
    message_payload:    reverifiedMessage,
    consensus_timestamp: receipt.consensusTimestamp,
    score,
    is_healthy:         isHealthy,
    score_delta:        scoreDelta,
  });

  // If score dropped — flag the agent
  if (!isHealthy) {
    const flagMessage = {
      type:      "AGENT_FLAGGED",
      agentId,
      score,
      reason:    `Trust score dropped to ${score} (below threshold ${HEALTHY_THRESHOLD})`,
      timestamp: new Date().toISOString(),
    };

    const flagReceipt = await _submitMessage(registry.hcs_topic_id, flagMessage);

    await AgentHcsMessage.create({
      agent_id:           agentId,
      hcs_topic_id:       registry.hcs_topic_id,
      sequence_number:    flagReceipt.sequenceNumber,
      message_type:       "AGENT_FLAGGED",
      message_payload:    flagMessage,
      consensus_timestamp: flagReceipt.consensusTimestamp,
      score,
      is_healthy:         false,
    });
  }

  // Update DB
  await registry.update({
    current_score:      score,
    current_risk_level: riskLevel,
    last_verified_at:   new Date(),
    verification_count: (registry.verification_count || 0) + 1,
    status:             isHealthy ? "verified" : "flagged",
  });

  await persistAgentReputation(agentId, score, riskLevel);

  logger.info({
    message: `[hcs] Agent ${agentId} reverified — score: ${score}, delta: ${scoreDelta}, healthy: ${isHealthy}`,
  });

  return { score, isHealthy, riskLevel, scoreDelta };
}

/**
 * Fetches the full HCS topic history for an agent from the Mirror Node.
 * Used for the verification detail view.
 *
 * @param {string} topicId  - e.g. "0.0.4821733"
 * @returns {Array}
 */
async function getAgentHistory(topicId) {
  return _fetchTopicHistory(topicId);
}

module.exports = {
  ensureAgentRegistered,
  runImmediateVerification,
  runScheduledReverification,
  getAgentHistory,
  HEALTHY_THRESHOLD,
};
