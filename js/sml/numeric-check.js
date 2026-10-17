/**
 * SmlNumericCheck — deterministic "every figure must come from evidence" checker for the SML layer.   (v1.0)
 *
 * The model may only state numbers that appear in the tool results / retrieved source chunks it was given.
 * This module extracts the figures from an answer and verifies each one against that evidence. It FAILS
 * CLOSED: a derived figure (a sum, a difference, a projection the model computed itself) that is not in the
 * evidence is reported as unmatched. It never edits a number — sanitize() can only delete whole sentences.
 *
 *   SmlNumericCheck.extractNumbers('Spent ₹5,900 (12%) in 2024 [SOURCE_1]')
 *     → [{raw:'₹5,900', value:5900, kind:'money'}, {raw:'12%', value:12, kind:'percent'}, {raw:'2024', value:2024, kind:'year'}]
 *   SmlNumericCheck.check(answer, [{ok:true, value:5900, unit:'INR'}, 'source chunk text …'])
 *     → {ok, numbers:[{raw, value, kind, matched, matched_to, …}], unmatched:[…], skipped:[…]}
 *   SmlNumericCheck.sanitize(answer, evidence) → {text, removed:[…], changed, blocked}
 *
 * ── What is extracted (see SmlNormalizer for the exact money/year rules) ──────────────────────────────
 *  kinds returned: money (value in INR), percent, count, year, ordinal.
 *  NOT returned at all: citation markers [SOURCE_1]/[1], FY/AY and year ranges ("FY 2025-26", "2025-26"),
 *  income-tax sections ("80C", "80CCD(1B)", "Section 24(b)", "87A"), reference numbers ("Form 16", "Step 2"),
 *  dates and times ("15 March", "March 2026", "2026-09", "10:30"), line-start list numbering ("1.", "2)"),
 *  phone/card/account-like ids, URLs.
 *  A bare 1900–2100 integer is kind 'year' only when a year cue is nearby (in/since/from/till/by/during/FY/
 *  budget … or "onwards"); otherwise it is treated as MONEY and verified — "you spent 2000 on rent" must not
 *  slip through just because 2000 looks like a year.
 *
 * ── What is verified ──────────────────────────────────────────────────────────────────────────────────
 *  money and percent are verified. year / ordinal are never verified. count (bare numbers < 100, and bare
 *  numbers followed by a count/time word such as "250 transactions") is verified only with
 *  opts.strictCounts = true — small counts ("3 steps", "top 5") are overwhelmingly structural prose.
 *
 * ── Matching rule (precise) ───────────────────────────────────────────────────────────────────────────
 *  Evidence numbers come from: every finite number in the tool-result objects (nested ok; the `unit` field
 *  qualifies the sibling `value`), numbers written inside any string field, and numbers in source-chunk
 *  strings (parsed with the same normaliser, so ₹1,50,000 / 1.5 lakh / 150000 are all 150000).
 *  Results with ok === false, and keys like id/ts/version/year/month, are NOT evidence.
 *
 *  An answer figure `a` with display step `s` matches an evidence figure `e` of a compatible kind when
 *      roundHalfUp(e / s) * s == a        (|difference| <= s*1e-6)
 *  where s is the precision the answer actually displays:
 *    - plain rupees, no decimals ("₹5,900")            s = 1        (so 5899.6 and 5900 both read "₹5,900")
 *    - plain rupees with d decimals ("₹5,900.50")      s = 10^-d
 *    - unit WITH decimals ("₹1.4 L", "₹11.2K", "2.5 Cr") s = unit * 10^-d  (₹1.4 L ↔ 1,35,000 … 1,44,999.99;
 *                                                         ₹11.2K ↔ 11,150 … 11,249.99)
 *    - unit with a whole number ("₹2 lakh", "50k", "2 crore", "dedh lakh", compounds) s = 0 → EXACT
 *      (|a-e| < 0.005): a whole number of lakh is a precise claim, not a rounding.
 *    - percent with d decimals ("12.5%", "12%")         s = 10^-d
 *  With opts.allowRounded === false every step is 0 (exact only).
 *  Comparison is on magnitude (sign ignored): prose says "spent ₹500 less" rather than "-₹500", and a
 *  checker cannot judge direction. Kind compatibility: a money figure matches evidence of unit INR/lakh/crore/K or unit-less evidence;
 *  a percent figure matches unit %/ratio or unit-less evidence; evidence with any other unit
 *  ("months", "count") never matches money or percent.
 *
 *  If the user's own numbers may be echoed ("for your ₹50,000 SIP"), put the user message in `evidence`
 *  as a string — otherwise the echoed figure is (correctly) unmatched.
 */
(function (root, factory) {
  const dep = (typeof module !== 'undefined' && module.exports) ? require('./normalizer.js') : root.SmlNormalizer;
  const api = factory(dep);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlNumericCheck = api;
})(typeof window !== 'undefined' ? window : globalThis, function (N) {
  'use strict';
  if (!N || !N.scanNumbers) throw new Error('SmlNumericCheck needs SmlNormalizer (load js/sml/normalizer.js first)');

  const UNVERIFIED_MESSAGE = "I can't verify the figures in that answer, so I'm not showing it.";
  const MONEY_EPS = 0.005;
  const ALL_KINDS = ['money', 'percent', 'count'];
  const SKIP_KEY = /^(?:id|uuid|ts|timestamp|created_?at|updated_?at|version|status|status_?code|year|month|day|latency_?ms|elapsed_?ms|duration_?ms|took_?ms|top_?k|limit|offset)$/i;

  // ───────────────────────────── extraction ─────────────────────────────
  /** Figures in an answer. Each: {raw, value, kind, start, end, decimals, mult, step}. */
  function extractNumbers(answerText) {
    if (typeof answerText !== 'string' || !answerText) return [];
    return N.scanNumbers(answerText, { yearPolicy: 'context' }).map((t) => ({
      raw: t.raw, value: t.value, kind: t.kind, start: t.start, end: t.end, decimals: t.decimals, mult: t.mult, step: t.step,
    }));
  }

  // ───────────────────────────── evidence ─────────────────────────────
  function unitInfo(unit) {
    if (unit == null || unit === '') return null;
    const u = String(unit).trim().toLowerCase();
    if (['%', 'percent', 'percentage', 'pct', 'per cent', 'percent_points'].includes(u)) return { kinds: ['percent'], mult: 1 };
    if (['ratio', 'fraction'].includes(u)) return { kinds: ['percent'], mult: 100 };
    if (['inr', '₹', 'rs', 'rs.', 'rupee', 'rupees', 'rupaye', 'currency', 'inr_rupees'].includes(u)) return { kinds: ['money'], mult: 1 };
    if (['lakh', 'lakhs', 'lac', 'lacs', 'inr_lakh'].includes(u)) return { kinds: ['money'], mult: 1e5 };
    if (['crore', 'crores', 'cr', 'inr_crore'].includes(u)) return { kinds: ['money'], mult: 1e7 };
    if (['thousand', 'k', 'inr_thousand'].includes(u)) return { kinds: ['money'], mult: 1e3 };
    if (u === 'paise') return { kinds: ['money'], mult: 0.01 };
    return { kinds: ['count'], mult: 1 };
  }

  function scanString(str, path, out) {
    if (!str) return;
    const trimmed = str.trim();
    if (/^-?\d[\d,]*(?:\.\d+)?$/.test(trimmed)) {            // a bare numeric string, e.g. "5900"
      const v = parseFloat(trimmed.replace(/,/g, ''));
      if (Number.isFinite(v)) out.push({ value: v, kinds: new Set(ALL_KINDS), path, raw: trimmed });
    }
    for (const t of N.scanNumbers(str, { yearPolicy: 'context' })) {
      if (t.kind === 'money') out.push({ value: t.value, kinds: new Set(['money']), path, raw: t.raw });
      else if (t.kind === 'percent') out.push({ value: t.value, kinds: new Set(['percent']), path, raw: t.raw });
      else if (t.kind === 'count') out.push({ value: t.value, kinds: new Set(t.noun ? ['count'] : ['count', 'percent']), path, raw: t.raw });
    }
  }

  function walk(node, path, unit, out, depth) {
    if (node == null || depth > 12) return;
    const t = typeof node;
    if (t === 'number') {
      if (!Number.isFinite(node)) return;
      const u = unit;
      out.push({ value: u ? Number((node * u.mult).toFixed(6)) : node, kinds: new Set(u ? u.kinds : ALL_KINDS), path, raw: String(node) });
    } else if (t === 'string') {
      scanString(node, path, out);
    } else if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`, unit, out, depth + 1));
    } else if (t === 'object') {
      if (node.ok === false) return;                           // a failed tool result is not evidence
      const own = unitInfo(node.unit);
      for (const k of Object.keys(node)) {
        if (k === 'ok' || k === 'error' || k === 'unit') continue;
        const child = node[k];
        if (typeof child === 'number' && SKIP_KEY.test(k)) continue;
        // `unit` qualifies the sibling `value`/`values` (and everything nested under them); other fields are unit-less
        const childUnit = own ? ((k === 'value' || k === 'values') ? own : null) : unit;
        walk(child, `${path}.${k}`, childUnit, out, depth + 1);
      }
    }
  }

  /** Flatten evidence (array of tool results / source strings, or a single item) into comparable entries. */
  function collectEvidence(evidence) {
    const list = evidence == null ? [] : (Array.isArray(evidence) ? evidence : [evidence]);
    const out = [];
    list.forEach((item, i) => walk(item, `evidence[${i}]`, null, out, 0));
    return out;
  }

  // ───────────────────────────── matching ─────────────────────────────
  function roundHalfUp(x) { return Math.round(x); }          // x >= 0 here
  /** @returns 'exact' | 'rounded' | null */
  function valueMatch(tok, e0, allowRounded) {
    const a = Math.abs(tok.value);
    const e = Math.abs(e0);                                   // magnitude only — see header
    const eps = tok.kind === 'money' ? MONEY_EPS : 1e-9;
    if (Math.abs(a - e) < eps) return 'exact';
    const step = allowRounded ? tok.step : 0;
    if (step > 0) {
      const r = roundHalfUp(e / step) * step;
      if (Math.abs(r - a) <= Math.max(1e-6, step * 1e-6)) return 'rounded';
    }
    return null;
  }
  function matchToken(tok, ev, allowRounded) {
    let rounded = null;
    for (const e of ev) {
      if (!e.kinds.has(tok.kind)) continue;
      const how = valueMatch(tok, e.value, allowRounded);
      if (how === 'exact') return { path: e.path, how, raw: e.raw, value: e.value };
      if (how === 'rounded' && !rounded) rounded = { path: e.path, how, raw: e.raw, value: e.value };
    }
    return rounded;
  }

  /**
   * @param {string} answerText
   * @param {Array|object|string} evidence tool results ({ok,value,unit,…}, nested ok) and/or source chunk strings
   * @param {{strictCounts?:boolean, allowRounded?:boolean}} [opts]
   * @returns {{ok:boolean, numbers:Array, unmatched:Array, skipped:Array}}
   */
  function check(answerText, evidence, opts) {
    opts = opts || {};
    const allowRounded = opts.allowRounded !== false;
    const kinds = new Set(['money', 'percent']);
    if (opts.strictCounts) kinds.add('count');
    const ev = collectEvidence(evidence);
    const numbers = [], unmatched = [], skipped = [];
    for (const t of extractNumbers(answerText)) {
      if (!kinds.has(t.kind)) { skipped.push({ raw: t.raw, value: t.value, kind: t.kind, start: t.start, end: t.end }); continue; }
      const r = matchToken(t, ev, allowRounded);
      const entry = {
        raw: t.raw, value: t.value, kind: t.kind, matched: !!r, matched_to: r ? r.path : null,
        match: r ? r.how : null, evidence_value: r ? r.value : null, start: t.start, end: t.end,
      };
      numbers.push(entry);
      if (!r) unmatched.push(entry);
    }
    return { ok: unmatched.length === 0, numbers, unmatched, skipped };
  }

  // ───────────────────────────── sentence removal ─────────────────────────────
  const ABBR = new Set(['rs', 'no', 'vs', 'approx', 'e.g', 'i.e', 'mr', 'mrs', 'ms', 'dr', 'st', 'sec', 'fig', 'p.a', 'p.m', 'a.m', 'inr', 'pvt', 'ltd', 'incl', 'excl', 'est', 'avg', 'max', 'min', 'ca']);

  /** Split into sentence units (also one per line). Returns [{start,end}] ranges of the original text. */
  function splitSentences(text) {
    const units = [];
    const addUnit = (a, b) => {
      while (a < b && /\s/.test(text[a])) a++;
      while (b > a && /\s/.test(text[b - 1])) b--;
      if (b > a) units.push({ start: a, end: b });
    };
    let ls = 0;
    while (ls <= text.length) {
      let le = text.indexOf('\n', ls);
      if (le < 0) le = text.length;
      let segStart = ls;
      let p = ls;
      while (p < le) {
        const ch = text[p];
        if (ch === '.' || ch === '!' || ch === '?' || ch === '।') {
          let q = p + 1;
          while (q < le && /[.!?।"')\]]/.test(text[q])) q++;
          const cite = /^(?:[ \t]*\[[^\]\n]{1,40}\])+/.exec(text.slice(q, le));
          if (cite) q += cite[0].length;
          const atEnd = q >= le || /\s/.test(text[q]);
          let boundary = atEnd;
          if (boundary && ch === '.' && q === p + 1) {
            const before = text.slice(segStart, p);
            const word = (/([A-Za-z][A-Za-z.]*)$/.exec(before) || [])[1];
            if (word && ABBR.has(word.toLowerCase())) boundary = false;
            if (/^\s*(?:\d{1,3}|[A-Za-z])$/.test(text.slice(ls, p)) && segStart === ls) boundary = false; // "1." list marker
            const nextMatch = /^\s*(\S)/.exec(text.slice(q, le));
            if (boundary && nextMatch && /[a-z]/.test(nextMatch[1])) boundary = false;       // "e.g. salary" / lowercase continuation
          }
          if (boundary) { addUnit(segStart, q); segStart = q; p = q; continue; }
          p = q; continue;
        }
        p++;
      }
      addUnit(segStart, le);
      ls = le + 1;
    }
    return units;
  }

  /**
   * Remove every sentence (or list line) that contains a figure the evidence does not support. Never rewrites
   * a number. `removed` lists the dropped sentences; if nothing is left the fixed UNVERIFIED_MESSAGE is returned
   * and `blocked` is true.
   * @returns {{text:string, removed:string[], changed:boolean, blocked:boolean, check:object}}
   */
  function sanitize(answerText, evidence, opts) {
    const text = typeof answerText === 'string' ? answerText : '';
    const res = check(text, evidence, opts);
    if (res.ok) return { text, removed: [], changed: false, blocked: false, check: res };

    const units = splitSentences(text);
    const bad = new Set();
    let orphan = false;
    for (const u of res.unmatched) {
      const idx = units.findIndex((x) => u.start >= x.start && u.start < x.end);
      if (idx < 0) orphan = true; else bad.add(idx);
    }
    const blockAll = () => ({ text: UNVERIFIED_MESSAGE, removed: units.map((u) => text.slice(u.start, u.end)), changed: true, blocked: true, check: res });
    if (orphan) return blockAll();

    let out = '';
    const removed = [];
    const nl = (x) => (x.match(/\n/g) || []).length;
    let pendingSep = null;                                  // separator after the last KEPT unit, not yet written
    units.forEach((u, i) => {
      const nextStart = i + 1 < units.length ? units[i + 1].start : text.length;
      const sep = text.slice(u.end, nextStart);
      if (bad.has(i)) {
        removed.push(text.slice(u.start, u.end));
        if (pendingSep !== null && nl(sep) > nl(pendingSep)) pendingSep = sep;   // keep line structure
        return;
      }
      if (pendingSep !== null) out += pendingSep;
      out += text.slice(u.start, u.end);
      pendingSep = sep;
    });
    out = out.replace(/\s+$/, '');
    if (!out.trim()) return blockAll();
    if (!check(out, evidence, opts).ok) return blockAll();     // defensive: never return text that still fails
    return { text: out, removed, changed: true, blocked: false, check: res };
  }

  return { VERSION: '1.0', UNVERIFIED_MESSAGE, extractNumbers, check, sanitize, collectEvidence, splitSentences };
});
