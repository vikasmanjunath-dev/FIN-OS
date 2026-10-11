/**
 * FIN-OS bank statement import — a bank's CSV, or Account Aggregator (ReBIT) JSON → transactions.   (v1.0)
 *
 * Everything here runs on the device. There is no network call anywhere in this file, and nothing is uploaded.
 * It is the honest alternative to a live Account Aggregator connection, which FIN-OS cannot offer until it has a registered
 * provider partnership (see js/finos-aa.js).
 *
 *   FinosStatement.parseStatement(csvText)    → { ok, format:'bank-csv', rows, skipped, warnings, dateRange, totals, dateOrder, reconciled }
 *   FinosStatement.fromAA(json | text)        → the same shape, format 'aa-json' (deposit accounts only)
 *   FinosStatement.toLedger(rows, {batch})    → transactions in the shape the rest of FIN-OS reads (finos_transactions)
 *   FinosStatement.mergeLedger(existing, new) → { merged, added, duplicates }   (a re-import adds nothing)
 *   FinosStatement.undoBatch(existing, batch) → the ledger without that import
 *
 * row: { date:'YYYY-MM-DD', desc, type:'credit'|'debit', amount (> 0), balance|null, ref|null }
 *
 * What it is careful about
 *   • Bank layouts differ: it finds the header row (banks add account details above it), accepts separate debit/credit columns
 *     or one amount column with Dr/Cr, and reads dates as day-first unless the file proves otherwise.
 *   • It never guesses an amount: a row without a valid date or exactly one clear amount is skipped, and every skipped row is
 *     reported with its reason.
 *   • It checks the running balance. If the balance column does not add up row by row, it says so, because that means a row
 *     was missed or misread.
 *   • Two genuinely identical payments on one day (two ₹10 teas) are both kept; a second import of the same file adds nothing.
 *   • Account numbers, names and IFSC codes are never read into the output. Only date, description, amount and balance are.
 */
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const api = factory(root, isNode ? { Import: require('./finos-import.js'), Budget: require('./finos-budget.js') } : null);
  if (isNode) module.exports = api;
  else root.FinosStatement = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root, deps) {
  'use strict';

  const Imp = (deps && deps.Import) || root.FinosImport;
  const Bud = (deps && deps.Budget) || root.FinosBudget;
  const MAX_ROWS = 20000;

  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const iso = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);

  function realDate(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    const thisYear = new Date().getUTCFullYear();
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 2000 && y <= thisYear + 1;
  }

  /** One date string → 'YYYY-MM-DD' or null. `order` is 'dmy' or 'mdy' and only matters for all-numeric dates like 03/04/2025. */
  function parseDate(s, order) {
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);                          // 2025-04-03, 2025/04/03, 2025-04-03T10:00:00+05:30
    if (m) return realDate(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : null;
    m = /^(\d{1,2})[-/. ]([A-Za-z]{3})[A-Za-z]*[-/. ,]*(\d{2,4})(?:\s.*)?$/.exec(s);             // 03-Apr-2025, 03 Apr 25, 3-April-2025
    if (m && MONTHS[m[2].toLowerCase()]) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return realDate(y, MONTHS[m[2].toLowerCase()], +m[1]) ? iso(y, MONTHS[m[2].toLowerCase()], +m[1]) : null; }
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/.exec(s);                                // 03/04/2025, 03-04-25
    if (m) {
      const a = +m[1], b = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
      const [d, mo] = order === 'mdy' ? [b, a] : [a, b];
      return realDate(y, mo, d) ? iso(y, mo, d) : null;
    }
    return null;
  }

  /** Day-first unless the file proves otherwise: a first part above 12 means day-first, a second part above 12 means month-first. */
  function detectDateOrder(dates) {
    let dmy = false, mdy = false;
    dates.forEach((s) => { const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(String(s).trim()); if (m) { if (+m[1] > 12) dmy = true; if (+m[2] > 12) mdy = true; } });
    return { order: mdy && !dmy ? 'mdy' : 'dmy', mixed: dmy && mdy };
  }

  /* ── columns ─────────────────────────────────────────────────────────────────────────────────────────────── */
  const norm = (h) => String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /** Map a header row to column indexes, or null if it is not a statement header. */
  function mapHeader(row) {
    const h = row.map(norm);
    const find = (...tests) => { for (const t of tests) { const i = h.findIndex((x) => (t instanceof RegExp ? t.test(x) : x === t)); if (i >= 0) return i; } return -1; };
    const m = {
      date: find('transaction date', 'txn date', 'tran date', 'trans date', 'posting date', 'date', /^value date$/, /\bdate\b/),
      desc: find('narration', 'transaction remarks', 'description', 'particulars', 'transaction details', 'transaction description', 'details', 'remarks', /narration|particulars|remarks/),
      balance: find(/balance|^bal\b/),
      ref: find(/chq|cheque|ref|utr/),
    };
    const taken = new Set(Object.values(m).filter((i) => i >= 0));
    const other = (re) => h.findIndex((x, i) => !taken.has(i) && re.test(x) && !/balance|bal\b/.test(x));
    // A "Dr/Cr" or "Type" column says which side a single amount is on. Claim it first, or it would be mistaken for the debit column.
    m.drcr = other(/^dr cr$|^cr dr$|^debit credit$|^dr or cr$|^type$|transaction type|^txn type$/);
    if (m.drcr >= 0) taken.add(m.drcr);
    m.debit = other(/\b(withdrawal|withdrawals|debit|dr)\b/);
    if (m.debit >= 0) taken.add(m.debit);
    m.credit = other(/\b(deposit|deposits|credit|cr)\b/);
    if (m.credit >= 0) taken.add(m.credit);
    m.amount = m.debit < 0 && m.credit < 0 ? other(/^amount\b|\bamount$|\btransaction amount\b|\btxn amount\b/) : -1;
    if (m.amount < 0 || (m.debit >= 0 && m.credit >= 0)) m.drcr = -1;               // the marker only matters beside a single amount column
    const hasAmount = (m.debit >= 0 && m.credit >= 0) || (m.amount >= 0);
    if (m.date < 0 || m.desc < 0 || !hasAmount) return null;
    Object.keys(m).forEach((k) => { if (m[k] < 0) delete m[k]; });
    return m;
  }

  function findHeader(rows) {
    for (let i = 0; i < Math.min(rows.length, 30); i++) { const m = mapHeader(rows[i]); if (m) return { index: i, map: m }; }
    return null;
  }

  /** "1,234.50", "1,234.50 Dr", "(500)", "-500" → { n, side } where side is 'debit' | 'credit' | null (from a Dr/Cr suffix). */
  function readAmount(raw) {
    let s = String(raw == null ? '' : raw).trim(), side = null;
    const t = /\s*(dr|cr)\.?$/i.exec(s);
    if (t) { side = t[1].toLowerCase() === 'dr' ? 'debit' : 'credit'; s = s.slice(0, t.index); }
    const n = Imp.toNumber(s);
    return { n, side, signed: Number.isFinite(n) && n < 0 };
  }

  const BALANCE_ROW = /^(opening|closing|brought forward|carried forward|b\/f|c\/f|total|grand total|statement summary|balance)\b/i;
  const BLANK = '(no description)';

  /* ── balance reconciliation ──────────────────────────────────────────────────────────────────────────────── */
  /** 'yes' when the running balance adds up row by row (oldest-first or newest-first), 'no' when it does not, 'unknown' when there is too little. */
  function reconcile(rows) {
    const withBal = rows.filter((r) => r.balance != null);
    if (withBal.length < 5 || withBal.length < rows.length * 0.8) return 'unknown';
    const signed = (r) => (r.type === 'credit' ? r.amount : -r.amount);
    const score = (list, forward) => {
      let ok = 0, n = 0;
      for (let i = 1; i < list.length; i++) {
        if (list[i].balance == null || list[i - 1].balance == null) continue;
        n++;
        const expected = forward ? list[i - 1].balance + signed(list[i]) : list[i].balance + signed(list[i - 1]);
        if (Math.abs(expected - (forward ? list[i].balance : list[i - 1].balance)) <= 0.51) ok++;
      }
      return n ? ok / n : 0;
    };
    return Math.max(score(withBal, true), score(withBal, false)) >= 0.9 ? 'yes' : 'no';
  }

  /* ── result assembly ─────────────────────────────────────────────────────────────────────────────────────── */
  function finish(format, rows, skipped, warnings, extra) {
    const dates = rows.map((r) => r.date).sort();
    const sum = (t) => Math.round(rows.filter((r) => r.type === t).reduce((s, r) => s + r.amount, 0) * 100) / 100;
    return Object.assign({
      ok: rows.length > 0, format, rows, skipped, warnings,
      dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      totals: { count: rows.length, credits: sum('credit'), debits: sum('debit') },
      reconciled: reconcile(rows),
    }, extra || {});
  }
  const fail = (format, msg) => ({ ok: false, format, rows: [], skipped: [], warnings: [msg], dateRange: null, totals: { count: 0, credits: 0, debits: 0 }, reconciled: 'unknown', dateOrder: 'dmy' });

  /* ── CSV ─────────────────────────────────────────────────────────────────────────────────────────────────── */
  function parseStatement(text) {
    const rows0 = Imp.parseCSV(text);
    if (!rows0.length) return fail('bank-csv', 'The file is empty.');
    const hdr = findHeader(rows0);
    if (!hdr) return fail('bank-csv', 'This does not look like a bank statement. I could not find columns for the date, the description and the amounts. Download the statement as CSV from your bank\'s net banking.');
    const { map: m, index } = hdr;
    const body = rows0.slice(index + 1);
    const { order, mixed } = detectDateOrder(body.map((r) => r[m.date]));
    const out = [], skipped = [], warnings = [];
    if (mixed) warnings.push('The dates mix day-first and month-first forms, so some may be misread. Check the date range below.');
    if (body.length > MAX_ROWS) warnings.push('Only the first ' + MAX_ROWS + ' rows were read.');

    body.slice(0, MAX_ROWS).forEach((r, k) => {
      const line = index + 2 + k;
      const cell = (i) => (i == null ? '' : (r[i] == null ? '' : r[i]));
      const date = parseDate(cell(m.date), order);
      const desc = cell(m.desc).replace(/\s+/g, ' ').trim();
      if (!date) {
        const dateText = String(cell(m.date)).trim();
        // Words in the date cell ("Opening Balance", "Page 1 of 3") or nothing at all mean it is not a transaction line; digits that do not form a real date are an unreadable date.
        if (r.some((c) => String(c).trim())) skipped.push({ line, reason: !dateText || /[a-z]{4,}/i.test(dateText) || BALANCE_ROW.test(dateText + ' ' + desc) ? 'not a transaction row' : 'unreadable date' });
        return;
      }
      if (BALANCE_ROW.test(desc) && !/transfer|upi|neft|imps|rtgs/i.test(desc)) { skipped.push({ line, reason: 'balance row' }); return; }
      let type = null, amount = null;
      if (m.debit != null && m.credit != null) {
        const d = readAmount(cell(m.debit)), c = readAmount(cell(m.credit));
        const dv = Number.isFinite(d.n) ? Math.abs(d.n) : 0, cv = Number.isFinite(c.n) ? Math.abs(c.n) : 0;
        if (dv > 0 && cv > 0) { skipped.push({ line, reason: 'both a debit and a credit' }); return; }
        if (dv === 0 && cv === 0) { skipped.push({ line, reason: 'no amount' }); return; }
        type = dv > 0 ? 'debit' : 'credit'; amount = dv > 0 ? dv : cv;
      } else {
        const a = readAmount(cell(m.amount));
        if (!Number.isFinite(a.n) || a.n === 0) { skipped.push({ line, reason: 'no amount' }); return; }
        const marker = m.drcr != null ? String(cell(m.drcr)).trim().toLowerCase() : '';
        const side = a.side || (/^(dr|debit|d|w|withdrawal)\b/.test(marker) ? 'debit' : /^(cr|credit|c|deposit)\b/.test(marker) ? 'credit' : null);
        if (side) { type = side; } else if (a.signed) { type = 'debit'; } else { skipped.push({ line, reason: 'could not tell debit from credit' }); return; }
        amount = Math.abs(a.n);
      }
      const bal = m.balance != null ? readAmount(cell(m.balance)) : null;
      out.push({ date, desc: desc || BLANK, type, amount: Math.round(amount * 100) / 100, balance: bal && Number.isFinite(bal.n) ? bal.n : null, ref: cell(m.ref) ? cell(m.ref).slice(0, 40) : null });
    });

    if (!out.length) return Object.assign(fail('bank-csv', 'I found the columns but no readable transactions.'), { skipped, dateOrder: order });
    const res = finish('bank-csv', out, skipped, warnings, { dateOrder: order });
    if (res.reconciled === 'no') res.warnings.push('The balance column does not add up row by row. A row may be missing or misread, or the file may be incomplete. Check it before importing.');
    if (skipped.length) res.warnings.push(skipped.length + ' row' + (skipped.length === 1 ? ' was' : 's were') + ' skipped (see below).');
    return res;
  }

  /* ── Account Aggregator (ReBIT) JSON ─────────────────────────────────────────────────────────────────────── */
  const lower = (o) => { const r = {}; Object.keys(o || {}).forEach((k) => { r[k.toLowerCase()] = o[k]; }); return r; };

  /** Walk any JSON a provider might hand over and collect each account's transaction list. */
  function collectAccounts(node, acc, depth) {
    if (!node || typeof node !== 'object' || depth > 8) return acc;
    if (Array.isArray(node)) { node.forEach((x) => collectAccounts(x, acc, depth + 1)); return acc; }
    const o = lower(node);
    const tx = o.transactions && typeof o.transactions === 'object' ? lower(o.transactions) : null;
    if (tx && Array.isArray(tx.transaction)) { acc.push({ type: String(o.type || '').toLowerCase(), txns: tx.transaction }); return acc; }
    if (o.type && /^(mutual_funds|insurance_policies|equities|etf|bonds|ppf|nps|term_deposit|recurring_deposit|sip|reit|invit|cis)/i.test(String(o.type))) { acc.other = (acc.other || 0) + 1; return acc; }
    Object.keys(node).forEach((k) => collectAccounts(node[k], acc, depth + 1));
    return acc;
  }

  function fromAA(input) {
    let data = input;
    if (typeof input === 'string') { try { data = JSON.parse(input); } catch (e) { return fail('aa-json', 'This is not valid JSON.'); } }
    if (!data || typeof data !== 'object') return fail('aa-json', 'This does not look like Account Aggregator data.');
    const accounts = collectAccounts(data, [], 0);
    if (!accounts.length) {
      const encrypted = JSON.stringify(data).indexOf('encryptedFI') !== -1 || JSON.stringify(data).indexOf('encryptedfi') !== -1;
      return fail('aa-json', encrypted ? 'This data is still encrypted. Account Aggregator data can only be read by a registered provider; it has to be decrypted before it can be imported here.' : 'I could not find any deposit-account transactions in this file.');
    }
    const out = [], skipped = [], warnings = [];
    accounts.forEach((a) => a.txns.forEach((t, k) => {
      const o = lower(t), line = out.length + skipped.length + 1;
      const kind = String(o.type || '').toUpperCase();
      const type = kind === 'CREDIT' ? 'credit' : kind === 'DEBIT' ? 'debit' : null;
      const amt = Imp.toNumber(o.amount);
      const date = parseDate(String(o.transactiontimestamp || o.valuedate || '').slice(0, 10), 'dmy');          // the date part exactly as written, no timezone shift
      if (!type) { skipped.push({ line, reason: 'unknown transaction type' }); return; }
      if (!Number.isFinite(amt) || amt <= 0) { skipped.push({ line, reason: 'no amount' }); return; }
      if (!date) { skipped.push({ line, reason: 'unreadable date' }); return; }
      const bal = Imp.toNumber(o.currentbalance);
      out.push({ date, desc: String(o.narration || '').replace(/\s+/g, ' ').trim().slice(0, 160) || BLANK, type, amount: Math.round(amt * 100) / 100, balance: Number.isFinite(bal) ? bal : null, ref: o.txnid || o.reference ? String(o.txnid || o.reference).slice(0, 40) : null });
    }));
    if (accounts.other) warnings.push(accounts.other + ' other account type' + (accounts.other === 1 ? ' was' : 's were') + ' ignored (only savings and current account transactions are imported here).');
    if (!out.length) return Object.assign(fail('aa-json', 'I found accounts but no readable transactions.'), { skipped });
    if (skipped.length) warnings.push(skipped.length + ' transaction' + (skipped.length === 1 ? ' was' : 's were') + ' skipped (see below).');
    return finish('aa-json', out, skipped, warnings, { dateOrder: 'dmy' });
  }

  /* ── into the ledger ─────────────────────────────────────────────────────────────────────────────────────── */
  const APP_NAMES = /\b(phonepe|paytm|google ?pay|gpay|bhim|paid via|upi)\b/gi;     // payment-app names say how it was paid, not what for ("PhonePe" would read as a phone bill)

  function categorize(row) {
    if (row.type === 'credit') return 'Income';
    const cleaned = row.desc.replace(APP_NAMES, ' ');
    return Bud && Bud.canonicalCategory ? Bud.canonicalCategory(cleaned) : 'Other';
  }

  const descKey = (d) => String(d || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30);
  const keyOf = (date, type, amount, desc) => String(date).slice(0, 10) + '|' + type + '|' + (Math.round(Number(amount) * 100) / 100).toFixed(2) + '|' + descKey(desc);

  /** Transactions in the shape the rest of FIN-OS reads. The date is noon UTC so no timezone can move it to another day. */
  function toLedger(rows, opts) {
    const batch = (opts && opts.batch) || 'imp_' + Date.now().toString(36);
    return (rows || []).map((r, i) => ({
      id: batch + '_' + i, type: r.type, amount: r.amount, desc: r.desc, category: categorize(r),
      date: r.date + 'T12:00:00.000Z', src: 'import', batch,
    }));
  }

  /**
   * Add `incoming` to `existing` without duplicating anything already there. Identical payments inside one file are kept (two ₹10 teas),
   * so duplicates are counted: if the ledger already has two of a kind, the first two of them in the file are the duplicates.
   */
  function mergeLedger(existing, incoming) {
    const have = {};
    (Array.isArray(existing) ? existing : []).forEach((t) => {
      if (!t || (t.type !== 'credit' && t.type !== 'debit') || !t.date) return;
      const k = keyOf(t.date, t.type, t.amount, t.desc || t.description);
      have[k] = (have[k] || 0) + 1;
    });
    const seen = {}, added = [];
    (incoming || []).forEach((t) => {
      const k = keyOf(t.date, t.type, t.amount, t.desc);
      seen[k] = (seen[k] || 0) + 1;
      if (seen[k] > (have[k] || 0)) added.push(t);
    });
    return { merged: (Array.isArray(existing) ? existing : []).concat(added), added: added.length, duplicates: (incoming || []).length - added.length };
  }

  function undoBatch(existing, batch) {
    return (Array.isArray(existing) ? existing : []).filter((t) => !(t && t.src === 'import' && t.batch === batch));
  }

  /** Spending by category for the preview: debits only, largest first. */
  function topCategories(rows, n) {
    const by = {};
    (rows || []).filter((r) => r.type === 'debit').forEach((r) => { const c = categorize(r); by[c] = (by[c] || 0) + r.amount; });
    return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, n || 5).map(([category, amount]) => ({ category, amount: Math.round(amount) }));
  }

  return { parseStatement, fromAA, toLedger, mergeLedger, undoBatch, topCategories, parseDate, detectDateOrder, mapHeader, findHeader, reconcile, categorize, keyOf, MAX_ROWS };
});
