-- ═══════════════════════════════════════════════════════════════════════════
-- FIN-OS Alert Engine — Supabase Migration
-- Run this once in Supabase SQL Editor → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Alerts table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL,                 -- Supabase auth.users.id
  rule_id      text NOT NULL,                 -- e.g. 'SIP_MISSED', 'MARKET_DROP'
  title        text NOT NULL,
  message      text NOT NULL,
  priority     text DEFAULT 'info'            -- critical | warning | info | celebration
                    CHECK (priority IN ('critical','warning','info','celebration')),
  action_url   text,                          -- deep-link to the relevant FIN-OS page
  action_label text,                          -- CTA button text e.g. "View Portfolio"
  data         jsonb DEFAULT '{}',            -- arbitrary rule-specific payload
  read         boolean DEFAULT false,
  read_at      timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- Index: fast lookups for a user's unread alerts
CREATE INDEX IF NOT EXISTS idx_alerts_user_unread
  ON alerts (user_id, read, created_at DESC);

-- Index: cooldown check (has this rule fired for this user recently?)
CREATE INDEX IF NOT EXISTS idx_alerts_rule_check
  ON alerts (user_id, rule_id, created_at DESC);

-- ── 2. Push subscriptions table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth_key   text NOT NULL,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_user
  ON push_subscriptions (user_id);

-- ── 3. Alert preferences (per user, per rule) ──────────────────────────────
CREATE TABLE IF NOT EXISTS alert_preferences (
  user_id    uuid  NOT NULL,
  rule_id    text  NOT NULL,
  enabled    boolean DEFAULT true,
  channels   text[] DEFAULT ARRAY['in_app', 'push'],  -- in_app | push | voice
  PRIMARY KEY (user_id, rule_id)
);

-- ── 4. Enable Realtime for live frontend updates ───────────────────────────
-- Run these in Supabase dashboard: Database → Replication → Tables
ALTER TABLE alerts        REPLICA IDENTITY FULL;
ALTER TABLE alert_preferences REPLICA IDENTITY FULL;

-- ── 5. Row Level Security ──────────────────────────────────────────────────
ALTER TABLE alerts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_preferences   ENABLE ROW LEVEL SECURITY;

-- Users can only read their own alerts
CREATE POLICY "user_read_own_alerts"        ON alerts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_update_own_alerts"      ON alerts
  FOR UPDATE USING (auth.uid() = user_id);

-- Users manage their own push subs
CREATE POLICY "user_manage_push"            ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Users manage their own alert prefs
CREATE POLICY "user_manage_alert_prefs"     ON alert_preferences
  FOR ALL USING (auth.uid() = user_id);

-- Service role (used by alert-engine.py) can insert/read all
-- (Handled via service role key — bypasses RLS automatically)

-- ── 6. Couple links ────────────────────────────────────────────────────────
-- Joins two user accounts as financial partners (couple / family)
CREATE TABLE IF NOT EXISTS couple_links (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a       uuid NOT NULL,              -- inviter
  user_b       uuid NOT NULL,              -- invitee
  status       text DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'dissolved')),
  invite_code  text UNIQUE,               -- short code user_b enters to accept
  created_at   timestamptz DEFAULT now(),
  accepted_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_couple_user_a ON couple_links (user_a);
CREATE INDEX IF NOT EXISTS idx_couple_user_b ON couple_links (user_b);

-- ── 7. Couple goals ────────────────────────────────────────────────────────
-- Shared goals (visible to both partners)
CREATE TABLE IF NOT EXISTS couple_goals (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  couple_id        uuid NOT NULL REFERENCES couple_links(id) ON DELETE CASCADE,
  title            text NOT NULL,
  target_amount    numeric NOT NULL DEFAULT 0,
  current_amount   numeric NOT NULL DEFAULT 0,
  target_date      date,
  contrib_a        numeric DEFAULT 0,         -- monthly contribution from user_a
  contrib_b        numeric DEFAULT 0,         -- monthly contribution from user_b
  owner            text DEFAULT 'joint'       -- joint | user_a | user_b
                        CHECK (owner IN ('joint', 'user_a', 'user_b')),
  category         text DEFAULT 'other',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_couple_goals_couple ON couple_goals (couple_id);

-- ── 8. Couple responsibility assignments ──────────────────────────────────
-- "Pay rent = user_a, SIP = user_b"
CREATE TABLE IF NOT EXISTS couple_responsibilities (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  couple_id   uuid NOT NULL REFERENCES couple_links(id) ON DELETE CASCADE,
  label       text NOT NULL,       -- e.g. "EMI payment", "SIP standing order"
  assigned_to text NOT NULL        -- 'user_a' | 'user_b' | 'joint'
                   CHECK (assigned_to IN ('user_a', 'user_b', 'joint')),
  reminder_day int,                -- day of month (1-28) for reminder, null = no reminder
  amount       numeric,
  created_at   timestamptz DEFAULT now()
);

-- ── 9. RLS for couple tables ───────────────────────────────────────────────
ALTER TABLE couple_links            ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_goals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE couple_responsibilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "couple_members_only" ON couple_links
  FOR ALL USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "couple_goals_members" ON couple_goals
  FOR ALL USING (
    couple_id IN (
      SELECT id FROM couple_links
      WHERE user_a = auth.uid() OR user_b = auth.uid()
    )
  );

CREATE POLICY "couple_resp_members" ON couple_responsibilities
  FOR ALL USING (
    couple_id IN (
      SELECT id FROM couple_links
      WHERE user_a = auth.uid() OR user_b = auth.uid()
    )
  );

-- ── 10. Helper function: unread alert count ───────────────────────────────────
CREATE OR REPLACE FUNCTION get_unread_alert_count(p_user_id uuid)
RETURNS integer AS $$
  SELECT COUNT(*)::integer FROM alerts
  WHERE user_id = p_user_id AND read = false;
$$ LANGUAGE sql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- SPRINT 2 & 3 ADDITIONS — Run after initial schema is applied
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 11. Health score history (fixes always-stable trajectory bug) ──────────
CREATE TABLE IF NOT EXISTS health_score_history (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL,
  total       int  NOT NULL,
  tier        text NOT NULL,
  trajectory  text DEFAULT 'stable',
  pillars     jsonb DEFAULT '[]',
  computed_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hs_history_user
  ON health_score_history (user_id, computed_at DESC);

ALTER TABLE health_score_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hs_history_own" ON health_score_history
  FOR ALL USING (auth.uid() = user_id);

-- ── 12. Premium plan field on profiles ────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  plan text DEFAULT 'free' CHECK (plan IN ('free', 'smart', 'family', 'pro'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS
  plan_expires_at timestamptz;

-- ── 13. Complete RLS on core tables (run if not already applied) ──────────
-- profiles: own row only
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='profiles_own'
  ) THEN
    CREATE POLICY "profiles_own" ON profiles
      FOR ALL USING (auth.uid() = id);
  END IF;
END $$;

-- transactions: own rows only
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='transactions' AND policyname='transactions_own'
  ) THEN
    ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "transactions_own" ON transactions
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- goals: own rows only
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='goals' AND policyname='goals_own'
  ) THEN
    ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "goals_own" ON goals
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- holdings: own rows only
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='holdings' AND policyname='holdings_own'
  ) THEN
    ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "holdings_own" ON holdings
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- budgets: own rows only
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='budgets' AND policyname='budgets_own'
  ) THEN
    ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "budgets_own" ON budgets
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── 14. pgvector semantic memory (requires pgvector extension) ────────────
-- Enable in Supabase: Extensions → vector → Enable
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memory_embeddings (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NOT NULL,
  content    text NOT NULL,
  embedding  vector(384),          -- all-MiniLM-L6-v2 dimension
  category   text DEFAULT 'general',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mem_emb_user
  ON memory_embeddings (user_id, created_at DESC);

-- IVFFlat index for fast similarity search (create after inserting >1000 rows)
-- CREATE INDEX ON memory_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

ALTER TABLE memory_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memory_own" ON memory_embeddings
  FOR ALL USING (auth.uid() = user_id);

-- RPC for semantic recall (called by voice agent)
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(384),
  query_user_id   uuid,
  match_count     int DEFAULT 3
)
RETURNS TABLE (content text, category text, similarity float)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    me.content,
    me.category,
    1 - (me.embedding <=> query_embedding) AS similarity
  FROM memory_embeddings me
  WHERE me.user_id = query_user_id
    AND me.embedding IS NOT NULL
  ORDER BY me.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── 15. Realtime: enable for new tables ───────────────────────────────────
ALTER TABLE health_score_history REPLICA IDENTITY FULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- FEATURE 24 — PERSONALIZED DASHBOARD (user behavior tracking)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 16. User behavior (synced from usage-tracker.js) ─────────────────────
CREATE TABLE IF NOT EXISTS user_behavior (
  user_id     uuid PRIMARY KEY,
  top_pages   text[]   DEFAULT '{}',           -- e.g. ['portfolio', 'dashboard']
  top_calcs   text[]   DEFAULT '{}',           -- e.g. ['sip-optimizer', 'emi']
  page_counts jsonb    DEFAULT '{}',           -- { "portfolio": 42, "dashboard": 31, ... }
  time_prefs  jsonb    DEFAULT '{"morning":0,"afternoon":0,"evening":0}',
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE user_behavior ENABLE ROW LEVEL SECURITY;
CREATE POLICY "behavior_own" ON user_behavior
  FOR ALL USING (auth.uid() = user_id);

-- ── 17. Document AI processing log ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_ai_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL,
  doc_type    text NOT NULL,
  confidence  float,
  fields_extracted int DEFAULT 0,
  actions_applied  int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE document_ai_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "doc_ai_own" ON document_ai_log
  FOR ALL USING (auth.uid() = user_id);

