// Runs a website calculator page's own inline script against a stub DOM so its real arithmetic and text can be compared.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../calculators');

interface Stub { id: string; value: string; checked: boolean; textContent: string; innerHTML: string; className: string; [k: string]: any }

export function loadWebCalc(rel: string) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const els: Record<string, Stub> = {};
  const get = (id: string): Stub => {
    if (!els[id]) {
      const tag = html.match(new RegExp(`<(?:input|select)[^>]*\\bid="${id}"[^>]*>`));
      const val = tag?.[0].match(/\bvalue="([^"]*)"/)?.[1] ?? '0';
      els[id] = {
        id, value: val, checked: !!tag?.[0].match(/\bchecked\b/), textContent: '', innerHTML: '', className: '', style: {}, dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute: () => null,
        getContext: () => ({}), appendChild() {}, querySelectorAll: () => [], querySelector: () => null, focus() {}, scrollIntoView() {},
      };
    }
    return els[id];
  };
  const document: any = {
    getElementById: get, querySelector: () => get('__q'), querySelectorAll: () => [], addEventListener() {}, createElement: () => get('__c'),
    documentElement: { getAttribute: () => 'dark', setAttribute() {}, classList: { add() {}, remove() {} } }, body: get('__body'),
  };
  // Pages build their chart with the real Chart.js config; keep that config's data so later `chart.data.datasets[n].data = ...` works.
  const Chart: any = function (_ctx: unknown, cfg: any) {
    const data = cfg?.data && typeof cfg.data === 'object' ? cfg.data : { datasets: [], labels: [] };
    if (!Array.isArray(data.datasets)) data.datasets = [];
    while (data.datasets.length < 6) data.datasets.push({ data: [] });
    return { data, options: cfg?.options ?? {}, update() {}, destroy() {} };
  };
  const sandbox: any = {
    document, Chart, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, console: { log() {}, warn() {}, error() {}, debug() {} },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame: () => 0, navigator: {}, location: { href: '', hostname: '' }, AryaAI: undefined,
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const s of scripts) { try { vm.runInContext(s, sandbox); } catch { /* the page's own chrome (theme toggle etc.) */ } }
  if (typeof sandbox.calculate !== 'function') throw new Error(`${rel}: no calculate() on the page`);

  return {
    /** Sets a logical input (both the range element and its number twin) and returns nothing. */
    set(webId: string, v: number | string | boolean) {
      for (const id of [webId, webId + 'Num']) {
        const e = get(id);
        if (typeof v === 'boolean') e.checked = v; else e.value = String(v);
      }
    },
    /** Sets a variable the page's script keeps outside the DOM (e.g. the delivery / intraday toggle). */
    setVar(name: string, v: string) { vm.runInContext(`${name} = ${JSON.stringify(v)};`, sandbox); },
    /** Clears the outputs, runs the page's calculate() and returns the text it wrote, keyed by element id. */
    run(): Record<string, string> {
      const before: Record<string, string> = {};
      Object.values(els).forEach(e => { before[e.id] = e.textContent; e.textContent = ''; e.innerHTML = ''; });
      sandbox.calculate();
      const out: Record<string, string> = {};
      const strip = (h: string) => h.replace(/<[^>]*>/g, '');       // what a reader sees of innerHTML
      Object.values(els).forEach(e => {
        if (e.id.startsWith('__')) return;
        if (e.textContent !== '') out[e.id] = String(e.textContent);
        else if (e.innerHTML !== '') out[e.id] = strip(String(e.innerHTML));
      });
      return out;
    },
  };
}
