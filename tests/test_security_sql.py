"""Supabase / repo SQL security properties, checked by reading the files (nothing is run against any database).

  * every table that holds a person's rows has row-level security enabled and a policy keyed on auth.uid(); no `USING (true)`;
  * every SECURITY DEFINER function pins search_path and puts pg_temp last;
  * couple tables are not writable through the public API (a FOR ALL policy let anyone link themselves to any user);
  * `profiles.plan` cannot be changed by the signed-in user;
  * the SQL parses (pglast, when installed).
"""
import glob
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = sorted(glob.glob(os.path.join(ROOT, "supabase", "*.sql"))) + [os.path.join(ROOT, "alerts", "schema.sql"),
                                                                       os.path.join(ROOT, "voiceagent", "schema.sql")]
SQL = {os.path.relpath(f, ROOT): re.sub(r"--[^\n]*", "", open(f, encoding="utf-8").read()) for f in FILES}
ALL = "\n".join(SQL.values())
# tables that hold a person's data, keyed by the column that names the owner
OWNER = {"profiles": "id", "transactions": "user_id", "goals": "user_id", "budgets": "user_id", "holdings": "user_id",
         "tracker_snapshot": "user_id", "alerts": "user_id", "push_subscriptions": "user_id", "alert_preferences": "user_id",
         "health_score_history": "user_id", "memory_embeddings": "user_id", "user_behavior": "user_id",
         "document_ai_log": "user_id", "agent_memories": "user_id"}


@pytest.mark.parametrize("table,col", sorted(OWNER.items()))
def test_user_tables_have_rls_and_an_auth_uid_policy(table, col):
    assert re.search(r"ALTER TABLE %s\s+ENABLE ROW LEVEL SECURITY" % table, ALL, re.I), table
    pols = re.findall(r"CREATE POLICY\s+\"?\w+\"?\s+ON\s+%s\b(.*?);" % table, ALL, re.I | re.S)
    assert pols, f"no policy on {table}"
    assert all(re.search(r"auth\.uid\(\)\s*=\s*%s\b" % col, p) for p in pols), table


def test_no_policy_is_open_to_everyone():
    for name, text in SQL.items():
        for pol in re.findall(r"CREATE POLICY.*?;", text, re.I | re.S):
            assert not re.search(r"USING\s*\(\s*true\s*\)|WITH CHECK\s*\(\s*true\s*\)", pol, re.I), (name, pol[:80])
            assert re.search(r"auth\.uid\(\)", pol), (name, "policy not tied to auth.uid()", pol[:80])


def test_security_definer_functions_pin_search_path_with_pg_temp_last():
    for name, text in SQL.items():
        for fn in re.findall(r"CREATE OR REPLACE FUNCTION.*?(?:\$\$.*?\$\$)", text, re.I | re.S):
            if re.search(r"SECURITY\s+DEFINER", fn, re.I):
                m = re.search(r"SET\s+search_path\s*=\s*([\w\s,]+)", fn, re.I)
                assert m, (name, fn[:70])
                parts = [p.strip() for p in m.group(1).split(",") if p.strip()]
                assert parts[-1].split()[0] == "pg_temp", (name, parts)


def test_delete_my_account_search_path_and_grants():
    sql = SQL["supabase/delete_account.sql"]
    assert re.search(r"SET search_path = public, auth, pg_temp", sql)
    assert re.search(r"REVOKE ALL ON FUNCTION public\.delete_my_account\(\) FROM anon", sql)
    assert re.search(r"GRANT EXECUTE ON FUNCTION public\.delete_my_account\(\) TO authenticated", sql)


def test_couple_tables_are_read_only_through_the_public_api():
    for table in ("couple_links", "couple_goals", "couple_responsibilities"):
        pols = re.findall(r"CREATE POLICY\s+\"?\w+\"?\s+ON\s+%s\b(.*?);" % table, ALL, re.I | re.S)
        assert pols and all(re.match(r"\s*FOR SELECT\b", p, re.I) for p in pols), table


def test_plan_column_is_protected_from_the_signed_in_user():
    sql = SQL["alerts/schema.sql"]
    assert re.search(r"CREATE TRIGGER profiles_protect_plan\s+BEFORE INSERT OR UPDATE ON profiles", sql)
    assert re.search(r"NEW\.plan\s*:=\s*OLD\.plan", sql) and re.search(r"NEW\.plan\s*:=\s*'free'", sql)
    assert re.search(r"auth\.role\(\)", sql)


def test_unread_count_function_is_not_a_definer_that_anyone_can_call():
    fn = re.search(r"CREATE OR REPLACE FUNCTION get_unread_alert_count.*?LANGUAGE sql[^;]*;", SQL["alerts/schema.sql"], re.I | re.S).group(0)
    assert "SECURITY DEFINER" not in fn.upper() and "search_path" in fn


@pytest.mark.parametrize("path", sorted(SQL))
def test_sql_parses(path):
    pglast = pytest.importorskip("pglast")
    pglast.parse_sql(open(os.path.join(ROOT, path), encoding="utf-8").read())
