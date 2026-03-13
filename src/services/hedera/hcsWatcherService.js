// src/services/hedera/hcsWatcherService.js
//
// Background watcher — polls the Hedera Mirror Node every POLL_INTERVAL_MS
// looking for REVERIFICATION_TRIGGERED messages on active agent topics.
//
// When a triggered message is found:
//   1. Runs runScheduledReverification() → posts REVERIFIED to HCS
//   2. Creates the NEXT scheduled transaction → keeps the chain alive
//
// Recovery: On server startup, checks for agents whose last_verified_at is
// overdue (> 2× interval) and reschedules immediately. This prevents the
// chain from breaking if the server was down when a schedule fired.
//
// Mirror Node docs: https://docs.hedera.com/hedera/sdks-and-apis/rest-api#topics

"use strict";

const { getMirrorNodeUrl }           = require("../../config/hederaClient");
const { runScheduledReverification } = require("./hcsRegistryService");
const { scheduleReverification, REVERIFY_INTERVAL_SECONDS } = require("./hcsSchedulerService");
const logger                         = require("../../config/logger");
const AgentHcsRegistry               = require("../../models/agentHcsRegistry");
const AgentHcsMessage                = require("../../models/agentHcsMessage");
const { Op }                         = require("sequelize");

// How often the watcher polls (default: 60 seconds)
const POLL_INTERVAL_MS = parseInt(process.env.HEDERA_WATCHER_POLL_MS || "60000");

let _watcherInterval = null;
let _isRunning       = false;

// ─────────────────────────────────────────────────────────────────────────────
// MIRROR NODE QUERY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetches new messages on a topic since a given timestamp.
 * Uses Mirror Node REST API — no SDK connection needed.
 *
 * @param {string} topicId            - e.g. "0.0.4821733"
 * @param {string} sinceTimestamp     - ISO string — only fetch messages after this
 * @returns {Array<{sequenceNumber, content}>}
 */
async function _fetchNewMessages(topicId, sinceTimestamp) {
  const base = getMirrorNodeUrl();

  // Mirror Node uses consensus timestamps in "seconds.nanoseconds" format
  // We pass an ISO timestamp and let the API filter
  const since = sinceTimestamp
    ? `&timestamp=gt:${new Date(sinceTimestamp).getTime() / 1000}`
    : "";

  const url = `${base}/topics/${topicId}/messages?order=asc&limit=25${since}`;

  try {
    const res  = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();

    return (data.messages || []).map((m) => {
      let content = {};
      try {
        content = JSON.parse(Buffer.from(m.message, "base64").toString("utf8"));
      } catch {
        content = {};
      }
      return {
        sequenceNumber:     m.sequence_number,
        consensusTimestamp: m.consensus_timestamp,
        content,
      };
    });
  } catch (err) {
    logger.error({ message: `[watcher] Mirror Node query failed for ${topicId}: ${err.message}` });
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE POLL LOOP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single poll cycle — checks all active verified agents for
 * REVERIFICATION_TRIGGERED messages and processes them.
 */
async function _poll() {
  try {
    // Find all verified agents that have an active schedule
    const activeRegistries = await AgentHcsRegistry.findAll({
      where: {
        status:             { [Op.in]: ["verified", "registered"] },
        active_schedule_id: { [Op.ne]: null },
      },
    });

    if (activeRegistries.length === 0) return;

    logger.info({ message: `[watcher] Polling ${activeRegistries.length} active agents` });

    for (const registry of activeRegistries) {
      try {
        await _checkAgent(registry);
      } catch (err) {
        logger.error({
          message: `[watcher] Error processing agent ${registry.agent_id}: ${err.message}`,
        });
      }
    }
  } catch (err) {
    logger.error({ message: `[watcher] Poll cycle failed: ${err.message}` });
  }
}

/**
 * Checks a single agent's HCS topic for a REVERIFICATION_TRIGGERED message.
 * If found, runs reverification and creates the next schedule.
 */
async function _checkAgent(registry) {
  const { agent_id, hcs_topic_id, last_verified_at } = registry;

  // Only look at messages after the last verification
  const since = last_verified_at?.toISOString() ?? null;

  const newMessages = await _fetchNewMessages(hcs_topic_id, since);
  const trigger     = newMessages.find(
    (m) => m.content?.type === "REVERIFICATION_TRIGGERED" &&
           m.content?.agentId === agent_id
  );

  if (!trigger) return; // Schedule hasn't fired yet

  logger.info({
    message: `[watcher] REVERIFICATION_TRIGGERED detected for agent ${agent_id} (seq: ${trigger.sequenceNumber})`,
  });

  // Mirror the trigger message locally (idempotent check)
  const alreadyMirrored = await AgentHcsMessage.findOne({
    where: {
      agent_id,
      message_type:    "REVERIFICATION_TRIGGERED",
      sequence_number: trigger.sequenceNumber,
    },
  });

  if (!alreadyMirrored) {
    await AgentHcsMessage.create({
      agent_id,
      hcs_topic_id,
      sequence_number:    trigger.sequenceNumber,
      message_type:       "REVERIFICATION_TRIGGERED",
      message_payload:    trigger.content,
      consensus_timestamp: trigger.consensusTimestamp,
    });
  }

  // ── Run the actual reverification ──────────────────────
  await runScheduledReverification(agent_id, registry);

  // ── Create the NEXT schedule — keeps the chain alive ───
  const nextScheduleId = await scheduleReverification(
    hcs_topic_id,
    agent_id,
    REVERIFY_INTERVAL_SECONDS
  );

  logger.info({
    message: `[watcher] Agent ${agent_id} chain continues — next schedule: ${nextScheduleId}`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOVERY — run on server startup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects agents whose last_verified_at is overdue (server was down when
 * the schedule fired). Reschedules them immediately so the chain continues.
 *
 * Called once from server.js on startup.
 */
async function recoverMissedSchedules() {
  const overdueThreshold = new Date(
    Date.now() - REVERIFY_INTERVAL_SECONDS * 2 * 1_000
  );

  const overdue = await AgentHcsRegistry.findAll({
    where: {
      status: { [Op.in]: ["verified", "registered"] },
      [Op.or]: [
        { last_verified_at: { [Op.lt]: overdueThreshold } },
        { last_verified_at: null },
      ],
    },
  });

  if (overdue.length === 0) return;

  logger.info({
    message: `[watcher] Recovery: ${overdue.length} agent(s) missed scheduled reverification — rescheduling`,
  });

  for (const registry of overdue) {
    try {
      // Fire in 2 minutes to give server time to fully start
      await scheduleReverification(
        registry.hcs_topic_id,
        registry.agent_id,
        120
      );
    } catch (err) {
      logger.error({
        message: `[watcher] Recovery reschedule failed for ${registry.agent_id}: ${err.message}`,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Starts the watcher.
 * Called from server.js after database sync.
 */
async function startWatcher() {
  if (_isRunning) return;
  _isRunning = true;

  logger.info({
    message: `[watcher] Starting — poll interval: ${POLL_INTERVAL_MS}ms, reverify interval: ${REVERIFY_INTERVAL_SECONDS}s`,
  });

  // Run recovery check on startup
  try {
    await recoverMissedSchedules();
  } catch (err) {
    logger.error({ message: `[watcher] Recovery check failed: ${err.message}` });
  }

  // Start polling loop
  _watcherInterval = setInterval(_poll, POLL_INTERVAL_MS);

  // Also run an initial poll immediately
  _poll().catch((err) => {
    logger.error({ message: `[watcher] Initial poll failed: ${err.message}` });
  });
}

/**
 * Stops the watcher (useful for testing / graceful shutdown).
 */
function stopWatcher() {
  if (_watcherInterval) {
    clearInterval(_watcherInterval);
    _watcherInterval = null;
    _isRunning       = false;
    logger.info({ message: "[watcher] Stopped" });
  }
}

module.exports = { startWatcher, stopWatcher, recoverMissedSchedules };
