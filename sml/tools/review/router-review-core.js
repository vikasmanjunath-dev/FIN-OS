/**
 * Pure logic of the BLIND router label review page (sml/tools/review/router_review.html): no DOM, no storage, no network.   (v1.0)
 * The reviewer sees ONLY the message text; the author's label and the routers' guesses are never in the file the page loads. Labels are only what the person clicks.
 *   parseJsonl(text) -> { rows, errors }      rows need item_id and text, and must NOT carry any label-like field (rejected: the file must stay blind)
 *   create(rows, saved) / setLabel / undo / next / prev / jump / progress / toJsonl / parseLabels / signature   (same shape as the claim page core)
 *   keyFor(intent) -> the one-key shortcut of an intent
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RouterReview = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const INTENTS = ['personal_spend_query', 'personal_money_summary', 'goal_status', 'calculator_request', 'regulation_question', 'concept_explainer', 'document_help', 'market_data', 'app_help', 'advice_seeking', 'evasion_request', 'smalltalk', 'out_of_scope'];
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'e', 's', 'o'];      // 1-9 for the first nine; a(dvice) e(vasion) s(malltalk) o(ut of scope) for the last four
  const LABELS = INTENTS.concat(['unsure']);
  const FORBIDDEN = ['label', 'intent', 'current_label', 'gold', 'router', 'pred', 'prediction', 'reason', 'confidence', 'conf', 'set'];

  const keyFor = (intent) => KEYS[INTENTS.indexOf(intent)] || null;
  const intentForKey = (k) => (k === 'u' ? 'unsure' : INTENTS[KEYS.indexOf(String(k).toLowerCase())] || null);

  function parseJsonl(text) {
    const rows = [], errors = []; const seen = new Set();
    String(text == null ? '' : text).split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      let r; try { r = JSON.parse(line); } catch (e) { errors.push({ line: i + 1, error: 'not JSON' }); return; }
      if (!r || typeof r !== 'object' || typeof r.item_id !== 'string' || !r.item_id || typeof r.text !== 'string' || !r.text.trim()) { errors.push({ line: i + 1, error: 'needs item_id and text' }); return; }
      const leak = Object.keys(r).filter((k) => FORBIDDEN.some((f) => k.toLowerCase().indexOf(f) >= 0));
      if (leak.length) { errors.push({ line: i + 1, error: 'file is not blind: has ' + leak.join(', ') }); return; }
      if (seen.has(r.item_id)) { errors.push({ line: i + 1, error: 'duplicate item_id ' + r.item_id }); return; }
      seen.add(r.item_id); rows.push({ item_id: r.item_id, text: r.text });
    });
    return { rows, errors };
  }
  function signature(rows) {
    let h = 0x811c9dc5; const s = rows.map((r) => r.item_id).join('|');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return rows.length + '-' + h.toString(16);
  }
  function firstUnlabelled(st, from) {
    for (let i = 0; i < st.rows.length; i++) { const j = (from + i) % st.rows.length; if (!st.labels[st.rows[j].item_id]) return j; }
    return Math.min(from, Math.max(0, st.rows.length - 1));
  }
  function create(rows, saved) {
    const ids = new Set(rows.map((r) => r.item_id)); const labels = {};
    if (saved && saved.labels && typeof saved.labels === 'object') Object.keys(saved.labels).forEach((k) => { if (ids.has(k) && LABELS.indexOf(saved.labels[k]) >= 0) labels[k] = saved.labels[k]; });
    const st = { rows, labels, history: [], cursor: 0 };
    const c = saved && Number.isInteger(saved.cursor) ? saved.cursor : -1;
    st.cursor = c >= 0 && c < rows.length ? c : firstUnlabelled(st, 0); return st;
  }
  function setLabel(st, id, label) {
    if (LABELS.indexOf(label) < 0 || !st.rows.some((r) => r.item_id === id)) return false;
    st.history.push({ id, prev: st.labels[id] || null }); st.labels[id] = label; return true;
  }
  function undo(st) {
    const h = st.history.pop(); if (!h) return false;
    if (h.prev) st.labels[h.id] = h.prev; else delete st.labels[h.id];
    const i = st.rows.findIndex((r) => r.item_id === h.id); if (i >= 0) st.cursor = i; return true;
  }
  const next = (st) => { st.cursor = firstUnlabelled(st, st.cursor + 1); return st.cursor; };
  const prev = (st) => { st.cursor = Math.max(0, st.cursor - 1); return st.cursor; };
  const jump = (st, i) => { if (Number.isInteger(i) && i >= 0 && i < st.rows.length) st.cursor = i; return st.cursor; };
  function progress(st) {
    const counts = {}; LABELS.forEach((l) => { counts[l] = 0; }); Object.keys(st.labels).forEach((k) => { counts[st.labels[k]] += 1; });
    const done = Object.keys(st.labels).length;
    return { total: st.rows.length, labelled: done, remaining: st.rows.length - done, unsure: counts.unsure, by_label: counts };
  }
  const toJsonl = (st) => st.rows.filter((r) => st.labels[r.item_id]).map((r) => JSON.stringify({ item_id: r.item_id, label: st.labels[r.item_id] })).join('\n');
  function parseLabels(text) {
    const labels = {}, errors = [];
    String(text == null ? '' : text).split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return; let r; try { r = JSON.parse(line); } catch (e) { errors.push(i + 1); return; }
      if (r && typeof r.item_id === 'string' && LABELS.indexOf(r.label) >= 0) labels[r.item_id] = r.label; else errors.push(i + 1);
    });
    return { labels, errors };
  }
  return { VERSION: '1.0', INTENTS, KEYS, LABELS, keyFor, intentForKey, parseJsonl, signature, create, setLabel, undo, next, prev, jump, progress, toJsonl, parseLabels };
});
