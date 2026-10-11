-- Lets a signed-in person delete their own account from the app (store requirement when an app has accounts).
--
-- The app calls  supabase.rpc('delete_my_account')  which runs below as the table owner, but can only ever touch the
-- caller's own user: it deletes auth.users WHERE id = auth.uid(). Every table that references auth.users with
-- ON DELETE CASCADE (profiles, holdings, tracker_snapshot, transactions, goals, budgets, …) loses that person's rows too.
--
-- Idempotent. Run once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Only signed-in users may call it; never anonymous callers.
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- Verify (as a signed-in user, from the app or the SQL editor with a user JWT):
--   SELECT public.delete_my_account();   -- the account and its rows are gone
