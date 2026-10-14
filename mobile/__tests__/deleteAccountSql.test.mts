// supabase/delete_account.sql must remove every table that stores a person's rows without a cascading foreign key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(path.join(repo, p), 'utf8');
const del = read('supabase/delete_account.sql');

/** Tables in the repo's schema files that carry a user column. */
function userTables(sql: string): { table: string; col: string; cascades: boolean }[] {
  const out: { table: string; col: string; cascades: boolean }[] = [];
  for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    for (const line of m[2].split('\n')) {
      const c = line.match(/^\s*(user_id|user_a|user_b)\s+uuid\b(.*)$/i);
      if (c) out.push({ table: m[1], col: c[1], cascades: /REFERENCES\s+auth\.users\(id\)\s+ON DELETE CASCADE/i.test(c[2]) });
    }
  }
  return out;
}

test('every table in the repo schemas that stores a person\'s rows is handled by delete_my_account()', () => {
  const files = ['supabase/core_tables.sql', 'supabase/holdings.sql', 'supabase/tracker_snapshot.sql', 'alerts/schema.sql', 'voiceagent/schema.sql'].filter(f => existsSync(path.join(repo, f)));
  assert.ok(files.length >= 4);
  const tables = files.flatMap(f => userTables(read(f)));
  assert.ok(tables.length >= 10, `found ${tables.length}`);
  const missing = tables.filter(t => !new RegExp(`\\['${t.table}',\\s*'${t.col}'\\]`).test(del) && !(t.col !== 'user_id' && /couple_links/.test(t.table) && /user_a = uid OR user_b = uid/.test(del)));
  assert.deepEqual(missing, [], 'add these tables to delete_account.sql');
  // the ones WITHOUT a cascade are the reason the explicit deletes exist: prove the file is not relying on a cascade for them
  for (const t of tables.filter(t => !t.cascades && t.col === 'user_id')) assert.match(del, new RegExp(`\\['${t.table}',\\s*'user_id'\\]`), t.table);
});

test('the function is still restricted to the caller and to signed-in users', () => {
  assert.match(del, /uid\s+uuid\s*:=\s*auth\.uid\(\)/);
  assert.match(del, /IF uid IS NULL THEN\s+RAISE EXCEPTION/);
  assert.match(del, /REVOKE ALL ON FUNCTION public\.delete_my_account\(\) FROM anon/);
  assert.match(del, /GRANT EXECUTE ON FUNCTION public\.delete_my_account\(\) TO authenticated/);
  assert.match(del, /SECURITY DEFINER/);
  assert.match(del, /DELETE FROM auth\.users WHERE id = uid/);
  assert.ok(!/DELETE FROM public\.\w+;/i.test(del), 'no unqualified delete of a whole table');
});

test('the phone app calls exactly that function by that name', () => {
  assert.match(readFileSync(path.join(repo, 'mobile/lib/dataControls.ts'), 'utf8'), /rpc\('delete_my_account'\)/);
});
