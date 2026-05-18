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

-- ── 6. Helper function: unread alert count ────────────────────────────────
CREATE OR REPLACE FUNCTION get_unread_alert_count(p_user_id uuid)
RETURNS integer AS $$
  SELECT COUNT(*)::integer FROM alerts
  WHERE user_id = p_user_id AND read = false;
$$ LANGUAGE sql SECURITY DEFINER;
