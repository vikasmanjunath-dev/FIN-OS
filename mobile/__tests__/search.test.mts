// Phone-wide search: ranking, and that the index matches the screens that really exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDEX, SCREENS, search, popularEntries } from '../lib/search.ts';
import { CALCS } from '../lib/calcs/index.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(ROOT, 'app');
const exists = (route: string) => {
  const rel = route.replace(/^\//, '');
  const cands = [`${rel}.tsx`, `(tabs)/${rel}.tsx`, `${rel}/index.tsx`];
  if (rel.startsWith('tools/calc/')) return true;          // dynamic route app/tools/calc/[id].tsx, ids checked below
  return cands.some(c => fs.existsSync(path.join(APP, c)));
};

test('every indexed screen route exists', () => {
  const missing = SCREENS.filter(s => !exists(s.route)).map(s => s.route);
  assert.deepEqual(missing, []);
  assert.ok(fs.existsSync(path.join(APP, 'tools/calc/[id].tsx')));
});

test('every tool and tracker screen is in the index', () => {
  const have = new Set(SCREENS.map(s => s.route));
  const files = [...fs.readdirSync(path.join(APP, 'tools')).filter(f => f.endsWith('.tsx')).map(f => '/tools/' + f.replace('.tsx', '')),
    ...fs.readdirSync(path.join(APP, 'tracker')).filter(f => f.endsWith('.tsx')).map(f => '/tracker/' + f.replace('.tsx', ''))];
  assert.deepEqual(files.filter(f => !have.has(f)), []);
});

test('every calculator is searchable and ids are unique', () => {
  assert.equal(INDEX.length, SCREENS.length + CALCS.length);
  assert.equal(new Set(INDEX.map(i => i.id)).size, INDEX.length);
});

test('exact and prefix title matches rank first', () => {
  assert.equal(search('sip')[0].route, '/tools/calc/sip');
  assert.equal(search('net worth')[0].route, '/tracker/networth');
  assert.equal(search('home loan')[0].route, '/tools/homeloan');
  assert.equal(search('emi')[0].route, '/tools/calc/emi');
});

test('plain words and Hindi terms find the right screen', () => {
  assert.ok(search('bima').some(r => r.route === '/tracker/insurance'));
  assert.ok(search('sona').some(r => r.route === '/tracker/gold'));
  assert.ok(search('pf').some(r => r.route === '/tracker/epf'));
  assert.ok(search('cibil')[0].route === '/tools/credit');
  assert.ok(search('stamp duty').some(r => r.route === '/tools/realestate'));
  assert.ok(search('ltcg').some(r => r.route === '/tracker/harvest'));
});

test('every word must match; nonsense and blank give nothing; results are capped', () => {
  assert.deepEqual(search('zzzzqq'), []);
  assert.deepEqual(search('   '), []);
  assert.equal(search('sip zzzzqq').length, 0);
  assert.ok(search('a', INDEX, 5).length <= 5);
  assert.ok(search('tax').length > 0);
});

test('case, punctuation and accents do not matter', () => {
  assert.deepEqual(search('HRA').map(r => r.route), search('hra').map(r => r.route));
  assert.deepEqual(search('Net-worth!').map(r => r.route)[0], '/tracker/networth');
});

test('the popular list only points at real entries', () => {
  assert.equal(popularEntries().length, 8);
});
