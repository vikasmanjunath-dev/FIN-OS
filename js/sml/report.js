/**
 * SmlReport — one readable summary of the local SML counters for the founder (sml/PLAN.md W1/W6).   (v2.0)
 * Pure: takes the two stats objects plus the module APIs, returns text. Reads counters only; never any message text.
 *   build(routerMod, routerStats, pulseMod, pulseStats, flags) → {text, ready}
 *   resetKeys(routerMod, pulseMod) → the storage keys a reset removes (counters only; flags are left as they are)
 *   exportCounters(routerMod, routerStats, pulseMod, pulseStats, flags, now) → plain object (v2) for offline analysis: counters only, rebuilt through each module's whitelist
 *   wilson(k, n) → [lo, hi] 95% Wilson interval of a proportion
 * `ready` = enough router messages (>= 300, the PLAN.md gate to leave shadow mode) to review disagreements.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlReport = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const GATE = 300;

  /** 95% Wilson score interval for k of n (rates from small samples must not be read as points). */
  function wilson(k, n, z) {
    if (!(n > 0)) return [0, 1];
    z = z || 1.96; const p = k / n, d = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  }
  const pct = (x) => (100 * x).toFixed(1) + '%';
  const rate = (k, n) => { const w = wilson(k, n); return pct(k / n) + ' (95% CI ' + pct(w[0]) + '-' + pct(w[1]) + ')'; };

  /** Pass stats through the module's own whitelist (save then load into a throw-away store): nothing but known counters can come out. */
  function sanitise(mod, stats) {
    if (!mod || !stats) return null;
    const mem = {}; const st = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
    mod.saveStats(st, stats); return mod.loadStats(st);
  }

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
      lines.push('Router guard rate: ' + rate(rs.router_guard || 0, total) + ' | regex guard rate: ' + rate(rs.regex_guard || 0, total));
      const dis = (rs.router_only || 0) + (rs.regex_only || 0);
      lines.push('Router and regex disagree on ' + dis + ' of ' + total + ' messages (' + rate(dis, total) + '); router-only ' + (rs.router_only || 0) + ', regex-only ' + (rs.regex_only || 0));
      if (rs.errors) lines.push('Router call errors: ' + rs.errors + ' (' + pct(rs.errors / (total + rs.errors)) + ' of attempts)');
      lines.push('Messages toward the ' + GATE + ' gate: ' + Math.min(total, GATE) + '/' + GATE);
    }
    lines.push('PULSE counters: ' + (f.pulse ? 'ON' : 'off'));
    lines.push(P && ps ? P.summary(ps) : 'PULSE counters: module not loaded');
    return { text: lines.join('\n'), ready: total >= GATE };
  }

  function resetKeys(R, P) {
    return [R && R.KEY, P && P.KEY, P && P.LOG_KEY].filter(Boolean);   // P.LOG_KEY: the G5 event ring buffer
  }

  function exportCounters(R, rs, P, ps, flags, now) {
    return { schema: 'finos-sml-counters/2', exported_at: Number.isFinite(now) ? now : Date.now(),
      flags: { router: !!(flags && flags.router), pulse: !!(flags && flags.pulse) },
      router: sanitise(R, rs), pulse: sanitise(P, ps) };
  }

  return { VERSION: '2.0', GATE, build, resetKeys, exportCounters, wilson };
});
