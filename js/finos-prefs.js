/**
 * FIN•OS preferences runtime — applies the Settings page choices on EVERY page.
 *
 * Settings (settings.html → js/settings.js) writes FINOS_SYS_SETTINGS to localStorage. Pages only
 * honour it if something reads it back. ui.js does that for most pages; this file is the
 * dependency-free version for the pages that do not load ui.js (every calculator, plus a few
 * trackers), and ui.js lazy-loads it everywhere else so there is one implementation of:
 *
 *   FINOS.applyPrefs()   re-reads storage and applies accent · font size · reduce-motion ·
 *                        high-contrast · compact-ui · number/currency/date data-attributes
 *   FINOS.aiDirective()  a short, strictly validated system-prompt suffix that makes Arya answer in
 *                        the language and tone chosen in Settings (AI language + persona)
 *
 * Strict by design: only values from the same allow-lists settings.js enforces are ever applied,
 * so tampered or corrupt storage can never inject a style value, a class name or prompt text.
 */
(function () {
  'use strict';

  var KEY = 'FINOS_SYS_SETTINGS';
  var ENUMS = {
    fontSize:     ['small', 'normal', 'large'],
    aiLang:       ['hinglish', 'english', 'hindi'],
    aiPersona:    ['bhai', 'ca_sahab', 'trader_bro', 'retirement_uncle'],
    numberFormat: ['indian', 'western'],
    currency:     ['inr', 'usd'],
    dateFormat:   ['dmy', 'mdy', 'ymd'],
  };
  var FLAGS = { reduceMotion: 'reduce-motion', highContrast: 'high-contrast', compactUI: 'compact-ui' };

  function read() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY) || '{}');
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch (e) { return {}; }   // blocked storage or corrupt JSON: behave as "nothing chosen"
  }

  function valid(key, value) {
    return ENUMS[key] && ENUMS[key].indexOf(value) !== -1 ? value : undefined;
  }

  function applyPrefs(settings) {
    var s = settings && typeof settings === 'object' ? settings : read();
    var root = document.documentElement;
    if (!root) return;

    if (typeof s.accent === 'string' && /^#[\da-f]{6}$/i.test(s.accent)) {
      root.style.setProperty('--accent', s.accent);
      root.style.setProperty('--accent-dim', s.accent + '20');
    }
    var fs = valid('fontSize', s.fontSize);
    if (fs) root.setAttribute('data-font-size', fs);
    Object.keys(FLAGS).forEach(function (k) { root.classList.toggle(FLAGS[k], s[k] === true); });
    [['numberFormat', 'data-number-format'], ['currency', 'data-currency'], ['dateFormat', 'data-date-format']]
      .forEach(function (p) { var v = valid(p[0], s[p[0]]); if (v) root.setAttribute(p[1], v); });
  }

  /* ── AI language + persona → system-prompt suffix ─────────────────────────────────────────── */
  var LANG = {
    hinglish: 'Reply in natural Hinglish (Hindi written in Roman script, mixed with English), conversational and clear.',
    english:  'Reply in clear, simple English only.',
    hindi:    'Reply in Hindi (Devanagari script). Keep numbers, ₹ amounts and standard finance terms easy to read.',
  };
  var PERSONA = {
    bhai:             'Tone: a friendly, plain-spoken "bhai" — warm, casual, relatable Indian everyday examples.',
    ca_sahab:         'Tone: a careful Chartered Accountant — precise, compliance- and tax-aware; cite the relevant section or limit where it matters and flag risks.',
    trader_bro:       'Tone: an energetic active trader — concise and market-focused, always with risk and position-sizing caveats; never imply guaranteed returns.',
    retirement_uncle: 'Tone: a calm, patient retirement-minded elder — capital safety, steady income, inflation and healthcare first, in simple language.',
  };

  function aiDirective() {
    var s = read();
    var lang = valid('aiLang', s.aiLang), persona = valid('aiPersona', s.aiPersona);
    if (!lang && !persona) return '';   // nothing chosen yet: leave every prompt exactly as it was
    var lines = [];
    if (lang) lines.push(LANG[lang]);
    if (persona) lines.push(PERSONA[persona]);
    lines.push('The persona changes tone only: keep every number, rule and caveat accurate, and never promise returns.');
    return '\n\nRESPONSE STYLE (user setting):\n' + lines.join('\n');
  }

  window.FINOS = window.FINOS || {};
  window.FINOS.applyPrefs = applyPrefs;
  window.FINOS.aiDirective = aiDirective;

  applyPrefs();
  // Another tab changed a preference: follow it without a reload.
  window.addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) applyPrefs(); });
})();
