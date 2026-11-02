const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '..', 'tools', 'review');
const html = fs.readFileSync(path.join(dir, 'router_review.html'), 'utf8');

test('the blind review page has no network code and loads only the local core file', () => {
  const code = html.replace(/<style[\s\S]*?<\/style>/g, '');
  assert.ok(!/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/.test(code));
  assert.ok(!/<(script|link)[^>]+(src|href)=["']https?:/i.test(html));
  assert.deepStrictEqual([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]), ['router-review-core.js']);
});
test('the page offers all 13 intents plus unsure, refuses files that show labels, and explains the blind rule', () => {
  for (const i of ['personal_spend_query', 'personal_money_summary', 'goal_status', 'calculator_request', 'regulation_question', 'concept_explainer', 'document_help', 'market_data', 'app_help', 'advice_seeking', 'evasion_request', 'smalltalk', 'out_of_scope']) assert.ok(html.includes(i + ':'), i);
  for (const re of [/You do not see anyone else's label: that is on purpose/, /A file containing any label or router guess is refused/, /Unsure/, /LABELLING_GUIDE/]) assert.match(html, re, String(re));
  const core = fs.readFileSync(path.join(dir, 'router-review-core.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/localStorage|sessionStorage|document\.|window\./.test(core), 'the core stays pure');
});
test('the candidates file the page loads carries no label, router guess or set name (only item_id and text)', () => {
  const p = path.join(dir, 'router_candidates.jsonl'); if (!fs.existsSync(p)) return;
  const rows = fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.ok(rows.length > 0 && rows.every((r) => JSON.stringify(Object.keys(r).sort()) === '["item_id","text"]'));
});
