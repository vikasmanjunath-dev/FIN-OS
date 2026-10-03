/**
 * FIN-OS Subscription Tracker — recurring-expense core + UI.   (v1.0)
 *
 * Pure part (works in Node, unit-tested):
 *   FinosSubscriptions.normalize(raw)               → clean subscription or null
 *   FinosSubscriptions.annualCost(sub) / monthlyCost(sub)       (your share, after splitting a family plan)
 *   FinosSubscriptions.nextRenewal(sub, todayISO)   → ISO date or null (paused/cancelled)
 *   FinosSubscriptions.occurrences(sub, fromISO, toISO, max)    → ISO[]
 *   FinosSubscriptions.summarize(subs, todayISO, {income})      → totals, categories, upcoming, review candidates
 *   FinosSubscriptions.calendarEvents(subs, fromISO, toISO)     → events for finos-calendar.js / reminders
 *
 * Browser part:
 *   FinosSubscriptions.render(el)                   → full tracker UI (add / edit / pause / cancel / export)
 *   FinosSubscriptions.load() / save(list)          → storage key `finos_subscriptions` (FinosStore when present)
 *
 * Keys written for the rest of FIN-OS: finos_subscriptions, finos_subscriptions_monthly, finos_subscriptions_annual.
 * Dates are plain YYYY-MM-DD strings handled in UTC, so IST never shifts a renewal by a day.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosSubscriptions = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const KEY = 'finos_subscriptions';
  const CYCLES = {
    weekly:     { label: 'Weekly',      perYear: 52, months: 0 },
    monthly:    { label: 'Monthly',     perYear: 12, months: 1 },
    quarterly:  { label: 'Quarterly',   perYear: 4,  months: 3 },
    halfyearly: { label: 'Half-yearly', perYear: 2,  months: 6 },
    yearly:     { label: 'Yearly',      perYear: 1,  months: 12 },
  };
  const CATEGORIES = [
    { id: 'ott',      label: 'Streaming / OTT',   icon: '🎬', overlap: true },
    { id: 'music',    label: 'Music & audio',     icon: '🎧', overlap: true },
    { id: 'software', label: 'Apps & software',   icon: '💻', overlap: false },
    { id: 'cloud',    label: 'Cloud storage',     icon: '☁️', overlap: true },
    { id: 'news',     label: 'News & reading',    icon: '📰', overlap: true },
    { id: 'fitness',  label: 'Fitness & wellness', icon: '🏋️', overlap: true },
    { id: 'learning', label: 'Learning',          icon: '🎓', overlap: false },
    { id: 'telecom',  label: 'Phone & broadband', icon: '📶', overlap: false },
    { id: 'shopping', label: 'Shopping & delivery', icon: '🛍️', overlap: false },
    { id: 'gaming',   label: 'Gaming',            icon: '🎮', overlap: false },
    { id: 'other',    label: 'Other',             icon: '📦', overlap: false },
  ];
  const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  const STATUSES = ['active', 'trial', 'paused', 'cancelled'];
  const PAY = ['upi', 'card', 'netbanking', 'other'];

  /* ── dates (UTC, ISO strings) ─────────────────────────────────────────── */
  const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  function parseISO(s) {
    const m = ISO_RE.exec(String(s || ''));
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? { y, m: mo, d } : null;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const fmtISO = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const dayNum = (iso) => { const p = parseISO(iso); return p ? Date.UTC(p.y, p.m - 1, p.d) / 86400000 : NaN; };
  const daysBetween = (fromISO, toISO) => Math.round(dayNum(toISO) - dayNum(fromISO));
  function addDays(iso, n) {
    const p = parseISO(iso); const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
    return fmtISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  /** anchor + n months, keeping the anchor's day-of-month where it exists (31 Jan → 28/29 Feb → 31 Mar). */
  function addMonths(iso, n) {
    const p = parseISO(iso);
    const total = p.y * 12 + (p.m - 1) + n;
    const y = Math.floor(total / 12), m = (total % 12) + 1;
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return fmtISO(y, m, Math.min(p.d, dim));
  }
  function localToday() {
    const d = new Date();
    return fmtISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  /* ── normalisation ────────────────────────────────────────────────────── */
  const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
  let _seq = 0;
  const newId = () => 's' + Date.now().toString(36) + (++_seq).toString(36) + Math.random().toString(36).slice(2, 5);

  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name == null ? '' : raw.name).trim().slice(0, 60);
    const amount = Number(raw.amount);
    if (!name || !Number.isFinite(amount) || amount <= 0 || amount > 1e7) return null;
    const cycle = CYCLES[raw.cycle] ? raw.cycle : null;
    if (!cycle) return null;
    if (!parseISO(raw.nextDate)) return null;
    const use = raw.usefulness === '' || raw.usefulness == null ? null : clampInt(raw.usefulness, 1, 5, null);
    return {
      id: raw.id ? String(raw.id) : newId(),
      name,
      category: CAT[raw.category] ? raw.category : 'other',
      amount: Math.round(amount * 100) / 100,
      cycle,
      nextDate: raw.nextDate,
      split: clampInt(raw.split, 1, 20, 1),
      status: STATUSES.includes(raw.status) ? raw.status : 'active',
      usefulness: use,
      pay: PAY.includes(raw.pay) ? raw.pay : '',
      note: String(raw.note == null ? '' : raw.note).trim().slice(0, 120),
    };
  }
  const normalizeAll = (list) => (Array.isArray(list) ? list : []).map(normalize).filter(Boolean);

  /* ── money ─────────────────────────────────────────────────────────────── */
  const annualCost = (s) => (s.amount / s.split) * CYCLES[s.cycle].perYear;
  const monthlyCost = (s) => annualCost(s) / 12;

  /* ── renewals ──────────────────────────────────────────────────────────── */
  const isLive = (s) => s.status === 'active' || s.status === 'trial';

  /** Smallest k ≥ 0 such that anchor + k·cycle falls on/after today (month-based cycles only). */
  function firstIndex(sub, todayISO) {
    const c = CYCLES[sub.cycle];
    if (sub.nextDate >= todayISO) return 0;
    const a = parseISO(sub.nextDate), t = parseISO(todayISO);
    const gap = (t.y - a.y) * 12 + (t.m - a.m);
    let k = Math.max(0, Math.floor(gap / c.months));
    while (addMonths(sub.nextDate, k * c.months) < todayISO) k++;
    return k;
  }

  function nextRenewal(sub, todayISO) {
    if (!sub || !isLive(sub) || !parseISO(todayISO)) return null;
    const c = CYCLES[sub.cycle];
    if (sub.nextDate >= todayISO) return sub.nextDate;
    if (c.months === 0) return addDays(sub.nextDate, Math.ceil(daysBetween(sub.nextDate, todayISO) / 7) * 7);
    return addMonths(sub.nextDate, firstIndex(sub, todayISO) * c.months);
  }

  /** Up to `max` renewals in [fromISO, toISO]. Always counted from the original anchor, so 31 Jan → 28 Feb → 31 Mar. */
  function occurrences(sub, fromISO, toISO, max) {
    const out = [];
    if (!sub || !isLive(sub) || !parseISO(fromISO) || !parseISO(toISO)) return out;
    const c = CYCLES[sub.cycle];
    const lim = max || 3;
    if (c.months === 0) {
      for (let d = nextRenewal(sub, fromISO); d <= toISO && out.length < lim; d = addDays(d, 7)) out.push(d);
      return out;
    }
    for (let k = firstIndex(sub, fromISO); out.length < lim; k++) {
      const d = addMonths(sub.nextDate, k * c.months);
      if (d > toISO) break;
      out.push(d);
    }
    return out;
  }

  /* ── summary ───────────────────────────────────────────────────────────── */
  function summarize(subsIn, todayISO, opts) {
    const subs = normalizeAll(subsIn);
    const today = parseISO(todayISO) ? todayISO : localToday();
    const income = Number(opts && opts.income) || 0;
    const active = subs.filter((s) => s.status === 'active');
    const trials = subs.filter((s) => s.status === 'trial');

    const monthly = active.reduce((a, s) => a + monthlyCost(s), 0);
    const annual = monthly * 12;

    const byCat = {};
    active.forEach((s) => {
      const b = (byCat[s.category] = byCat[s.category] || { id: s.category, label: CAT[s.category].label, icon: CAT[s.category].icon, monthly: 0, annual: 0, count: 0 });
      b.monthly += monthlyCost(s); b.annual += annualCost(s); b.count++;
    });
    const categories = Object.values(byCat).sort((a, b) => b.annual - a.annual).map((b) => Object.assign(b, { share: annual > 0 ? b.annual / annual : 0 }));

    const upcoming = [];
    subs.filter(isLive).forEach((s) => {
      const d = nextRenewal(s, today);
      if (!d) return;
      const daysAway = daysBetween(today, d);
      if (daysAway <= 30) upcoming.push({ id: s.id, name: s.name, date: d, daysAway, cost: s.amount / s.split, trial: s.status === 'trial' });
    });
    upcoming.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));

    // ── review candidates: low value first, then overlapping services in the same category ──
    const review = [];
    const flagged = new Set();
    active.forEach((s) => {
      if (s.usefulness !== null && s.usefulness <= 2) {
        review.push({ id: s.id, name: s.name, reason: 'low-value', annual: annualCost(s), detail: `You rated it ${s.usefulness}/5` });
        flagged.add(s.id);
      }
    });
    CATEGORIES.filter((c) => c.overlap).forEach((c) => {
      const group = active.filter((s) => s.category === c.id);
      if (group.length < 2) return;
      const score = (s) => (s.usefulness === null ? 3 : s.usefulness);
      // keep the best-rated one (ties: keep the cheapest, so the saving is the biggest)
      const keep = group.slice().sort((a, b) => score(b) - score(a) || annualCost(a) - annualCost(b))[0];
      group.forEach((s) => {
        if (s.id === keep.id || flagged.has(s.id)) return;
        review.push({ id: s.id, name: s.name, reason: 'overlap', annual: annualCost(s), detail: `${group.length} services in ${c.label} — you also keep ${keep.name}` });
        flagged.add(s.id);
      });
    });
    review.sort((a, b) => b.annual - a.annual);
    const reviewSavings = review.reduce((a, r) => a + r.annual, 0);

    const trialsEnding = trials
      .map((s) => ({ id: s.id, name: s.name, date: nextRenewal(s, today), annual: annualCost(s) }))
      .filter((t) => t.date)
      .map((t) => Object.assign(t, { daysAway: daysBetween(today, t.date) }))
      .sort((a, b) => a.daysAway - b.daysAway);

    return {
      today,
      activeCount: active.length, trialCount: trials.length, pausedCount: subs.filter((s) => s.status === 'paused').length,
      monthly, annual,
      pctOfIncome: income > 0 ? monthly / income : null,
      categories, upcoming, review, reviewSavings, trialsEnding,
      dueIn7: upcoming.filter((u) => u.daysAway <= 7 && !u.trial).reduce((a, u) => a + u.cost, 0),
      biggest: active.slice().sort((a, b) => annualCost(b) - annualCost(a)).slice(0, 3).map((s) => ({ id: s.id, name: s.name, annual: annualCost(s) })),
    };
  }

  /* ── calendar / reminders feed ────────────────────────────────────────── */
  function calendarEvents(subsIn, fromISO, toISO) {
    const out = [];
    normalizeAll(subsIn).filter(isLive).forEach((s) => {
      const cost = Math.round((s.amount / s.split) * 100) / 100;
      occurrences(s, fromISO, toISO, 3).forEach((date) => {
        out.push({
          date,
          title: s.status === 'trial' ? `${s.name} trial ends — first charge` : `${s.name} renews`,
          sub: `₹${Math.round(cost).toLocaleString('en-IN')} · ${CYCLES[s.cycle].label.toLowerCase()}${s.status === 'trial' ? ' · cancel before this date to avoid the charge' : ''}`,
          type: 'sub', amount: cost,
        });
      });
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  /* ── storage ───────────────────────────────────────────────────────────── */
  const hasLS = () => { try { return !!(root.localStorage); } catch (e) { return false; } };
  function load() {
    if (root.FinosStore && root.FinosStore.get) return normalizeAll(root.FinosStore.get(KEY, []));
    if (!hasLS()) return [];
    try { return normalizeAll(JSON.parse(root.localStorage.getItem(KEY) || '[]')); } catch (e) { return []; }
  }
  function save(list) {
    const clean = normalizeAll(list);
    const sum = summarize(clean, localToday());
    const put = (k, v) => {
      if (root.FinosStore && root.FinosStore.set) return root.FinosStore.set(k, v);
      if (hasLS()) { try { root.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
      return false;
    };
    const ok = put(KEY, clean);
    put('finos_subscriptions_monthly', Math.round(sum.monthly));
    put('finos_subscriptions_annual', Math.round(sum.annual));
    return ok !== false;
  }

  /* ── CSV ───────────────────────────────────────────────────────────────── */
  function toCSV(subsIn) {
    const q = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@]/.test(s) ? "'" + s : s; };   // neutralise spreadsheet formulas
    const esc = (v) => '"' + q(v).replace(/"/g, '""') + '"';
    const rows = [['Name', 'Category', 'Amount', 'Cycle', 'Your share / year', 'Next renewal', 'Status', 'Usefulness', 'Notes']];
    normalizeAll(subsIn).forEach((s) => rows.push([s.name, CAT[s.category].label, s.amount, CYCLES[s.cycle].label, Math.round(annualCost(s)), s.nextDate, s.status, s.usefulness == null ? '' : s.usefulness, s.note]));
    return rows.map((r) => r.map(esc).join(',')).join('\r\n');
  }

  const api = { KEY, CYCLES, CATEGORIES, STATUSES, normalize, normalizeAll, annualCost, monthlyCost, nextRenewal, occurrences, summarize, calendarEvents, load, save, toCSV, localToday, addMonths, daysBetween };

  /* ═══════════════════════════ browser UI ═══════════════════════════════ */
  if (typeof document === 'undefined') return api;

  const PRESETS = [
    ['Netflix', 'ott', 'monthly'], ['Prime Video', 'ott', 'yearly'], ['JioHotstar', 'ott', 'yearly'], ['YouTube Premium', 'ott', 'monthly'],
    ['Spotify', 'music', 'monthly'], ['ChatGPT', 'software', 'monthly'], ['Google One', 'cloud', 'monthly'], ['iCloud+', 'cloud', 'monthly'],
    ['Gym', 'fitness', 'quarterly'], ['Broadband', 'telecom', 'monthly'],
  ];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => (root.FinosFmt ? root.FinosFmt.inr(Math.round(n)) : '₹' + Math.round(n).toLocaleString('en-IN'));
  const when = (n) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);
  const incomeNow = () => {
    const read = (k) => { try { const v = root.FinosStore ? root.FinosStore.get(k, 0) : JSON.parse(root.localStorage.getItem(k) || '0'); return Number(v) || 0; } catch (e) { return 0; } };
    return read('finos_monthly_income') || read('finos_income') || 0;
  };

  function render(el) {
    if (!el) return;
    let subs = load();
    let editing = null;          // id | 'new' | null
    let armedDelete = null;
    let showAll = false;

    const persist = () => { save(subs); };
    const find = (id) => subs.find((s) => s.id === id);

    function formHTML(s) {
      const v = s || { name: '', category: 'ott', amount: '', cycle: 'monthly', nextDate: addDays(localToday(), 30), split: 1, status: 'active', usefulness: '', pay: '', note: '' };
      const opt = (val, label, cur) => `<option value="${esc(val)}"${String(cur) === String(val) ? ' selected' : ''}>${esc(label)}</option>`;
      return `<form class="sub-form" data-form="${esc(s ? s.id : 'new')}" novalidate>
        <div class="sub-grid">
          <label>Name<input name="name" maxlength="60" value="${esc(v.name)}" placeholder="e.g. Netflix" required></label>
          <label>Category<select name="category">${CATEGORIES.map((c) => opt(c.id, c.icon + ' ' + c.label, v.category)).join('')}</select></label>
          <label>Bill amount (₹)<input name="amount" inputmode="decimal" value="${esc(v.amount)}" placeholder="649" required></label>
          <label>Billed<select name="cycle">${Object.keys(CYCLES).map((k) => opt(k, CYCLES[k].label, v.cycle)).join('')}</select></label>
          <label>Next renewal<input name="nextDate" type="date" value="${esc(v.nextDate)}" required></label>
          <label>Shared by (people)<input name="split" type="number" min="1" max="20" value="${esc(v.split)}"></label>
          <label>Status<select name="status">${[['active', 'Active'], ['trial', 'Free trial (first charge date above)'], ['paused', 'Paused'], ['cancelled', 'Cancelled']].map(([k, l]) => opt(k, l, v.status)).join('')}</select></label>
          <label>How useful? (1–5)<select name="usefulness">${opt('', 'Not rated', v.usefulness === null ? '' : v.usefulness)}${[1, 2, 3, 4, 5].map((n) => opt(n, n + (n === 1 ? ' – never use' : n === 5 ? ' – can’t live without' : ''), v.usefulness)).join('')}</select></label>
          <label class="sub-wide">Note<input name="note" maxlength="120" value="${esc(v.note)}" placeholder="optional — e.g. autopay on HDFC card"></label>
        </div>
        <div class="sub-err" role="alert" hidden></div>
        <div class="sub-actions"><button class="sub-btn primary" type="submit">${s ? 'Save changes' : 'Add subscription'}</button><button class="sub-btn" type="button" data-act="cancel-edit">Cancel</button></div>
      </form>`;
    }

    function cardHTML(s, today) {
      const nr = nextRenewal(s, today);
      const days = nr ? daysBetween(today, nr) : null;
      const cat = CAT[s.category];
      const dim = s.status === 'paused' || s.status === 'cancelled';
      const pill = { active: '', trial: '<span class="sub-pill trial">Free trial</span>', paused: '<span class="sub-pill paused">Paused</span>', cancelled: '<span class="sub-pill cancelled">Cancelled</span>' }[s.status];
      return `<article class="sub-card${dim ? ' dim' : ''}" data-id="${esc(s.id)}">
        <div class="sub-card-main">
          <div class="sub-ico" aria-hidden="true">${cat.icon}</div>
          <div class="sub-info">
            <div class="sub-name">${esc(s.name)} ${pill}</div>
            <div class="sub-meta">${esc(cat.label)} · ${inr(s.amount)} ${CYCLES[s.cycle].label.toLowerCase()}${s.split > 1 ? ` · split ${s.split} ways = ${inr(s.amount / s.split)}` : ''}${s.usefulness ? ` · rated ${s.usefulness}/5` : ''}</div>
            ${s.note ? `<div class="sub-note">${esc(s.note)}</div>` : ''}
          </div>
          <div class="sub-cost"><strong>${inr(annualCost(s))}</strong><span>/ year</span><small>${inr(monthlyCost(s))}/mo</small></div>
        </div>
        <div class="sub-card-foot">
          <span class="sub-next">${nr ? `${s.status === 'trial' ? 'First charge' : 'Renews'} ${esc(nr)} (${when(days)})` : dim ? '' : ''}</span>
          <span class="sub-row-actions">
            <button class="sub-link" data-act="edit" data-id="${esc(s.id)}">Edit</button>
            ${s.status === 'cancelled' ? `<button class="sub-link" data-act="status" data-to="active" data-id="${esc(s.id)}">Reactivate</button>` : `
            <button class="sub-link" data-act="status" data-to="${s.status === 'paused' ? 'active' : 'paused'}" data-id="${esc(s.id)}">${s.status === 'paused' ? 'Resume' : 'Pause'}</button>
            <button class="sub-link" data-act="status" data-to="cancelled" data-id="${esc(s.id)}">Cancelled it</button>`}
            <button class="sub-link danger" data-act="delete" data-id="${esc(s.id)}">${armedDelete === s.id ? 'Click again to delete' : 'Delete'}</button>
          </span>
        </div>
      </article>`;
    }

    function draw() {
      const today = localToday();
      const income = incomeNow();
      const sum = summarize(subs, today, { income });
      const live = subs.filter((s) => s.status === 'active' || s.status === 'trial').sort((a, b) => (nextRenewal(a, today) || '9').localeCompare(nextRenewal(b, today) || '9'));
      const inactive = subs.filter((s) => s.status === 'paused' || s.status === 'cancelled');
      const reasonLabel = { 'low-value': 'Low value', overlap: 'Overlap' };

      el.innerHTML = `
      <div class="sub-wrap">
        <div class="sub-stats">
          <div class="sub-stat"><span>Per month</span><strong id="sub-monthly">${inr(sum.monthly)}</strong></div>
          <div class="sub-stat hot"><span>Per year</span><strong id="sub-annual">${inr(sum.annual)}</strong></div>
          <div class="sub-stat"><span>Active</span><strong>${sum.activeCount}</strong>${sum.trialCount ? `<small>+ ${sum.trialCount} trial${sum.trialCount > 1 ? 's' : ''}</small>` : ''}</div>
          <div class="sub-stat"><span>Share of income</span><strong>${sum.pctOfIncome === null ? '—' : (sum.pctOfIncome * 100).toFixed(1) + '%'}</strong>${sum.pctOfIncome === null ? '<small>set income in Salary Optimizer</small>' : ''}</div>
        </div>

        ${sum.trialsEnding.filter((t) => t.daysAway <= 7).map((t) => `<div class="sub-alert warn">⏰ <b>${esc(t.name)}</b> free trial converts to a paid plan ${when(t.daysAway)} — cancel now to avoid ${inr(t.annual)}/year.</div>`).join('')}
        ${sum.dueIn7 > 0 ? `<div class="sub-alert">💳 ${inr(sum.dueIn7)} will be charged in the next 7 days — keep the balance ready.</div>` : ''}

        <div class="sub-bar">
          <div class="sub-presets" aria-label="Quick add">${PRESETS.map(([n, c, cy], i) => `<button class="sub-chip" data-act="preset" data-i="${i}">+ ${esc(n)}</button>`).join('')}</div>
          <div class="sub-bar-right"><button class="sub-btn primary" data-act="add">+ Add subscription</button>${subs.length ? '<button class="sub-btn" data-act="export">Export CSV</button>' : ''}</div>
        </div>

        ${editing === 'new' ? formHTML(null) : ''}

        ${!subs.length && editing !== 'new' ? `<div class="sub-empty"><div>🔁</div><h3>No subscriptions yet</h3><p>Add the apps and services that bill you every month or year — OTT, music, cloud storage, gym, broadband. FIN-OS adds up what they really cost per year and reminds you before each renewal.</p></div>` : ''}

        ${live.length ? `<h2 class="sub-h">Your subscriptions</h2><div class="sub-list">${live.map((s) => (editing === s.id ? formHTML(s) : cardHTML(s, today))).join('')}</div>` : ''}

        ${sum.review.length ? `<section class="sub-review"><h2 class="sub-h">Worth a second look <span class="sub-save">could save ${inr(sum.reviewSavings)}/year</span></h2>
          <ul>${sum.review.map((r) => `<li><span class="sub-tag ${r.reason}">${reasonLabel[r.reason]}</span><b>${esc(r.name)}</b> — ${esc(r.detail)} <em>${inr(r.annual)}/yr</em></li>`).join('')}</ul></section>` : ''}

        ${sum.categories.length ? `<section><h2 class="sub-h">Where it goes</h2><div class="sub-cats">${sum.categories.map((c) => `<div class="sub-cat"><div class="sub-cat-top"><span>${c.icon} ${esc(c.label)} <small>(${c.count})</small></span><b>${inr(c.annual)}/yr</b></div><div class="sub-meter"><i style="width:${Math.max(2, Math.round(c.share * 100))}%"></i></div></div>`).join('')}</div></section>` : ''}

        ${sum.upcoming.length ? `<section><h2 class="sub-h">Next 30 days</h2><ul class="sub-up">${sum.upcoming.map((u) => `<li><span>${esc(u.date)}</span><b>${esc(u.name)}</b>${u.trial ? ' <em>(trial ends)</em>' : ''}<span class="sub-up-amt">${inr(u.cost)}</span><small>${when(u.daysAway)}</small></li>`).join('')}</ul></section>` : ''}

        ${inactive.length ? `<section><h2 class="sub-h"><button class="sub-link" data-act="toggle-inactive">${showAll ? '▾' : '▸'} Paused & cancelled (${inactive.length})</button></h2>${showAll ? `<div class="sub-list">${inactive.map((s) => (editing === s.id ? formHTML(s) : cardHTML(s, today))).join('')}</div>` : ''}</section>` : ''}
      </div>`;
    }

    function readForm(form) {
      const f = new FormData(form);
      const get = (k) => String(f.get(k) == null ? '' : f.get(k));
      const rawAmt = root.FinosFmt && root.FinosFmt.parse ? root.FinosFmt.parse(get('amount')) : Number(get('amount').replace(/[₹,\s]/g, ''));
      return { name: get('name'), category: get('category'), amount: rawAmt, cycle: get('cycle'), nextDate: get('nextDate'), split: get('split'), status: get('status'), usefulness: get('usefulness'), note: get('note') };
    }

    function submit(form) {
      const id = form.getAttribute('data-form');
      const raw = readForm(form);
      if (id !== 'new') raw.id = id;
      const clean = normalize(raw);
      const err = form.querySelector('.sub-err');
      if (!clean) {
        const why = !raw.name.trim() ? 'Give it a name.' : !(Number(raw.amount) > 0) ? 'Enter the bill amount in rupees.' : !parseISO(raw.nextDate) ? 'Pick the next renewal date.' : 'Please check the details.';
        err.textContent = why; err.hidden = false; return;
      }
      if (id === 'new') subs.push(clean); else subs = subs.map((s) => (s.id === id ? clean : s));
      persist(); editing = null; draw();
    }

    el.addEventListener('submit', (e) => { if (e.target.matches('.sub-form')) { e.preventDefault(); submit(e.target); } });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || !el.contains(b)) return;
      const act = b.getAttribute('data-act'), id = b.getAttribute('data-id');
      if (act === 'add') { editing = 'new'; draw(); const n = el.querySelector('.sub-form input[name=name]'); if (n) n.focus(); }
      else if (act === 'cancel-edit') { editing = null; draw(); }
      else if (act === 'edit') { editing = id; if (find(id) && !(find(id).status === 'active' || find(id).status === 'trial')) showAll = true; draw(); }
      else if (act === 'preset') {
        const [n, c, cy] = PRESETS[+b.getAttribute('data-i')];
        editing = 'new'; draw();
        const f = el.querySelector('.sub-form').elements;
        f.namedItem('name').value = n; f.namedItem('category').value = c; f.namedItem('cycle').value = cy; f.namedItem('amount').focus();
      } else if (act === 'status') {
        subs = subs.map((s) => (s.id === id ? Object.assign({}, s, { status: b.getAttribute('data-to') }) : s));
        persist(); draw();
      } else if (act === 'delete') {
        if (armedDelete === id) { subs = subs.filter((s) => s.id !== id); armedDelete = null; persist(); } else armedDelete = id;
        draw();
      } else if (act === 'toggle-inactive') { showAll = !showAll; draw(); }
      else if (act === 'export') {
        try {
          const blob = new Blob([toCSV(subs)], { type: 'text/csv;charset=utf-8' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = 'finos-subscriptions.csv';
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } catch (err) { /* download blocked — nothing to do */ }
      }
    });
    root.addEventListener('storage', (e) => { if (e.key === KEY) { subs = load(); draw(); } });
    draw();
  }

  api.render = render;
  return api;
});
