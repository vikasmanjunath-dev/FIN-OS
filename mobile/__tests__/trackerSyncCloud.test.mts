// The real supabase-js client + our Supabase adapter, against a mock server that follows PostgREST's rules
// (409/23505 on duplicate insert, filtered PATCH returning the updated rows, timestamptz echoed as "+00:00").
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { makeSupabaseCloud } from '../lib/trackerSyncCloud.ts';
import { runSync, type LocalStore } from '../lib/trackerSyncEngine.ts';

type Row = { user_id: string; data: any; updated_at: string };
const rows = new Map<string, Row>();
let missingTable = false;
const log: string[] = [];
let server: http.Server;
let url = '';

// Postgres returns timestamptz as e.g. 2026-10-11T10:20:30.123+00:00 (not the client's "...Z"); equality is on the instant.
const pg = (iso: string) => new Date(iso).toISOString().replace('Z', '+00:00');
const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise(res => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => res(b ? JSON.parse(b) : null)); });
}
const send = (res: http.ServerResponse, code: number, body: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

before(async () => {
  server = http.createServer(async (req, res) => {
    const u = new URL(req.url!, 'http://x');
    log.push(`${req.method} ${u.pathname}${u.search}`);
    if (!u.pathname.endsWith('/rest/v1/tracker_snapshot')) return send(res, 404, { message: 'nope' });
    if (missingTable) return send(res, 404, { code: 'PGRST205', message: "Could not find the table 'public.tracker_snapshot' in the schema cache", details: null, hint: null });
    const eq = (col: string) => { const v = u.searchParams.get(col); return v && v.startsWith('eq.') ? v.slice(3) : null; };
    const cols = (u.searchParams.get('select') || '*').split(',');
    const project = (r: Row) => (cols[0] === '*' ? r : Object.fromEntries(cols.map(c => [c, (r as any)[c]])));

    if (req.method === 'GET') {
      const uid = eq('user_id');
      const hit = [...rows.values()].filter(r => !uid || r.user_id === uid).map(r => ({ ...r, updated_at: pg(r.updated_at) })).map(project);
      if ((req.headers.accept || '').includes('vnd.pgrst.object+json')) {
        return hit.length === 1 ? send(res, 200, hit[0]) : send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      }
      return send(res, 200, hit);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (rows.has(body.user_id)) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint "tracker_snapshot_pkey"' });
      rows.set(body.user_id, { user_id: body.user_id, data: body.data, updated_at: body.updated_at });
      return send(res, 201, []);
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const uid = eq('user_id'), at = eq('updated_at');
      const hit = [...rows.values()].filter(r => (!uid || r.user_id === uid) && (!at || sameInstant(r.updated_at, at)));
      hit.forEach(r => { r.data = body.data; r.updated_at = body.updated_at; });
      return send(res, 200, hit.map(r => ({ ...r, updated_at: pg(r.updated_at) })).map(project));
    }
    return send(res, 405, { message: 'method' });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  // Supabase's fetch client can leave keep-alive sockets open after the last
  // assertion. Close those sockets so Node's test worker can terminate.
  server.closeAllConnections?.();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

const mkClient = () => createClient(url, 'anon-key-for-tests', { auth: { persistSession: false, autoRefreshToken: false } });
class Mem implements LocalStore {
  m = new Map<string, string>();
  async readAll() { return Object.fromEntries(this.m); }
  async get(k: string) { return this.m.get(k) ?? null; }
  async set(e: Record<string, string>) { Object.entries(e).forEach(([k, v]) => this.m.set(k, v)); }
  async remove(keys: string[]) { keys.forEach(k => this.m.delete(k)); }
}

test('adapter: fetch / insert / compare-and-set behave like PostgREST', async () => {
  rows.clear();
  const cloud = makeSupabaseCloud(mkClient());
  assert.equal(await cloud.fetch('u1'), null);

  assert.equal(await cloud.store('u1', { finos_a: '1' }, null), 'ok');                 // insert
  assert.equal(await cloud.store('u1', { finos_a: 'dup' }, null), 'conflict');         // 409 / 23505 → conflict, not a throw

  const row = await cloud.fetch('u1');
  assert.deepEqual(row?.data, { finos_a: '1' });
  assert.match(row!.updatedAt, /\+00:00$/);                                             // Postgres-style timestamp round-trips

  assert.equal(await cloud.store('u1', { finos_a: '2' }, row!.updatedAt), 'ok');        // CAS with the echoed timestamp
  assert.equal(await cloud.store('u1', { finos_a: '3' }, row!.updatedAt), 'conflict');  // stale expected value
  assert.deepEqual((await cloud.fetch('u1'))?.data, { finos_a: '2' });
});

test('adapter: a missing table surfaces as an error the app can explain', async () => {
  missingTable = true;
  try {
    const err: any = await makeSupabaseCloud(mkClient()).fetch('u1').then(() => null, e => e);
    assert.ok(err, 'fetch should reject');
    assert.match(`${err.code ?? ''} ${err.message ?? ''}`, /PGRST205|schema cache/);
  } finally { missingTable = false; }
});

test('end to end: two devices through the real client converge, and users stay isolated', async () => {
  rows.clear();
  const phone = new Mem(), tablet = new Mem(), other = new Mem();
  const cloud = makeSupabaseCloud(mkClient());
  phone.m.set('finos_monthly_income', '60000');
  phone.m.set('finos_goals', JSON.stringify([{ id: 'g1', name: 'Car' }]));
  other.m.set('finos_monthly_income', 'someone-else');

  assert.equal((await runSync(phone, cloud, 'u1')).pushed, true);
  assert.equal((await runSync(other, cloud, 'u2')).pushed, true);
  const t1 = await runSync(tablet, cloud, 'u1');
  assert.equal(t1.pulled, 2);
  assert.equal(tablet.m.get('finos_monthly_income'), '60000');

  phone.m.set('finos_monthly_income', '65000');
  tablet.m.set('finos_goals', JSON.stringify([{ id: 'g1', name: 'Car' }, { id: 'g2', name: 'Trip' }]));
  await runSync(phone, cloud, 'u1');
  await runSync(tablet, cloud, 'u1');
  await runSync(phone, cloud, 'u1');
  assert.equal(tablet.m.get('finos_monthly_income'), '65000');
  assert.equal(JSON.parse(phone.m.get('finos_goals')!).length, 2);
  assert.equal(rows.get('u2')!.data.finos_monthly_income, 'someone-else');                 // u2's row untouched
  // steady state: nothing left to do
  const quiet = await runSync(tablet, cloud, 'u1');
  assert.deepEqual([quiet.ok, quiet.pulled, quiet.pushed], [true, 0, false]);
});
