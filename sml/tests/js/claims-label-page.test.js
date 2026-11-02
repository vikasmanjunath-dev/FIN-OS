const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '..', 'tools', 'claims');
const html = fs.readFileSync(path.join(dir, 'label_claims.html'), 'utf8');

test('the labelling page has no network code and loads only the local core file', () => {
  const code = html.replace(/<style[\s\S]*?<\/style>/g, '');
  assert.ok(!/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b/.test(code));
  assert.ok(!/<(script|link)[^>]+(src|href)=["']https?:/i.test(html));
  assert.deepStrictEqual([...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]), ['labeling-core.js']);
});
test('the page never pre-fills or imports a label from the claims file, offers the three choices and the keyboard shortcuts, and says what to judge', () => {
  for (const re of [/Supported <kbd>1<\/kbd>/, /Not supported <kbd>2<\/kbd>/, /Unsure <kbd>3<\/kbd>/, /Judge only against the passages shown/, /Nothing is pre-filled/, /300/, /100 needed/, /Download labels/]) assert.match(html, re, String(re));
  const core = fs.readFileSync(path.join(dir, 'labeling-core.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/localStorage|sessionStorage|document\.|window\./.test(core), 'the core stays pure');
});
