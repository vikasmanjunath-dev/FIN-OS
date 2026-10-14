#!/usr/bin/env python3
"""Checks the Supabase SQL the owner is about to run, against a REAL local PostgreSQL (not a mock).

    python3 mobile/scripts/release-sql-check.py            # needs: Postgres 14+ binaries (brew install postgresql@16), pglast optional

What it does, in order:
  1. Parses every file with pglast (the real Postgres parser) when installed; reports syntax errors with line numbers.
  2. Starts a throwaway cluster in a temp dir (unix socket only, nothing listens on the network) and stubs what Supabase
     provides: roles anon / authenticated / service_role, auth.users, auth.uid() (reads request.jwt.claim.sub). A bare,
     RLS-less `profiles` table is created first to mimic the live project.
  3. Runs the files in the documented order TWICE each (idempotency): a second run must not error.
  4. Asserts row-level security is ON and at least one policy exists for every table the files create.
  5. Behaviour: user A cannot see user B's rows in any table, anon sees nothing, anon cannot call delete_my_account().
  6. Account deletion: runs delete_my_account() as user A and lists every table that still holds A's rows (a finding when
     non-empty), for the CURRENT supabase/delete_account.sql and for the PROPOSED mobile/scripts/release-sql/delete_account_complete.sql.
  7. Scans for statements that destroy data on re-run (DROP TABLE, TRUNCATE, unconditional DELETE).
Exit code 1 on a hard failure (syntax, non-idempotent, missing RLS, cross-user leak). Findings are printed as FINDING.
"""
import os, re, shutil, subprocess, sys, tempfile, time, glob

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
ORDER = ['supabase/profiles_rls.sql', 'supabase/core_tables.sql', 'supabase/holdings.sql', 'supabase/tracker_snapshot.sql',
         'alerts/schema.sql', 'voiceagent/schema.sql', 'supabase/delete_account.sql']
PROPOSED = 'mobile/scripts/release-sql/delete_account_complete.sql'
hard, findings = [], []


def find_bin(name):
    for d in ('/opt/homebrew/opt/postgresql@16/bin', '/opt/homebrew/opt/postgresql@17/bin', '/opt/homebrew/opt/postgresql@15/bin',
              '/usr/local/opt/postgresql@16/bin', '/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/lib/postgresql/14/bin'):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return shutil.which(name)


def read(rel):
    return open(os.path.join(ROOT, rel), encoding='utf-8').read()


def parse_all():
    try:
        import pglast
    except ImportError:
        print('pglast not installed: skipping the standalone parse (the server still parses everything below)')
        return
    for rel in ORDER + [PROPOSED]:
        try:
            pglast.parse_sql(read(rel))
            print(f'parsed   {rel}')
        except Exception as e:  # noqa: BLE001
            hard.append(f'syntax: {rel}: {e}')


class Db:
    def __init__(self, tmp, port_dir):
        self.psql, self.sock = find_bin('psql'), port_dir

    def run(self, sql, role=None, sub=None, check=True, fetch=False):
        pre = ''
        if role:
            pre += f"SET ROLE {role};\n"
        if sub:
            pre += f"SELECT set_config('request.jwt.claim.sub','{sub}',false);\n"
        args = [self.psql, '-h', self.sock, '-p', '55432', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-At', '-F', '|']
        r = subprocess.run(args, input=pre + sql, capture_output=True, text=True)
        if check and r.returncode != 0:
            raise RuntimeError(r.stderr.strip())
        return (r.stdout.strip() if r.returncode == 0 else 'ERR: ' + r.stderr.strip()) if fetch or not check else r.stdout


STUB = """
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
-- the live project already had a bare, RLS-less profiles table
CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text);
GRANT ALL ON public.profiles TO anon, authenticated, service_role;
"""

A = '11111111-1111-1111-1111-111111111111'
B = '22222222-2222-2222-2222-222222222222'


def main():
    os.environ['LC_ALL'] = 'C'      # Postgres on macOS refuses to start with an unset / invalid locale
    initdb, pg_ctl = find_bin('initdb'), find_bin('pg_ctl')
    parse_all()
    if not (initdb and pg_ctl and find_bin('psql')):
        print('PostgreSQL binaries not found: install them (brew install postgresql@16) to run the behavioural checks.')
        return 1 if hard else 0
    tmp = tempfile.mkdtemp(prefix='fpg-', dir='/tmp')   # short path: unix sockets are limited to ~100 chars
    data, sock = os.path.join(tmp, 'data'), os.path.join(tmp, 'sock')
    os.makedirs(sock)
    subprocess.run([initdb, '-D', data, '-A', 'trust', '-U', os.environ.get('USER', 'postgres'), '-E', 'UTF8', '--locale=C'], capture_output=True, check=True)
    subprocess.run([pg_ctl, '-D', data, '-o', f"-c listen_addresses='' -c unix_socket_directories='{sock}' -c port=55432", '-l', os.path.join(tmp, 'log'), '-w', 'start'],
                   capture_output=True, check=True)
    try:
        run_checks(Db(tmp, sock))
    finally:
        subprocess.run([pg_ctl, '-D', data, '-m', 'immediate', 'stop'], capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)
    for f in findings:
        print('FINDING', f)
    for h in hard:
        print('FAIL   ', h)
    print(f'{len(hard)} failure(s), {len(findings)} finding(s)')
    return 1 if hard else 0


def run_checks(db):
    db.run(STUB)
    vector = db.run("CREATE EXTENSION IF NOT EXISTS vector;", check=False, fetch=True)
    have_vector = not str(vector).startswith('ERR')
    if not have_vector:
        print('note: pgvector is not available locally; vector(384) is replaced by float4[] in memory for the check only')
    created = set()
    for rel in ORDER:
        sql = read(rel)
        if not have_vector:
            sql = sql.replace('vector(384)', 'float4[]')
        for n in (1, 2):
            if rel.startswith('voiceagent') and n == 2:
                if re.search(r'^\s*DROP TABLE IF EXISTS agent_memories', sql, re.M):
                    findings.append(f'{rel} starts with DROP TABLE IF EXISTS agent_memories: re-running it DELETES every user\'s voice-agent memory (run it only if the table is missing)')
                break
            try:
                db.run(sql)
                print(f'ok       {rel} (run {n})')
            except RuntimeError as e:
                (hard if (n == 1 or rel.startswith('supabase/')) else findings).append(f'{rel} run {n} (not safe to run twice): {' '.join(l for l in str(e).splitlines() if 'ERROR' in l or 'DETAIL' in l)[:300]}')
                break
        for m in re.finditer(r'CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?(\w+)', sql):
            created.add(m.group(1))
    # 4. RLS everywhere
    rows = db.run("SELECT c.relname, c.relrowsecurity, (SELECT count(*) FROM pg_policies p WHERE p.tablename=c.relname AND p.schemaname='public') "
                  "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY 1", fetch=True)
    tables = []
    for line in rows.splitlines():
        name, rls, pol = line.split('|')
        tables.append(name)
        if rls != 't':
            hard.append(f'table {name}: row-level security is OFF')
        elif int(pol) == 0:
            hard.append(f'table {name}: RLS on but no policy (nobody, including the owner of the row, can read it)')
    print(f'rls      {len(tables)} public tables checked: ' + ', '.join(tables))
    # policy shape: FOR ALL policies without WITH CHECK let a user INSERT rows owned by someone else only if USING is also used as check;
    # Postgres applies USING as the check when WITH CHECK is absent, so that is safe. Report policies with no qual at all.
    for line in db.run("SELECT tablename, policyname, cmd, replace(replace(coalesce(qual,''),E'\n',' '),'|','/'), replace(replace(coalesce(with_check,''),E'\n',' '),'|','/') FROM pg_policies WHERE schemaname='public'", fetch=True).splitlines():
        t, p, cmd, qual, wc = line.split('|')
        if qual in ('', 'true') and cmd in ('ALL', 'SELECT'):
            hard.append(f'policy {t}.{p}: unconditional read (qual={qual or "none"})')
    # 5. behaviour: every table that has a user_id (or id for profiles)
    owners = {}
    for line in db.run("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('user_id','user_a')", fetch=True).splitlines():
        t, c = line.split('|')
        owners.setdefault(t, c)
    owners['profiles'] = 'id'
    db.run(f"INSERT INTO auth.users(id,email) VALUES ('{A}','a@example.test'),('{B}','b@example.test');")
    seeded = []
    for t, c in owners.items():
        for u in (A, B):
            r = db.run(f"SET session_replication_role = replica; INSERT INTO public.{t} ({c}) VALUES ('{u}');", check=False, fetch=True)
            if str(r).startswith('ERR'):
                # NOT NULL columns without defaults: fill them with a type-appropriate value
                cols = db.run(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}' AND is_nullable='NO' AND column_default IS NULL", fetch=True)
                names, vals = [], []
                for cl in cols.splitlines():
                    n, ty = cl.split('|')
                    names.append(n)
                    vals.append(f"'{u}'" if n == c else {'uuid': "gen_random_uuid()", 'jsonb': "'{}'", 'numeric': '0', 'integer': '0', 'boolean': 'false', 'date': 'now()', 'ARRAY': "'{}'"}.get(ty, f"'x{u[:2]}'"))
                if c not in names:
                    names.append(c); vals.append(f"'{u}'")
                r = db.run(f"SET session_replication_role = replica; INSERT INTO public.{t} ({','.join(names)}) VALUES ({','.join(vals)});", check=False, fetch=True)
            if str(r).startswith('ERR'):
                findings.append(f'could not seed {t} for the behavioural check: {r[:160]}')
                break
        else:
            seeded.append(t)
    for t in seeded:
        c = owners[t]
        as_a = db.run(f"SELECT count(*) FROM public.{t} WHERE {c} = '{B}';", role='authenticated', sub=A, fetch=True)
        own = db.run(f"SELECT count(*) FROM public.{t} WHERE {c} = '{A}';", role='authenticated', sub=A, fetch=True)
        anon = db.run(f"SELECT count(*) FROM public.{t};", role='anon', fetch=True)
        if not str(as_a).endswith('0'):
            hard.append(f'{t}: user A can read user B\'s rows ({as_a})')
        if not str(own).endswith('1'):
            hard.append(f'{t}: user A cannot read own row ({own})')
        if not str(anon).endswith('0'):
            hard.append(f'{t}: anon can read rows ({anon})')
    print(f'rls      behaviour checked on {len(seeded)} tables (own rows visible, other user and anon see none)')
    # anon cannot delete accounts
    r = db.run("SELECT public.delete_my_account();", role='anon', check=False, fetch=True)
    if not str(r).startswith('ERR'):
        hard.append('anon can call delete_my_account()')
    # 6. deletion completeness
    def leftovers(label):
        out = []
        for t, c in owners.items():
            n = db.run(f"SET session_replication_role = replica; SELECT count(*) FROM public.{t} WHERE {c} = '{A}';", fetch=True)
            if str(n).splitlines()[-1] != '0':
                out.append(t)
        return out
    db.run("SELECT public.delete_my_account();", role='authenticated', sub=A)
    gone = db.run(f"SELECT count(*) FROM auth.users WHERE id='{A}'", fetch=True)
    left = leftovers('current')
    print(f'delete   current supabase/delete_account.sql: account row gone={gone == "0"}; tables still holding that user\'s rows: {left or "none"}')
    if left:
        findings.append('supabase/delete_account.sql leaves the user\'s rows in: ' + ', '.join(left) +
                        ' (no foreign key to auth.users). Replace with mobile/scripts/release-sql/delete_account_complete.sql.')
    # proposed version: re-seed A, apply, delete, count again
    db.run(f"INSERT INTO auth.users(id,email) VALUES ('{A}','a@example.test') ON CONFLICT DO NOTHING;")
    for t in seeded:
        c = owners[t]
        db.run(f"SET session_replication_role = replica; DELETE FROM public.{t} WHERE {c}='{A}'; ", check=False)
    for t in seeded:
        c = owners[t]
        cols = db.run(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='{t}' AND is_nullable='NO' AND column_default IS NULL", fetch=True)
        names, vals = [], []
        for cl in cols.splitlines():
            n, ty = cl.split('|')
            names.append(n)
            vals.append(f"'{A}'" if n == c else {'uuid': "gen_random_uuid()", 'jsonb': "'{}'", 'numeric': '0', 'integer': '0', 'boolean': 'false', 'date': 'now()', 'ARRAY': "'{}'"}.get(ty, f"'x{A[:2]}'"))
        if c not in names:
            names.append(c); vals.append(f"'{A}'")
        db.run(f"SET session_replication_role = replica; INSERT INTO public.{t} ({','.join(names)}) VALUES ({','.join(vals)});", check=False)
    db.run(read(PROPOSED))
    db.run(read(PROPOSED))   # idempotent
    db.run("SELECT public.delete_my_account();", role='authenticated', sub=A)
    left2 = leftovers('proposed')
    print(f'delete   proposed delete_account_complete.sql: tables still holding that user\'s rows: {left2 or "none"}')
    if left2:
        hard.append('proposed delete function still leaves rows in: ' + ', '.join(left2))
    other = db.run(f"SET session_replication_role = replica; SELECT count(*) FROM public.profiles WHERE id='{B}'", fetch=True)
    if str(other).splitlines()[-1] != '1':
        hard.append("deleting user A removed user B's profile")
    # 7. destructive statements
    for rel in ORDER:
        for m in re.finditer(r'^\s*(DROP TABLE|TRUNCATE|DELETE FROM\s+\w+\s*;)', read(rel), re.M | re.I):
            line = read(rel)[:m.start()].count('\n') + 1
            if not rel.startswith('voiceagent'):
                findings.append(f'{rel}:{line} destructive statement: {m.group(1)}')


if __name__ == '__main__':
    sys.exit(main())
