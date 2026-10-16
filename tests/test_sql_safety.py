"""Repo SQL must be safe to run twice and must never drop a table or wipe rows when run as documented.

Found Oct 2026: voiceagent/schema.sql started with `DROP TABLE IF EXISTS agent_memories` while supabase/README.md told people to
run it "if missing" / "run once" (re-running erased every user's voice memory), and alerts/schema.sql stopped on a second run
because CREATE POLICY had no DROP POLICY IF EXISTS.  Nothing here runs SQL against a database: it reads the files.
"""
import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = sorted(glob.glob(os.path.join(ROOT, "supabase", "*.sql"))) + [
    os.path.join(ROOT, "alerts", "schema.sql"),
    os.path.join(ROOT, "voiceagent", "schema.sql"),
]


def statements(path):
    text = open(path, encoding="utf-8").read()
    text = re.sub(r"--[^\n]*", "", text)                    # line comments
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)       # block comments
    # keep $$ ... $$ bodies together: split on ; only outside dollar quotes
    out, cur, in_dollar = [], [], False
    for part in re.split(r"(\$\$)", text):
        if part == "$$":
            in_dollar = not in_dollar
            cur.append(part)
        elif in_dollar:
            cur.append(part)
        else:
            chunks = part.split(";")
            for k, c in enumerate(chunks):
                cur.append(c)
                if k < len(chunks) - 1:
                    out.append("".join(cur).strip())
                    cur = []
    if "".join(cur).strip():
        out.append("".join(cur).strip())
    return [re.sub(r"\s+", " ", s) for s in out if s]


def test_files_found():
    assert len(FILES) >= 7 and all(os.path.exists(f) for f in FILES)


def test_nothing_drops_a_table_or_wipes_rows():
    bad = []
    for f in FILES:
        for st in statements(f):
            u = st.upper()
            if re.match(r"(DROP\s+(TABLE|SCHEMA|DATABASE|COLUMN)|TRUNCATE)\b", u) or re.search(r"\bDROP\s+TABLE\b", u):
                bad.append((os.path.basename(f), st[:90]))
            if re.match(r"DELETE\s+FROM\b", u) and " WHERE " not in u:
                bad.append((os.path.basename(f), st[:90]))
    assert not bad, bad


def test_create_statements_are_rerunnable():
    bad = []
    for f in FILES:
        sts = statements(f)
        for i, st in enumerate(sts):
            u = st.upper()
            m = re.match(r'CREATE POLICY\s+("[^"]+"|\w+)\s+ON\s+([\w.]+)', st, re.I)
            if m:
                name, table = m.group(1), m.group(2)
                want = re.compile(r"DROP POLICY IF EXISTS\s+%s\s+ON\s+%s" % (re.escape(name), re.escape(table)), re.I)
                # the DROP may sit anywhere earlier in the file (or inside a DO block that guards the CREATE)
                inside_do = "NOT EXISTS" in u or u.startswith("DO ")
                if not inside_do and not any(want.search(p) for p in sts[:i]):
                    bad.append((os.path.basename(f), "policy", name))
            m = re.match(r'CREATE TRIGGER\s+(\w+)\s', st, re.I)
            if m and not any(re.search(r"DROP TRIGGER IF EXISTS\s+%s\b" % m.group(1), p, re.I) for p in sts[:i]):
                bad.append((os.path.basename(f), "trigger", m.group(1)))
            if re.match(r"CREATE TABLE\s+(?!IF NOT EXISTS)", st, re.I):
                bad.append((os.path.basename(f), "table without IF NOT EXISTS", st[:60]))
            if re.match(r"CREATE (UNIQUE )?INDEX\s+(?!IF NOT EXISTS)", st, re.I) and "ON" in u:
                # an unnamed index (CREATE INDEX ON ...) has no name to collide on; named ones must be IF NOT EXISTS
                if not re.match(r"CREATE (UNIQUE )?INDEX\s+ON\b", st, re.I):
                    bad.append((os.path.basename(f), "index without IF NOT EXISTS", st[:60]))
    assert not bad, bad


def test_readme_lists_delete_account_and_does_not_claim_cascade_is_enough():
    text = open(os.path.join(ROOT, "supabase", "README.md"), encoding="utf-8").read()
    assert "Run `delete_account.sql`" in text, "the setup order must tell people to install delete_my_account()"
    assert "via cascades, every row it owns" not in text
    assert "if `agent_memories` is missing" not in text, "voiceagent/schema.sql is re-runnable; no 'only if missing' workaround"
