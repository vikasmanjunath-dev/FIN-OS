/**
 * SmlPulseExplore: flagged, default-OFF epsilon-greedy over the rule ranker's top-K, logging PROPENSITIES (sml/PLAN.md W6, tracker T1.5).   (v1.0)
 * Why: the rule ranker is deterministic, so what a different order would earn cannot be estimated from its logs (see sml/tools/pulse/replay.py).
 * With the flag on, one non-pinned widget from the rule top-K may take the first non-pinned slot; the probability of what was shown is logged.
 * Flag: localStorage finos_pulse_explore_on === '1' AND finos_pulse_counters_on === '1' (the tap markers come from the counters). Local only, no network.
 * SAFETY NET (same as replay.py check_order): candidates = rule top-K non-pinned; pinned stay put; everyone else keeps rule order, so nobody drops more than
 * one place and the rule's first widget never goes below the second non-pinned slot.
 *   choose(ruleOrder, {eps, k, rand}) -> {order, featured, propensity, explored}
 *   record(log, ruleOrder, choice, now) / markTap(log, id) / cleanLog / loadLog / saveLog / toJsonl(log)
 * Log row = replay.py format: {v:1, day, rule_order, featured, propensity, tap}. Ids must match /^[A-Za-z][A-Za-z0-9]{0,39}$/; newest MAX_ROWS kept.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlPulseExplore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LOG_KEY = 'finos_pulse_explore', FLAG = 'finos_pulse_explore_on', COUNTER_FLAG = 'finos_pulse_counters_on';
  const PINNED = ['crossPageHUD', 'smartInsightCards'];
  const ID_RE = /^[A-Za-z][A-Za-z0-9]{0,39}$/, MAX_ROWS = 400, DEFAULT_EPS = 0.1, DEFAULT_K = 5;

  function choose(ruleOrder, opts) {
    const o = opts || {}, eps = Number.isFinite(o.eps) ? Math.min(Math.max(o.eps, 0), 1) : DEFAULT_EPS, k = Math.max(1, o.k | 0 || DEFAULT_K);
    const rand = typeof o.rand === 'function' ? o.rand : Math.random;
    const rule = Array.isArray(ruleOrder) ? ruleOrder.slice() : [];
    const cand = rule.filter((w) => PINNED.indexOf(w) < 0).slice(0, k);
    if (cand.length === 0) return { order: rule, featured: null, propensity: 1, explored: false };
    const explored = cand.length > 1 && rand() < eps;
    const featured = explored ? cand[Math.min(cand.length - 1, Math.floor(rand() * cand.length))] : cand[0];
    const pCand = eps / cand.length, propensity = cand.length === 1 ? 1 : (featured === cand[0] ? 1 - eps + pCand : pCand);
    const pos = [], np = [];
    rule.forEach((w, i) => { if (PINNED.indexOf(w) < 0) { pos.push(i); np.push(w); } });
    const newNp = [featured].concat(np.filter((w) => w !== featured));
    const order = rule.slice(); pos.forEach((p, j) => { order[p] = newNp[j]; });
    return { order, featured, propensity: Math.round(propensity * 10000) / 10000, explored };
  }

  const dayOf = (now) => new Date(Number.isFinite(now) ? now : Date.now()).toISOString().slice(0, 10);
  function cleanRow(r) {
    if (!r || typeof r !== 'object' || !Array.isArray(r.rule_order) || !ID_RE.test(String(r.featured))) return null;
    const ro = r.rule_order.filter((x) => typeof x === 'string' && ID_RE.test(x)).slice(0, 80);
    const p = Number(r.propensity); if (!(p > 0 && p <= 1) || ro.indexOf(r.featured) < 0) return null;
    return { v: 1, day: /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : dayOf(), rule_order: ro, featured: r.featured, propensity: p, tap: r.tap === 1 ? 1 : 0 };
  }
  function cleanLog(log) { return (Array.isArray(log) ? log : []).map(cleanRow).filter(Boolean).slice(-MAX_ROWS); }
  function record(log, ruleOrder, choice, now) {
    const l = cleanLog(log); if (!choice || !choice.featured) return l;
    const r = cleanRow({ day: dayOf(now), rule_order: ruleOrder, featured: choice.featured, propensity: choice.propensity, tap: 0 });
    if (r) l.push(r); return l.slice(-MAX_ROWS);
  }
  /** a tap on the featured widget of the NEWEST row sets tap=1; taps on other widgets, or when there is no row, change nothing */
  function markTap(log, id) {
    const l = cleanLog(log); const last = l[l.length - 1];
    if (last && last.featured === id) last.tap = 1; return l;
  }
  const toJsonl = (log) => cleanLog(log).map((r) => JSON.stringify(r)).join('\n');
  const enabled = (s) => { try { return s.getItem(FLAG) === '1' && s.getItem(COUNTER_FLAG) === '1'; } catch (e) { return false; } };
  function loadLog(s) { try { return cleanLog(JSON.parse(s.getItem(LOG_KEY))); } catch (e) { return []; } }
  function saveLog(s, log) { try { s.setItem(LOG_KEY, JSON.stringify(cleanLog(log))); return true; } catch (e) { return false; } }

  return { VERSION: '1.0', LOG_KEY, FLAG, PINNED, MAX_ROWS, choose, record, markTap, cleanLog, toJsonl, enabled, loadLog, saveLog };
});
