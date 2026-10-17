"""Row-level-security proof for tracker_snapshot against a throwaway LOCAL PostgreSQL cluster (never Supabase).

Stubs the minimum of Supabase's `auth` schema (auth.users, auth.uid() reading request.jwt.claim.sub) and the
`authenticated` role, applies supabase/tracker_snapshot.sql verbatim, then checks select/insert/update/delete
for owner, other user and anonymous. Skipped when PostgreSQL binaries are not installed.

    python3 -m pytest tests/test_rls_tracker_snapshot.py -q
"""
import shutil
import socket
import subprocess
import tempfile
from pathlib import Path

import os

import pytest

os.environ["LC_ALL"] = "C"  # Homebrew postgres refuses to start under some inherited locales
ROOT = Path(__file__).resolve().parent.parent
SQL = ROOT / "supabase" / "tracker_snapshot.sql"
BIN = [shutil.which(b) for b in ("initdb", "pg_ctl", "psql")]
pytestmark = pytest.mark.skipif(not all(BIN), reason="PostgreSQL binaries not installed")

A = "00000000-0000-0000-0000-00000000000a"
B = "00000000-0000-0000-0000-00000000000b"

SETUP = """
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE ROLE authenticated NOLOGIN; CREATE ROLE anon NOLOGIN;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
INSERT INTO auth.users VALUES ('%s'), ('%s');
""" % (A, B)


@pytest.fixture(scope="module")
def pg():
    d = tempfile.mkdtemp(prefix="rls-")
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]
    run = lambda *a, **k: subprocess.run(a, check=True, capture_output=True, text=True, **k)
    run(shutil.which("initdb"), "-D", d + "/data", "-U", "postgres", "--auth=trust", "--locale=C", "-E", "UTF8")
    run(shutil.which("pg_ctl"), "-D", d + "/data", "-o", f"-p {port} -c unix_socket_directories= -c listen_addresses=127.0.0.1", "-w", "-l", d + "/log", "start")
    def sql(q, who=None, role="authenticated"):
        pre = ""
        if who is not None or role:
            pre = f"SET ROLE {role}; " + (f"SET request.jwt.claim.sub = '{who}'; " if who else "")
        r = subprocess.run([shutil.which("psql"), "-h", "127.0.0.1", "-p", str(port), "-U", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", pre + q],
                           capture_output=True, text=True)
        return r
    try:
        run(shutil.which("psql"), "-h", "127.0.0.1", "-p", str(port), "-U", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-c", SETUP)
        run(shutil.which("psql"), "-h", "127.0.0.1", "-p", str(port), "-U", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-f", str(SQL))
        run(shutil.which("psql"), "-h", "127.0.0.1", "-p", str(port), "-U", "postgres", "-X", "-c",
            "GRANT SELECT, INSERT, UPDATE, DELETE ON tracker_snapshot TO authenticated, anon;")
        yield sql
    finally:
        subprocess.run([shutil.which("pg_ctl"), "-D", d + "/data", "-m", "immediate", "stop"], capture_output=True)
        shutil.rmtree(d, ignore_errors=True)


def test_owner_can_insert_select_update(pg):
    assert pg("INSERT INTO tracker_snapshot(user_id,data) VALUES ('%s','{\"k\":1}')" % A, A).returncode == 0
    assert pg("SELECT data->>'k' FROM tracker_snapshot", A).stdout.strip().splitlines()[-1] == "1"
    r = pg("UPDATE tracker_snapshot SET data='{\"k\":2}' WHERE user_id='%s' RETURNING 1" % A, A)
    assert r.returncode == 0 and "1" in r.stdout


def test_other_user_cannot_read_update_or_delete(pg):
    pg("INSERT INTO tracker_snapshot(user_id,data) VALUES ('%s','{\"k\":9}') ON CONFLICT DO NOTHING" % A, A)
    assert pg("SELECT count(*) FROM tracker_snapshot WHERE user_id='%s'" % A, B).stdout.strip().splitlines()[-1] == "0"
    assert "UPDATE 0" in pg("UPDATE tracker_snapshot SET data='{\"x\":1}' WHERE user_id='%s'" % A, B).stdout
    assert "DELETE 0" in pg("DELETE FROM tracker_snapshot WHERE user_id='%s'" % A, B).stdout
    assert pg("SELECT data->>'k' FROM tracker_snapshot WHERE user_id='%s'" % A, A).stdout.strip().splitlines()[-1] != ""


def test_other_user_cannot_insert_row_for_someone_else(pg):
    r = pg("INSERT INTO tracker_snapshot(user_id,data) VALUES ('%s','{}')" % A, B)
    assert r.returncode != 0 and "row-level security" in r.stderr


def test_other_user_cannot_reassign_row_to_themselves(pg):
    pg("INSERT INTO tracker_snapshot(user_id,data) VALUES ('%s','{}') ON CONFLICT DO NOTHING" % B, B)
    r = pg("UPDATE tracker_snapshot SET user_id='%s' WHERE user_id='%s'" % (A, B), B)
    assert r.returncode != 0 and "row-level security" in r.stderr


def test_anonymous_sees_and_changes_nothing(pg):
    assert pg("SELECT count(*) FROM tracker_snapshot", None, "anon").stdout.strip().splitlines()[-1] == "0"
    assert pg("INSERT INTO tracker_snapshot(user_id,data) VALUES ('%s','{}')" % A, None, "anon").returncode != 0
    assert "DELETE 0" in pg("DELETE FROM tracker_snapshot", None, "anon").stdout


def test_owner_delete_works_and_rls_is_forced_on(pg):
    assert "DELETE 1" in pg("DELETE FROM tracker_snapshot WHERE user_id='%s'" % A, A).stdout
    assert pg("SELECT relrowsecurity FROM pg_class WHERE relname='tracker_snapshot'", None, "authenticated").stdout.strip().splitlines()[-1] == "t"
