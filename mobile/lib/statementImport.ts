// Bank statement import — port of js/finos-statement-import.js (CSV from a bank, or Account Aggregator JSON → transactions).
// Runs entirely on the device; there is no network call anywhere in this file.
//
// The parsing core is kept line-for-line identical to the website's module (and its CSV helpers from js/finos-import.js) on
// purpose: __tests__/statement.parity.test.mts feeds both the same random statements and requires identical output.
// The body keeps the website's untyped JavaScript, so strict checking is off for this file only.
// Re-generated Oct 12 2026 from the website's current files (brokers / fund houses are now filed as Savings & Investments).
// @ts-nocheck
import { canonicalCategory } from '@/lib/budget';

const MAX_ROWS_VALUE = 20000;
  function detectDelimiter(text) {
    const head = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5).join('\n');
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let inQ = false;
    for (const ch of head) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in counts) counts[ch]++; }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }

  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    const d = detectDelimiter(text);
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === d) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some((c) => c.trim() !== '')) rows.push(row);
        row = [];
      } else cur += ch;
    }
    row.push(cur);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    return rows.map((r) => r.map((c) => c.trim()));
  }

  function toNumber(v) {
    if (v === undefined || v === null) return NaN;
    let s = String(v).trim();
    if (!s || s === '-' || /^n\/?a$/i.test(s)) return NaN;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    s = s.replace(/[()₹$,\s%]|^rs\.?/gi, '').replace(/^-/, '');
    const n = parseFloat(s);
    return isNaN(n) ? NaN : neg ? -n : n;
  }



  const MAX_ROWS = MAX_ROWS_VALUE;

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
    const n = toNumber(s);
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
  /** A sentence: its English text now, plus { key, params } so the page can show it in the person's language. */
  const W = (key, params) => ({ text: String(key).replace(/\{(\w+)\}/g, (_, k) => (params && params[k] != null ? params[k] : '')), key, params: params || {} });
  /** Add a sentence to a result's warnings and, in step, its translatable twin. */
  function addWarn(res, key, params) { const w = W(key, params); res.warnings.push(w.text); res.warningsT.push({ key: w.key, params: w.params }); }

  function finish(format, rows, skipped, warnings, extra) {
    const dates = rows.map((r) => r.date).sort();
    const sum = (t) => Math.round(rows.filter((r) => r.type === t).reduce((s, r) => s + r.amount, 0) * 100) / 100;
    return Object.assign({
      ok: rows.length > 0, format, rows, skipped, warnings, warningsT: [],
      dateRange: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      totals: { count: rows.length, credits: sum('credit'), debits: sum('debit') },
      reconciled: reconcile(rows),
    }, extra || {});
  }
  const fail = (format, msg) => ({ ok: false, format, rows: [], skipped: [], warnings: [msg], warningsT: [{ key: msg, params: {} }], dateRange: null, totals: { count: 0, credits: 0, debits: 0 }, reconciled: 'unknown', dateOrder: 'dmy' });

  /* ── CSV ─────────────────────────────────────────────────────────────────────────────────────────────────── */
  function parseStatement(text) {
    const rows0 = parseCSV(text);
    if (!rows0.length) return fail('bank-csv', 'The file is empty.');
    const hdr = findHeader(rows0);
    if (!hdr) return fail('bank-csv', 'This does not look like a bank statement. I could not find columns for the date, the description and the amounts. Download the statement as CSV from your bank\'s net banking.');
    const { map: m, index } = hdr;
    const body = rows0.slice(index + 1);
    const { order, mixed } = detectDateOrder(body.map((r) => r[m.date]));
    const out = [], skipped = [], warnings = [], early = [];
    if (mixed) { warnings.push('The dates mix day-first and month-first forms, so some may be misread. Check the date range below.'); early.push({ key: 'The dates mix day-first and month-first forms, so some may be misread. Check the date range below.', params: {} }); }
    if (body.length > MAX_ROWS) { warnings.push('Only the first ' + MAX_ROWS + ' rows were read.'); early.push({ key: 'Only the first {n} rows were read.', params: { n: MAX_ROWS } }); }

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
    res.warningsT.push.apply(res.warningsT, early);
    if (res.reconciled === 'no') addWarn(res, 'The balance column does not add up row by row. A row may be missing or misread, or the file may be incomplete. Check it before importing.');
    if (skipped.length) addWarn(res, skipped.length === 1 ? '1 row was skipped (see below).' : '{n} rows were skipped (see below).', { n: skipped.length });
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
    const out = [], skipped = [], warnings = [], wt = [];
    accounts.forEach((a) => a.txns.forEach((t, k) => {
      const o = lower(t), line = out.length + skipped.length + 1;
      const kind = String(o.type || '').toUpperCase();
      const type = kind === 'CREDIT' ? 'credit' : kind === 'DEBIT' ? 'debit' : null;
      const amt = toNumber(o.amount);
      const date = parseDate(String(o.transactiontimestamp || o.valuedate || '').slice(0, 10), 'dmy');          // the date part exactly as written, no timezone shift
      if (!type) { skipped.push({ line, reason: 'unknown transaction type' }); return; }
      if (!Number.isFinite(amt) || amt <= 0) { skipped.push({ line, reason: 'no amount' }); return; }
      if (!date) { skipped.push({ line, reason: 'unreadable date' }); return; }
      const bal = toNumber(o.currentbalance);
      out.push({ date, desc: String(o.narration || '').replace(/\s+/g, ' ').trim().slice(0, 160) || BLANK, type, amount: Math.round(amt * 100) / 100, balance: Number.isFinite(bal) ? bal : null, ref: o.txnid || o.reference ? String(o.txnid || o.reference).slice(0, 40) : null });
    }));
    if (accounts.other) { const w = W(accounts.other === 1 ? '1 other account type was ignored (only savings and current account transactions are imported here).' : '{n} other account types were ignored (only savings and current account transactions are imported here).', { n: accounts.other }); warnings.push(w.text); wt.push({ key: w.key, params: w.params }); }
    if (!out.length) return Object.assign(fail('aa-json', 'I found accounts but no readable transactions.'), { skipped });
    if (skipped.length) { const w = W(skipped.length === 1 ? '1 transaction was skipped (see below).' : '{n} transactions were skipped (see below).', { n: skipped.length }); warnings.push(w.text); wt.push({ key: w.key, params: w.params }); }
    const res = finish('aa-json', out, skipped, warnings, { dateOrder: 'dmy' });
    res.warningsT = wt;
    return res;
  }

  /* ── into the ledger ─────────────────────────────────────────────────────────────────────────────────────── */
  const APP_NAMES = /\b(phonepe|paytm|google ?pay|gpay|bhim|paid via|upi)\b/gi;     // payment-app names say how it was paid, not what for ("PhonePe" would read as a phone bill)

  /* Money sent to a broker, a fund house or a retirement account is saved, not spent, so it must not count against the budget or the
     savings rate. FinosBudget reads the category 'Savings & Investments' as kind 'saving'. Names are matched as whole words so a cafe
     called "Stockholm" is not an investment. Insurance premiums are left as they were (an expense with no category of its own). */
  const INVEST = /\b(zerodha|groww|upstox|angel ?(one|broking)|5paisa|icici ?direct|hdfc ?sec(urities)?|kotak ?sec(urities)?|motilal ?oswal|sharekhan|paytm ?money|smallcase|kuvera|et ?money|indmoney|iccl|indian ?clearing|nse ?clearing|bse ?star|amfi|cams|kfin ?tech|karvy|mutual ?funds?|mf ?sip|sip|nps|ppf|demat|stock ?brok\w*)\b/i;

  function categorize(row) {
    if (row.type === 'credit') return 'Income';
    const cleaned = row.desc.replace(APP_NAMES, ' ');
    if (INVEST.test(row.desc)) return 'Savings & Investments';          // tested before payment-app names are removed: "Paytm Money" is a broker, "Paytm" is a wallet
    return canonicalCategory(cleaned);
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
    (rows || []).filter((r) => r.type === 'debit').forEach((r) => { const c = categorize(r); if (c === 'Savings & Investments') return; by[c] = (by[c] || 0) + r.amount; });   // money put aside is not spending
    return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, n || 5).map(([category, amount]) => ({ category, amount: Math.round(amount) }));
  }


export { parseStatement, fromAA, toLedger, mergeLedger, undoBatch, topCategories, parseDate, detectDateOrder, mapHeader, findHeader, reconcile, categorize, keyOf, parseCSV, toNumber, MAX_ROWS };
