// src/services/hedera/hcsSchedulerService.js
//
// Hedera Scheduled Transaction service.
// Creates a one-shot scheduled transaction that:
//   1. Fires at a future time (default: 1 hour)
//   2. Submits "REVERIFICATION_TRIGGERED" to the agent's HCS topic
//   3. The watcher (hcsWatcherService) detects this message and chains the next schedule
//
// WHY scheduled transactions:
//   Hedera schedules execute on-chain at a specific time — no backend cron needed.
//   The schedule fires even if your server restarts. The watcher just needs to
//   detect the fired message and create the NEXT schedule.
//
// Hedera Schedule docs: https://docs.hedera.com/hedera/sdks-and-apis/sdks/schedule-transaction
// setWaitForExpiry:     https://docs.hedera.com/hedera/sdks-and-apis/sdks/schedule-transaction#schedule-create-transaction

"use strict";

const {
  ScheduleCreateTransaction,
  TopicMessageSubmitTransaction,
  Timestamp,
} = require("@hashgraph/sdk");

const { getHederaClient, getOperatorKey } = require("../../config/hederaClient");
const logger                              = require("../../config/logger");
const AgentHcsRegistry                    = require("../../models/agentHcsRegistry");

// Default reverification interval in seconds (1 hour)
const REVERIFY_INTERVAL_SECONDS = parseInt(
  process.env.HEDERA_REVERIFY_INTERVAL_SECONDS || "3600"
);

/**
 * Creates a Hedera scheduled transaction that will fire in `delaySeconds`.
 * When it fires, it submits a REVERIFICATION_TRIGGERED message to the agent's HCS topic.
 * The watcher picks this up and runs the actual reverification + creates the next schedule.
 *
 * @param {string} agentTopicId  - The agent's HCS topic ID e.g. "0.0.4821733"
 * @param {string} agentId       - Agent UUID (included in the message for watcher)
 * @param {number} delaySeconds  - How long until schedule fires (default: 1hr)
 * @returns {string}             - The new schedule ID e.g. "0.0.5555"
 */
async function scheduleReverification(agentTopicId, agentId, delaySeconds = REVERIFY_INTERVAL_SECONDS) {
  const client      = getHederaClient();
  const operatorKey = getOperatorKey();

  const fireAt = new Date(Date.now() + delaySeconds * 1_000);

  // The inner transaction: submit a trigger message to the agent's HCS topic
  // This is what Hedera will execute when the schedule fires
  const innerTx = new TopicMessageSubmitTransaction()
    .setTopicId(agentTopicId)
    .setMessage(
      JSON.stringify({
        type:        "REVERIFICATION_TRIGGERED",
        agentId,
        agentTopicId,
        scheduledAt: new Date().toISOString(),
        fireAt:      fireAt.toISOString(),
      })
    );

  // Wrap in ScheduleCreateTransaction
  // setWaitForExpiry(true) = executes AT expiry, not before
  const scheduleTx = await new ScheduleCreateTransaction()
    .setScheduledTransaction(innerTx)
    .setScheduleMemo(`Agentity reverify: ${agentId} at ${fireAt.toISOString()}`)
    .setExpirationTime(Timestamp.fromDate(fireAt))
    .setWaitForExpiry(true)
    .setAdminKey(operatorKey)
    .execute(client);

  const scheduleReceipt = await scheduleTx.getReceipt(client);
  const scheduleId      = scheduleReceipt.scheduleId.toString();

  logger.info({
    message: `[scheduler] Schedule created for agent ${agentId}: ${scheduleId} — fires at ${fireAt.toISOString()}`,
  });

  // Update the registry row with the new active schedule
  await AgentHcsRegistry.update(
    {
      active_schedule_id: scheduleId,
      next_scheduled_at:  fireAt,
    },
    { where: { agent_id: agentId } }
  );

  return scheduleId;
}

/**
 * Cancels the active schedule for an agent (e.g. if agent is suspended).
 * Uses the admin key set during schedule creation.
 *
 * Docs: https://docs.hedera.com/hedera/sdks-and-apis/sdks/schedule-transaction#delete-a-schedule-transaction
 *
 * @param {string} scheduleId  - e.g. "0.0.5555"
 * @param {string} agentId     - Agent UUID (for DB update)
 */
async function cancelSchedule(scheduleId, agentId) {
  if (!scheduleId) return;

  const { ScheduleDeleteTransaction } = require("@hashgraph/sdk");
  const client = getHederaClient();

  try {
    await new ScheduleDeleteTransaction()
      .setScheduleId(scheduleId)
      .execute(client);

    await AgentHcsRegistry.update(
      {
        active_schedule_id: null,
        next_scheduled_at:  null,
      },
      { where: { agent_id: agentId } }
    );

    logger.info({ message: `[scheduler] Schedule ${scheduleId} cancelled for agent ${agentId}` });
  } catch (err) {
    // Schedule may have already fired or expired — not a fatal error
    logger.error({
      message: `[scheduler] Failed to cancel schedule ${scheduleId}: ${err.message}`,
    });
  }
}

module.exports = { scheduleReverification, cancelSchedule, REVERIFY_INTERVAL_SECONDS };
