-- Lets a signed-in person delete their own account from the app (store requirement when an app has accounts).
--
-- The app calls  supabase.rpc('delete_my_account')  which runs below as the table owner, but can only ever touch the
-- caller's own user: it removes rows WHERE user_id = auth.uid() and then deletes auth.users WHERE id = auth.uid().
--
-- WHY THE EXPLICIT DELETES (found in the Oct 2026 trust review): deleting from auth.users only removes rows whose table has a
-- foreign key to it with ON DELETE CASCADE (profiles, holdings, tracker_snapshot, transactions, goals, budgets, agent_memories).
-- The tables created by alerts/schema.sql store a bare `user_id uuid` with NO foreign key, so they were left behind: alerts,
-- push_subscriptions (a push endpoint is an identifier), alert_preferences, health_score_history, memory_embeddings,
-- user_behavior, document_ai_log, and the couple tables (user_a / user_b). Two website tables (user_context, financial_profiles)
-- have no schema file in the repo, so they are listed too and skipped when they do not exist.
-- A couple link is removed entirely, which also removes the shared goals and responsibilities under it: the partner loses those
-- shared rows. That is a product decision for the owner; the alternative is to keep the link and anonymise the departing side.
--
-- Idempotent. Run once in the Supabase SQL editor. A test (mobile/__tests__/deleteAccountSql.test.mts) fails if a repo schema file
-- adds a table with a user_id column that is not handled here.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid   uuid := auth.uid();
  pairs text[][] := ARRAY[
    ['alerts', 'user_id'], ['push_subscriptions', 'user_id'], ['alert_preferences', 'user_id'],
    ['health_score_history', 'user_id'], ['memory_embeddings', 'user_id'], ['user_behavior', 'user_id'],
    ['document_ai_log', 'user_id'], ['user_context', 'user_id'], ['financial_profiles', 'user_id'],
    ['agent_memories', 'user_id'], ['transactions', 'user_id'], ['goals', 'user_id'], ['budgets', 'user_id'],
    ['holdings', 'user_id'], ['tracker_snapshot', 'user_id'], ['profiles', 'id']
  ];
  i int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;

  -- couple links first: their goals and responsibilities go with them (ON DELETE CASCADE inside alerts/schema.sql)
  IF to_regclass('public.couple_links') IS NOT NULL THEN
    DELETE FROM public.couple_links WHERE user_a = uid OR user_b = uid;
  END IF;

  FOR i IN 1 .. array_length(pairs, 1) LOOP
    IF to_regclass('public.' || quote_ident(pairs[i][1])) IS NOT NULL THEN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', pairs[i][1], pairs[i][2]) USING uid;
    END IF;
  END LOOP;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Only signed-in users may call it; never anonymous callers.
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- Verify (as a signed-in user, from the app or the SQL editor with a user JWT):
--   SELECT public.delete_my_account();   -- the account and every row listed above are gone
