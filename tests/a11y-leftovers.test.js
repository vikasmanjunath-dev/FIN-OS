'use strict';
// Static guards for the accessibility leftovers pass (Oct 2026): contrast tokens, closed off-canvas widgets,
// landmarks / headings / scroll regions in the html pages. Behaviour is covered in tests/test_a11y_leftovers.py.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const htmlPages = () => fs.readdirSync(path.join(root, 'html')).filter((f) => f.endsWith('.html')).map((f) => 'html/' + f);

test('reader chapters are dimmed through the --chapter-dim token, never to 0.2 / 0.3', () => {
  assert.match(read('css/design-tokens.css'), /--chapter-dim:\s*0\.[89]\d*/);
  const files = ['commoditydetail', 'cryptodetail', 'derivativesdetail', 'equitydetail', 'etfdetail', 'debtdetail',
                 'forexdetail', 'moneydetail', 'mfdetail', 'markets-deep'].map((n) => `css/${n}.css`);
  for (const f of files) {
    const css = read(f);
    const rule = css.match(/\.chapter\s*\{[^}]*\}/);
    assert.ok(rule, f + ' has a .chapter rule');
    assert.match(rule[0], /opacity:\s*var\(--chapter-dim/, f + ': .chapter opacity must use the token');
    assert.doesNotMatch(rule[0], /opacity:\s*0?\.[0-6]\d*\s*[;}]/, f);
    // markets-deep.js dims the others inline to 0.3; the stylesheet must keep that readable
    assert.match(css, /\.chapter\[style\*="opacity: 0\.3"\]\s*\{[^}]*--chapter-dim[^}]*!important/, f + ': inline dim override');
  }
});

test('light-theme bowl labels do not use white text on lime / red / yellow', () => {
  const css = read('css/etfdetail.css');
  assert.match(css, /\[data-theme="light"\] \.bowl:not\(\.n50\)\s*\{\s*color:\s*#000/);
});

test('closed drawers, sheets and pop-ups leave the tab order (visibility:hidden until .open)', () => {
  const base = read('css/base.css');
  for (const sel of ['#finos-popup:not(.open)', '#finos-hs-panel:not(.open)', '#finos-alert-drawer:not(.open)',
                     '.finos-quick-capture:not(.open)', '#fs-bar:not(.active)', '#qft-drawer:not(.open)']) {
    const re = new RegExp('html ' + sel.replace(/[.()#:]/g, '\\$&') + '\\s*\\{[^}]*visibility:\\s*hidden');
    assert.match(base, re, sel);
  }
  assert.match(read('css/layout.css'), /\.sidebar:not\(\.mob-open\)\s*\{[^}]*visibility:\s*hidden/);
  assert.match(read('css/insight-cards.css'), /\.ic-modal-overlay:not\(\.open\)\s*\{[^}]*visibility:\s*hidden/);
  const sim = read('html/simulator-landing.html');
  assert.match(sim, /#arya-panel:not\(\.open\)\s*\{[^}]*visibility:\s*hidden/);
  assert.match(sim, /#readinessModal:not\(\.open\)\s*\{[^}]*visibility:\s*hidden/);
});

test('floating Arya button and header search have a focus ring that beats their outline:none', () => {
  const base = read('css/base.css');
  assert.match(base, /html #finos-fab:focus-visible\s*\{[^}]*outline:\s*3px solid/);
  assert.match(base, /html #fs-toggle:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  assert.match(base, /\.sr-only\s*\{/);
});

test('every floating back link sits in its own nav landmark', () => {
  let seen = 0;
  for (const f of htmlPages()) {
    const s = read(f);
    const m = s.match(/<a id="floatBackBtn"/g);
    if (!m) continue;
    seen++;
    assert.match(s, /<nav aria-label="Back"><a id="floatBackBtn"/, f);
  }
  assert.ok(seen >= 30, 'expected the back link on 30+ pages, saw ' + seen);
});

test('pages whose title is not an <h1> expose one', () => {
  const need = {
    'html/fear-roadmap.html': 'class="zen-title" role="heading" aria-level="1"',
    'html/trader-roadmap.html': 'class="glitch-title" role="heading" aria-level="1"',
    'html/traditional-roadmap.html': 'class="vault-title" role="heading" aria-level="1"',
    'html/trading-brain.html': 'class="trady-logo-name" role="heading" aria-level="1"',
    'html/simulator-landing.html': 'class="hl-wrap" role="heading" aria-level="1"',
    'html/market-visualizer.html': 'class="logo" role="heading" aria-level="1"',
  };
  for (const [f, frag] of Object.entries(need)) assert.ok(read(f).includes(frag), f);
});

test('landmarks: one <main> per page, labelled asides, decorative canvases hidden', () => {
  const tb = read('html/trading-brain.html');
  assert.equal((tb.match(/<main\b/g) || []).length, 1, 'trading-brain has one <main>');
  assert.match(tb, /<aside class="signal-panel" id="signalPanel" aria-label=/);
  assert.match(read('html/market-visualizer.html'), /<main class="container" id="mainContent">/);
  assert.match(read('calculators/investment & wealth/sip-optimizer.html'), /<main class="page">/);
  for (const [f, id] of [['html/diagnostics.html', 'neuralCanvas'], ['html/foundations.html', 'gridCanvas'], ['html/simulator-guide.html', 'bgCanvas'],
                         ['html/insurance-directory.html', 'sanctum-canvas'], ['html/investor-mindset.html', 'heroCanvas'], ['html/track-finances.html', 'tf-stars']]) {
    assert.match(read(f), new RegExp(`<canvas aria-hidden="true" id="${id}"`), f);
  }
});

test('trading simulator has a page heading', () => {
  assert.match(read('html/trading-simulator.html'), /<h1 class="sr-only">FIN-OS Trading Simulator<\/h1>/);
  assert.match(read('html/money-ai.html'), /id="quickChips" tabindex="0"/);
});

test('scrollable regions can take keyboard focus', () => {
  for (const f of ['html/finance101.html', 'html/etfdetail.html', 'html/forexdetail.html', 'html/markets.html', 'html/debtdetail.html']) {
    const s = read(f);
    assert.doesNotMatch(s, /<div class="scrolling-wrapper">/, f);
    assert.match(s, /<div class="scrolling-wrapper" tabindex="0">/, f);
  }
  assert.match(read('html/options-intelligence.html'), /overflow-x:auto;-webkit-overflow-scrolling:touch;" tabindex="0"/);
  assert.match(read('html/trading-simulator.html'), /id="watchlistBody" tabindex="0"/);
});

test('greyed-out controls use the disabled attribute so contrast rules and keyboards both skip them', () => {
  assert.match(read('html/trader-roadmap.html'), /id="calcBtn"[^>]*\bdisabled\b/);
  assert.match(read('html/fear-roadmap.html'), /id="healBtn"[^>]*\bdisabled\b/);
});

test('list items sit in a list', () => {
  const s = read('html/mfdetail.html');
  assert.doesNotMatch(s, /<div class="checklist-style">\s*<li>/);
  assert.match(s, /<ul class="checklist-style"[^>]*>\s*<li>/);
});

test('heading levels never skip downwards in the static markup of the pages that used to (aria-level applied)', () => {
  // learn-metrics had <h1> followed by 24 <h3>; they now carry aria-level="2"
  const s = read('html/learn-metrics.html');
  const h3 = s.match(/<h3 class="m-title"[^>]*>/g) || [];
  assert.ok(h3.length >= 20);
  for (const t of h3) assert.match(t, /aria-level="2"/);
});
