// Insurance hub: the extracted content is well formed, every figure traces to a real line of the website, nothing is ranked or
// invented, and the comparison / checklist logic behaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as hub from '../lib/insuranceHub.ts';
import { INSURANCE_CONTENT } from '../content/insurance/data.ts';
import { renewalDays, type Policy } from '../lib/retirement.ts';

const MOBILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.join(MOBILE, '..');
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(MOBILE, 'content/insurance', f), 'utf8'));
const coverJson = readJson('cover-types.json');
const factsJson = readJson('facts.json');
const checksJson = readJson('checks.json');

const NOW = new Date('2026-10-14T10:00:00');
const pol = (o: Partial<Policy>): Policy => ({ id: 'p', type: 'health', provider: 'Insurer', sum_assured: 500000, annual_premium: 10000, renewal_date: '', policy_number: '', notes: '', added_at: '', ...o });

// ── content ─────────────────────────────────────────────────────────────────────────────────────

test('the bundled data module is exactly the three JSON files (no drift)', () => {
  assert.deepEqual(INSURANCE_CONTENT.coverTypes, coverJson);
  assert.deepEqual(INSURANCE_CONTENT.facts, factsJson);
  assert.deepEqual(INSURANCE_CONTENT.checks, checksJson);
});

test('the committed JSON is what the extraction script produces from the website today', t => {
  let out = '';
  try {
    out = execFileSync('python3', [path.join(MOBILE, 'scripts/extract-insurance.py'), '--check'], { encoding: 'utf8' });
  } catch (e: any) {
    if (e.code === 'ENOENT') return t.skip('python3 not available');
    assert.fail(`extract-insurance.py --check failed: ${e.stdout || e.message}`);
  }
  assert.match(out, /up to date/);
});

function lineOf(file: string, line: number, stripTags: boolean): string {
  const lines = fs.readFileSync(path.join(REPO, file), 'utf8').split('\n');
  let s = lines[line - 1] ?? '';
  if (stripTags) s = s.replace(/<[^>]+>/g, '');
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function allSources(): { where: string; s: hub.Source }[] {
  const out: { where: string; s: hub.Source }[] = [];
  for (const c of coverJson.coverTypes) {
    if (c.layer) {
      out.push({ where: `${c.id}.taglineSource`, s: c.layer.taglineSource }, { where: `${c.id}.headingSource`, s: c.layer.headingSource }, { where: `${c.id}.story`, s: c.layer.story.source });
      c.layer.features.forEach((f: any, i: number) => out.push({ where: `${c.id}.features[${i}]`, s: f.source }));
    }
    if (c.hub) out.push({ where: `${c.id}.hub`, s: c.hub.source });
  }
  for (const f of factsJson.facts) f.sources.forEach((s: hub.Source, i: number) => out.push({ where: `fact ${f.id}[${i}]`, s }));
  return out;
}

test('every figure and feature quotes a line that is really on the website', () => {
  const list = allSources();
  assert.ok(list.length > 60, `only ${list.length} sources`);
  const bad: string[] = [];
  for (const { where, s } of list) {
    assert.match(s.file, /^html\/[a-z-]+\.html$/);
    assert.ok(Number.isInteger(s.line) && s.line > 0, where);
    assert.ok(s.quote.length >= 2, `${where}: quote too short`);
    if (!lineOf(s.file, s.line, s.file !== 'html/insurance-hub.html').includes(s.quote)) bad.push(`${where} ${s.file}:${s.line} ${JSON.stringify(s.quote)}`);
  }
  assert.deepEqual(bad, []);
});

test('no website figure claims a date or a verification it does not have', () => {
  assert.ok(factsJson.facts.length >= 15);
  const ids = new Set<string>();
  for (const f of factsJson.facts) {
    assert.ok(!ids.has(f.id), `duplicate fact ${f.id}`);
    ids.add(f.id);
    assert.equal(f.asOf, null, `${f.id} has a date the website does not give`);
    assert.match(f.asOfNote, /not stated/i);
    assert.equal(f.verified, false);
    assert.ok(f.statement.length > 10 && f.sources.length >= 1, f.id);
    assert.ok(['figure', 'rule', 'claim'].includes(f.kind));
  }
});

test('the website holds no insurer table, and the content says so rather than inventing one', () => {
  assert.equal(hub.INSURER_DATA.available, false);
  assert.match(hub.INSURER_DATA.body, /does not hold a table of insurers/);
  // nothing that names a company or an insurer-level ratio value is in the shipped content
  const text = JSON.stringify([coverJson, factsJson, checksJson]);
  assert.doesNotMatch(text, /Star Health|HDFC|ICICI|Niva|Bajaj|Tata AIA|Max Life|SBI Life|New India|United India|Oriental|Care Health|Aditya Birla/i);
});

test('cover types: unique ids, known groups, every policy type of the tracker maps somewhere once', () => {
  const ids = hub.COVER_TYPES.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const groups = new Set(hub.GROUPS.map(g => g.id));
  hub.COVER_TYPES.forEach(c => {
    assert.ok(groups.has(c.group), c.id);
    assert.ok(c.summary.length > 20 && c.pays.length && c.doesNotPay.length, c.id);
    assert.equal(c.detail, c.layer ? 'full' : 'thin');
  });
  const mapped = hub.COVER_TYPES.flatMap(c => c.policyTypes);
  assert.equal(new Set(mapped).size, mapped.length);
  for (const t of ['health', 'life_term', 'life_ulip', 'vehicle', 'home', 'travel', 'critical']) assert.ok(mapped.includes(t as any), t);
  assert.equal(hub.coverTypeForPolicy('life_term'), 'term');
  assert.equal(hub.coverTypeForPolicy('something-new'), null);
});

test('FACTS_BY_TYPE and the checks point only at things that exist', () => {
  const factIds = new Set(hub.FACTS.map(f => f.id));
  const typeIds = new Set(hub.COVER_TYPES.map(c => c.id));
  for (const [t, list] of Object.entries(hub.FACTS_BY_TYPE)) {
    assert.ok(typeIds.has(t), t);
    list.forEach(id => assert.ok(factIds.has(id), `${t}: ${id}`));
  }
  for (const c of hub.CHECKS) {
    assert.ok(typeIds.has(c.coverType), c.id);
    c.facts.forEach(id => assert.ok(factIds.has(id), `${c.id}: ${id}`));
  }
  hub.GUIDE.forEach(g => g.points.forEach(p => p.facts.forEach(id => assert.ok(factIds.has(id), `${g.id}: ${id}`))));
  assert.equal(new Set(hub.CHECKS.map(c => c.id)).size, hub.CHECKS.length);
  for (const t of typeIds) assert.ok(hub.checksFor(t).length >= 2, `${t} has too few questions`);
});

test('authored wording: no ranking words, and a figure only appears next to the website fact it comes from', () => {
  const strings: { id: string; text: string; facts: string[] }[] = [];
  hub.CHECKS.forEach(c => strings.push({ id: c.id, text: `${c.question} ${c.why}`, facts: c.facts }));
  hub.GUIDE.forEach(g => g.points.forEach((p, i) => strings.push({ id: `${g.id}[${i}]`, text: p.text, facts: p.facts })));
  const cover = checksJson.cover;
  Object.entries(cover).forEach(([id, c]: any) => strings.push({ id: `cover.${id}`, text: [c.summary, ...c.pays, ...c.doesNotPay].join(' '), facts: [] }));
  for (const s of strings) {
    assert.doesNotMatch(s.text, /\bbest\b|\btop[- ]rated\b|\bcheapest\b|\bwe recommend\b|\bhighest rated\b/i, `${s.id} ranks or recommends`);
    if (/\d|%/.test(s.text)) assert.ok(s.facts.length > 0, `${s.id} has a number but cites no website fact: ${s.text}`);
  }
});

// ── logic ───────────────────────────────────────────────────────────────────────────────────────

test('recorded policies are grouped by cover type; unknown kinds are kept, not dropped', () => {
  const g = hub.policiesByCoverType([pol({ id: 'a', type: 'health' }), pol({ id: 'b', type: 'life_term' }), pol({ id: 'c', type: 'health' }), pol({ id: 'd', type: 'mystery' as any })]);
  assert.deepEqual(g.byType.health.map(p => p.id), ['a', 'c']);
  assert.deepEqual(g.byType.term.map(p => p.id), ['b']);
  assert.deepEqual(g.other.map(p => p.id), ['d']);
});

test('directory filter: group, words (all must match) and recorded-only', () => {
  const none = new Set<string>();
  assert.equal(hub.filterCoverTypes({}, none).length, hub.COVER_TYPES.length);
  assert.ok(hub.filterCoverTypes({ group: 'health' }, none).every(c => c.group === 'health'));
  assert.ok(hub.filterCoverTypes({ query: 'co-pay' }, none).some(c => c.id === 'health'));
  assert.deepEqual(hub.filterCoverTypes({ query: 'zzzzqqqq' }, none), []);
  assert.deepEqual(hub.filterCoverTypes({ query: 'term zzzzqqqq' }, none), []);
  assert.deepEqual(hub.filterCoverTypes({ recordedOnly: true }, new Set(['term'])).map(c => c.id), ['term']);
  assert.deepEqual(hub.filterCoverTypes({ recordedOnly: true }, none), []);
});

test('comparing cover types: one cell per type per row, website cells carry a source, thin types say so', () => {
  const rows = hub.compareCoverTypes(['health', 'ulip', 'term', 'travel'], { health: [pol({ id: 'a' })] });
  assert.ok(rows.every(r => r.cells.length === 3), 'capped at three');
  const feat = rows.find(r => r.key === 'features')!;
  assert.equal(feat.cells[0].kind, 'website');
  assert.match(feat.cells[0].source!, /html\/insurance-directory\.html, lines /);
  assert.equal(feat.cells[1].kind, 'none');                         // ULIP: the website only names it
  assert.deepEqual(feat.cells[1].lines, ['Not described on the website']);
  assert.deepEqual(rows.find(r => r.key === 'recorded')!.cells.map(c => c.lines[0]), ['1 policy', 'None', 'None']);
  const rules = rows.find(r => r.key === 'rules')!;
  assert.match(rules.cells[0].lines.join(' '), /2 times annual income/);
  assert.match(rules.cells[2].lines.join(' '), /15 times annual income|20 x annual income/);
  assert.deepEqual(hub.compareCoverTypes(['nope'], {}).every(r => r.cells.length === 0), true);
});

test('comparing policies: premium per lakh only when both numbers exist; mixed types are flagged; nothing is ranked', () => {
  const a = pol({ id: 'a', type: 'health', sum_assured: 1000000, annual_premium: 15000, renewal_date: '2026-11-14' });
  const b = pol({ id: 'b', type: 'health', sum_assured: 500000, annual_premium: 0 });
  const c = pol({ id: 'c', type: 'life_term', sum_assured: 10000000, annual_premium: 12000, renewal_date: 'garbage' });
  const same = hub.comparePolicies([a, b], NOW);
  assert.equal(same.sameType, true);
  assert.equal(same.columns[0].premiumPerLakh, 1500);
  assert.equal(same.columns[1].premiumPerLakh, null);
  assert.equal(same.columns[1].annualPremium, null);
  assert.equal(same.columns[0].renewalDays, 31);
  const mixed = hub.comparePolicies([a, c], NOW);
  assert.equal(mixed.sameType, false);
  assert.equal(mixed.columns[1].renewalDays, null);
  assert.ok(mixed.notes.some(n => /not like for like/.test(n)));
  assert.equal(hub.comparePolicies([a, b, c, pol({ id: 'd' })], NOW).columns.length, 3);
  assert.deepEqual(Object.keys(same.columns[0]).filter(k => /rank|score|best|better/i.test(k)), []);
});

test('renewal countdown compares real calendar days and rejects malformed or impossible dates', () => {
  const now = new Date(2026, 10, 1, 23, 55); // late on the local day; no time-of-day rounding
  assert.equal(renewalDays(pol({ renewal_date: '2026-11-02' }), now), 1);
  assert.equal(renewalDays(pol({ renewal_date: '2026-11-01' }), now), 0);
  assert.equal(renewalDays(pol({ renewal_date: '2026-10-31' }), now), -1);
  assert.equal(renewalDays(pol({ renewal_date: '2026-02-30' }), now), null);
  assert.equal(renewalDays(pol({ renewal_date: '2026-11-1' }), now), null);
  assert.equal(renewalDays(pol({ renewal_date: '' }), now), null);
});

test('checklist answers: unknown ids and values are dropped, clearing works, progress counts only real checks', () => {
  const healthCheck = hub.checksFor('health')[0].id;
  const bad = hub.normaliseAnswers({ p1: { [healthCheck]: 'ok', nope: 'ok', [hub.checksFor('health')[1].id]: 'maybe' }, p2: 'x', p3: {} });
  assert.deepEqual(bad, { p1: { [healthCheck]: 'ok' } });
  assert.deepEqual(hub.normaliseAnswers(null), {});
  assert.deepEqual(hub.normaliseAnswers([1, 2]), {});

  let a: hub.Answers = {};
  a = hub.setAnswer(a, 'p1', healthCheck, 'concern');
  a = hub.setAnswer(a, 'p1', hub.checksFor('health')[1].id, 'ok');
  const p = pol({ id: 'p1', type: 'health' });
  assert.deepEqual(hub.progressFor(p, a), { total: hub.checksFor('health').length, checked: 2, concerns: 1 });
  assert.deepEqual(hub.followUps([p], a).map(f => f.check.id), [healthCheck]);
  a = hub.setAnswer(a, 'p1', healthCheck, null);
  assert.equal(hub.followUps([p], a).length, 0);
  assert.deepEqual(hub.progressFor(pol({ id: 'zz', type: 'mystery' as any }), a), { total: 0, checked: 0, concerns: 0 });
  assert.deepEqual(hub.pruneAnswers(a, ['other']), {});
  assert.deepEqual(hub.setAnswer({}, 'p', healthCheck, null), {});
});
