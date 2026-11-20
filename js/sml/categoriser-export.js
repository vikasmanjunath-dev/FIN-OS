/**
 * SmlCategoriserExport — OPT-IN, DEVICE-LOCAL export of redacted, labelled transaction rows for the categoriser (ROADMAP I2, decision F1).   (v1.0)
 *
 * Builds rows in the format of sml/categoriser/SPEC.md from the person's OWN transaction list. Nothing is sent anywhere (no network code); the person previews the
 * rows, deletes what should not leave, and passes the file on by hand. Off unless localStorage finos_sml_rows === '1'.
 *
 * Row: { description, amount_bucket, direction, channel, category, source }
 *  - description: redacted (sml/sample-capture.js redact(): e-mail, UPI handle, PAN, long digit runs, money amounts) and every remaining digit run of 3-4 becomes '#'
 *    (merchant order numbers; longer ones are already [NUM]); names cannot be detected, hence the preview;
 *  - amount_bucket: <100 | 100-500 | 500-2000 | 2000-10000 | 10000+ (never the exact amount); NO date, NO id;
 *  - category: the person's OWN category, only when the stored `category` is exactly one of the 13 app categories (a rule-derived or imported label is NOT "own" and is skipped);
 *  - source: a label the person gives (default "founder"), used to keep people apart in train/test.
 */
(function (root, factory) {
  const dep = (typeof module !== 'undefined' && module.exports) ? require('./sample-capture.js') : root.SmlSampleCapture;
  const api = factory(dep);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlCategoriserExport = api;
})(typeof self !== 'undefined' ? self : this, function (Capture) {
  'use strict';
  const FLAG = 'finos_sml_rows';
  const CATEGORIES = ['Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Bills & Utilities', 'Housing', 'EMI & Loans', 'Subscriptions', 'Health', 'Entertainment', 'Education', 'Travel', 'Other'];
  const CHANNELS = ['upi', 'card', 'netbanking', 'cash'];

  function bucket(amount) {
    const a = Math.abs(Number(amount));
    if (!Number.isFinite(a) || a <= 0) return null;
    return a < 100 ? '<100' : a < 500 ? '100-500' : a < 2000 ? '500-2000' : a < 10000 ? '2000-10000' : '10000+';
  }
  function describe(raw) {
    const t = [raw.description, raw.desc, raw.label].find((x) => typeof x === 'string' && x.trim());
    if (!t) return '';
    const r = (Capture ? Capture.redact(t).text : t.replace(/\d{5,}/g, '[NUM]')).replace(/\p{Nd}{3,}/gu, '#').replace(/\s+/g, ' ').trim();
    return r.slice(0, 80);
  }
  function channelOf(raw) {
    const c = String(raw.channel || raw.mode || raw.method || '').toLowerCase();
    return CHANNELS.find((k) => c.includes(k)) || 'other';
  }
  /** rawList: the stored transaction objects. Returns { rows, skipped: {reason: count} } */
  function buildRows(rawList, opts) {
    const source = opts && typeof opts.source === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(opts.source) ? opts.source : 'founder';
    const rows = [], skipped = {};
    const skip = (k) => { skipped[k] = (skipped[k] || 0) + 1; };
    (Array.isArray(rawList) ? rawList : []).forEach((raw) => {
      if (!raw || typeof raw !== 'object') return skip('not_an_object');
      const type = String(raw.type || '').toLowerCase();
      if (/^(transfer|income|credit)$/.test(type) || raw.isTransfer === true) return skip('not_an_expense');
      const cat = typeof raw.category === 'string' ? raw.category.trim() : '';
      if (!CATEGORIES.includes(cat)) return skip('category_not_one_of_the_13');
      const b = bucket(raw.amount); if (!b) return skip('bad_amount');
      const d = describe(raw); if (!d || d === '#') return skip('no_usable_description');
      rows.push({ description: d, amount_bucket: b, direction: 'debit', channel: channelOf(raw), category: cat, source });
    });
    return { rows, skipped };
  }
  const enabled = (storage) => { try { return storage.getItem(FLAG) === '1'; } catch (e) { return false; } };
  const toJsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n');

  return { VERSION: '1.0', FLAG, CATEGORIES, bucket, buildRows, enabled, toJsonl };
});
