-- ══════════════════════════════════════════════════════════════════════════════
-- FIN-OS Voice Agent — Persistent Memory Schema
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query → Run).
--
-- SAFE TO RUN MORE THAN ONCE, AND NEVER DELETES DATA. An earlier version of this file started by dropping the
-- agent_memories table, which erased every user's voice memory on each re-run; it no longer does.
-- The table is created only when missing; columns, trigger and policies are added or re-created in place.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── agent_memories ──────────────────────────────────────────────────────────
-- One row per user. Stores extracted profile + session summary + last turns.
-- Written by the voice agent backend (service role key).
-- Read by the voice agent on reconnect to restore context instantly.
CREATE TABLE IF NOT EXISTS agent_memories (
  user_id       uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Structured profile extracted from conversation (name, age, income, goals …)
  profile       jsonb       NOT NULL DEFAULT '{}',

  -- LLM-generated summary of the last session (injected as context on reconnect)
  summary       text,

  -- Last N conversation turns (role + content) for warm context
  mem_items     jsonb       NOT NULL DEFAULT '[]',

  -- Counts
  total_sessions  int       NOT NULL DEFAULT 0,
  total_messages  int       NOT NULL DEFAULT 0,

  -- Timestamps
  first_seen    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Columns added in place if an older copy of the table lacks them (a no-op when they exist; every one has a default)
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS profile        jsonb       NOT NULL DEFAULT '{}';
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS summary        text;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS mem_items      jsonb       NOT NULL DEFAULT '[]';
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS total_sessions int         NOT NULL DEFAULT 0;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS total_messages int         NOT NULL DEFAULT 0;
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS first_seen     timestamptz NOT NULL DEFAULT now();
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS last_seen      timestamptz NOT NULL DEFAULT now();
ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_agent_memories_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS agent_memories_ts ON agent_memories;
CREATE TRIGGER agent_memories_ts
  BEFORE UPDATE ON agent_memories
  FOR EACH ROW EXECUTE FUNCTION update_agent_memories_ts();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;

-- Users can read their own memory (for future client-side use)
DROP POLICY IF EXISTS "user_read_own_memory" ON agent_memories;
CREATE POLICY "user_read_own_memory"
  ON agent_memories FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own memory (client-side clear, etc.)
DROP POLICY IF EXISTS "user_update_own_memory" ON agent_memories;
CREATE POLICY "user_update_own_memory"
  ON agent_memories FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role (backend) bypasses RLS — no extra policy needed.

-- ── Index ────────────────────────────────────────────────────────────────────
-- user_id is already the PK / index; nothing else needed for this table.

-- ── Realtime (optional — enables live memory sync if you ever want it) ───────
ALTER TABLE agent_memories REPLICA IDENTITY FULL;
