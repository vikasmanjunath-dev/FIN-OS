/**
 * SmlRouterShadow — counters for the SML router running in SHADOW mode (sml/PLAN.md W1).   (v1.0)
 *
 * The router's decision never changes an answer; this only counts how often it agrees with the regex guardrails
 * (AryaGuardrails). PRIVACY BY CONSTRUCTION: record() copies only whitelisted fields from the decision (an intent
 * name that matches /^[a-z_]{1,40}$/, a risk class, a needs_guard boolean) into numeric counters. No message text can
 * be stored, even if the decision object carries extra fields.
 *
 * Stats: {since, total, by_intent:{}, by_risk:{low,high}, router_guard, regex_guard, agree_both, router_only, regex_only, errors, by_version:{}}
 *   record(stats, decision, regexFlagged) → new stats (decision null/invalid → errors+1)
 *   summary(stats) → one-line string for the founder
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlRouterShadow = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'finos_sml_router_stats';
  const INTENT_RE = /^[a-z_]{1,40}$/;
  const MAX_INTENTS = 30;
  const VERSION_RE = /^[0-9]{1,2}\.[0-9]{1,2}\.[0-9]{1,3}$/;   // router_version such as 0.4.1; anything else is ignored
  const MAX_VERSIONS = 5;

  function emptyStats(now) {
    return { since: Number.isFinite(now) ? now : Date.now(), total: 0, by_intent: {}, by_risk: { low: 0, high: 0 },
      router_guard: 0, regex_guard: 0, agree_both: 0, router_only: 0, regex_only: 0, errors: 0, by_version: {} };
  }

  function num(v) { return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0; }
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const validIntent = (k) => typeof k === 'string' && INTENT_RE.test(k) && k !== '__proto__';
  const own = (o, k) => (has(o, k) ? o[k] : 0);   // an intent named "constructor" must not resolve to an inherited member

  /** Rebuild from untrusted input: only the known numeric fields survive, so nothing else can ever be kept. */
  function clean(s) {
    const o = emptyStats(s && s.since);
    if (!s || typeof s !== 'object') return o;
    ['total', 'router_guard', 'regex_guard', 'agree_both', 'router_only', 'regex_only', 'errors'].forEach((k) => { o[k] = num(s[k]); });
    if (s.by_risk && typeof s.by_risk === 'object') { o.by_risk.low = num(s.by_risk.low); o.by_risk.high = num(s.by_risk.high); }
    if (s.by_intent && typeof s.by_intent === 'object') {
      Object.keys(s.by_intent).filter(validIntent).slice(0, MAX_INTENTS).forEach((k) => { o.by_intent[k] = num(s.by_intent[k]); });
    }
    if (s.by_version && typeof s.by_version === 'object') {
      Object.keys(s.by_version).filter((k) => VERSION_RE.test(k)).slice(0, MAX_VERSIONS).forEach((k) => { o.by_version[k] = num(s.by_version[k]); });
    }
    return o;
  }

  function record(stats, decision, regexFlagged) {
    const o = clean(stats);
    if (!decision || typeof decision !== 'object' || !validIntent(decision.intent)) {
      o.errors += 1;
      return o;
    }
    const rg = !!decision.needs_guard, xg = !!regexFlagged;
    o.total += 1;
    if (has(o.by_intent, decision.intent) || Object.keys(o.by_intent).length < MAX_INTENTS) {
      o.by_intent[decision.intent] = own(o.by_intent, decision.intent) + 1;
    }
    o.by_risk[decision.risk === 'high' ? 'high' : 'low'] += 1;
    if (typeof decision.router_version === 'string' && VERSION_RE.test(decision.router_version) &&
        (has(o.by_version, decision.router_version) || Object.keys(o.by_version).length < MAX_VERSIONS)) {
      o.by_version[decision.router_version] = own(o.by_version, decision.router_version) + 1;
    }
    if (rg) o.router_guard += 1;
    if (xg) o.regex_guard += 1;
    if (rg && xg) o.agree_both += 1; else if (rg) o.router_only += 1; else if (xg) o.regex_only += 1;
    return o;
  }

  function summary(stats) {
    const s = clean(stats);
    if (!s.total) return 'Router shadow: no messages yet' + (s.errors ? ' (' + s.errors + ' errors)' : '');
    const pct = (n) => (100 * n / s.total).toFixed(1) + '%';
    return 'Router shadow: ' + s.total + ' msgs | router guard ' + pct(s.router_guard) + ' | regex guard ' + pct(s.regex_guard) +
      ' | both ' + s.agree_both + ', router-only ' + s.router_only + ', regex-only ' + s.regex_only + ' | errors ' + s.errors +
      (Object.keys(s.by_version).length ? ' | router ' + Object.keys(s.by_version).map((k) => k + ' x' + s.by_version[k]).join(', ') : '');
  }

  function loadStats(storage) {
    try { return clean(JSON.parse(storage.getItem(KEY))); } catch (e) { return emptyStats(Date.now()); }
  }
  function saveStats(storage, stats) {
    try { storage.setItem(KEY, JSON.stringify(clean(stats))); return true; } catch (e) { return false; }
  }

  return { VERSION: '1.0', KEY, emptyStats, record, summary, loadStats, saveStats };
});
