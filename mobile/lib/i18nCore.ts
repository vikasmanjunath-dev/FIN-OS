// Language lookup for the app's own text, with no React Native imports so Node can test it.
// The same rules as js/finos-i18n.js on the website (exact text; "Label: value" results; sentences with numbers by template, with lakh
// / crore / years / months in Hindi; a bare figure with only its units changed). __tests__/i18n.parity.test.mts compares the two.

export type Lang = 'en' | 'hi';
export type Table = Record<string, string>;

const norm = (s: string) => String(s).replace(/\s+/g, ' ').trim();
const NUM = /₹?\d[\d,]*(?:\.\d+)?(?:\s?(?:Cr|L|K|%|x|yrs?|years?|months?|mo|y|m|days?|lakhs?)(?![A-Za-z]))?/gi;
const GLYPH = /^([\s\p{Extended_Pictographic}️‍←→↑↓‹›»«⬆⬇✓✕+＋•·●▸⇪−\-–—]*)(.*?)([\s\p{Extended_Pictographic}️‍←→↑↓‹›»«⬆⬇✓✕+＋•·●▸⇪−\-–—…]*)$/u;
const has = (t: Table, k: string) => Object.prototype.hasOwnProperty.call(t, k);

export function localiseValue(v: string, lang: Lang): string {
  if (lang !== 'hi') return v;
  return v.replace(/(\d)\s?Cr\b/gi, '$1 करोड़').replace(/(\d)\s?lakhs?\b/gi, '$1 लाख').replace(/(\d)\s?L\b/g, '$1 लाख').replace(/(\d)\s?K\b/g, '$1 हज़ार')
    .replace(/(\d)\s?(?:years?|yrs?|y)\b/gi, '$1 साल').replace(/(\d)\s?(?:months?|mo|m)\b/gi, '$1 महीने').replace(/(\d)\s?days?\b/gi, '$1 दिन')
    .replace(/\/mo\b/g, '/माह').replace(/\bper month\b/g, 'प्रति माह');
}

/** The translation of `text`, or null when there is none (the caller then shows the original). */
export function lookup(text: string, table: Table, lang: Lang): string | null {
  if (lang === 'en') return null;
  const n = norm(text);
  if (!n) return null;
  if (has(table, n)) return table[n];
  const m = n.match(GLYPH);
  if (m && m[2] && has(table, m[2])) return (m[1] + table[m[2]] + m[3]).trim();
  const kv = n.match(/^([^:\d₹]{2,60}): (.+)$/);
  if (kv) {
    const key = kv[1] + ': {v}';
    if (has(table, key)) return table[key].replace('{v}', localiseValue(kv[2], lang));
  }
  const tokens = n.match(NUM);
  if (tokens) {
    if (tokens.length === 1 && tokens[0] === n) {
      const v = localiseValue(n, lang);
      return v !== n ? v : null;
    }
    const tpl = n.replace(NUM, '{n}');
    if (tpl !== n && has(table, tpl)) {
      let i = 0;
      return table[tpl].replace(/\{n\}/g, () => localiseValue(tokens[i++] || '', lang));
    }
  }
  return null;
}

/** Text as shown: translated when there is an entry, else unchanged. Keeps the original's surrounding whitespace. */
export function translateWith(text: string, table: Table, lang: Lang): string {
  if (lang === 'en' || typeof text !== 'string') return text;
  const hit = lookup(text, table, lang);
  if (hit === null) return text;
  const lead = (text.match(/^\s*/) || [''])[0], trail = (text.match(/\s*$/) || [''])[0];
  return lead + hit + trail;
}

/** The table key a runtime string would need: whitespace tidied, every number-like token replaced by {n}. */
export function templateKey(text: string): string {
  const n = norm(text);
  return n.replace(NUM, '{n}');
}
