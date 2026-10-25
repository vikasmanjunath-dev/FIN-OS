/**
 * SmlReport — one readable summary of the local SML counters for the founder (sml/PLAN.md W1/W6).   (v1.0)
 * Pure: takes the two stats objects plus the module APIs, returns text. Reads counters only; never any message text.
 *   build(routerMod, routerStats, pulseMod, pulseStats, flags) → {text, ready}
 *   resetKeys(routerMod, pulseMod) → the storage keys a reset removes (counters only; flags are left as they are)
 * `ready` = enough router messages (>= 300, the PLAN.md gate to leave shadow mode) to review disagreements.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlReport = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const GATE = 300;

  function build(R, rs, P, ps, flags) {
    const f = flags || {};
    const lines = [];
    lines.push('Router shadow: ' + (f.router ? 'ON' : 'off'));
    lines.push(R && rs ? R.summary(rs) : 'Router shadow: module not loaded');
    const total = rs && Number.isFinite(rs.total) ? rs.total : 0;
    if (R && total) {
      const top = Object.keys(rs.by_intent || {}).sort((a, b) => rs.by_intent[b] - rs.by_intent[a]).slice(0, 5)
        .map((k) => k + ' ' + rs.by_intent[k]);
      if (top.length) lines.push('Top intents: ' + top.join(', '));
      lines.push('Messages toward the ' + GATE + ' gate: ' + Math.min(total, GATE) + '/' + GATE);
    }
    lines.push('PULSE counters: ' + (f.pulse ? 'ON' : 'off'));
    lines.push(P && ps ? P.summary(ps) : 'PULSE counters: module not loaded');
    return { text: lines.join('\n'), ready: total >= GATE };
  }

  function resetKeys(R, P) {
    return [R && R.KEY, P && P.KEY].filter(Boolean);
  }

  return { VERSION: '1.0', GATE, build, resetKeys };
});
