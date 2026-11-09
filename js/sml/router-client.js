/**
 * SmlRouterClient — "on-device first, server fallback" router decisions (ROADMAP J2/C13).   (v1.0)
 *
 * decide(text) → Promise<{ decision, via }>   via = 'local' | 'server' | null
 *   - Local: the TF-IDF half of the router running in this browser (js/sml/tfidf-router.js), no request at all per message. The model file (about 0.5 MB
 *     compressed) is downloaded ONCE, lazily, from this site, only when the caller enabled local mode. Until it has arrived, and whenever it cannot load or the
 *     local call throws, the SERVER callback (`remote`, POST /api/route on rag-engine) answers instead. If both fail the decision is null (fail-open).
 *   - The local head is the recall-first signal of router 0.4.1 (sealed test_v7: F1 0.928, recall 332/333, false alarm 11.7%; TRACKER C19), NOT the blend and not
 *     a blocking guard. Its decisions are labelled router_version '0.4.1-tfidf' so counters never mix it with the server blend.
 * Nothing here stores or logs the text.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlRouterClient = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LABEL = '0.4.1-tfidf';
  const GUARD_MASS = 0.10;          // chosen on dev with the pre-refit head (C18); recall-first

  function create(opts) {
    const o = opts || {};
    const tfidf = o.tfidf, loadModel = o.loadModel, remote = o.remote;
    const guardMass = Number.isFinite(o.guardMass) ? o.guardMass : GUARD_MASS;
    let state = 'idle', router = null, loading = null;

    function ensure() {
      if (state !== 'idle' || typeof loadModel !== 'function' || !tfidf) return state === 'idle' ? null : loading;
      state = 'loading';
      loading = Promise.resolve().then(loadModel).then((model) => { router = tfidf.create(model); state = 'ready'; })
        .catch(() => { state = 'failed'; });
      return loading;
    }
    function viaServer(text) {
      if (typeof remote !== 'function') return Promise.resolve({ decision: null, via: null });
      return Promise.resolve().then(() => remote(text)).then((d) => (d && !d.error ? { decision: d, via: 'server' } : { decision: null, via: null }))
        .catch(() => ({ decision: null, via: null }));
    }
    function decide(text) {
      ensure();
      if (state === 'ready') {
        try {
          const d = router.predict(String(text == null ? '' : text), { guardMass });
          return Promise.resolve({ decision: { router_version: LABEL, intent: d.intent, confidence: Math.round(d.confidence * 1000) / 1000, risk: d.risk,
            high_risk_mass: Math.round(d.high_risk_mass * 1000) / 1000, needs_guard: d.needs_guard }, via: 'local' });
        } catch (e) { /* fall through to the server */ }
      }
      return viaServer(text);
    }
    return { VERSION: '1.0', LABEL, decide, ready: () => loading || Promise.resolve(), state: () => state };
  }

  return { VERSION: '1.0', LABEL, GUARD_MASS, create };
});
