// The phone's portfolio analytics against the website's own code (Porfolio Analyser/portfolio-analyser-v10.html,
// html/hedgefund.html), run in a vm on random and edge inputs. Where the phone deliberately differs, the test says what and why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWeb, sliceBlock, sliceLine, runIn, stubDom } from './helpers/webText.mts';
import * as st from '../lib/portfolioStats.ts';
import { squarify, layoutValues } from '../lib/portfolioTreemap.ts';
import { computeHHI, effectiveN } from '../lib/portfolioSectors.ts';
import { riskMetrics } from '../lib/portfolioHistory.ts';
import { mulberry32, simulatePaths } from '../lib/portfolioSimulate.ts';
import { deepValue } from '../lib/marketDataScreener.ts';

const PA = readWeb('Porfolio Analyser/portfolio-analyser-v10.html');
const HF = readWeb('html/hedgefund.html');

function R(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const rnd = R(20261017);
const arr = (n: number, f: () => number) => Array.from({ length: n }, f);
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b)), `${a} vs ${b}`);

// ── statistics helpers ───────────────────────────────────────────────────────
const statsCtx = runIn({}, sliceLine(PA, 'function mean(arr)'), sliceLine(PA, 'function std(arr)'), sliceLine(PA, 'function cov(a,b)'), sliceLine(PA, 'function corr(a,b)'),
  sliceLine(PA, 'function linReg(x,y)'), sliceBlock(PA, 'function toReturns(prices) {'));

test('mean, std, cov, corr and linReg equal the website on random and edge inputs', () => {
  const edge: number[][] = [[], [1], [1, 1, 1], [0, 0, 0, 0], [-1, 1, -1, 1, 5]];
  const cases: number[][][] = edge.flatMap(a => edge.map(b => [a, b]));
  for (let i = 0; i < 400; i++) { const n = 2 + Math.floor(rnd() * 60); cases.push([arr(n, () => rnd() * 0.1 - 0.05), arr(n + (i % 3 === 0 ? 5 : 0), () => rnd() * 0.1 - 0.05)]); }
  for (const [x, y] of cases) {
    close(st.mean(x), statsCtx.mean(x));
    close(st.std(x), statsCtx.std(x));
    close(st.cov(x, y), statsCtx.cov(x, y));
    close(st.corr(x, y), statsCtx.corr(x, y));
    const a = st.linReg(x, y), b = statsCtx.linReg(x, y);
    close(a.a, b.a); close(a.b, b.b); close(a.r2, b.r2);
  }
});

test('simple returns equal the website toReturns on positive prices', () => {
  for (let i = 0; i < 100; i++) {
    const px = arr(5 + (i % 40), () => 50 + rnd() * 100);
    const theirs = statsCtx.toReturns(px.map((p: number) => ({ p })));
    const mine = st.simpleReturns(px);
    assert.equal(mine.length, theirs.length);
    mine.forEach((m, k) => close(m, theirs[k]));
  }
});

// ── treemap ──────────────────────────────────────────────────────────────────
const squarifyWeb = runIn({}, `${sliceBlock(PA, 'function squarify(items, x, y, w, h) {')}; this.squarify = squarify;`).squarify;

test('squarify places the same rectangles as the website for random value lists', () => {
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(rnd() * 30);
    const W = 200 + rnd() * 800, H = 100 + rnd() * 500;
    const vals = arr(n, () => 1 + rnd() * 1e5).sort((a, b) => b - a);
    const tot = vals.reduce((s, v) => s + v, 0);
    const items = vals.map((v, k) => ({ id: k, area: (v / tot) * W * H }));
    const theirs = squarifyWeb(items, 0, 0, W, H);
    const mine = squarify(items, 0, 0, W, H);
    assert.equal(mine.length, theirs.length);
    mine.forEach((m, k) => { assert.equal(m.id, theirs[k].id); close(m.rx, theirs[k].rx); close(m.ry, theirs[k].ry); close(m.rw, theirs[k].rw); close(m.rh, theirs[k].rh); });
    // geometry: the rectangles tile the box
    close(mine.reduce((s, r) => s + r.rw * r.rh, 0), W * H, 1e-9);
  }
});

test('squarify matches the website on equal values and on a single value (ties are where the "<=" rule matters)', () => {
  for (const vals of [[1, 1, 1, 1], [2, 2, 2, 2, 2, 2], [1], [3, 3], [5, 5, 5, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1, 1]]) {
    for (const [W, H] of [[100, 100], [300, 120], [90, 400]]) {
      const tot = vals.reduce((s, v) => s + v, 0);
      const items = vals.map((v, k) => ({ id: k, area: (v / tot) * W * H }));
      const theirs = squarifyWeb(items, 0, 0, W, H), mine = squarify(items, 0, 0, W, H);
      assert.equal(mine.length, theirs.length);
      mine.forEach((m, k) => { close(m.rx, theirs[k].rx); close(m.ry, theirs[k].ry); close(m.rw, theirs[k].rw); close(m.rh, theirs[k].rh); });
    }
  }
});

test('layoutValues drops non-positive values and covers the box', () => {
  const r = layoutValues([{ value: 5 }, { value: 0 }, { value: -3 }, { value: NaN }, { value: 3 }], 100, 50);
  assert.equal(r.length, 2);
  close(r.reduce((s, x) => s + x.rw * x.rh, 0), 5000);
  assert.deepEqual(layoutValues([], 100, 50), []);
  assert.deepEqual(layoutValues([{ value: 1 }], 0, 50), []);
});

// ── concentration ────────────────────────────────────────────────────────────
const conc = runIn({}, sliceBlock(PA, 'function computeHHI(map, base){'), sliceBlock(PA, 'function effectiveN(map, base){'));
test('computeHHI and effectiveN equal the website', () => {
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(rnd() * 12);
    const map: Record<string, { inv: number }> = {};
    for (let k = 0; k < n; k++) map['s' + k] = { inv: Math.round(rnd() * 1e6) };
    const base = i % 10 === 0 ? 0 : Object.values(map).reduce((s, v) => s + v.inv, 0);
    close(computeHHI(map, base), conc.computeHHI(map, base));
    assert.equal(effectiveN(map, base), conc.effectiveN(map, base));
  }
});

// ── alpha / beta / Sharpe / tracking error ───────────────────────────────────
function webAlpha(port: number[], bench: number[]) {
  // QUANT_DATA with a single "holding" worth 1 whose returns are the portfolio series, so the website's weighted sum is the series itself
  const { els, document } = stubDom();
  const ctx: any = { document, QUANT_DATA: { X: { holding: { currVal: 1 }, returns: port } }, QUANT_BENCH: bench, buildFactorDecomp() {}, buildRollingAlphaChart() {}, buildHoldingAlphaChart() {} };
  runIn(ctx, sliceLine(PA, 'function mean(arr)'), sliceLine(PA, 'function std(arr)'), sliceLine(PA, 'function cov(a,b)'), sliceLine(PA, 'function linReg(x,y)'),
    sliceBlock(PA, 'function computeAlphaMetrics() {'));
  ctx.computeAlphaMetrics();
  return els;
}
test('beta, Sharpe, tracking error and information ratio match the website; alpha uses CAPM excess returns (weekly, rf 6.5%)', () => {
  for (let i = 0; i < 120; i++) {
    const n = 10 + Math.floor(rnd() * 100);
    const bench = arr(n, () => rnd() * 0.06 - 0.03);
    const beta = 0.4 + rnd() * 1.2;
    const port = bench.map(b => beta * b + (rnd() - 0.5) * 0.02 + 0.001);
    const els = webAlpha(port, bench);
    const dates = port.map((_, k) => new Date(Date.UTC(2025, 0, 1 + 7 * k)).toISOString().slice(0, 10));
    const m = riskMetrics({ dates, port, bench }, 6.5, 52)!;
    assert.equal(m.beta.toFixed(2), els['qm-beta-real'].textContent);
    const rf = 6.5 / 100 / 52;
    const capmAlpha = (st.mean(port.map(x => x - rf)) - m.beta * st.mean(bench.map(x => x - rf))) * 52 * 100;
    assert.equal((capmAlpha >= 0 ? '+' : '') + capmAlpha.toFixed(2) + '%', (m.alphaAnnPct >= 0 ? '+' : '') + m.alphaAnnPct.toFixed(2) + '%');
    assert.equal(m.sharpe!.toFixed(2), els['qm-sharpe'].textContent);
    assert.equal(m.trackingErrorPct.toFixed(2) + '%', els['qm-te'].textContent);
    assert.equal(m.infoRatio!.toFixed(2), els['qm-ir'].textContent);
  }
});

// ── Monte Carlo path rule ────────────────────────────────────────────────────
test('simulatePaths follows the website runMonteCarlo path rule exactly when it is given the same random stream', () => {
  const body = sliceBlock(PA, 'function runMonteCarlo() {');
  for (let i = 0; i < 12; i++) {
    const n = 20 + Math.floor(rnd() * 60);
    const rets = arr(n, () => rnd() * 0.05 - 0.02);
    const horizon = 13 + Math.floor(rnd() * 80), paths = 300 + Math.floor(rnd() * 400);
    const cur = Math.round(100000 + rnd() * 5e6);
    const { els, document } = stubDom({ 'mc-paths': String(paths), 'mc-horizon': String(horizon), 'mc-scenario': 'base' });
    const seed = 1 + Math.floor(rnd() * 1e6);
    const ctx: any = { document, setTimeout: (f: () => void) => f(), console, parseInt, Math, Array, Object, String, Number,
      QUANT_DATA: { A: { holding: { currVal: cur }, returns: rets } }, QUANT_BENCH: rets, EQ: [{ invested: cur }], MF: [],
      fmtINR: (v: number) => String(v), mkChart() {}, __rand: mulberry32(seed) };
    runIn(ctx, sliceLine(PA, 'function mean(arr)'), sliceLine(PA, 'function std(arr)'), sliceBlock(PA, 'function randn() {'), body);
    // the page draws from Math.random: give it the same stream
    (ctx.Math as any) = Object.create(Math); ctx.Math.random = ctx.__rand;
    runIn(ctx, 'Math = this.Math;');
    ctx.runMonteCarlo();
    // phone side: same inputs, same stream
    const mu = st.mean(rets), sigma = st.std(rets);
    const { finals } = simulatePaths({ start: cur, mu, sigma, steps: horizon, paths, rand: mulberry32(seed) });
    const sorted = [...finals].sort((a, b) => a - b);
    for (const p of [5, 25, 50, 75, 95]) assert.equal(String(st.percentileFloor(sorted, p)), els[`mc-p${p}`].textContent, `p${p}`);
    const pLoss = (finals.filter(v => v < cur).length / paths * 100).toFixed(1);
    assert.ok(els['mc-insights'].innerHTML.includes(`>${pLoss}%<`), 'probability of loss');
  }
});

// ── hedge-fund page arithmetic ───────────────────────────────────────────────
test('expectancy and recovery-needed equal the hedge-fund page calculators', () => {
  for (let i = 0; i < 100; i++) {
    const wr = 10 + Math.floor(rnd() * 81), aw = 500 + Math.floor(rnd() * 80) * 250, al = 200 + Math.floor(rnd() * 99) * 100;
    const { els, document } = stubDom({ wr: String(wr), aw: String(aw), al: String(al) });
    const ctx: any = { document };
    runIn(ctx, sliceLine(HF, 'const fmt=n=>'), sliceBlock(HF, 'function calcExp(){'));
    ctx.calculate = undefined;
    ctx.calcExp();
    const e = st.expectancy(wr / 100, aw, al)!;
    assert.equal(els['exp-val'].textContent, (e >= 0 ? '₹' : '−₹') + Math.abs(Math.round(e)).toLocaleString('en-IN'));
    assert.equal(els['exp-rr'].textContent, (aw / al).toFixed(1) + ':1');
  }
  for (let v = 1; v <= 50; v++) {
    const { els, document } = stubDom();
    const ctx: any = { document };
    runIn(ctx, sliceLine(HF, 'const fmt=n=>'), sliceBlock(HF, 'function updateDD(v){'));
    ctx.updateDD(v);
    assert.equal(st.recoveryNeededPct(v)!.toFixed(1) + '%', els['dd-rec'].textContent);
  }
});

// ── screener rule ────────────────────────────────────────────────────────────
test('the Deep Value rule equals the website preset', () => {
  const ctx: any = runIn({ _get52WPct: () => null }, sliceBlock(PA, 'const SCR_PRESETS = {') + '\nthis.SCR_PRESETS = SCR_PRESETS;');
  const web = ctx.SCR_PRESETS.deep_value.fn;
  const pick = () => (rnd() < 0.2 ? null : Math.round(rnd() * 400) / 10);
  for (let i = 0; i < 500; i++) {
    const pe = pick(), pb = rnd() < 0.2 ? null : Math.round(rnd() * 80) / 10;
    assert.equal(deepValue({ pe, pb }), web({ pe, pb }));
  }
  assert.equal(deepValue({ pe: 15, pb: 2 }), true);
  assert.equal(deepValue({ pe: 15.01, pb: 2 }), false);
});
