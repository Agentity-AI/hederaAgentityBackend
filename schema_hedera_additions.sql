-- schema_hedera_additions.sql
-- Run this against your Supabase Postgres database to add the two
-- new tables required by the Hedera HCS implementation.
--
-- Tables added:
--   agent_hcs_registry  — one row per agent: topic ID, schedule state, trust score
--   agent_hcs_messages  — local mirror of HCS messages for fast dashboard queries
--
-- NOTE: The authoritative source of truth is always the Hedera Mirror Node.
--       These tables are a local cache for performance.
--
-- Docs: https://docs.hedera.com/hedera/sdks-and-apis/rest-api#topics

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- ENUM for HCS registry status
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_agent_hcs_registry_status') THEN
    CREATE TYPE "enum_agent_hcs_registry_status"
      AS ENUM ('registered', 'verified', 'flagged', 'suspended');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: agent_hcs_registry
-- One row per agent — stores the HCS topic ID, current schedule, and
-- latest trust score so the dashboard doesn't need to query HCS every time.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_hcs_registry (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK to the Agents table (Sequelize model — uppercase table name)
  agent_id            UUID        NOT NULL UNIQUE
                                  REFERENCES public."Agents"(id) ON DELETE CASCADE,

  -- The per-agent HCS topic — e.g. "0.0.4821733"
  -- Anyone can verify the agent by querying this topic on HashScan
  hcs_topic_id        TEXT        NOT NULL UNIQUE,

  -- Sequence number of this agent's registration on the global registry topic
  global_registry_seq INTEGER     NULL,

  -- Trust score 0–100 (higher = more trustworthy)
  current_score       FLOAT       NOT NULL DEFAULT 0,

  -- safe | low | medium | high
  current_risk_level  TEXT        NOT NULL DEFAULT 'unknown',

  -- Timestamp of last successful verification (manual or scheduled)
  last_verified_at    TIMESTAMPTZ NULL,

  -- When the next Hedera scheduled transaction will fire
  next_scheduled_at   TIMESTAMPTZ NULL,

  -- The currently active Hedera Schedule ID e.g. "0.0.5555"
  -- NULL = no active schedule (agent paused or not yet verified)
  active_schedule_id  TEXT        NULL,

  -- Total number of times this agent has been verified/reverified
  verification_count  INTEGER     NOT NULL DEFAULT 0,

  status              "enum_agent_hcs_registry_status" NOT NULL DEFAULT 'registered',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_hcs_registry_agent_id
  ON public.agent_hcs_registry(agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_hcs_registry_hcs_topic_id
  ON public.agent_hcs_registry(hcs_topic_id);

CREATE INDEX IF NOT EXISTS idx_agent_hcs_registry_status
  ON public.agent_hcs_registry(status);

CREATE INDEX IF NOT EXISTS idx_agent_hcs_registry_active_schedule_id
  ON public.agent_hcs_registry(active_schedule_id)
  WHERE active_schedule_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: agent_hcs_messages
-- Local mirror of HCS messages for fast dashboard queries.
-- message_type values:
--   AGENT_REGISTERED          first message on agent topic
--   VERIFIED                  user clicked verify (manual, immediate)
--   REVERIFICATION_TRIGGERED  fired by Hedera scheduled transaction
--   REVERIFIED                result written after scheduled trigger
--   AGENT_FLAGGED             score dropped below healthy threshold
--   SCORE_UPDATED             manual admin override
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.agent_hcs_messages (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  agent_id            UUID        NOT NULL
                                  REFERENCES public."Agents"(id) ON DELETE CASCADE,

  -- The HCS topic this message belongs to
  hcs_topic_id        TEXT        NOT NULL,

  -- Sequence number from Hedera receipt (unique within a topic)
  sequence_number     INTEGER     NULL,

  -- AGENT_REGISTERED | VERIFIED | REVERIFICATION_TRIGGERED |
  -- REVERIFIED | AGENT_FLAGGED | SCORE_UPDATED
  message_type        TEXT        NOT NULL,

  -- Full JSON message as submitted to HCS
  message_payload     JSONB       NULL,

  -- Hedera consensus timestamp e.g. "1714300000.000000000"
  consensus_timestamp TEXT        NULL,

  -- Trust score at time of message (for VERIFIED / REVERIFIED)
  score               FLOAT       NULL,

  -- Whether score was >= HEALTHY_THRESHOLD (default 60)
  is_healthy          BOOLEAN     NULL,

  -- Score change vs previous check
  score_delta         FLOAT       NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_hcs_messages_agent_id
  ON public.agent_hcs_messages(agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_hcs_messages_hcs_topic_id
  ON public.agent_hcs_messages(hcs_topic_id);

CREATE INDEX IF NOT EXISTS idx_agent_hcs_messages_message_type
  ON public.agent_hcs_messages(message_type);

CREATE INDEX IF NOT EXISTS idx_agent_hcs_messages_created_at
  ON public.agent_hcs_messages(created_at);

-- Prevent re-mirroring the same HCS sequence number for a topic
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_hcs_messages_seq_unique
  ON public.agent_hcs_messages(hcs_topic_id, sequence_number)
  WHERE sequence_number IS NOT NULL;

COMMIT;
