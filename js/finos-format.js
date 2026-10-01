/**
 * FIN-OS formatting — one implementation of Indian number/currency/date formatting.  (v1.0)
 *
 *   FinosFmt.inr(1234567)                 → "₹12,34,567"
 *   FinosFmt.inr(1234567.5, {decimals:2}) → "₹12,34,567.50"
 *   FinosFmt.compact(12500000)            → "₹1.25 Cr"      (K / L / Cr / Ar)
 *   FinosFmt.num(1234567)                 → "12,34,567"
 *   FinosFmt.pct(0.1234)                  → "12.3%"          (ratio in, percent out; pctRaw for 12.34 → "12.3%")
 *   FinosFmt.parse("₹5L") → 500000   parse("2.5 cr") → 25000000   parse("50k") → 50000
 *   FinosFmt.date(d) → "01 Oct 2026"    FinosFmt.monthYear(d) → "Oct 2026"
 *
 * Intl.NumberFormat('en-IN') is used when available; a manual lakh/crore grouper is the fallback
 * (older WebViews / ICU-less runtimes group by thousands, which is wrong for India).
 * Invalid input → "—" rather than "NaN" or "₹NaN".
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosFmt = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const DASH = '—';
  const isNum = (n) => typeof n === 'number' && isFinite(n);
  const toNum = (n) => (typeof n === 'string' && n.trim() !== '' ? Number(n.replace(/[₹,\s]/g, '')) : n);

  /** Indian digit grouping: 12,34,567 — implemented by hand so it never depends on ICU data. */
  function group(intStr) {
    if (intStr.length <= 3) return intStr;
    const last3 = intStr.slice(-3);
    const rest = intStr.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + last3;
  }

  function num(n, opts) {
    n = toNum(n);
    if (!isNum(n)) return DASH;
    const d = (opts && opts.decimals) || 0;
    const fixed = Math.abs(n).toFixed(d);
    const [i, f] = fixed.split('.');
    const body = group(i) + (f ? '.' + f : '');
    return (n < 0 && Number(fixed) !== 0 ? '-' : '') + body;
  }

  function inr(n, opts) {
    n = toNum(n);
    if (!isNum(n)) return DASH;
    const s = num(n, opts);
    return s.startsWith('-') ? '-₹' + s.slice(1) : '₹' + s;
  }

  const UNITS = [
    [1e9, 'Ar'],   // arab = 100 crore
    [1e7, 'Cr'],
    [1e5, 'L'],
    [1e3, 'K'],
  ];
  const UNIT_LABELS = { en: { Ar: 'Ar', Cr: 'Cr', L: 'L', K: 'K' }, hi: { Ar: 'अरब', Cr: 'करोड़', L: 'लाख', K: 'हज़ार' } };
  function unitLabels(opts) {
    const lang = (opts && opts.lang) || (root.FinosI18n && root.FinosI18n.lang && root.FinosI18n.lang()) || 'en';
    return UNIT_LABELS[lang] || UNIT_LABELS.en;
  }
  function compact(n, opts) {
    n = toNum(n);
    if (!isNum(n)) return DASH;
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    const sym = opts && opts.symbol === false ? '' : '₹';
    const lbl = unitLabels(opts);
    for (const [v, u] of UNITS) {
      if (abs >= v) {
        // Round first, then promote (so 9.99L doesn't render as "10 L" when it should be "₹10 L" / next unit)
        let x = Math.round((abs / v) * 100) / 100;
        if (x >= 100 && v === 1e3) return sign + sym + (Math.round(abs / 1e5 * 100) / 100) + ' ' + lbl.L;
        return sign + sym + (+x.toFixed(2)) + ' ' + lbl[u];
      }
    }
    return sign + sym + (+abs.toFixed(2));
  }

  function pct(ratio, decimals) {
    ratio = toNum(ratio);
    return isNum(ratio) ? (ratio * 100).toFixed(decimals === undefined ? 1 : decimals).replace(/\.0+$/, '') + '%' : DASH;
  }
  function pctRaw(v, decimals) {
    v = toNum(v);
    return isNum(v) ? v.toFixed(decimals === undefined ? 1 : decimals).replace(/\.0+$/, '') + '%' : DASH;
  }

  /** "₹5L" "2.5 cr" "50k" "1,23,456" "1 lakh" → number | NaN */
  function parse(str) {
    if (typeof str === 'number') return str;
    const m = String(str == null ? '' : str).toLowerCase().replace(/[₹,\s]/g, '')
      .match(/^(-?\d*\.?\d+)(k|thousand|l|lac|lakh|lakhs|lacs|cr|crore|crores|ar|arab)?$/);
    if (!m) return NaN;
    const mult = { k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lakh: 1e5, lakhs: 1e5, lacs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7, ar: 1e9, arab: 1e9 }[m[2]] || 1;
    return parseFloat(m[1]) * mult;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function asDate(d) { const x = d instanceof Date ? d : new Date(d); return isNaN(x) ? null : x; }
  function date(d) {
    const x = asDate(d); if (!x) return DASH;
    return String(x.getDate()).padStart(2, '0') + ' ' + MONTHS[x.getMonth()] + ' ' + x.getFullYear();
  }
  function monthYear(d) { const x = asDate(d); return x ? MONTHS[x.getMonth()] + ' ' + x.getFullYear() : DASH; }

  /** Indian financial year label for a date: Apr 2026–Mar 2027 → "FY 2026-27". */
  function fy(d) {
    const x = asDate(d || new Date()); if (!x) return DASH;
    const y = x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1;
    return 'FY ' + y + '-' + String((y + 1) % 100).padStart(2, '0');
  }

  return { inr, num, compact, pct, pctRaw, parse, date, monthYear, fy, group };
});
