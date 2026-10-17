const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('legacy tracker identifies synthetic market cards as sample data', () => {
  const html = read('html/tracker.html');
  const js = read('js/tracker.js');
  assert.equal(/>\s*LIVE\s*</i.test(html), false, 'a static demonstration must not claim to be live');
  assert.equal(/sample data|illustrative|not market data/i.test(html), true, 'market figures need a visible sample-data disclosure');
  assert.equal(/Math\.random\s*\(|setInterval\s*\(/.test(js), false, 'synthetic prices must not move like a live feed');
});

test('Track hub does not probe or navigate to a developer localhost service', () => {
  const html = read('html/track-finances.html');
  const engineCard = html.match(/<!-- EXPENSE ENGINE -->([\s\S]*?)<!-- CALCULATOR SUITE -->/)?.[1] ?? '';
  assert.equal(/https?:\/\/localhost(?::\d+)?/i.test(engineCard), false, 'production pages must not link to developer localhost');
  assert.equal(/probeExpenseEngine|checkExpenseEngine/.test(html), false, "the page must not probe a user's localhost");
});

test('legacy tracker.html is never advertised as live or as an expense tracker (TRK-WEB-001)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  const markets = read('html/markets.html');
  const card = markets.slice(markets.indexOf('href="tracker.html"'), markets.indexOf('href="stock-platform.html"'));
  assert.ok(card.length > 0, 'markets.html card for tracker.html still present');
  assert.doesNotMatch(card, /\bLive\b/i, 'the tracker.html card must not claim live feeds');
  assert.match(card, /sample/i);
  const idx = read('js/finos-search-index.js');
  const line = idx.split('\n').find((l) => l.includes('html/tracker.html'));
  assert.ok(line && /sample/i.test(line) && !/expense and income/i.test(line));
});

test('the archived Portfolio.AI v9 forwards to v10 and nothing links to it (it lacks the request guards)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const v9 = fs.readFileSync(path.join(root, 'Porfolio Analyser/portfolio-analyser-v9.html'), 'utf8');
  assert.match(v9, /http-equiv="refresh"[^>]+portfolio-analyser-v10\.html/);
  assert.match(v9, /location\.replace\('portfolio-analyser-v10\.html'/);
  assert.match(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'), /portfolio-analyser-v9\.html[\s\S]{0,80}portfolio-analyser/);
  const app = fs.readFileSync(path.join(root, 'News1/src/App.tsx'), 'utf8');
  assert.doesNotMatch(app, /portfolio-analyser-v9/);
  const hub = fs.readFileSync(path.join(root, 'html/track-finances.html'), 'utf8');
  assert.doesNotMatch(hub, /portfolio-analyser-v9/);
});
