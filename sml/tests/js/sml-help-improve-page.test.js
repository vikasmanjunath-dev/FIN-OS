const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'html', 'help-improve.html'), 'utf8');

test('the opt-in page has no network code and loads only the local capture module', () => {
  const code = html.replace(/<style[\s\S]*?<\/style>/g, '');
  assert.ok(!/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/.test(code), 'network API found');
  assert.ok(!/<link[^>]+href=["']https?:/i.test(html) && !/<script[^>]+src=["']https?:/i.test(html), 'external file loaded');
  assert.deepStrictEqual([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]), ['../js/sml/sample-capture.js']);
});
test('the page says plainly what is kept, that nothing is sent automatically, that names are not found, and how to delete; it is marked as a draft', () => {
  const text = html.replace(/<[^>]+>/g, ' ');
  for (const re of [/DRAFT/, /Nothing is sent automatically/i, /Names are not found automatically/i, /At most 50 examples/, /Delete all examples/, /90 days/, /never sell/i]) assert.match(text, re, String(re));
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(text, /इसे चालू करने पर/);                                   // the Hindi draft is present and marked for review
  assert.match(text, /मसौदा/);
});
test('the page is not linked from any other page or script yet (draft until the founder approves the wording)', () => {
  const hits = [];
  for (const dir of ['html', 'js', 'calculators']) {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name); if (e.isDirectory()) { if (!/node_modules|models/.test(e.name)) walk(p); return; }
      if (/\.(html|js)$/.test(e.name) && e.name !== 'help-improve.html' && /(href|src|action)\s*=\s*["'][^"']*help-improve|(location|open|assign|replace)[^;\n]{0,40}["'`][^"'`]*help-improve/.test(fs.readFileSync(p, 'utf8'))) hits.push(p);
    });
    walk(path.join(ROOT, dir));
  }
  assert.deepStrictEqual(hits, []);
});
