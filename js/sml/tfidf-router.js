/**
 * SmlTfidfRouter — the TF-IDF half of the SML intent router in plain JavaScript (ROADMAP J1).   (v1.0)
 *
 * A port of sml/runtime/tfidf_head.py (which matches scikit-learn): word 1-2 grams + char_wb 2-5 grams, lowercase, sublinear tf, idf, l2 per block, then a
 * logistic-regression softmax. NOT WIRED into any page: it is the building block for a router that runs in the browser without rag-engine.
 * Weights come from sml/training/export_tfidf_web.py (a JSON file; nothing is bundled here). No network, no storage, no logging; the text is only read.
 *
 *   const r = SmlTfidfRouter.create(modelJson);   // modelJson = the parsed tfidf_head.web.json
 *   r.proba(text)  → Float64Array of class probabilities (order = r.classes)
 *   r.predict(text, {guardMass}) → {intent, confidence, risk, high_risk_mass, needs_guard}
 *
 * Tokenisation matches Python's `\w` on purpose: letters, digits, underscore; Devanagari vowel signs and virama are combining marks and are NOT word
 * characters, so a Hindi word is split at them, exactly as when the model was trained.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlTfidfRouter = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const RISK = { advice_seeking: 'high', evasion_request: 'high' };
  const WORD_RUN = /[\p{L}\p{N}_]+/gu;
  // Python str.split() whitespace (not JS \s: it lacks \x1c-\x1f and \x85, and has ﻿)
  const PY_SPACE = new RegExp('[\\t\\n\\u000b\\f\\r\\u001c-\\u0020\\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]+');

  function wordTerms(text) {
    const toks = [];
    for (const m of text.toLowerCase().matchAll(WORD_RUN)) if (Array.from(m[0]).length >= 2) toks.push(m[0]);
    const out = toks.slice();
    for (let i = 0; i + 1 < toks.length; i++) out.push(toks[i] + ' ' + toks[i + 1]);
    return out;
  }

  function charWbTerms(text) {
    const out = [];
    for (const word of text.toLowerCase().split(PY_SPACE)) {
      if (!word) continue;
      const w = Array.from(' ' + word + ' ');
      for (let n = 2; n <= 5; n++) {
        let off = 0;
        out.push(w.slice(off, off + n).join(''));
        while (off + n < w.length) { off += 1; out.push(w.slice(off, off + n).join('')); }
        if (off === 0) break;                               // a short word counts once for this n
      }
    }
    return out;
  }

  function create(model) {
    if (!model || model.schema !== 'finos-tfidf-head/1') throw new Error('unsupported model file');
    const vw = new Map(model.vocab_word.map((t, i) => [t, i]));
    const vc = new Map(model.vocab_char.map((t, i) => [t, i]));
    const nw = model.n_word, K = model.classes.length;
    const coef = model.coef.map((row) => Float64Array.from(row));
    const b = Float64Array.from(model.intercept);
    const idfW = Float64Array.from(model.idf_word), idfC = Float64Array.from(model.idf_char);

    function block(terms, vocab, idf) {
      const tf = new Map();
      for (const t of terms) { const i = vocab.get(t); if (i !== undefined) tf.set(i, (tf.get(i) || 0) + 1); }
      const idx = [], val = []; let sq = 0;
      for (const [i, c] of tf) { const v = (1 + Math.log(c)) * idf[i]; idx.push(i); val.push(v); sq += v * v; }
      const n = Math.sqrt(sq);
      if (n > 0) for (let k = 0; k < val.length; k++) val[k] /= n;
      return [idx, val];
    }

    function proba(text) {
      const s = String(text == null ? '' : text);
      const [iw, vwv] = block(wordTerms(s), vw, idfW), [ic, vcv] = block(charWbTerms(s), vc, idfC);
      const z = new Float64Array(K);
      for (let k = 0; k < K; k++) {
        let a = b[k]; const row = coef[k];
        for (let j = 0; j < iw.length; j++) a += row[iw[j]] * vwv[j];
        for (let j = 0; j < ic.length; j++) a += row[nw + ic[j]] * vcv[j];
        z[k] = a;
      }
      let m = -Infinity; for (let k = 0; k < K; k++) if (z[k] > m) m = z[k];
      let sum = 0; for (let k = 0; k < K; k++) { z[k] = Math.exp(z[k] - m); sum += z[k]; }
      for (let k = 0; k < K; k++) z[k] /= sum;
      return z;
    }

    function predict(text, opts) {
      const p = proba(text); let best = 0; for (let k = 1; k < K; k++) if (p[k] > p[best]) best = k;
      const intent = model.classes[best];
      let mass = 0; model.classes.forEach((c, k) => { if (RISK[c]) mass += p[k]; });
      const thr = opts && Number.isFinite(opts.guardMass) ? opts.guardMass : 0.35;
      return { intent, confidence: p[best], risk: RISK[intent] || 'low', high_risk_mass: mass, needs_guard: !!RISK[intent] || mass >= thr };
    }

    return { VERSION: '1.0', classes: model.classes.slice(), version: model.version, proba, predict };
  }

  return { VERSION: '1.0', create, wordTerms, charWbTerms };
});
