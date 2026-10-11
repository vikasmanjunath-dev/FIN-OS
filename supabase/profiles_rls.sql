-- URGENT — run this first.
--
-- Found Oct 11 2026: row-level security was OFF on `profiles`, so anyone holding the public anon key (it ships in
-- js/auth.js) could read every profile row; 13 rows were visible to an unauthenticated caller. alerts/schema.sql
-- created a "profiles_own" policy but never ran ENABLE ROW LEVEL SECURITY, and a policy does nothing on its own.
--
-- Idempotent: safe to run more than once. Backends that use the service_role key (alert engine, voice agent, Arya)
-- bypass RLS and are unaffected; signed-in users still read and write their own row exactly as before.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- remove the earlier same-purpose policies (names used in alerts/schema.sql and docs/DATABASE.md) before re-creating
DROP POLICY IF EXISTS "profiles_own"                ON profiles;
DROP POLICY IF EXISTS "Users can CRUD own profile"  ON profiles;

CREATE POLICY "profiles_own" ON profiles
  FOR ALL
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Verify (run as a separate query; expect rls_enabled = true):
--   SELECT relname, relrowsecurity AS rls_enabled FROM pg_class WHERE relname = 'profiles';
-- And from outside the app, with only the anon key, this must now return [] instead of rows:
--   curl "$SUPABASE_URL/rest/v1/profiles?select=id" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
