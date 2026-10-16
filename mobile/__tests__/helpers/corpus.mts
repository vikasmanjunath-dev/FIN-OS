// The "wrong data" corpus used by corruptData.test.mts: every shape of damage a stored or received value can have.
// Two flavours: RAW strings (what AsyncStorage hands back) and VALUES (what JSON.parse or a backend response gives).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Property names the app reads anywhere (harvested from lib/ and hooks/), so a poisoned object hits real fields. */
function harvestFieldNames(): string[] {
  const names = new Set<string>(['id', 'type', 'name', 'amount', 'date', 'kind', 'category', 'limits', 'data', 'inputs', 'score', 'at', 'count', 'last', 'items']);
  const walk = (dir: string) => {
    for (const n of readdirSync(path.join(root, dir))) {
      const rel = path.join(dir, n);
      if (statSync(path.join(root, rel)).isDirectory()) { if (n !== 'calcs') walk(rel); continue; }
      if (!/\.(ts|tsx)$/.test(n)) continue;
      const src = readFileSync(path.join(root, rel), 'utf8');
      for (const m of src.matchAll(/(?:\.|\?\.|\{\s*|,\s*)([a-z][A-Za-z0-9_]{1,24})\b\s*(?::|\?\.|\)|,|;|\.)/g)) names.add(m[1]);
    }
  };
  walk('lib'); walk('hooks');
  ['__proto__', 'constructor', 'toString', 'length', 'prototype'].forEach(k => names.add(k));
  return [...names].filter(k => k.length <= 24).slice(0, 1400);
}
export const FIELD_NAMES = harvestFieldNames();

const LONG = 'x'.repeat(200_000);

/** Wrong values for a field that should be a number, string, array, object, date. As JSON text, so 1e999 really becomes Infinity. */
export const FIELD_VARIANTS_JSON = [
  'null', '"str"', '""', '"NaN"', '"2026-13-45"', '123', '-5', '0', '1e999', '-1e999', '1e-999', 'true', 'false', '[]', '{}', '[1,"a",null]', '{"a":{"b":1}}', JSON.stringify('y'.repeat(3000)),
];

const poisonText = (v: string) => `{${FIELD_NAMES.map(k => `${JSON.stringify(k)}:${v}`).join(',')}}`;

/** Raw strings as AsyncStorage would return them. `null` is "key not present". */
export function rawCorpus(): { label: string; raw: string | null }[] {
  const out: { label: string; raw: string | null }[] = [
    { label: 'null (absent)', raw: null }, { label: 'empty string', raw: '' }, { label: 'spaces', raw: '   ' }, { label: 'the word undefined', raw: 'undefined' },
    { label: 'the word null', raw: 'null' }, { label: 'NaN', raw: 'NaN' }, { label: 'Infinity', raw: 'Infinity' }, { label: '-Infinity', raw: '-Infinity' },
    { label: 'zero', raw: '0' }, { label: 'negative number', raw: '-7' }, { label: 'huge number', raw: '1e999' }, { label: 'tiny number', raw: '1e-999' }, { label: 'plain number', raw: '12345.67' },
    { label: 'JSON string', raw: '"text"' }, { label: 'bare word', raw: 'hello' }, { label: 'true', raw: 'true' }, { label: 'false', raw: 'false' },
    { label: 'empty array', raw: '[]' }, { label: 'empty object', raw: '{}' }, { label: 'array of numbers', raw: '[1,2,3]' }, { label: 'array of strings', raw: '["a","b"]' },
    { label: 'array with null', raw: '[null]' }, { label: 'array of arrays', raw: '[[],[1]]' }, { label: 'object with number', raw: '{"a":1}' }, { label: 'nested object', raw: '{"a":{"b":{"c":[]}}}' },
    { label: 'truncated JSON', raw: '[{"id":"a","amount":12' }, { label: 'not JSON', raw: '{not json' }, { label: 'NUL bytes', raw: '\u0000\u0000' },
    { label: 'HTML', raw: '<html><body>502 Bad Gateway</body></html>' },
    { label: 'very long string', raw: LONG }, { label: 'very long JSON string', raw: JSON.stringify(LONG) },
    { label: 'deeply nested arrays', raw: '['.repeat(4000) + ']'.repeat(4000) },
    { label: 'array of 3000 nulls', raw: '[' + Array(3000).fill('null').join(',') + ']' },
    { label: 'object key __proto__', raw: '{"__proto__":{"polluted":1},"constructor":{"prototype":{"x":1}}}' },
  ];
  for (const v of FIELD_VARIANTS_JSON) {
    const o = poisonText(v);
    const tag = v.length > 24 ? v.slice(0, 12) + '...' : v;
    out.push({ label: `every field = ${tag} (object)`, raw: o });
    out.push({ label: `every field = ${tag} (array of 2)`, raw: `[${o},${o}]` });
  }
  out.push({ label: 'every field a nested object', raw: `{${FIELD_NAMES.slice(0, 300).map(k => `${JSON.stringify(k)}:${poisonText('"s"')}`).join(',')}}` });
  out.push({ label: 'object wrapping a poisoned list', raw: `{"items":[${poisonText('null')}],"limits":${poisonText('"x"')},"data":${poisonText('-1')}}` });
  return out;
}

/** JS values for the pure normalisers (what a parsed file or backend answer can hold). */
export function valueCorpus(): { label: string; value: unknown }[] {
  const out: { label: string; value: unknown }[] = [
    { label: 'undefined', value: undefined }, { label: 'null', value: null }, { label: 'NaN', value: NaN }, { label: 'Infinity', value: Infinity }, { label: '-Infinity', value: -Infinity },
    { label: '0', value: 0 }, { label: '-1', value: -1 }, { label: '1e308', value: 1e308 }, { label: 'true', value: true }, { label: 'empty string', value: '' },
    { label: 'string', value: 'abc' }, { label: 'long string', value: LONG }, { label: 'function', value: () => 1 }, { label: 'symbol', value: Symbol('s') },
    { label: '[]', value: [] }, { label: '{}', value: {} }, { label: '[null]', value: [null] }, { label: '[undefined]', value: [undefined] }, { label: '[1,"a",null,[],{}]', value: [1, 'a', null, [], {}] },
    { label: '{a:{}}', value: { a: {} } }, { label: 'Date', value: new Date(NaN) }, { label: 'Map', value: new Map([['a', 1]]) },
    { label: 'array with holes', value: new Array(5) },
  ];
  for (const raw of rawCorpus()) {
    if (raw.raw == null || raw.raw.length > 100_000) continue;
    try { if (!/^\[{50,}/.test(raw.raw)) out.push({ label: `parsed: ${raw.label}`, value: JSON.parse(raw.raw) }); } catch { /* not JSON: covered as a string below */ }
    out.push({ label: `string: ${raw.label}`, value: raw.raw });
  }
  return out;
}

/** Walks a result and returns the path of the first NaN / Infinity number, or null. */
export function findNonFinite(v: unknown, p = '$', seen = new Set<unknown>(), depth = 0): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : `${p} = ${v}`;
  if (!v || typeof v !== 'object' || depth > 12 || seen.has(v)) return null;
  seen.add(v);
  if (Array.isArray(v)) { for (let i = 0; i < Math.min(v.length, 200); i++) { const r = findNonFinite(v[i], `${p}[${i}]`, seen, depth + 1); if (r) return r; } return null; }
  if (v instanceof Map || v instanceof Set || v instanceof Date) return null;
  for (const k of Object.keys(v).slice(0, 400)) { const r = findNonFinite((v as any)[k], `${p}.${k}`, seen, depth + 1); if (r) return r; }
  return null;
}
