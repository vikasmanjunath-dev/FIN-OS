/**
 * FIN-OS Future Loss — what a monthly money leak would have become if it had been invested.   (v1.0)
 * Powers the "Sync Future Loss" button on html/system-leak.html.
 *
 * Pure part (works in Node, unit-tested):
 *   FinosLeak.compute({ txns, subscriptionsMonthly, now, include, rate, redirectPct })
 *       → { enoughData, days, categories[{category, monthly, included}], monthly, horizons[{years, invested, value, gain}], redirect }
 *   FinosLeak.fv(monthly, annualPct, years)     → future value of a monthly investment (start-of-month, the same as the SIP calculator)
 *   FinosLeak.DEFAULT_INCLUDE / MIN_DAYS / HORIZONS
 *
 * Browser part:
 *   FinosLeak.sync(el, sampleCosts)   → reads FIN-OS data, renders the panel into `el`, saves the figures for the rest of the app.
 *                                       `sampleCosts` (₹ per item) only powers the empty-state "Try it with sample leaks" button.
 *   FinosLeak.sample(el, sampleCosts) → the same panel with clearly labelled SAMPLE leaks
 *
 * Where the numbers come from (never invented):
 *   • finos_transactions, via FinosBudget.normalize(): only `expense` rows count; income and SIP/saving never do.
 *   • finos_subscriptions_monthly, written by the Subscription Tracker. Subscriptions use the larger of the tracker figure and
 *     the logged payments, never the sum, so a Netflix bill that is both tracked and logged is not counted twice.
 * Method: each category's spend over the last 90 days (or since the first logged expense, if that is later), scaled to a month.
 * Under 14 days of history is too thin to scale up, so only the tracker's subscription figure is used.
 * The default "leak" categories are the discretionary ones; the user can tick any category in or out.
 *
 * Keys written: finos_leak_monthly, finos_leak_future_20y, finos_leak_synced_at, finos_leak_cats (the user's ticks), finos_leak_rate.
 * The growth rate is an assumption (default 12% a year, a long-run equity-like return). It is not a promise.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosLeak = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const DEFAULT_INCLUDE = ['Food & Dining', 'Entertainment', 'Shopping', 'Subscriptions'];
  const HORIZONS = [10, 20, 30];
  const MIN_DAYS = 14;
  const WINDOW_DAYS = 90;
  const DEFAULT_RATE = 12;
  const DEFAULT_REDIRECT = 25;
  const SUBS = 'Subscriptions';

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  /** Future value of `monthly` invested at the start of every month for `years` at `annualPct` a year. */
  function fv(monthly, annualPct, years) {
    const n = Math.round(years * 12), i = annualPct / 1200;
    if (!(monthly > 0) || n <= 0) return 0;
    return i === 0 ? monthly * n : monthly * ((Math.pow(1 + i, n) - 1) / i) * (1 + i);
  }

  const horizonRows = (monthly, rate) => HORIZONS.map((years) => {
    const invested = monthly * years * 12, value = fv(monthly, rate, years);
    return { years, invested: Math.round(invested), value: Math.round(value), gain: Math.round(value - invested) };
  });

  /* ── dates as plain YYYY-MM-DD strings (UTC maths, so IST never shifts a day) ── */
  const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
  const dayNum = (iso) => { const m = ISO.exec(iso); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
  const pad = (n) => String(n).padStart(2, '0');
  const isoOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  function compute(opts) {
    opts = opts || {};
    const rate = clamp(Number.isFinite(+opts.rate) ? +opts.rate : DEFAULT_RATE, 0, 30);
    const redirectPct = clamp(Number.isFinite(+opts.redirectPct) ? +opts.redirectPct : DEFAULT_REDIRECT, 0, 100);
    const include = new Set(Array.isArray(opts.include) ? opts.include : DEFAULT_INCLUDE);
    const subsMonthly = Math.max(0, Number(opts.subscriptionsMonthly) || 0);
    const todayISO = isoOf(opts.now instanceof Date ? opts.now : new Date());
    const today = dayNum(todayISO), start = today - (WINDOW_DAYS - 1);

    const rows = (Array.isArray(opts.txns) ? opts.txns : []).filter((t) => t && t.kind === 'expense' && t.amount > 0 && Number.isFinite(dayNum(t.date)));
    const win = rows.filter((t) => { const d = dayNum(t.date); return d >= start && d <= today; });
    const first = win.reduce((m, t) => Math.min(m, dayNum(t.date)), Infinity);
    const days = win.length ? today - first + 1 : 0;
    const enoughData = days >= MIN_DAYS;

    const byCat = {};
    if (enoughData) win.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
    const monthlyOf = {};
    Object.keys(byCat).forEach((c) => { monthlyOf[c] = (byCat[c] * 30) / days; });
    if (subsMonthly > 0) monthlyOf[SUBS] = Math.max(monthlyOf[SUBS] || 0, subsMonthly);

    const categories = Object.keys(monthlyOf)
      .map((category) => ({ category, monthly: Math.round(monthlyOf[category]), included: include.has(category) }))
      .filter((c) => c.monthly > 0)
      .sort((a, b) => b.monthly - a.monthly);
    const monthly = categories.reduce((s, c) => s + (c.included ? c.monthly : 0), 0);
    const redirectMonthly = Math.round((monthly * redirectPct) / 100);

    return {
      enoughData, days, rate, redirectPct, categories, monthly,
      hasAnyData: categories.length > 0,
      horizons: horizonRows(monthly, rate),
      redirect: { pct: redirectPct, monthly: redirectMonthly, horizons: horizonRows(redirectMonthly, rate) },
    };
  }

  const api = { compute, fv, DEFAULT_INCLUDE, HORIZONS, MIN_DAYS, WINDOW_DAYS, DEFAULT_RATE, DEFAULT_REDIRECT };
  if (typeof root.document === 'undefined') return api;

  /* ═════════════════════ browser part ═════════════════════ */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fmt(n) {
    n = Math.round(Number(n) || 0);
    const a = Math.abs(n);
    return a >= 1e7 ? '₹' + (a / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? '₹' + (a / 1e5).toFixed(2) + ' L' : '₹' + a.toLocaleString('en-IN');
  }
  function rd(k, fb) {
    try {
      if (root.FinosStore && root.FinosStore.get) return root.FinosStore.get(k, fb);
      const v = root.localStorage.getItem(k);
      return v == null ? fb : JSON.parse(v);
    } catch (e) { return fb; }
  }
  function wr(k, v) {
    try { if (root.FinosStore && root.FinosStore.set) return root.FinosStore.set(k, v); root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode / quota */ }
  }

  function loadTxns() {
    if (root.FinosBudget && root.FinosBudget.transactions) { try { return root.FinosBudget.transactions(); } catch (e) { /* fall through */ } }
    return [];
  }

  /** Persist the figures other parts of FIN-OS can read. Returns the stored object. */
  function save(r) {
    const twenty = r.horizons.find((h) => h.years === 20);
    wr('finos_leak_monthly', r.monthly);
    wr('finos_leak_future_20y', twenty ? twenty.value : 0);
    wr('finos_leak_synced_at', new Date().toISOString());
    return { monthly: r.monthly, future20: twenty ? twenty.value : 0 };
  }

  function panelHTML(r, ctx) {
    const sample = ctx.mode === 'sample';
    const head = '<div class="fl-head"><span class="fl-kicker">FUTURE LOSS</span><h3 id="fl-title" tabindex="-1">What this leak costs you later</h3></div>';
    if (!r.hasAnyData && !sample) {
      return head + '<div class="fl-empty"><p>Nothing to analyse yet. This reads the expenses you log and the subscriptions you track. It never guesses.</p>' +
        '<div class="fl-row-btns"><a class="fl-btn" href="subscription-tracker.html">Add your subscriptions</a><a class="fl-btn" href="track-finances.html">Log your spending</a>' +
        '<button type="button" class="fl-btn ghost" id="fl-sample">Try it with sample leaks</button></div></div>';
    }
    const source = sample
      ? '<p class="fl-source warn">SAMPLE values from the radar above. Not your data. Log spending or track subscriptions to see your real number.</p>'
      : '<p class="fl-source">' + (r.enoughData
        ? 'Based on your last ' + Math.min(r.days, WINDOW_DAYS) + ' days of logged spending' + (ctx.subs > 0 ? ' and your tracked subscriptions' : '') + ', scaled to a month.'
        : 'Only your tracked subscriptions are counted. Log at least ' + MIN_DAYS + ' days of spending to include your other habits (you have ' + r.days + ').') + '</p>';
    const cats = r.categories.map((c) => '<li><label class="fl-cat"><input type="checkbox" data-cat="' + esc(c.category) + '"' + (c.included ? ' checked' : '') + (sample ? ' disabled' : '') + '><span class="fl-cat-n">' + esc(c.category) + '</span><b>' + fmt(c.monthly) + '<small>/mo</small></b></label></li>').join('');
    const hz = r.horizons.map((h) => '<div class="fl-h"><span>' + h.years + ' years</span><b>' + fmt(h.value) + '</b><small>you would put in ' + fmt(h.invested) + ', and growth adds ' + fmt(h.gain) + '</small></div>').join('');
    const rh = r.redirect.horizons.find((h) => h.years === 20);
    return head + source +
      '<div class="fl-big"><span>Monthly leak</span><b id="fl-monthly">' + fmt(r.monthly) + '</b></div>' +
      (cats ? '<fieldset class="fl-cats"><legend>What counts as a leak (tick to include)</legend><ul>' + cats + '</ul></fieldset>' : '') +
      '<div class="fl-controls"><label class="fl-ctl">Assumed yearly growth <input type="number" id="fl-rate" min="0" max="30" step="0.5" value="' + esc(r.rate) + '"' + (sample ? ' disabled' : '') + '>%</label></div>' +
      '<p class="fl-label">If that money had been invested instead</p><div class="fl-horizons" id="fl-horizons">' + hz + '</div>' +
      '<div class="fl-redirect"><label for="fl-pct">If you redirect <b id="fl-pct-v">' + r.redirect.pct + '%</b> of it (' + fmt(r.redirect.monthly) + ' a month)</label>' +
      '<input type="range" id="fl-pct" min="0" max="100" step="5" value="' + r.redirect.pct + '" aria-label="Share of the leak to redirect into investing">' +
      '<p class="fl-redirect-out" id="fl-redirect-out">…it becomes <b>' + fmt(rh ? rh.value : 0) + '</b> in 20 years.</p></div>' +
      '<div class="fl-row-btns"><a class="fl-btn" href="sip-stepup.html">Plan a step-up SIP →</a><a class="fl-btn ghost" href="' + encodeURI('../calculators/investment & wealth/sip.html') + '">SIP calculator</a></div>' +
      '<p class="fl-fine" id="fl-saved" role="status" aria-live="polite">' + (sample ? '' : 'Saved on this device, so your other FIN-OS tools can use it.') + ' An illustration using an assumed growth rate, not a promise of returns.</p>';
  }

  function mount(el, mode, sampleCosts) {
    if (!el) return;
    const sample = mode === 'sample';
    const txns = sample ? [] : loadTxns();
    const subs = sample ? 0 : Number(rd('finos_subscriptions_monthly', 0)) || 0;
    let include = sample ? DEFAULT_INCLUDE : (rd('finos_leak_cats', null) || DEFAULT_INCLUDE);
    let rate = Number(rd('finos_leak_rate', DEFAULT_RATE)); if (!Number.isFinite(rate)) rate = DEFAULT_RATE;
    let pct = DEFAULT_REDIRECT;

    function calc() {
      if (sample) {
        const m = (Array.isArray(sampleCosts) ? sampleCosts : []).reduce((s, c) => s + (Number(c) > 0 ? Number(c) : 0), 0);
        return { enoughData: true, days: 30, rate: DEFAULT_RATE, categories: [{ category: 'Radar sample leaks', monthly: m, included: true }], monthly: m, hasAnyData: m > 0, horizons: horizonRows(m, DEFAULT_RATE),
          redirect: { pct, monthly: Math.round(m * pct / 100), horizons: horizonRows(Math.round(m * pct / 100), DEFAULT_RATE) } };
      }
      return compute({ txns, subscriptionsMonthly: subs, now: new Date(), include, rate, redirectPct: pct });
    }
    function draw(keepFocus) {
      const r = calc();
      el.hidden = false;
      el.innerHTML = panelHTML(r, { mode, subs });
      if (!sample && r.hasAnyData) { save(r); }
      const t = el.querySelector('#fl-title');
      if (t && !keepFocus) { t.focus({ preventScroll: true }); el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }
    // delegated, replaced each mount so a second click never stacks listeners
    el.onchange = (e) => {
      const t = e.target;
      if (t.matches && t.matches('input[data-cat]')) {
        const set = new Set(include); if (t.checked) set.add(t.dataset.cat); else set.delete(t.dataset.cat);
        include = [...set]; wr('finos_leak_cats', include); draw(true);
        const again = el.querySelector('input[data-cat][data-cat="' + (t.dataset.cat.replace(/"/g, '\\"')) + '"]'); if (again) again.focus();
      } else if (t.id === 'fl-rate') {
        const v = parseFloat(t.value); rate = Number.isFinite(v) ? clamp(v, 0, 30) : DEFAULT_RATE; wr('finos_leak_rate', rate); draw(true);
        const again = el.querySelector('#fl-rate'); if (again) again.focus();
      }
    };
    el.oninput = (e) => {
      if (e.target.id === 'fl-pct') {
        pct = clamp(parseInt(e.target.value, 10) || 0, 0, 100);
        const r = calc(), rh = r.redirect.horizons.find((h) => h.years === 20);
        el.querySelector('#fl-pct-v').textContent = pct + '%';
        el.querySelector('#fl-redirect-out').innerHTML = '…it becomes <b>' + fmt(rh ? rh.value : 0) + '</b> in 20 years.';
        const lab = el.querySelector('label[for="fl-pct"]'); if (lab) lab.innerHTML = 'If you redirect <b id="fl-pct-v">' + pct + '%</b> of it (' + fmt(r.redirect.monthly) + ' a month)';
      }
    };
    el.onclick = (e) => { if (e.target.id === 'fl-sample') mount(el, 'sample', sampleCosts); };
    draw(false);
  }

  return Object.assign(api, { sync: (el, sampleCosts) => mount(el, 'data', sampleCosts), sample: (el, sampleCosts) => mount(el, 'sample', sampleCosts), fmt, save });
});
