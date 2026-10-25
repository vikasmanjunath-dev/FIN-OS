/**
 * SmlPulseCounters — local-only impression / tap counters for the PULSE widgets (sml/PLAN.md W6 groundwork).   (v1.0)
 *
 * Input for a FUTURE learned ranker; nothing reads these counters to change the PULSE order today. Default OFF
 * (localStorage finos_pulse_counters_on === '1'). PRIVACY BY CONSTRUCTION: only widget ids that look like /^[A-Za-z][A-Za-z0-9]{0,39}$/
 * become keys, only whitelisted numeric fields are kept, nothing is ever sent anywhere (no network flow), no text,
 * no amounts, no timestamps per event (only the `since` of the whole counter set).
 *
 * Stats: {since, renders, widgets:{id:{imp, tap, pos_sum, top_imp, top_tap}}}
 *   imp = times the widget was drawn, pos_sum/imp = average position (0 = first), top_* = while in the first TOP positions.
 *   recordRender(stats, order[]) → stats      one PULSE render, `order` = widget ids best-first
 *   recordTap(stats, id, pos)    → stats      a click inside a widget at position `pos`
 *   summary(stats)               → one-line string
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlPulseCounters = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'finos_pulse_counters';
  const FLAG = 'finos_pulse_counters';
  const ID_RE = /^[A-Za-z][A-Za-z0-9]{0,39}$/;
  const MAX_WIDGETS = 60;
  const TOP = 3;
  const FIELDS = ['imp', 'tap', 'pos_sum', 'top_imp', 'top_tap'];

  function num(v) { return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0; }
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);   // ids like "constructor" must not resolve to inherited members
  function emptyStats(now) { return { since: Number.isFinite(now) ? now : Date.now(), renders: 0, widgets: {} }; }

  /** Rebuild from untrusted input: only known numeric fields under valid ids survive. */
  function clean(s) {
    const o = emptyStats(s && s.since);
    if (!s || typeof s !== 'object') return o;
    o.renders = num(s.renders);
    if (s.widgets && typeof s.widgets === 'object') {
      Object.keys(s.widgets).filter((k) => ID_RE.test(k)).slice(0, MAX_WIDGETS).forEach((k) => {
        const w = s.widgets[k] && typeof s.widgets[k] === 'object' ? s.widgets[k] : {}; const c = {};
        FIELDS.forEach((f) => { c[f] = num(w[f]); });
        o.widgets[k] = c;
      });
    }
    return o;
  }
  function slot(o, id) {
    if (typeof id !== 'string' || !ID_RE.test(id)) return null;
    if (!has(o.widgets, id)) {
      if (Object.keys(o.widgets).length >= MAX_WIDGETS) return null;
      o.widgets[id] = { imp: 0, tap: 0, pos_sum: 0, top_imp: 0, top_tap: 0 };
    }
    return o.widgets[id];
  }

  function recordRender(stats, order) {
    const o = clean(stats);
    if (!Array.isArray(order)) return o;
    o.renders += 1;
    order.forEach((id, pos) => {
      const w = slot(o, id); if (!w) return;
      w.imp += 1; w.pos_sum += pos; if (pos < TOP) w.top_imp += 1;
    });
    return o;
  }
  function recordTap(stats, id, pos) {
    const o = clean(stats);
    const w = slot(o, id); if (!w) return o;
    w.tap += 1; if (Number.isFinite(pos) && pos >= 0 && pos < TOP) w.top_tap += 1;
    return o;
  }

  function summary(stats) {
    const s = clean(stats);
    const ids = Object.keys(s.widgets);
    if (!s.renders) return 'PULSE counters: no renders yet';
    const taps = ids.reduce((a, k) => a + s.widgets[k].tap, 0);
    const best = ids.filter((k) => s.widgets[k].imp >= 3 && s.widgets[k].tap > 0)
      .sort((a, b) => s.widgets[b].tap / s.widgets[b].imp - s.widgets[a].tap / s.widgets[a].imp).slice(0, 3)
      .map((k) => k + ' ' + s.widgets[k].tap + '/' + s.widgets[k].imp);
    return 'PULSE counters: ' + s.renders + ' renders, ' + taps + ' taps' + (best.length ? ' | most tapped per view: ' + best.join(', ') : '');
  }

  function enabled(storage) { try { return storage.getItem(FLAG + '_on') === '1'; } catch (e) { return false; } }
  function loadStats(storage) { try { return clean(JSON.parse(storage.getItem(KEY))); } catch (e) { return emptyStats(Date.now()); } }
  function saveStats(storage, stats) { try { storage.setItem(KEY, JSON.stringify(clean(stats))); return true; } catch (e) { return false; } }

  return { VERSION: '1.0', KEY, FLAG_KEY: FLAG + '_on', TOP, emptyStats, recordRender, recordTap, summary, enabled, loadStats, saveStats };
});
