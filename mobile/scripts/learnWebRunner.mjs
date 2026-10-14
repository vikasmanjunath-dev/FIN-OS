// Runs the website's OWN page scripts (inline <script> blocks and js/*.js files) against a recording stand-in for the browser,
// so that lesson content which only exists inside JavaScript (charts, scenario tables, decision-aid branches) is taken from
// the website's real code instead of being retyped.  Used by mobile/scripts/extract-learn.py (generation) and by the
// parity tests in mobile/__tests__/learn*.test.mts (the phone's ports are compared with what this runner makes the website do).
//
// Nothing here talks to the network, and no script is given a real DOM: every element is a recording "ghost".
import vm from 'node:vm';
import fs from 'node:fs';

const INERT = Symbol('ghost');

/** A value that accepts any property read, call or assignment and remembers what was assigned. */
export function ghost(name = 'ghost', store = {}) {
  const props = store;
  const cache = new Map();
  const target = function () {};
  const proxy = new Proxy(target, {
    get(_t, key) {
      if (key === INERT) return true;
      if (key === 'then') return undefined;                      // never look like a promise
      if (key === Symbol.toPrimitive) return () => '';
      if (key === Symbol.iterator) return function* () {};
      if (key === 'toString' || key === 'valueOf') return () => '';
      if (key === 'toJSON') return () => undefined;
      if (typeof key === 'symbol') return undefined;
      if (key === '__props') return props;
      if (key in props) return props[key];
      if (key === 'length') return 0;
      if (key === 'dataset' || key === 'style') { if (!props[key]) props[key] = {}; return props[key]; }
      if (!cache.has(key)) cache.set(key, ghost(`${name}.${String(key)}`));
      return cache.get(key);
    },
    set(_t, key, value) { props[key] = value; return true; },
    apply(_t, _this, args) {
      return ghost(`${name}()`);
    },
    construct() { return ghost(`new ${name}`); },
    has() { return true; },
  });
  return proxy;
}

function makeElement(id, env) {
  const props = { id, __html: [] };
  const el = ghost(`#${id}`, props);
  props.insertAdjacentHTML = (_pos, html) => { props.__html.push(String(html)); };
  props.getContext = () => ghost('ctx', { __canvas: id });
  props.closest = () => makeElementGeneric(env);
  props.querySelector = () => makeElementGeneric(env);
  props.querySelectorAll = () => [];
  props.addEventListener = () => {};
  props.appendChild = () => {};
  props.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  return el;
}
function makeElementGeneric(env) {
  const props = { __html: [], classList: { add() {}, remove() {}, toggle() {}, contains: () => false } };
  props.querySelectorAll = () => [];
  props.querySelector = () => makeElementGeneric(env);
  props.addEventListener = () => {};
  props.closest = () => makeElementGeneric(env);
  return ghost('el', props);
}

/** The recording browser stand-in: `env.elements[id]` holds whatever the page wrote to #id. */
export function makeEnvironment(opts = {}) {
  const env = { elements: {}, charts: [], domReady: [], timers: [], storage: { ...(opts.storage || {}) }, location: opts.location || 'https://example.invalid/page.html' };
  const getEl = (id) => (env.elements[id] ||= makeElement(id, env));
  const document = {
    getElementById: getEl,
    querySelector: () => makeElementGeneric(env),
    querySelectorAll: () => [],
    createElement: () => makeElementGeneric(env),
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded' && typeof fn === 'function') env.domReady.push(fn); },
    removeEventListener() {},
    documentElement: ghost('html', { getAttribute: () => 'dark', setAttribute() {} }),
    body: makeElementGeneric(env),
    head: makeElementGeneric(env),
    readyState: 'complete',
    hidden: false,
  };
  const localStorage = {
    getItem: (k) => (k in env.storage ? env.storage[k] : null),
    setItem: (k, v) => { env.storage[k] = String(v); },
    removeItem: (k) => { delete env.storage[k]; },
  };
  class Chart {
    constructor(ctx, config) {
      const canvas = ctx && ctx.__props ? ctx.__props.__canvas : null;
      this.config = config; this.data = config && config.data; this.options = config && config.options;
      env.charts.push({ canvas: canvas || null, config });
    }
    update() {} destroy() {}
    static register() {} static get defaults() { return ghost('Chart.defaults'); }
  }
  const win = {
    document, localStorage, Chart, location: { href: env.location, hostname: 'example.invalid', pathname: '/html/page.html', search: '', replace() {} },
    navigator: { userAgent: 'learn-runner' },
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout: (fn) => { env.timers.push(fn); return 0; },
    setInterval: () => 0, clearTimeout() {}, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    addEventListener() {}, removeEventListener() {},
    fetch: () => Promise.reject(new Error('no network in the learn runner')),
    AbortSignal: { timeout: () => ({}) },
    URLSearchParams, JSON, Math, Date, Number, String, Array, Object, parseInt, parseFloat, isNaN, isFinite, Promise,
    FINOS: undefined, FINOS_USER_CONTEXT: undefined, gsap: ghost('gsap'), THREE: ghost('THREE'), d3: ghost('d3'),
    marked: ghost('marked'), DOMPurify: ghost('DOMPurify'),
  };
  win.window = win; win.self = win; win.globalThis = win;
  return { env, win };
}

/** Run one or more script sources in a shared context. Returns the context so functions and top-level lets can be queried. */
export function runScripts(sources, opts = {}) {
  const { env, win } = makeEnvironment(opts);
  const ctx = vm.createContext(win);
  const errors = [];
  for (const src of sources) {
    try { vm.runInContext(src, ctx, { timeout: 5000 }); } catch (e) { errors.push(String(e && e.message || e)); }
  }
  for (const fn of env.domReady) { try { fn.call(win, { type: 'DOMContentLoaded' }); } catch (e) { errors.push('domready: ' + String(e && e.message || e)); } }
  return { ctx, env, errors, evaluate: (code) => vm.runInContext(code, ctx, { timeout: 5000 }) };
}

/** The inline <script> blocks of an HTML file, in order, without external ones. */
export function inlineScripts(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/.test(m[1])) continue;
    if (m[2].trim()) out.push(m[2]);
  }
  return out;
}

/** Evaluate a JavaScript literal (object / array / template strings) with unknown identifiers as inert placeholders. */
export function evalLiteral(source) {
  const sandbox = new Proxy({}, {
    has: () => true,
    get: (_t, k) => (typeof k === 'symbol' ? undefined : (k === 'undefined' ? undefined : ghost(String(k)))),
  });
  const ctx = vm.createContext(sandbox);
  const value = vm.runInContext('(' + source + ')', ctx, { timeout: 5000 });
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'function' ? undefined : v)));
}

/** Plain-data view of the elements a page wrote to (id -> {innerText, textContent, innerHTML, __html, style...}). */
export function writtenElements(env) {
  const out = {};
  for (const [id, el] of Object.entries(env.elements)) {
    const p = el.__props;
    const rec = {};
    for (const k of ['innerText', 'textContent', 'innerHTML', 'value', 'className']) if (typeof p[k] === 'string') rec[k] = p[k];
    if (p.__html && p.__html.length) rec.inserted = p.__html.slice();
    if (p.style && Object.keys(p.style).length) rec.style = { ...p.style };
    if (Object.keys(rec).length) out[id] = rec;
  }
  return out;
}

// ── command line: node learnWebRunner.mjs  (reads a JSON job on stdin, writes JSON on stdout) ──────────────────────────────
// job: { literals: [{ file, name }], literalSources: [{ id, src }], charts: [{ html, scripts: [paths] }], calls: [...] }
if (process.argv[1] && process.argv[1].endsWith('learnWebRunner.mjs') && process.argv[2] === '--job') {
  const job = JSON.parse(fs.readFileSync(0, 'utf8'));
  const result = {};
  if (job.literalSources) {
    result.literals = {};
    for (const { id, src } of job.literalSources) result.literals[id] = evalLiteral(src);
  }
  if (job.charts) {
    result.charts = {};
    for (const spec of job.charts) {
      const srcs = [];
      if (spec.html) srcs.push(...inlineScripts(spec.html));
      for (const f of spec.scripts || []) srcs.push(fs.readFileSync(f, 'utf8'));
      const variants = spec.variants || [[]];
      result.charts[spec.id] = variants.map((calls) => {
        const run = runScripts(srcs);
        for (const call of calls) run.evaluate(call);
        return run.env.charts.map((c) => ({
          canvas: c.canvas,
          type: c.config && c.config.type,
          labels: c.config && c.config.data && c.config.data.labels,
          datasets: ((c.config && c.config.data && c.config.data.datasets) || []).map((d) => ({ label: d.label, data: d.data })),
          title: c.config && c.config.options && c.config.options.plugins && c.config.options.plugins.title && c.config.options.plugins.title.text,
          yTitle: c.config && c.config.options && c.config.options.scales && c.config.options.scales.y && c.config.options.scales.y.title && c.config.options.scales.y.title.text,
        }));
      });
    }
  }
  if (job.pages) {
    result.pages = {};
    for (const page of job.pages) {
      const srcs = [...inlineScripts(page.html), ...(page.scripts || []).map((f) => fs.readFileSync(f, 'utf8'))];
      const outs = [];
      let errors = [];
      for (const step of page.runs) {
        const fresh = runScripts(srcs);
        errors = fresh.errors;
        for (const call of step.calls) fresh.evaluate(call);
        if (step.timers) { for (const fn of fresh.env.timers.splice(0)) { try { fn(); } catch (e) { errors.push(String(e)); } } }
        outs.push({ calls: step.calls, written: writtenElements(fresh.env) });
      }
      result.pages[page.id] = { errors, runs: outs };
    }
  }
  process.stdout.write(JSON.stringify(result));
}
