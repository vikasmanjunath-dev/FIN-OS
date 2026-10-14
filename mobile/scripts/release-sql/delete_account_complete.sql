-- PROPOSED replacement for supabase/delete_account.sql (not yet applied anywhere; owner to review, then run in the SQL editor).
--
-- Why: supabase/delete_account.sql deletes only auth.users and relies on ON DELETE CASCADE. These tables hold a user_id
-- (or user_a / user_b) WITHOUT a foreign key to auth.users (alerts/schema.sql), so their rows would survive an account
-- deletion: alerts, push_subscriptions, alert_preferences, health_score_history, memory_embeddings, user_behavior,
-- document_ai_log, couple_links (and couple_goals / couple_responsibilities through their cascade from couple_links).
-- mobile/scripts/release-sql-check.py proves this against a real Postgres.
--
-- Safe to run more than once. Tables that do not exist in your project are skipped (to_regclass guard).
-- Run AFTER every other schema file, so every table that exists is covered.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  t   text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  -- tables keyed by user_id with no foreign key to auth.users
  FOREACH t IN ARRAY ARRAY['alerts', 'push_subscriptions', 'alert_preferences', 'health_score_history',
                           'memory_embeddings', 'user_behavior', 'document_ai_log'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', t) USING uid;
    END IF;
  END LOOP;

  -- couples: dissolving the link removes the shared goals / responsibilities by cascade
  IF to_regclass('public.couple_links') IS NOT NULL THEN
    DELETE FROM public.couple_links WHERE user_a = uid OR user_b = uid;
  END IF;

  -- the live `profiles` table pre-dates these files and may have no foreign key either
  DELETE FROM public.profiles WHERE id = uid;

  -- the account itself; everything that references auth.users ON DELETE CASCADE goes with it
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
