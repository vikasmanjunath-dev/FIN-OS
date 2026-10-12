/**
 * FIN-OS interface translation.   (v1.0)
 *
 * No markup changes needed on 119 pages: the engine walks the DOM and replaces text nodes (and placeholder / title /
 * aria-label attributes) whose entire text exactly matches a dictionary entry. Exact-match keeps prose, numbers and
 * user data untouched — only short, known UI strings (nav labels, buttons, tab names, page titles) change.
 *
 *   FinosI18n.setLang('hi')        switch (persists in localStorage 'finos_lang'; loads js/i18n/hi.js on demand)
 *   FinosI18n.setLang('en')        switch back — originals are restored exactly
 *   FinosI18n.t('Save')            'सहेजें' (or 'Save' when there is no entry)  — for strings built in JS
 *   FinosI18n.lang()               current language code
 *   FinosI18n.register(code, {English: 'Local', …})   used by the locale files
 *
 * Adding a language: create js/i18n/<code>.js that calls FinosI18n.register('<code>', {...}) and add its name to
 * LANGUAGES below. Locale files must be reviewed by a fluent speaker before release.
 * Elements (or ancestors) with data-no-i18n are never touched.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosI18n = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const LANGUAGES = { en: 'English', hi: 'हिन्दी' };
  const STORE_KEY = 'finos_lang';
  const tables = {};
  let current = 'en';
  const originals = new WeakMap();            // text node → original text
  const attrOriginals = new WeakMap();        // element → { attr: original }
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const SKIP_TAGS = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE|NOSCRIPT|SVG|CANVAS)$/;
  let observer = null, timer = null;

  const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
  /* Decorative glyphs people put around labels ("← Back", "Export ⬆", "✓ Done") are kept, only the words are translated. */
  const GLYPH = /^([\s\p{Extended_Pictographic}\uFE0F\u200D←→↑↓‹›»«⬆⬇✓✕+•·\-–—]*)(.*?)([\s\p{Extended_Pictographic}\uFE0F\u200D←→↑↓‹›»«⬆⬇✓✕+•·\-–—…]*)$/u;

  function lookup(text) {
    const table = tables[current];
    if (!table) return null;
    const n = norm(text);
    if (!n) return null;
    if (Object.prototype.hasOwnProperty.call(table, n)) return table[n];
    const m = n.match(GLYPH);
    if (m && m[2] && Object.prototype.hasOwnProperty.call(table, m[2])) return (m[1] + table[m[2]] + m[3]).trim();
    // "Label: value" results (calculators write "Maturity: ₹1.41 L"): translate the label, keep the value, with lakh/crore in Hindi.
    const kv = n.match(/^([^:\d₹]{2,60}): (.+)$/);
    if (kv) {
      const key = kv[1] + ': {v}';
      if (Object.prototype.hasOwnProperty.call(table, key)) return table[key].replace('{v}', localiseValue(kv[2]));
    }
    return null;
  }
  function localiseValue(v) {
    if (current !== 'hi') return v;
    return v.replace(/(\d)\s?Cr\b/g, '$1 करोड़').replace(/(\d)\s?L\b/g, '$1 लाख').replace(/\/mo\b/g, '/माह').replace(/\bper month\b/g, 'प्रति माह');
  }

  function t(key, fallback) {
    const hit = current === 'en' ? null : lookup(key);
    return hit !== null && hit !== undefined ? hit : (fallback !== undefined ? fallback : key);
  }

  function register(code, table) { tables[code] = Object.assign(tables[code] || {}, table); }

  function skipped(el, forAttrs) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      // A textarea's own content is the person's text and is left alone, and a canvas or svg has no text to translate, but their
      // placeholder / aria-label / title are ours and are translated.
      if (forAttrs && e === el && /^(TEXTAREA|CANVAS|svg|SVG)$/.test(e.tagName)) { if (e.hasAttribute('data-no-i18n')) return true; continue; }
      if (SKIP_TAGS.test(e.tagName) || e.hasAttribute('data-no-i18n') || e.isContentEditable) return true;
    }
    return false;
  }

  /** Translate (or restore, when lang is 'en') everything under rootEl. Returns the number of changes. */
  function apply(rootEl) {
    const doc = root.document;
    if (!doc) return 0;
    const scope = rootEl || doc.body;
    if (!scope) return 0;
    let changed = 0;
    const walker = doc.createTreeWalker(scope, root.NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    nodes.forEach((node) => {
      const parent = node.parentElement;
      if (!parent || skipped(parent)) return;
      if (current === 'en') {
        if (originals.has(node)) { node.nodeValue = originals.get(node); originals.delete(node); changed++; }
        return;
      }
      const base = originals.has(node) ? originals.get(node) : node.nodeValue;
      const hit = lookup(base);
      if (hit === null || hit === undefined) return;
      if (!originals.has(node)) originals.set(node, node.nodeValue);
      const lead = (base.match(/^\s*/) || [''])[0], trail = (base.match(/\s*$/) || [''])[0];     // keep surrounding whitespace
      if (node.nodeValue !== lead + hit + trail) { node.nodeValue = lead + hit + trail; changed++; }
    });
    scope.querySelectorAll && scope.querySelectorAll('[placeholder],[title],[aria-label]').forEach((el) => {
      if (skipped(el, true)) return;
      const saved = attrOriginals.get(el) || {};
      ATTRS.forEach((a) => {
        if (!el.hasAttribute(a)) return;
        if (current === 'en') {
          if (a in saved) { el.setAttribute(a, saved[a]); delete saved[a]; changed++; }
          return;
        }
        const base = a in saved ? saved[a] : el.getAttribute(a);
        const hit = lookup(base);
        if (hit === null || hit === undefined) return;
        saved[a] = base; el.setAttribute(a, hit); changed++;
      });
      attrOriginals.set(el, saved);
    });
    return changed;
  }

  function loadTable(code) {
    return new Promise((resolve) => {
      if (tables[code] || code === 'en' || !root.document) return resolve();
      const me = root.document.querySelector('script[src*="finos-i18n.js"]');
      const base = me ? me.src.replace(/finos-i18n\.js(\?.*)?$/, '') : '../js/';
      const s = root.document.createElement('script');
      s.src = base + 'i18n/' + code + '.js';
      s.onload = s.onerror = () => resolve();
      root.document.head.appendChild(s);
    });
  }

  function watch() {
    if (observer || !root.MutationObserver || !root.document.body) return;
    observer = new root.MutationObserver((muts) => {
      if (current === 'en') return;
      clearTimeout(timer);
      timer = setTimeout(() => apply(), 150);              // UI rendered later by scripts gets translated too
    });
    observer.observe(root.document.body, { childList: true, subtree: true, characterData: false });
  }

  function lang() { return current; }

  async function setLang(code, opts) {
    if (!LANGUAGES[code]) code = 'en';
    await loadTable(code);
    current = tables[code] || code === 'en' ? code : 'en';
    if (!opts || opts.persist !== false) { try { root.localStorage.setItem(STORE_KEY, current); } catch (_) { /* private mode */ } }
    if (root.document) {
      root.document.documentElement.setAttribute('lang', current === 'en' ? 'en' : current);
      apply();
      watch();
      root.dispatchEvent && root.dispatchEvent(new root.CustomEvent('finos:lang', { detail: { lang: current } }));
    }
    return current;
  }

  function init() {
    let saved = 'en';
    try { saved = root.localStorage.getItem(STORE_KEY) || 'en'; } catch (_) { /* ignore */ }
    return saved === 'en' ? Promise.resolve('en') : setLang(saved, { persist: false });
  }

  return { LANGUAGES, t, apply, setLang, lang, init, register, _lookup: lookup };
});
