/**
 * FIN-OS budgets — per-category limits, month status with pace projection, overrun alerts.   (v1.0)
 *
 * `finos_transactions` is written by FOUR different features in four shapes:
 *   quick capture  {amount, category:'need_food', type:'need_food', label, date:'YYYY-MM-DD'}
 *   account aggr.  {id, type:'credit'|'debit', category:'Food & Dining', desc, date:ISO timestamp}
 *   voice journal  {id, type:'expense'|'income', category:'food', description, date}
 *   everything else {amount, type|category free text}
 * normalize() turns any of them into one shape so budgets (and anything after) can rely on it.
 *
 *   FinosBudget.normalize(raw)                 → {id,date,amount,kind:'expense'|'income'|'saving',category,label} | null
 *   FinosBudget.status(txns, limits, now)      → {month, day, daysInMonth, rows:[{category,spent,limit,pct,projected,projectedPct,state,left}], total}
 *   FinosBudget.suggest(txns, income, now)     → {category: limit}   (history-based, else income-based defaults)
 *   FinosBudget.alertEvents(now)               → reminder events (once per category per level per month)
 *   FinosBudget.getLimits() / setLimit(cat, n) / setLimits(obj)      (localStorage 'finos_budgets')
 *
 * Only `expense` kind counts toward budgets. Investing/saving (SIP, "saved ₹5000") and income never do — a SIP is not
 * overspending.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosBudget = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const STORE_KEY = 'finos_budgets';
  const TXN_KEY = 'finos_transactions';

  const CATEGORIES = ['Food & Dining', 'Groceries', 'Transport', 'Shopping', 'Bills & Utilities', 'Housing', 'EMI & Loans', 'Subscriptions', 'Health', 'Entertainment', 'Education', 'Travel', 'Other'];

  /* Order matters: first match wins. Patterns cover quick-capture keys, AA labels, voice-journal keys and free text. */
  const CATEGORY_RULES = [
    ['Groceries',         /grocer|bigbasket|blinkit|zepto|vegetable|provision|\bmilk\b/i],
    ['Food & Dining',     /\bfood\b|dining|restaurant|zomato|swiggy|lunch|dinner|breakfast|cafe|pizza|biryani|snack/i],
    ['Subscriptions',     /subscri|netflix|prime|spotify|hotstar|youtube/i],
    ['EMI & Loans',       /\bemi\b|loan|credit.?card.?bill/i],
    ['Housing',           /\brent\b|housing|maintenance|\bpg\b|society/i],
    ['Bills & Utilities', /utilit|bill|electric|water|\bgas\b|broadband|internet|recharge|phone|mobile/i],
    ['Transport',         /transport|fuel|petrol|diesel|uber|\bola\b|\bcab\b|\bauto\b|metro|\bbus\b|\btrain\b|toll|parking/i],
    ['Health',            /health|medic|doctor|hospital|pharma|\bgym\b|clinic/i],
    ['Education',         /educat|school|tuition|course|college|fees/i],
    ['Travel',            /travel|flight|hotel|holiday|vacation|trip/i],
    ['Entertainment',     /entertain|movie|\bfun\b|game|concert|outing/i],
    ['Shopping',          /shop|amazon|flipkart|myntra|clothes|shirt|shoes|mall|bought/i],
  ];
  const SAVING = /invest|saving|\bsip\b|mutual|\bmf\b|amfi|\bppf\b|\bnps\b|\bfd\b|stock|equity|emergency|put aside/i;
  const INCOME = /salary|income|bonus|freelance|received|got paid|refund|interest credit|dividend/i;

  const num = (v) => { const n = typeof v === 'string' ? parseFloat(v.replace(/[₹,\s]/g, '')) : Number(v); return isFinite(n) ? n : NaN; };
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthOf = (isoDay) => isoDay.slice(0, 7);

  function toDay(v) {
    if (!v) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;               // already a calendar day: don't reinterpret
    const d = new Date(v);
    return isNaN(d) ? null : ymd(d);                                                      // timestamps → the user's LOCAL day
  }

  function canonicalCategory(text) {
    const t = String(text || '').replace(/[_\-]+/g, ' ');         // need_food → "need food" (underscore is a word character, so \b would miss it)
    for (const [name, rx] of CATEGORY_RULES) if (rx.test(t)) return name;
    return 'Other';
  }

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const amount = Math.abs(num(raw.amount));
    if (!(amount > 0)) return null;
    const date = toDay(raw.date || raw.timestamp || raw.ts);
    if (!date) return null;

    const catText = [raw.category, raw.type, raw.label, raw.description, raw.desc].filter((x) => typeof x === 'string').join(' ');
    const typeText = String(raw.type || '');
    let kind = 'expense';
    if (/^credit$/i.test(typeText) || /^income$/i.test(typeText) || /^salary$/i.test(String(raw.category || ''))) kind = 'income';
    if (/^save_|^invest/i.test(String(raw.category || '')) || SAVING.test(String(raw.category || '')) || /^save_/.test(typeText)) kind = 'saving';
    // voice journal tags "SIP / invested / saved" as type:'income' — that is money going OUT to savings, not income
    if (kind === 'income' && SAVING.test(String(raw.category || '')) ) kind = 'saving';
    if (kind === 'expense' && /^debit$/i.test(typeText) && /salary/i.test(catText)) kind = 'income';   // never happens in practice; keeps odd data honest
    if (kind === 'expense' && INCOME.test(String(raw.category || '')) && !/^debit$/i.test(typeText)) kind = 'income';

    const label = String(raw.label || raw.description || raw.desc || '').trim().slice(0, 60);
    return {
      id: String(raw.id !== undefined ? raw.id : `${date}|${amount}|${label}`),
      date, amount, kind,
      category: kind === 'expense' ? canonicalCategory(catText) : (kind === 'saving' ? 'Savings & Investments' : 'Income'),
      label,
    };
  }

  function normalizeAll(list) { return (Array.isArray(list) ? list : []).map(normalize).filter(Boolean); }

  /* ── month maths ─────────────────────────────────────────────────── */
  function monthSpend(txns, month) {
    const byCat = {}; let total = 0;
    txns.forEach((t) => { if (t.kind === 'expense' && monthOf(t.date) === month) { byCat[t.category] = (byCat[t.category] || 0) + t.amount; total += t.amount; } });
    return { byCat, total };
  }
  const daysIn = (y, m0) => new Date(y, m0 + 1, 0).getDate();

  /**
   * status(): for every category that has a limit OR spend this month.
   *  state: 'over'  spent ≥ limit
   *         'warn'  spent ≥ 80% of limit, or (after day 7) the current pace projects past 110% of the limit
   *         'ok'
   */
  function status(txns, limits, now) {
    const list = Array.isArray(txns) ? txns : [];
    const t = list.every((x) => x && x.kind) ? list : normalizeAll(list);          // accept raw or already-normalized
    const d = now || new Date();
    const month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const dim = daysIn(d.getFullYear(), d.getMonth());
    const day = d.getDate();
    const { byCat, total } = monthSpend(t, month);
    const lim = limits || {};
    const cats = Array.from(new Set([...Object.keys(lim), ...Object.keys(byCat)]));
    const rows = cats.map((category) => {
      const spent = Math.round(byCat[category] || 0);
      const limit = lim[category] > 0 ? lim[category] : 0;
      const projected = day >= 1 ? Math.round((spent / day) * dim) : spent;
      const pct = limit ? Math.round((spent / limit) * 100) : null;
      const projectedPct = limit ? Math.round((projected / limit) * 100) : null;
      let state = 'ok';
      if (limit) {
        if (spent >= limit) state = 'over';
        else if (pct >= 80 || (day >= 7 && projectedPct >= 110)) state = 'warn';
      }
      return { category, spent, limit, pct, projected, projectedPct, pace: day >= 7, state, left: limit ? Math.max(0, limit - spent) : null };   // pace is only meaningful after a week of data
    }).sort((a, b) => (b.pct === null ? -1 : b.pct) - (a.pct === null ? -1 : a.pct) || b.spent - a.spent);
    const totalLimit = Object.values(lim).reduce((s, v) => s + (v > 0 ? v : 0), 0);
    return { month, day, daysInMonth: dim, daysLeft: dim - day, rows, total: { spent: Math.round(total), limit: totalLimit, pct: totalLimit ? Math.round((total / totalLimit) * 100) : null } };
  }

  /* ── suggestions ─────────────────────────────────────────────────── */
  const DEFAULT_SHARES = { 'Housing': 0.25, 'Groceries': 0.10, 'Food & Dining': 0.06, 'Transport': 0.07, 'Bills & Utilities': 0.06, 'EMI & Loans': 0.12, 'Health': 0.04, 'Shopping': 0.05, 'Entertainment': 0.04, 'Subscriptions': 0.02 };
  const round500 = (n) => Math.max(500, Math.ceil(n / 500) * 500);

  function suggest(txns, income, now) {
    const t = normalizeAll(txns);
    const d = now || new Date();
    const months = [];                                         // up to 3 most recent COMPLETE months with any spend
    for (let i = 1; i <= 3; i++) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push(`${m.getFullYear()}-${pad(m.getMonth() + 1)}`); }
    const spends = months.map((m) => monthSpend(t, m)).filter((s) => s.total > 0);
    if (spends.length) {
      const sums = {};
      spends.forEach((s) => Object.entries(s.byCat).forEach(([c, v]) => { sums[c] = (sums[c] || 0) + v; }));
      const out = {};
      Object.entries(sums).forEach(([c, v]) => { const avg = v / spends.length; if (avg >= 300) out[c] = round500(avg * 1.05); });   // 5% headroom over the average
      return out;
    }
    const inc = num(income);
    if (!(inc > 0)) return {};
    const out = {};
    Object.entries(DEFAULT_SHARES).forEach(([c, share]) => { out[c] = round500(inc * share); });
    return out;
  }

  /* ── storage ─────────────────────────────────────────────────────── */
  function read(k, fb) {
    try { if (root.FinosStore) return root.FinosStore.get(k, fb); const v = root.localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch (_) { return fb; }
  }
  function write(k, v) {
    try { if (root.FinosStore) root.FinosStore.set(k, v); else root.localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* quota/private mode */ }
  }
  function getLimits() { const b = read(STORE_KEY, null); return (b && b.limits) || {}; }
  function setLimits(limits) {
    const clean = {};
    Object.entries(limits || {}).forEach(([c, v]) => { const n = num(v); if (n > 0) clean[c] = Math.round(n); });
    write(STORE_KEY, { limits: clean, updatedAt: new Date().toISOString() });
    return clean;
  }
  function setLimit(cat, amount) { const l = Object.assign({}, getLimits()); const n = num(amount); if (n > 0) l[cat] = Math.round(n); else delete l[cat]; return setLimits(l); }
  function transactions() { return normalizeAll(read(TXN_KEY, [])); }

  /* ── alerts (consumed by finos-reminders.js) ─────────────────────── */
  const rupees = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  function alertEvents(now) {
    const d = now || new Date();
    const limits = getLimits();
    if (!Object.keys(limits).length) return [];
    const st = status(transactions(), limits, d);
    const today = ymd(d);
    const out = [];
    st.rows.forEach((r) => {
      if (r.state === 'ok' || !r.limit) return;
      const level = r.state === 'over' ? (r.pct >= 120 ? 'over-120' : 'over') : (r.pct >= 90 ? 'warn-90' : 'warn');
      const head = r.state === 'over' ? `${r.category} budget exceeded` : (r.pct >= 80 ? `${r.category} budget ${r.pct}% used` : `${r.category} on pace to overshoot`);
      const sub = r.state === 'over'
        ? `${rupees(r.spent)} spent against a ${rupees(r.limit)} limit, with ${st.daysLeft} days left in the month.`
        : `${rupees(r.spent)} of ${rupees(r.limit)} used (${rupees(r.left)} left for ${st.daysLeft} days)${r.pace && r.projectedPct >= 100 ? `; at this pace you'll reach ${r.projectedPct}%` : ''}.`;
      out.push({ type: 'budget', date: today, title: head, sub, once: true, key: `budget|${st.month}|${r.category}|${level}` });
    });
    return out;
  }

  return { CATEGORIES, normalize, normalizeAll, status, suggest, monthSpend, getLimits, setLimits, setLimit, transactions, alertEvents, canonicalCategory };
});
