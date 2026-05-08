BEGIN;

-- UUID generation (Supabase supports pgcrypto)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUM: Agent.status
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enum_Agents_status') THEN
    CREATE TYPE "enum_Agents_status" AS ENUM ('pending', 'verified', 'suspended');
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- TABLE: "Agents"  (Model: Agent)
-- Sequelize default: pluralized table name with exact casing
-- Timestamps: "createdAt", "updatedAt"
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."Agents" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  public_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL UNIQUE,
  status "enum_Agents_status" NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_Agents_status" ON public."Agents"(status);
CREATE INDEX IF NOT EXISTS "idx_Agents_createdAt" ON public."Agents"("createdAt");

-- ---------------------------------------------------------------------
-- TABLE: "AgentMetadata" (Model: AgentMetadata)
-- Sequelize default table name: model name pluralization can vary,
-- but in practice for "AgentMetadata" Sequelize uses "AgentMetadata"
-- unless freezeTableName is set; safest is to create both forms OR set tableName.
-- We'll create the common expected one: "AgentMetadata".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."AgentMetadata" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES public."Agents"(id) ON DELETE CASCADE,
  model_name TEXT,
  version TEXT,
  execution_environment TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_AgentMetadata_agent_id" ON public."AgentMetadata"(agent_id);

-- ---------------------------------------------------------------------
-- TABLE: "AgentReputations" (Model: AgentReputation)
-- Default pluralization usually becomes "AgentReputations"
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."AgentReputations" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES public."Agents"(id) ON DELETE CASCADE,
  score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  risk_level TEXT NOT NULL DEFAULT 'low',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_AgentReputations_agent_id" ON public."AgentReputations"(agent_id);
CREATE INDEX IF NOT EXISTS "idx_AgentReputations_score" ON public."AgentReputations"(score);

-- ---------------------------------------------------------------------
-- TABLE: "AgentBehaviorLogs" (Model: AgentBehaviorLog)
-- Default pluralization becomes "AgentBehaviorLogs"
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."AgentBehaviorLogs" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public."Agents"(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_payload JSONB,
  risk_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_AgentBehaviorLogs_agent_id" ON public."AgentBehaviorLogs"(agent_id);
CREATE INDEX IF NOT EXISTS "idx_AgentBehaviorLogs_event_type" ON public."AgentBehaviorLogs"(event_type);
CREATE INDEX IF NOT EXISTS "idx_AgentBehaviorLogs_createdAt" ON public."AgentBehaviorLogs"("createdAt");

-- ---------------------------------------------------------------------
-- TABLE: user_agent_events (Model: UserAgentEvent)
-- You explicitly set: tableName = "user_agent_events"
-- Timestamps: "createdAt", "updatedAt"
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  agent_id UUID NULL REFERENCES public."Agents"(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payload JSONB,
  ip TEXT,
  user_agent TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_agent_events_user_id ON public.user_agent_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agent_events_agent_id ON public.user_agent_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_user_agent_events_action ON public.user_agent_events(action);
CREATE INDEX IF NOT EXISTS idx_user_agent_events_createdAt ON public.user_agent_events("createdAt");

-- =====================================================================
-- RLS (Row Level Security) for Supabase
-- Applies ONLY when requests use Supabase JWT (authenticated role).
-- Service role bypasses RLS (expected).
-- =====================================================================
ALTER TABLE public.user_agent_events ENABLE ROW LEVEL SECURITY;

-- Read only your own events
DROP POLICY IF EXISTS "read_own_user_agent_events" ON public.user_agent_events;
CREATE POLICY "read_own_user_agent_events"
ON public.user_agent_events
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Insert only your own events
DROP POLICY IF EXISTS "insert_own_user_agent_events" ON public.user_agent_events;
CREATE POLICY "insert_own_user_agent_events"
ON public.user_agent_events
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Optional: immutability (recommended for audit logs)
DROP POLICY IF EXISTS "no_updates_user_agent_events" ON public.user_agent_events;
CREATE POLICY "no_updates_user_agent_events"
ON public.user_agent_events
FOR UPDATE
TO authenticated
USING (false);

DROP POLICY IF EXISTS "no_deletes_user_agent_events" ON public.user_agent_events;
CREATE POLICY "no_deletes_user_agent_events"
ON public.user_agent_events
FOR DELETE
TO authenticated
USING (false);

COMMIT;