/**
 * Pure logic of the claim-labelling page (sml/tools/claims/label_claims.html): no DOM, no storage, no network. Node-testable.   (v1.0)
 * Labels are ONLY what the person clicks: nothing is ever pre-filled, guessed or imported from another labeller.
 *   parseJsonl(text) -> { rows, errors }              rows must have claim_id, claim (non-empty), evidence (array)
 *   signature(rows)  -> short string identifying the pool (a saved session belongs to one pool)
 *   create(rows, saved) -> state                      saved = { labels, cursor } from an earlier session (ignored entries for unknown claim_ids are dropped)
 *   setLabel(state, claim_id, label) / clearLabel / undo(state) / next(state) / prev(state) / jump(state, i)
 *   progress(state, opts) -> counts, label mix, progress toward the gate (300 labelled, 100 not supported)
 *   toJsonl(state) / parseLabels(text)                {"claim_id","label"} lines, label in supported | not_supported | unsure
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClaimLabeling = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LABELS = ['supported', 'not_supported', 'unsure'];
  const GATE = { labelled: 300, not_supported: 100 };

  function parseJsonl(text) {
    const rows = [], errors = []; const seen = new Set();
    String(text == null ? '' : text).split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return;
      let r; try { r = JSON.parse(line); } catch (e) { errors.push({ line: i + 1, error: 'not JSON' }); return; }
      if (!r || typeof r !== 'object' || typeof r.claim_id !== 'string' || !r.claim_id || typeof r.claim !== 'string' || !r.claim.trim() || !Array.isArray(r.evidence)) { errors.push({ line: i + 1, error: 'needs claim_id, claim and evidence[]' }); return; }
      if (seen.has(r.claim_id)) { errors.push({ line: i + 1, error: 'duplicate claim_id ' + r.claim_id }); return; }
      seen.add(r.claim_id); rows.push(r);
    });
    return { rows, errors };
  }

  function signature(rows) {                       // FNV-1a over the ids: cheap, stable, enough to keep sessions of different pools apart
    let h = 0x811c9dc5; const s = rows.map((r) => r.claim_id).join('|');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return rows.length + '-' + h.toString(16);
  }

  function create(rows, saved) {
    const ids = new Set(rows.map((r) => r.claim_id)); const labels = {};
    if (saved && saved.labels && typeof saved.labels === 'object') Object.keys(saved.labels).forEach((k) => { if (ids.has(k) && LABELS.indexOf(saved.labels[k]) >= 0) labels[k] = saved.labels[k]; });
    const st = { rows, labels, history: [], cursor: 0 };
    const c = saved && Number.isInteger(saved.cursor) ? saved.cursor : -1;
    st.cursor = c >= 0 && c < rows.length ? c : firstUnlabelled(st, 0);
    return st;
  }
  function firstUnlabelled(st, from) {
    for (let i = 0; i < st.rows.length; i++) { const j = (from + i) % st.rows.length; if (!st.labels[st.rows[j].claim_id]) return j; }
    return Math.min(from, Math.max(0, st.rows.length - 1));
  }
  function setLabel(st, id, label) {
    if (LABELS.indexOf(label) < 0 || !st.rows.some((r) => r.claim_id === id)) return false;
    st.history.push({ id, prev: st.labels[id] || null }); st.labels[id] = label; return true;
  }
  function clearLabel(st, id) { if (st.labels[id]) { st.history.push({ id, prev: st.labels[id] }); delete st.labels[id]; return true; } return false; }
  function undo(st) {
    const h = st.history.pop(); if (!h) return false;
    if (h.prev) st.labels[h.id] = h.prev; else delete st.labels[h.id];
    const i = st.rows.findIndex((r) => r.claim_id === h.id); if (i >= 0) st.cursor = i; return true;
  }
  const next = (st) => { st.cursor = firstUnlabelled(st, st.cursor + 1); return st.cursor; };
  const prev = (st) => { st.cursor = Math.max(0, st.cursor - 1); return st.cursor; };
  const jump = (st, i) => { if (Number.isInteger(i) && i >= 0 && i < st.rows.length) st.cursor = i; return st.cursor; };

  function progress(st, opts) {
    const g = Object.assign({}, GATE, opts || {}); const m = { supported: 0, not_supported: 0, unsure: 0 };
    Object.keys(st.labels).forEach((k) => { m[st.labels[k]] += 1; });
    const decided = m.supported + m.not_supported;
    return { total: st.rows.length, labelled: decided + m.unsure, decided, mix: m, remaining: st.rows.length - decided - m.unsure,
      gate: { labelled_target: g.labelled, decided_toward_target: Math.min(decided, g.labelled), not_supported_target: g.not_supported, not_supported_toward_target: Math.min(m.not_supported, g.not_supported),
        met: decided >= g.labelled && m.not_supported >= g.not_supported } };
  }

  function toJsonl(st) { return st.rows.filter((r) => st.labels[r.claim_id]).map((r) => JSON.stringify({ claim_id: r.claim_id, label: st.labels[r.claim_id] })).join('\n'); }
  function parseLabels(text) {
    const labels = {}, errors = [];
    String(text == null ? '' : text).split(/\r?\n/).forEach((line, i) => {
      if (!line.trim()) return; let r; try { r = JSON.parse(line); } catch (e) { errors.push(i + 1); return; }
      if (r && typeof r.claim_id === 'string' && LABELS.indexOf(r.label) >= 0) labels[r.claim_id] = r.label; else errors.push(i + 1);
    });
    return { labels, errors };
  }

  return { VERSION: '1.0', LABELS, GATE, parseJsonl, signature, create, setLabel, clearLabel, undo, next, prev, jump, progress, toJsonl, parseLabels };
});
