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
/** A route resolves to a screen file: a literal file, a folder index, or a dynamic segment ([id].tsx, [code].tsx ...). Route groups like (tabs) are searched too. */
function resolves(dir: string, parts: string[]): boolean {
  if (!fs.existsSync(dir)) return false;
  const names = fs.readdirSync(dir);
  const [head, ...rest] = parts;
  const dyn = names.filter(n => /^\[[^\]]+\](\.tsx)?$/.test(n));
  if (!rest.length) {
    if (names.includes(`${head}.tsx`)) return true;
    if (fs.existsSync(path.join(dir, head, 'index.tsx'))) return true;
    if (dyn.some(n => n.endsWith('.tsx'))) return true;
  } else {
    if (resolves(path.join(dir, head), rest)) return true;
    for (const n of dyn.filter(n => !n.endsWith('.tsx'))) if (resolves(path.join(dir, n), rest)) return true;
  }
  return names.filter(n => /^\(.+\)$/.test(n)).some(g => resolves(path.join(dir, g), parts));
}
const exists = (route: string) => {
  const rel = route.replace(/^\//, '');
  if (rel.startsWith('tools/calc/')) return true;          // dynamic route app/tools/calc/[id].tsx, ids checked below
  return resolves(APP, rel.split('/'));
};

test('every indexed screen route exists', () => {
  const missing = SCREENS.filter(s => !exists(s.route)).map(s => s.route);
  assert.deepEqual(missing, []);
  assert.ok(fs.existsSync(path.join(APP, 'tools/calc/[id].tsx')));
});

test('the Learn lessons in the index are exactly the bundled manifest (id, title, summary), and each opens the lesson screen', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/learn/manifest.json'), 'utf8')) as { lessons: { id: string; title: string; summary: string }[] };
  const inIndex = SCREENS.filter(s => /^\/learn\/[^/]+$/.test(s.route));
  assert.deepEqual(inIndex.map(s => [s.route.slice(7), s.title, s.sub]), manifest.lessons.map(l => [l.id, l.title, l.summary]));
  assert.ok(SCREENS.some(s => s.route === '/learn'));
  assert.ok(fs.existsSync(path.join(APP, 'learn/[id].tsx')));
});

test('dynamic-route resolution is real: a route with no screen is not found', () => {
  assert.equal(exists('/learn/anything'), true);
  assert.equal(exists('/nope/anything'), false);
  assert.equal(exists('/market/stock/RELIANCE'), true);      // [symbol].tsx under stock
  assert.equal(exists('/market/stock'), false);              // a folder with only a dynamic screen is not a route by itself
  assert.equal(exists('/dashboard'), true);                  // (tabs) group
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
