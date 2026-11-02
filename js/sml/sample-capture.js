/**
 * SmlSampleCapture — OPT-IN, DEVICE-LOCAL capture of a few redacted messages so the founder can review the router on real text (ROADMAP K1 / decision N1).   (v1.0)
 *
 * The one exception to "counters never hold text", and only because the founder asked for it (2026-10-26). Rules, all enforced in code and tests:
 *   - OFF unless localStorage finos_sml_samples === '1' AND the router shadow flag is on; nothing is ever sent anywhere (no network code in this file);
 *   - at most MAX (100) rows, oldest dropped first; each row at most 300 characters; day only, no clock time;
 *   - every message is REDACTED before it is stored (see redact()): phone / card / account digits, e-mail, UPI handle, PAN, Aadhaar-like groups, any long digit run
 *     (including Devanagari digits), money amounts. Names cannot be detected: the founder previews the list and deletes what should not be there;
 *   - the founder can list, delete one, clear all, and export as JSON lines by hand (AryaSidebar.smlSamples / smlSamplesRemove / smlSamplesClear / smlSamplesExport).
 * Row: { id, day, text, pred, guard, regex }  (pred = router intent, guard = router needs_guard, regex = regex guard flagged)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlSampleCapture = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'finos_sml_samples_data';
  const FLAG = 'finos_sml_samples';
  const MAX = 100, MAXLEN = 300;
  const INTENT_RE = /^[a-z_]{1,40}$/;
  // Unicode decimal digits (ASCII, Devanagari, Arabic-Indic ...): \p{Nd}
  const D = '\\p{Nd}';
  const RULES = [
    [/[\w.+-]+@[\w-]+\.[\w.-]+/gu, '[EMAIL]'],                                                   // e-mail
    [/\b[\w.\-]{2,}@[a-z]{2,}\b/giu, '[UPI]'],                                                   // UPI handle  name@bank
    [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[PAN]'],                                                     // PAN
    [new RegExp(`(?:${D}[\\s\\-.]?){9,}${D}`, 'gu'), '[NUM]'],                                   // 10+ digits even when spaced or dashed (phone, card, account, Aadhaar)
    [new RegExp(`(?:₹|rs\\.?|inr)\\s*[${'\\d'}${D},.]+(?:\\s*(?:lakh|lac|crore|cr|k|l|thousand|hazaar))?`, 'giu'), '[AMT]'], // ₹ 5,000  Rs.2 lakh
    [new RegExp(`\\b${D}[${D},.]*\\s*(?:lakh|lac|lakhs|crore|crores|cr|hazaar|thousand)\\b`, 'giu'), '[AMT]'],  // 5 lakh, 2.5 crore, 25 hazaar
    [new RegExp(`${D}{5,}`, 'gu'), '[NUM]'],                                                     // any other run of 5+ digits
  ];

  /** Redact one message. Always returns text (never throws); `changed` tells whether anything was masked. */
  function redact(text) {
    let t = String(text == null ? '' : text);
    const orig = t;
    for (const [rx, rep] of RULES) t = t.replace(rx, rep);
    t = t.replace(/\s+/g, ' ').trim();
    if (t.length > MAXLEN) t = t.slice(0, MAXLEN) + '…';
    return { text: t, changed: t !== orig.replace(/\s+/g, ' ').trim() };
  }

  const dayOf = (now) => { const d = new Date(Number.isFinite(now) ? now : Date.now()); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const cleanRow = (r) => {
    if (!r || typeof r !== 'object' || typeof r.text !== 'string') return null;
    return { id: Number.isInteger(r.id) && r.id >= 0 ? r.id : 0, day: /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : '', text: redact(r.text).text,
      pred: typeof r.pred === 'string' && INTENT_RE.test(r.pred) ? r.pred : '', guard: !!r.guard, regex: !!r.regex };
  };

  /** One capped, opt-in store of redacted rows under its own storage key and flag. The founder's own store (K1) and the user-facing "flagged examples" store (C-feedback) are two instances. */
  function makeStore(cfg) {
    const key = cfg.key, flag = cfg.flag, max = cfg.max;
    function list(storage) {
      try { const v = JSON.parse(storage.getItem(key)); return Array.isArray(v) ? v.map(cleanRow).filter(Boolean).slice(-max) : []; } catch (e) { return []; }
    }
    function save(storage, rows) { try { storage.setItem(key, JSON.stringify(rows.slice(-max))); return true; } catch (e) { return false; } }
    /** Redact and keep one message (+ the router's verdict). Returns the stored row, or null when capture is off or the text is empty. */
    function add(storage, rawText, meta, now) {
      try { if (storage.getItem(flag) !== '1') return null; } catch (e) { return null; }
      const r = redact(rawText); if (!r.text) return null;
      const rows = list(storage); const id = rows.length ? Math.max.apply(null, rows.map((x) => x.id)) + 1 : 1;
      const m = meta && typeof meta === 'object' ? meta : {};
      const row = { id, day: dayOf(now), text: r.text, pred: typeof m.pred === 'string' && INTENT_RE.test(m.pred) ? m.pred : '', guard: !!m.guard, regex: !!m.regex };
      rows.push(row); save(storage, rows); return row;
    }
    function remove(storage, id) { const rows = list(storage); const k = rows.filter((x) => x.id !== id); save(storage, k); return rows.length - k.length; }
    function clear(storage) { try { storage.removeItem(key); return true; } catch (e) { return false; } }
    function enabled(storage) { try { return storage.getItem(flag) === '1'; } catch (e) { return false; } }
    return { KEY: key, FLAG: flag, MAX: max, list, add, remove, clear, enabled };
  }
  const own = makeStore({ key: KEY, flag: FLAG, max: MAX });
  /** JSON lines, one row per line, label column empty (to be filled by a reviewer) */
  function exportJsonl(storage) { return own.list(storage).map((r) => JSON.stringify({ text: r.text, intent: '', router_pred: r.pred, router_guard: r.guard, regex_guard: r.regex, day: r.day })).join('\n'); }

  /* User-facing, consent-based "flagged examples": only messages the router flagged (needs_guard), at most 50, kept on the device until the person deletes them or
     downloads a file to send themselves. The person's own consent flag is finos_sml_flagged. Nothing here sends anything. */
  const flagged = makeStore({ key: 'finos_sml_flagged_data', flag: 'finos_sml_flagged', max: 50 });
  /** The file a person can send to the founder: a header (schema, day, what it is) and the redacted rows. No ids, no clock times, no device or account identifiers. */
  function flaggedFile(storage, now) {
    return { schema: 'finos-flagged-examples/1', exported_day: dayOf(now), note: 'Redacted copies of questions the on-device classifier flagged. Created by the person and sent by hand; nothing was sent automatically.',
      rows: flagged.list(storage).map((r) => ({ text: r.text, router_pred: r.pred, router_guard: r.guard, regex_guard: r.regex, day: r.day })) };
  }

  return { VERSION: '1.1', KEY, FLAG, MAX, MAXLEN, redact, list: own.list, add: own.add, remove: own.remove, clear: own.clear, exportJsonl, enabled: own.enabled, flagged, flaggedFile };
});
