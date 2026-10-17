const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = { localStorage: { getItem: () => null, setItem: () => {} } };
vm.runInNewContext(fs.readFileSync('js/finos-portfolio-analytics.js', 'utf8'), { window, Date, Math, Number, String, Object, Array, JSON, isFinite });
const analytics = window.PortfolioAnalytics;

const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('XIRR matches the published irregular-cash-flow example on a 365-day basis', () => {
  const flows = [
    ['2008-01-01', -10000], ['2008-03-01', 2750], ['2008-10-30', 4250],
    ['2009-02-15', 3250], ['2009-04-01', 2750],
  ].map(([date, amount]) => ({ date, amount }));
  near(analytics.computeXIRR(flows), 37.3362535, 0.00002);
});

test('XIRR sorts flows, accepts Date objects, and rejects malformed or one-sided cash flows', () => {
  const flows = [{ date: new Date('2021-01-01T00:00:00Z'), amount: 110 }, { date: '2020-01-01', amount: -100 }];
  near(analytics.computeXIRR(flows), 9.9713586, 1e-6); // 2020 includes leap day; XIRR uses 365-day years
  assert.equal(analytics.computeXIRR([{ date: '2020-01-01', amount: -100 }, { date: '2021-01-01', amount: -10 }]), null);
  assert.equal(analytics.computeXIRR([{ date: 'bad-date', amount: -100 }, { date: '2021-01-01', amount: 110 }]), null);
  assert.equal(analytics.computeXIRR([{ date: '2024-02-30', amount: -100 }, { date: '2025-02-28', amount: 110 }]), null);
  assert.equal(analytics.computeXIRR([{ date: '2020-01-01', amount: NaN }, { date: '2021-01-01', amount: 110 }]), null);
});

test('XIRR refuses non-conventional cash flows with multiple roots instead of picking one silently', () => {
  const flows = [{ date: '2020-01-01', amount: -100 }, { date: '2021-01-01', amount: 230 }, { date: '2022-01-01', amount: -132 }];
  assert.equal(analytics.computeXIRR(flows), null);
});

test('drawdown sorts valid dated values and distinguishes recovered from unrecovered episodes', () => {
  const d = analytics.computeDrawdown([
    { date: '2024-04-01', value: 130 }, { date: '2024-03-01', value: 90 },
    { date: '2024-02-01', value: 120 }, { date: '2024-01-01', value: 100 },
  ]);
  assert.equal(d.maxDD, 25); assert.equal(d.maxDDStart, '2024-02-01');
  assert.equal(d.maxDDEnd, '2024-03-01'); assert.equal(d.recoveredDate, '2024-04-01');
  const open = analytics.computeDrawdown([{ date: '2024-01-01', value: 100 }, { date: '2024-02-01', value: 80 }]);
  assert.equal(open.recoveredDate, null);
  assert.equal(analytics.computeDrawdown([{ date: '2024-01-01', value: 0 }, { date: '2024-02-01', value: 1 }]), null);
});

test('factor scores are unavailable without source data rather than fabricated from ticker', () => {
  assert.equal(analytics.computeFactorExposure([{ symbol: 'TCS' }]), null);
});

test('sector breakdown uses available values, labels funds and unknowns, and escapes supplied labels', () => {
  let html = '';
  const result = analytics.renderSectorHeatmap({ set innerHTML(v) { html = v; } }, [
    { symbol: 'TCS', quantity: 2, current_price: 100 },
    { symbol: 'UNKNOWN', quantity: 1, avg_price: 50 },
    { symbol: '12345', asset_type: 'mutual_fund', quantity: 5, current_price: 10 },
    { symbol: 'SAFE', sector: '<img src=x onerror=1>', current_value: 25 },
    { symbol: 'BAD', quantity: 1, current_price: Infinity },
  ]);
  assert.equal(result.totalValue, 325);
  assert.equal(result.pricedValue, 250);
  assert.equal(result.costValue, 75);
  assert.equal(result.unclassifiedValue, 50);
  assert.match(html, /Funds \(look-through unavailable\)/);
  assert.match(html, /Not classified/);
  assert.match(html, /&lt;img src=x onerror=1&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /Good sector diversification|Consider diversifying/);
});

test('sector totals exclude rows that would overflow the supported numeric range', () => {
  let html = '';
  const result = analytics.renderSectorHeatmap({ set innerHTML(v) { html = v; } }, [
    { symbol: 'A', current_value: 1e308 }, { symbol: 'B', current_value: 1e308 },
  ]);
  assert.equal(result.totalValue, 1e308);
  assert.equal(result.excludedRows, 1);
  assert.match(html, /excluded because adding its value exceeded/);
});

test('drawdown empty state does not invent a recovery timeline or tell the user to stay invested', () => {
  let html = '';
  analytics.renderDrawdownCard({ set innerHTML(v) { html = v; } }, null);
  assert.match(html, /dated portfolio-value history/);
  assert.doesNotMatch(html, /12-36 months|Stay invested/);
});

test('research checklist does not convert answers into a buy/sell recommendation', () => {
  let html = '';
  const container = { set innerHTML(v) { html = v; }, querySelectorAll: () => [] };
  analytics.renderConvictionChecklist(container, 'TCS');
  assert.match(html, /records questions for your research/);
  assert.doesNotMatch(html, /8\+\/10|Strong conviction|proceed|Not ready/);
});

test('web portfolio page contains the analytics mount and wires both account and file snapshots', () => {
  const page = fs.readFileSync('html/portfolio.html', 'utf8');
  const importer = fs.readFileSync('js/portfolio.js', 'utf8');
  assert.match(page, /id="portfolio-analytics-mount"[^>]*aria-live="polite"/);
  assert.match(page, /id="ai-analysis-text" role="status" aria-live="polite"/);
  assert.match(page, /finos-context-ready/);
  assert.match(page, /finos-portfolio-file-ready/);
  assert.match(importer, /dispatchEvent\(new CustomEvent\('finos-portfolio-file-ready'/);
  assert.match(page, /finos-portfolio-import\.js/);
  assert.match(page, /cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/0\.18\.5\/xlsx\.full\.min\.js" integrity="sha512-/);
  assert.match(page, /finos-portfolio-analytics\.js"><\/script>/);
});

test('CSV portfolio parser preserves quoted delimiters, escaped quotes, multiline cells, and BOM', () => {
  const importWindow = {};
  vm.runInNewContext(fs.readFileSync('js/finos-portfolio-import.js', 'utf8'), { window: importWindow });
  const rows = importWindow.FinosPortfolioImport.parseCSV('\uFEFFSymbol,Name,Value\r\nTCS,"Tata, Consultancy",1200\r\nINFY,"Line 1\nLine ""2""",300');
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    ['Symbol', 'Name', 'Value'], ['TCS', 'Tata, Consultancy', '1200'], ['INFY', 'Line 1\nLine "2"', '300'],
  ]);
});

test('CSV portfolio parser rejects malformed quotes and excessive columns', () => {
  const importWindow = {};
  vm.runInNewContext(fs.readFileSync('js/finos-portfolio-import.js', 'utf8'), { window: importWindow });
  assert.throws(() => importWindow.FinosPortfolioImport.parseCSV('Symbol,Name\nTCS,"unfinished'), /unclosed quoted field/);
  assert.throws(() => importWindow.FinosPortfolioImport.parseCSV(Array(202).fill('x').join(',')), /200 columns/);
});

test('portfolio import maps market values safely and never treats average cost as a live price', () => {
  const importWindow = {};
  vm.runInNewContext(fs.readFileSync('js/finos-portfolio-import.js', 'utf8'), { window: importWindow });
  const parse = importWindow.FinosPortfolioImport.rowsToHoldings;
  assert.deepEqual(JSON.parse(JSON.stringify(parse([
    ['Symbol', 'Quantity', 'Average Price', 'LTP', 'Current Value'],
    ['NSE:TCS-EQ', '2', '90', '100', '₹12,000'],
    ['INFY', '2', '80', '100', ''],
    ['BAD', '2', '80', '', 'not a number'],
  ]))), [
    { symbol: 'TCS', value: 12000 }, { symbol: 'INFY', value: 200 },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(parse([
    ['Symbol', 'Quantity', 'Average Price'], ['TCS', 2, 100],
  ]))), []);
  assert.throws(() => parse([['Name', 'Units'], ['TCS', 2]]), /Could not find a 'Symbol' column/);
});

test('deep AI portfolio output is treated as text and production does not call localhost service', () => {
  const source = fs.readFileSync('js/portfolio.js', 'utf8');
  const deepAI = source.slice(source.indexOf('window.runDeepAIAnalysis'), source.indexOf("\n  };\n});", source.indexOf('window.runDeepAIAnalysis')));
  assert.match(deepAI, /textEl\.textContent = typeof data\.analysis/);
  assert.match(deepAI, /document\.createElement\('span'\)/);
  assert.match(deepAI, /wifText\.textContent/);
  assert.match(deepAI, /!\['localhost', '127\.0\.0\.1', '::1', '\[::1\]'\]\.includes\(location\.hostname\)/);
  assert.match(deepAI, /http:\/\/127\.0\.0\.1:8766\/ai-analysis/);
  assert.doesNotMatch(deepAI, /risk_profile:/);
  assert.doesNotMatch(deepAI, /metricsEl\.innerHTML\s*=|taxTable\.innerHTML\s*=|wifText\.innerHTML\s*=|textEl\.innerHTML\s*=/);
});

test('web analytics exposes distinct sign-in, loading, error, and empty states', () => {
  const attributes = {};
  const container = { set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; }, setAttribute(k, v) { attributes[k] = v; } };
  analytics.renderAll(container, [], { status: 'unauthenticated' });
  assert.match(container.innerHTML, /Sign in to load saved holdings/);
  analytics.renderAll(container, [], { status: 'loading' });
  assert.match(container.innerHTML, /Loading saved holdings/);
  assert.equal(attributes['aria-busy'], 'true');
  analytics.renderAll(container, [], { status: 'error' });
  assert.match(container.innerHTML, /saved holdings could not be loaded/i);
  analytics.renderAll(container, []);
  assert.match(container.innerHTML, /No holdings in this snapshot/);
  assert.match(container.innerHTML, /#uploadSection/);
  assert.doesNotMatch(container.innerHTML, /href="portfolio\.html"/);
});

test('decorative pull-to-refresh indicator is hidden from assistive technology', () => {
  const source = fs.readFileSync('js/finos-mobile.js', 'utf8');
  const pullToRefresh = source.slice(source.indexOf('function initPullToRefresh'), source.indexOf('function init', source.indexOf('function initPullToRefresh') + 12));
  assert.match(pullToRefresh, /ptr\.setAttribute\('aria-hidden', 'true'\)/);
});

test('uploaded snapshot values are labeled as file values, never as database prices or live quotes', () => {
  const children = {};
  const container = {
    set innerHTML(v) { this.html = v; }, get innerHTML() { return this.html; },
    setAttribute() {},
    querySelector(selector) { return children[selector] || (children[selector] = { innerHTML: '', querySelectorAll: () => [] }); },
  };
  analytics.renderAll(container, [{ symbol: 'TCS', current_value: 1000 }], { source: 'upload' });
  assert.match(container.innerHTML, /Values come from the uploaded file/);
  assert.doesNotMatch(container.innerHTML, /valued at cost because no positive price is saved/);
  assert.match(container.innerHTML, /not live quotes/);
});
