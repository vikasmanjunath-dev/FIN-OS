-- Cross-device sync for Command Hub tracker data (js/finos-tracker-sync.js).
--
-- One JSONB blob per user rather than ~125 columns — the tracker suite adds
-- new finos_* keys over time and this way that never needs a migration.
-- Mirrors the RLS idiom already used everywhere else in this project
-- (see alerts/schema.sql: auth.uid() = user_id, FOR ALL).
--
-- Run in the Supabase SQL editor of the project js/auth.js points to. Safe to run more than once.
-- Used by BOTH js/finos-tracker-sync.js (website) and mobile/lib/trackerSyncStore.ts (app).

CREATE TABLE IF NOT EXISTS tracker_snapshot (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data       jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tracker_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tracker_snapshot_own" ON tracker_snapshot;
CREATE POLICY "tracker_snapshot_own" ON tracker_snapshot
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
