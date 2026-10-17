// Pulls named functions / constants out of the website's large single-file pages so their real code can be run in a vm and compared
// with the phone's port. Text extraction by balanced braces (the pages are not modules).
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const readWeb = (rel: string) => fs.readFileSync(path.join(HERE, '../../..', rel), 'utf8');

/** The source from `marker` to the brace that closes the first `{` after it (and a trailing `;` for a const). */
export function sliceBlock(src: string, marker: string): string {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`not found in the page: ${marker}`);
  const open = marker.endsWith('{') ? start + marker.length - 1 : src.indexOf('{', start);
  let depth = 0;
  let q: string | null = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i], prev = src[i - 1];
    if (q) { if (c === q && prev !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1) + (src[i + 1] === ';' ? ';' : ''); }
  }
  throw new Error(`unbalanced braces after: ${marker}`);
}

/** A single-line function / const (the website's one-line helpers). */
export function sliceLine(src: string, marker: string): string {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`not found in the page: ${marker}`);
  return src.slice(start, src.indexOf('\n', start));
}

export function runIn(sandbox: Record<string, any>, ...code: string[]) {
  vm.createContext(sandbox);
  for (const c of code) vm.runInContext(c, sandbox);
  return sandbox;
}

/** A minimal stand-in for a DOM element the page writes its results to. */
export function stubDom(initial: Record<string, string> = {}) {
  const els: Record<string, any> = {};
  const get = (id: string) => els[id] ?? (els[id] = { id, value: initial[id] ?? '', textContent: '', innerHTML: '', className: '', disabled: false, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, querySelector: () => null });
  return { els, document: { getElementById: get, querySelectorAll: () => [], querySelector: () => null } };
}
