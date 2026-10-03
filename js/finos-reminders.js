/**
 * FIN-OS reminders — "what needs my attention in the next few days?"   (v1.0)
 *
 * Reads the same events the Financial Calendar shows (SIP debits, FD/PPF maturities, insurance renewals, subscription renewals,
 * goal deadlines, tax dates) and tells you about the ones that are close — once per event per day.
 *
 *   FinosReminders.upcoming(7)         → [{date,title,sub,type,daysAway,key}]   (soonest first)
 *   FinosReminders.run()               → in-app toast for items due within `leadDays`; system notification
 *                                        too if the user enabled it. Safe to call on every page load.
 *   FinosReminders.enableSystem()      → asks for Notification permission, remembers the choice
 *   FinosReminders.disableSystem()
 *   FinosReminders.select(events, todayISO, seen, opts)   pure core used by run() and the tests
 *
 * Lead times: tax & insurance 7 days (money has to be arranged), maturities 3 days, subscriptions 3 days, SIP debits 1 day
 * (make sure the balance is there), goals 14 days. At most 3 reminders per run so nothing spams.
 * Needs finos-calendar.js (+ finos-taxdates.js); loads them on demand if the page didn't.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosReminders = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const LEAD = { tax: 7, insurance: 7, fd: 3, ppf: 3, sip: 1, goal: 14, budget: 0, sub: 3 };
  const MAX_PER_RUN = 3;
  const SEEN_KEY = 'finos_reminders_seen';
  const SYS_KEY = 'finos_reminders_system';

  const DAY = 86400000;
  const toDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const daysBetween = (fromISO, toISO) => Math.round((toDay(toISO) - toDay(fromISO)) / DAY);
  const localISO = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const keyOf = (e) => `${e.type}|${e.date}|${e.title}`;

  /** Pure: which events should be announced right now? */
  function select(events, todayISO, seen, opts) {
    const o = Object.assign({ max: MAX_PER_RUN, lead: LEAD }, opts);
    const fresh = [];
    events.forEach((e) => {
      const daysAway = daysBetween(todayISO, e.date);
      if (daysAway < 0 || daysAway > (o.lead[e.type] === undefined ? 3 : o.lead[e.type])) return;
      const key = e.key || keyOf(e);
      if (e.once) { if (seen && seen[key]) return; }               // once-per-key events (budget levels): never repeat within the month
      else if (seen && seen[key] === todayISO) return;             // already told the user today
      fresh.push(Object.assign({}, e, { daysAway, key }));
    });
    // soonest first; ties → money leaving the account first (tax/insurance/sip) over informational ones
    const rank = { tax: 0, insurance: 1, budget: 1, sip: 2, sub: 2, fd: 3, ppf: 3, goal: 4 };
    fresh.sort((a, b) => a.daysAway - b.daysAway || (rank[a.type] ?? 9) - (rank[b.type] ?? 9));
    return fresh.slice(0, o.max);
  }

  function when(n) { return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`; }
  function message(r) {
    const label = { tax: 'Tax', insurance: 'Insurance', sip: 'SIP', fd: 'Maturity', ppf: 'Maturity', goal: 'Goal', budget: 'Budget', sub: 'Subscription' }[r.type] || 'Reminder';
    const body = (r.sub || '').replace(/\s*Statutory default.*$/, '');
    if (r.type === 'budget') return { title: `${label}: ${r.title}`, body };                // already about "now"; no "today" suffix
    return { title: `${label}: ${r.title} — ${when(r.daysAway)}`, body };
  }

  /* ── storage helpers (FinosStore if present, else localStorage) ─────── */
  function read(k, fb) {
    try { if (root.FinosStore) return root.FinosStore.get(k, fb); const v = root.localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch (_) { return fb; }
  }
  function write(k, v) {
    try { if (root.FinosStore) root.FinosStore.set(k, v); else root.localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* quota / private mode */ }
  }

  function allEvents() {
    let ev = [];
    if (root.FinosCalendar && root.FinosCalendar.collectEvents) { try { ev = root.FinosCalendar.collectEvents(3); } catch (_) { ev = []; } }
    if (root.FinosBudget && root.FinosBudget.alertEvents) { try { ev = ev.concat(root.FinosBudget.alertEvents()); } catch (_) { /* budgets are optional */ } }
    return ev;
  }

  function upcoming(days) {
    const today = localISO(new Date());
    return allEvents()
      .map((e) => Object.assign({}, e, { daysAway: daysBetween(today, e.date), key: keyOf(e) }))
      .filter((e) => e.daysAway >= 0 && e.daysAway <= (days || 7))
      .sort((a, b) => a.daysAway - b.daysAway);
  }

  /* ── system notifications (works while the site is open; background push is a separate server feature) ── */
  function systemEnabled() { return read(SYS_KEY, false) === true && root.Notification && root.Notification.permission === 'granted'; }

  async function enableSystem() {
    if (!root.Notification) return { ok: false, reason: 'unsupported' };
    const perm = root.Notification.permission === 'granted' ? 'granted' : await root.Notification.requestPermission();
    write(SYS_KEY, perm === 'granted');
    return { ok: perm === 'granted', reason: perm };
  }
  function disableSystem() { write(SYS_KEY, false); }

  async function showSystem(m, tag) {
    try {
      const reg = root.navigator && root.navigator.serviceWorker && await root.navigator.serviceWorker.getRegistration();
      const opts = { body: m.body, tag, icon: '/assets/icons/icon-192.svg', badge: '/assets/icons/icon-192.svg' };
      if (reg && reg.showNotification) await reg.showNotification(m.title, opts); else new root.Notification(m.title, opts);
    } catch (_) { /* notification blocked — in-app toast already shown */ }
  }

  /* Mirror the next 45 days into IndexedDB so the service worker (which cannot read localStorage) can fire
     reminders while the site is closed. Also merges back what the worker already announced today. */
  function mirror(events, seen) {
    const idb = root.FinosStore && root.FinosStore.idb;
    if (!idb) return Promise.resolve();
    const today = localISO(new Date());
    const horizon = events.filter((e) => { const d = daysBetween(today, e.date); return d >= 0 && d <= 45; })
      .map((e) => ({ type: e.type, date: e.date, title: e.title, sub: e.sub || '' }));
    return idb.get('snapshots', 'upcoming-reminders').then((prev) => {
      const merged = {};                                         // per event key, the LATER "told on" date wins
      [prev && prev.seen, seen].forEach((m) => Object.keys(m || {}).forEach((k) => { if (!merged[k] || m[k] > merged[k]) merged[k] = m[k]; }));
      return idb.put('snapshots', { id: 'upcoming-reminders', updatedAt: Date.now(), events: horizon, seen: merged })
        .then(() => { write(SEEN_KEY, merged); });
    }).catch(() => { /* IndexedDB unavailable (private mode) — foreground reminders still work */ });
  }

  /** Ask the browser to wake the service worker periodically (installed Chromium PWAs only). */
  async function enableBackground() {
    try {
      const reg = await root.navigator.serviceWorker.ready;
      if (!reg.periodicSync) return { ok: false, reason: 'unsupported' };
      const st = await root.navigator.permissions.query({ name: 'periodic-background-sync' });
      if (st.state !== 'granted') return { ok: false, reason: 'permission-' + st.state };
      await reg.periodicSync.register('finos-reminders', { minInterval: 12 * 3600 * 1000 });
      return { ok: true };
    } catch (e) { return { ok: false, reason: 'error' }; }
  }

  function run() {
    const today = localISO(new Date());
    const seen = read(SEEN_KEY, {});
    const events = allEvents();
    mirror(events, seen);                                           // keep the background snapshot fresh on every visit
    const picks = select(events, today, seen);
    if (!picks.length) return [];
    picks.forEach((r) => {
      const m = message(r);
      const toast = root.FiNOS && root.FiNOS.toast;
      if (toast && toast.show) toast.show({ title: m.title, msg: m.body, type: r.daysAway <= 1 ? 'warning' : 'info', duration: 9000 });
      if (systemEnabled()) showSystem(m, r.key);
      seen[r.key] = today;
    });
    Object.keys(seen).forEach((k) => { if (daysBetween(seen[k], today) > 30) delete seen[k]; });   // prune
    write(SEEN_KEY, seen);
    return picks;
  }

  /** Load calendar deps on demand, then run once. Used by pwa-init.js on every page. */
  function boot(baseUrl) {
    const need = [];
    if (!root.FinosStore) need.push('finos-store.js');
    if (!root.FinosBudget) need.push('finos-budget.js');
    if (!root.FinosSubscriptions) need.push('finos-subscriptions.js');
    if (!root.FinosTaxDates) need.push('finos-taxdates.js');
    if (!root.FinosCalendar) need.push('finos-calendar.js');
    let left = need.length;
    if (!left) return run();
    need.forEach((f) => {
      const s = root.document.createElement('script');
      s.src = baseUrl + f; s.async = false;
      s.onload = s.onerror = () => { if (--left === 0) run(); };
      root.document.head.appendChild(s);
    });
  }

  return { select, message, upcoming, run, boot, enableSystem, disableSystem, systemEnabled, enableBackground, mirror, LEAD };
});
