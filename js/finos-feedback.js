/**
 * FIN-OS feedback loop, built to be private by design.   (v1.0)
 *
 *   • Feedback and usage counts live ON THE DEVICE. The person can see, export and delete all of it.
 *   • Comments are redacted before they are even stored: amounts, numbers, emails, links and IDs never persist.
 *   • Nothing is ever sent unless (1) the person switched the matching consent on in Privacy & your data AND
 *     (2) an endpoint has been configured. The endpoint is null today, so nothing leaves the device.
 *   • Without an endpoint the person can download a report file and share it themselves; `summarize()` and
 *     scripts/summarize-feedback.js turn a pile of those files into counts the team can act on.
 *   • No user id, no device id, no timestamps finer than a day, no page query strings.
 *
 * Pure part (works in Node, unit-tested):
 *   FinosFeedback.redact(text)                          → text with amounts, numbers, emails, links and IDs removed
 *   FinosFeedback.sanitizeEvent(raw, now)               → { day, page, topic, rating, comment } | null
 *   FinosFeedback.cleanPath(path)                       → a plain path like "html/money-score.html", else "unknown"
 *   FinosFeedback.Usage.add(data, path, now)            → new usage object (keeps 90 days)
 *   FinosFeedback.buildReport({ feedback, usage, now, include })
 *   FinosFeedback.send(report, deps)                    → { ok, reason? }   deps: { consent(id), fetch, endpoint }
 *   FinosFeedback.summarize(reports)                    → counts for the team
 *
 * Browser part: FinosFeedback.Log, FinosFeedback.Usage.count(path), FinosFeedback.mountPrompt(el, opts),
 *   FinosFeedback.download(), FinosFeedback.configure({ endpoint }).
 * Storage keys: finos_feedback_log (last 50), finos_usage (last 90 days, only if the 'usage' consent is on).
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosFeedback = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const TOPICS = ['money-score', 'tax', 'calculators', 'arya', 'trackers', 'design', 'privacy', 'other'];
  const MAX_COMMENT = 500, MAX_LOG = 50, USAGE_DAYS = 90;
  const KEY_LOG = 'finos_feedback_log', KEY_USAGE = 'finos_usage';

  /** Where reports go. null on purpose: until a real inbox exists nothing is sent, whatever the consent says. */
  const CONFIG = { endpoint: null };

  const pad = (n) => String(n).padStart(2, '0');
  const dayOf = (d) => { d = d instanceof Date && !Number.isNaN(+d) ? d : new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

  /** Remove anything that could identify a person or reveal a figure. Applied before storing and again when building a report. */
  function redact(text) {
    let t = String(text == null ? '' : text);
    t = t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]');                                   // emails
    t = t.replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link]');                                    // links
    t = t.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[id]');                                           // PAN
    t = t.replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, '[id]');                                    // Aadhaar-style
    t = t.replace(/(?:₹|\brs\.?|\binr\b)\s*\d(?:[\d,.]*\d)?(?:\s*(?:lakhs?|lacs?|crores?|cr|k|l)\b)?/gi, '[amount]');   // ₹1,50,000 / Rs 5 lakh
    t = t.replace(/\b\d+(?:\.\d+)?\s*(?:lakhs?|lacs?|crores?|cr|k)\b/gi, '[amount]');           // 12 lakh, 5k
    t = t.replace(/\d[\d,.]*/g, (m) => {                                                        // any run holding 4+ digits, even glued to letters ("ref1234")
      const core = m.replace(/[,.]+$/, '');
      return core.replace(/\D/g, '').length >= 4 ? '[number]' + m.slice(core.length) : m;
    });
    return t.replace(/\s+/g, ' ').trim().slice(0, MAX_COMMENT);
  }

  /** A plain site path ("html/money-score.html"): no query, no hash, no host, no "..", nothing odd. Real calculator paths contain
      spaces, "&" and commas, so those are allowed. The site root counts as index.html. */
  function cleanPath(p) {
    if (p == null) return 'unknown';
    let s = String(p).split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
    try { s = decodeURIComponent(s); } catch (e) { return 'unknown'; }
    if (s === '') return 'index.html';
    s = s.replace(/^.*?\b(html|calculators)\//i, '$1/');                                        // drop any deployment prefix
    if (s.indexOf('..') !== -1) return 'unknown';
    if (!/^[a-z0-9][a-z0-9 \-_.,&/]{0,100}\.html$/i.test(s)) return 'unknown';
    s = s.toLowerCase();
    return /^(html|calculators)\//.test(s) || s === 'index.html' || s === 'login.html' ? s : 'unknown';              // only real site sections
  }

  function sanitizeEvent(raw, now) {
    if (!raw || typeof raw !== 'object') return null;
    const rating = raw.rating === 'up' || raw.rating === 'down' ? raw.rating : null;
    const comment = typeof raw.comment === 'string' ? redact(raw.comment) : '';
    if (!rating && !comment) return null;                                                       // nothing worth keeping
    return { day: dayOf(now), page: cleanPath(raw.page), topic: TOPICS.includes(raw.topic) ? raw.topic : 'other', rating, comment };
  }

  /* ── usage counters: how often each page opens, nothing about what was on it ───────────────────────── */
  const Usage = {
    /** Returns a new usage object with one more open for `path` today; older than 90 days is dropped. */
    add(data, path, now) {
      const today = dayOf(now);
      const days = Object.assign({}, data && data.days);
      const page = cleanPath(path);
      days[today] = Object.assign({}, days[today]);
      days[today][page] = (Number(days[today][page]) || 0) + 1;
      const keep = Object.keys(days).sort().slice(-USAGE_DAYS);
      return { v: 1, days: Object.fromEntries(keep.map((d) => [d, days[d]])) };
    },
    /** Total opens per page across all days. */
    totals(data) {
      const out = {};
      Object.values((data && data.days) || {}).forEach((d) => Object.entries(d || {}).forEach(([p, n]) => { out[p] = (out[p] || 0) + (Number(n) || 0); }));
      return out;
    },
  };

  /** include: { feedback: bool, usage: bool }. Everything is re-sanitised here, so nothing stored earlier can leak. */
  function buildReport(o) {
    o = o || {};
    const include = o.include || { feedback: true, usage: false };
    const feedback = include.feedback ? (Array.isArray(o.feedback) ? o.feedback : []).map((e) => sanitizeEvent(e, new Date(String((e && e.day) || '') + 'T12:00:00'))).filter(Boolean).slice(-MAX_LOG) : [];
    let usage = null;
    if (include.usage && o.usage && o.usage.days && typeof o.usage.days === 'object') {
      usage = { v: 1, days: {} };
      Object.keys(o.usage.days).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().slice(-USAGE_DAYS).forEach((d) => {
        const row = {};
        Object.entries(o.usage.days[d] || {}).forEach(([p, n]) => { const cp = cleanPath(p); if (cp !== 'unknown' && Number(n) > 0) row[cp] = (row[cp] || 0) + Math.min(Number(n), 100000); });
        if (Object.keys(row).length) usage.days[d] = row;
      });
    }
    return { app: 'FIN-OS', kind: 'feedback-report', v: 1, generatedAt: dayOf(o.now), feedback, usage };
  }

  /**
   * The only place anything could leave the device. Sends a section only if its consent is on, and only if an endpoint is set.
   * deps: { consent: (id) => bool, fetch, endpoint }.
   */
  async function send(report, deps) {
    deps = deps || {};
    const allowFeedback = !!(deps.consent && deps.consent('feedback'));
    const allowUsage = !!(deps.consent && deps.consent('usage'));
    const body = buildReport({ feedback: report && report.feedback, usage: report && report.usage, now: new Date(), include: { feedback: allowFeedback, usage: allowUsage } });
    if (!allowFeedback && !allowUsage) return { ok: false, reason: 'no-consent' };
    if (!body.feedback.length && !body.usage) return { ok: false, reason: 'nothing-to-send' };
    if (!deps.endpoint || !/^https:\/\//i.test(String(deps.endpoint))) return { ok: false, reason: 'no-endpoint' };
    if (typeof deps.fetch !== 'function') return { ok: false, reason: 'no-network' };
    try {
      const res = await deps.fetch(deps.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true });
      return res && res.ok ? { ok: true } : { ok: false, reason: 'rejected' };
    } catch (e) { return { ok: false, reason: 'network' }; }
  }

  /** Team-side: turn any number of exported reports into counts. Malformed reports are skipped, never trusted. */
  function summarize(reports) {
    const out = { reports: 0, skipped: 0, feedback: { total: 0, up: 0, down: 0, byTopic: {}, byPage: {} }, comments: [], usage: { byPage: {}, days: 0 } };
    const seenComments = new Set(), usageDays = new Set();
    (Array.isArray(reports) ? reports : []).forEach((r) => {
      if (!r || r.app !== 'FIN-OS' || r.kind !== 'feedback-report' || r.v !== 1 || !Array.isArray(r.feedback)) { out.skipped++; return; }
      out.reports++;
      r.feedback.map((e) => sanitizeEvent(e, new Date(String((e && e.day) || '') + 'T12:00:00'))).filter(Boolean).forEach((e) => {
        out.feedback.total++;
        if (e.rating === 'up') out.feedback.up++;
        if (e.rating === 'down') out.feedback.down++;
        const t = (out.feedback.byTopic[e.topic] = out.feedback.byTopic[e.topic] || { up: 0, down: 0, comments: 0 });
        if (e.rating) t[e.rating]++;
        out.feedback.byPage[e.page] = (out.feedback.byPage[e.page] || 0) + 1;
        if (e.comment) {
          t.comments++;
          const k = e.topic + '|' + e.comment;
          if (!seenComments.has(k)) { seenComments.add(k); out.comments.push({ day: e.day, topic: e.topic, rating: e.rating, page: e.page, comment: e.comment }); }
        }
      });
      if (r.usage && r.usage.days) {
        Object.entries(r.usage.days).forEach(([d, row]) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
          usageDays.add(d);
          Object.entries(row || {}).forEach(([p, n]) => { const cp = cleanPath(p); if (cp !== 'unknown' && Number(n) > 0) out.usage.byPage[cp] = (out.usage.byPage[cp] || 0) + Math.min(Number(n), 100000); });
        });
      }
    });
    out.usage.days = usageDays.size;
    out.comments.sort((a, b) => (a.day < b.day ? 1 : -1));
    return out;
  }

  const api = { TOPICS, MAX_COMMENT, MAX_LOG, USAGE_DAYS, CONFIG, redact, cleanPath, sanitizeEvent, Usage, buildReport, send, summarize, dayOf };
  if (typeof root.document === 'undefined') return api;

  /* ═════════════════════ browser part ═════════════════════ */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rd = (k, fb) => { try { const v = JSON.parse(root.localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } };
  const wr = (k, v) => { try { root.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const consent = (id) => !!(root.FinosPrivacy && root.FinosPrivacy.consent && root.FinosPrivacy.consent.get(id));

  const Log = {
    list() { const l = rd(KEY_LOG, []); return Array.isArray(l) ? l.filter((e) => e && typeof e === 'object') : []; },
    add(raw) { const e = sanitizeEvent(raw, new Date()); if (!e) return null; const l = Log.list().concat(e).slice(-MAX_LOG); return wr(KEY_LOG, l) ? e : null; },
    remove(i) { const l = Log.list(); if (i < 0 || i >= l.length) return false; l.splice(i, 1); return wr(KEY_LOG, l); },
    clear() { return wr(KEY_LOG, []); },
  };

  /** Counts a page open, but only for people who switched the 'usage' consent on. */
  Usage.count = function (path) {
    if (!consent('usage')) return false;
    return wr(KEY_USAGE, Usage.add(rd(KEY_USAGE, { days: {} }), path || root.location.pathname, new Date()));
  };
  Usage.get = () => rd(KEY_USAGE, { v: 1, days: {} });
  Usage.clear = () => wr(KEY_USAGE, { v: 1, days: {} });

  function report() { return buildReport({ feedback: Log.list(), usage: Usage.get(), now: new Date(), include: { feedback: true, usage: true } }); }

  function download() {
    const blob = new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' });
    const a = root.document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'finos-feedback-' + dayOf(new Date()) + '.json';
    root.document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function configure(o) { CONFIG.endpoint = o && /^https:\/\//i.test(String(o.endpoint || '')) ? String(o.endpoint) : null; return CONFIG.endpoint; }

  async function shareLatest() {
    return send(buildReport({ feedback: Log.list().slice(-1), usage: null, now: new Date(), include: { feedback: true, usage: false } }),
      { consent, fetch: root.fetch && root.fetch.bind(root), endpoint: CONFIG.endpoint });
  }

  const OUTCOME = {
    ok: 'Sent. Thank you.',
    'no-consent': 'Saved on this device. Nothing was sent. If you would like to share feedback with the team, turn that on in Privacy & your data.',
    'no-endpoint': 'Saved on this device. Nothing was sent, because the team has not set up an inbox yet. You can download your feedback as a file from the Feedback page.',
    network: 'Saved on this device. Sending did not work, so nothing left your device.',
    rejected: 'Saved on this device. The team\'s inbox did not accept it, so nothing was kept there.',
    other: 'Saved on this device. Nothing was sent.',
  };

  /* English templates, translated from js/i18n/hi.js when the person uses Hindi (no entry means the English shows). */
  const lang = () => (root.FinosI18n && root.FinosI18n.lang && root.FinosI18n.lang()) || 'en';
  function tr(key, params) {
    const raw = lang() === 'en' || !root.FinosI18n || !root.FinosI18n.t ? key : root.FinosI18n.t(key, key);
    return String(raw).replace(/\{(\w+)\}/g, (_, k) => (params && params[k] != null ? String(params[k]) : ''));
  }

  /* Styles live here so every page that shows the prompt looks the same without editing each page's CSS. Tokens only. */
  function ensureStyles() {
    if (root.document.getElementById('finos-fb-style')) return;
    const st = root.document.createElement('style');
    st.id = 'finos-fb-style';
    st.textContent = '.fb-card{padding:16px 18px;border-radius:16px;background:var(--bg-surface);border:1px solid var(--border-soft);color:var(--text-secondary);font-size:13px;line-height:1.6}' +
      '.fb-q{margin:0 0 10px;font-size:15px;font-weight:700;color:var(--text-primary)}.fb-rate{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}' +
      '.fb-btn{padding:9px 14px;border-radius:12px;border:1px solid var(--border-soft);background:transparent;color:var(--text-primary);font:inherit;font-weight:700;cursor:pointer}' +
      '.fb-btn[aria-pressed=true]{background:#3560E0;border-color:#3560E0;color:#fff}.fb-save{margin-top:10px;background:var(--bg-surface)}' +
      '.fb-btn:focus-visible,.fb-t:focus-visible{outline:2px solid #4F7CFF;outline-offset:2px}.fb-l{display:block;margin:6px 0;font-weight:600;color:var(--text-primary)}' +
      '.fb-l small{display:block;font-weight:500;color:var(--text-muted)}.fb-t{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid var(--border-soft);background:rgba(255,255,255,.05);color:var(--text-primary);font:inherit;resize:vertical}' +
      '[data-theme=light] .fb-t{background:#fff}.fb-out{min-height:20px;margin:10px 0 0;font-size:12px;color:var(--text-secondary)}';
    root.document.head.appendChild(st);
  }

  /** A small "Was this useful?" card. opts: { topic (or a function returning it), question, page }. */
  function mountPrompt(el, opts) {
    if (!el) return;
    opts = opts || {};
    ensureStyles();
    const uid = 'fb' + Math.random().toString(36).slice(2, 8);
    let rating = null;
    el.innerHTML = '<div class="fb-card" role="group" aria-labelledby="' + uid + '-q"><p class="fb-q" id="' + uid + '-q">' + esc(opts.question || tr('Was this useful?')) + '</p>' +
      '<div class="fb-rate"><button type="button" class="fb-btn" data-r="up" aria-pressed="false">' + esc(tr('👍 Yes')) + '</button><button type="button" class="fb-btn" data-r="down" aria-pressed="false">' + esc(tr('👎 Not really')) + '</button></div>' +
      '<label class="fb-l" for="' + uid + '-c">' + esc(tr('Anything to add?')) + ' <small>' + esc(tr('Please leave out amounts and personal details. We remove them anyway.')) + '</small></label>' +
      '<textarea id="' + uid + '-c" class="fb-t" maxlength="' + MAX_COMMENT + '" rows="3"></textarea>' +
      '<button type="button" class="fb-btn fb-save" data-save>' + esc(tr('Save feedback')) + '</button><p class="fb-out" role="status" aria-live="polite"></p></div>';
    const out = el.querySelector('.fb-out');
    el.addEventListener('click', async (e) => {
      const b = e.target.closest && e.target.closest('button'); if (!b) return;
      if (b.dataset.r) {
        rating = rating === b.dataset.r ? null : b.dataset.r;
        el.querySelectorAll('[data-r]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.r === rating)));
      } else if (b.hasAttribute('data-save')) {
        const saved = Log.add({ rating, comment: el.querySelector('.fb-t').value, topic: typeof opts.topic === 'function' ? opts.topic() : opts.topic, page: opts.page || root.location.pathname });
        if (!saved) { out.textContent = rating || el.querySelector('.fb-t').value.trim() ? tr('Could not save that on this device.') : tr('Pick Yes or Not really, or write a line, then save.'); return; }
        root.document.dispatchEvent(new root.CustomEvent('finos-feedback-saved'));
        const res = await shareLatest();
        out.textContent = tr(res.ok ? OUTCOME.ok : (OUTCOME[res.reason] || OUTCOME.other));
        el.querySelector('.fb-t').value = ''; rating = null;
        el.querySelectorAll('[data-r]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      }
    });
  }

  return Object.assign(api, { Log, report, download, configure, mountPrompt, shareLatest, OUTCOME });
});
