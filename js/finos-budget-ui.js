/**
 * Budget card — "This month's budgets" (renders into #finos-budget-card).   (v1.0)
 * Needs finos-budget.js. Per-category limits, progress with pace projection, and a one-click "suggest from my spending".
 * State is always shown as text as well as colour (OK / Watch / Over) so it reads without colour vision.
 */
(function () {
  'use strict';
  const B = window.FinosBudget;
  const host = document.getElementById('finos-budget-card');
  const stripHost = document.getElementById('finos-budget-strip');
  if (!B || (!host && !stripHost)) return;

  const inr = (n) => (window.FinosFmt ? window.FinosFmt.inr(n) : '₹' + Math.round(n).toLocaleString('en-IN'));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const COLORS = { ok: '#22D3A6', warn: '#FFB347', over: '#EF4444' };
  const WORDS = { ok: 'On track', warn: 'Watch', over: 'Over' };

  function render() {
    const limits = B.getLimits();
    const st = B.status(B.transactions(), limits, new Date());
    const hasAny = Object.keys(limits).length > 0;
    const unused = B.CATEGORIES.filter((c) => !(c in limits));
    const rows = st.rows.map((r) => {
      const pct = r.limit ? Math.min(100, r.pct) : 0;
      const col = COLORS[r.state];
      const note = !r.limit ? 'No limit set'
        : r.state === 'over' ? `${inr(r.spent - r.limit)} over`
        : `${inr(r.left)} left${r.pace ? ' · pace → ' + r.projectedPct + '%' : ''}`;
      return `<div class="bud-row" style="padding:12px 0;border-top:1px solid var(--border-soft,rgba(255,255,255,.08));">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap;">
          <strong style="font-size:14px;">${esc(r.category)}</strong>
          <span style="font-size:12px;color:var(--text-secondary,#A1A8B8);">${inr(r.spent)} of
            <input type="number" min="0" step="500" value="${r.limit || ''}" placeholder="set limit" data-cat="${esc(r.category)}" aria-label="Monthly limit for ${esc(r.category)}"
              style="width:92px;padding:4px 8px;border-radius:8px;border:1px solid var(--border-soft,rgba(255,255,255,.18));background:transparent;color:inherit;font-size:12px;"></span>
        </div>
        <div role="progressbar" aria-label="${esc(r.category)} budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"
          style="height:8px;border-radius:5px;background:var(--border-soft,rgba(255,255,255,.09));margin:8px 0 5px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${col};border-radius:5px;transition:width .4s;"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary,#A1A8B8);">
          <span>${note}</span>
          <span style="font-weight:700;color:${r.limit ? col : 'inherit'};">${r.limit ? WORDS[r.state] + ' · ' + r.pct + '%' : ''}</span>
        </div></div>`;
    }).join('');

    host.innerHTML = `
      <section aria-labelledby="bud-title" style="background:var(--bg-surface,rgba(255,255,255,.04));border:1px solid var(--border-soft,rgba(255,255,255,.1));border-radius:20px;padding:20px;margin-bottom:22px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
          <div>
            <h2 id="bud-title" style="margin:0;font-size:18px;">📊 This month's budgets</h2>
            <p style="margin:4px 0 0;font-size:12.5px;color:var(--text-secondary,#A1A8B8);">Day ${st.day} of ${st.daysInMonth} · ${inr(st.total.spent)} spent${st.total.limit ? ' of ' + inr(st.total.limit) + ' budgeted (' + st.total.pct + '%)' : ''}. Investing and income are not counted as spending.</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" id="bud-suggest" class="btn-outline" style="padding:8px 14px;border-radius:10px;cursor:pointer;">${hasAny ? 'Re-suggest from spending' : 'Suggest budgets from my spending'}</button>
            ${unused.length ? `<select id="bud-add" aria-label="Add a category budget" style="padding:8px 10px;border-radius:10px;font-size:13px;width:auto;max-width:190px;height:auto;min-height:0;"><option value="">+ Add category</option>${unused.map((c) => `<option>${esc(c)}</option>`).join('')}</select>` : ''}
          </div>
        </div>
        <div id="bud-msg" role="status" style="min-height:18px;font-size:12.5px;color:var(--text-secondary,#A1A8B8);margin-top:8px;"></div>
        ${rows || `<p style="font-size:13px;color:var(--text-secondary,#A1A8B8);line-height:1.6;margin:14px 0 0;">No budgets yet. Log a few expenses (quick capture, voice journal or a connected bank) and tap <b>Suggest budgets</b> — or add a category and type a limit. You'll get an alert when a category reaches 80%, is on pace to overshoot, or goes over.</p>`}
      </section>`;

    host.querySelectorAll('input[data-cat]').forEach((inp) => inp.addEventListener('change', () => { B.setLimit(inp.dataset.cat, inp.value); render(); }));
    const add = host.querySelector('#bud-add');
    if (add) add.addEventListener('change', () => { if (add.value) { B.setLimit(add.value, 5000); render(); const i = host.querySelector(`input[data-cat="${add.value}"]`); if (i) i.focus(); } });
    host.querySelector('#bud-suggest').addEventListener('click', () => {
      const income = parseFloat(localStorage.getItem('finos_monthly_income') || '0');
      const s = B.suggest(B.transactions(), income, new Date());
      const msg = host.querySelector('#bud-msg');
      if (!Object.keys(s).length) { msg.textContent = 'Not enough history yet — add your monthly income above, or log some expenses first.'; return; }
      if (hasAny && !window.confirm('Replace your current limits with the suggestions?')) return;
      B.setLimits(s);
      render();
      host.querySelector('#bud-msg').textContent = 'Suggested from your last few months (average + 5% headroom). Adjust any limit.';
    });
  }
  /* Compact one-line summary for the dashboard (#finos-budget-strip). Hidden unless there is something useful to say. */
  function renderStrip() {
    const limits = B.getLimits();
    const txns = B.transactions();
    const st = B.status(txns, limits, new Date());
    const expenses = txns.filter((t) => t.kind === 'expense').length;
    if (!Object.keys(limits).length) {
      stripHost.innerHTML = expenses >= 3
        ? `<a href="budget-forecast.html" style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:12px;padding:12px 16px;border-radius:14px;border:1px dashed var(--border-soft,rgba(255,255,255,.18));text-decoration:none;color:var(--text-secondary,#A1A8B8);font-size:13px;"><span>🧾 You've logged ${expenses} expenses — set category budgets to get overspend alerts.</span><b style="white-space:nowrap;">Set budgets →</b></a>`
        : '';
      return;
    }
    const over = st.rows.filter((r) => r.state === 'over').length, watch = st.rows.filter((r) => r.state === 'warn').length;
    const pct = st.total.pct === null ? 0 : st.total.pct;
    const col = over ? COLORS.over : (watch ? COLORS.warn : COLORS.ok);
    const flags = [over ? `${over} over` : '', watch ? `${watch} to watch` : ''].filter(Boolean).join(' · ') || 'all on track';
    stripHost.innerHTML = `<a href="budget-forecast.html" aria-label="Budget this month: ${pct}% used, ${flags}. Open budgets"
      style="display:block;margin-top:12px;padding:12px 16px;border-radius:14px;border:1px solid var(--border-soft,rgba(255,255,255,.1));background:var(--bg-surface,rgba(255,255,255,.04));text-decoration:none;color:inherit;">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:13px;">
        <span><b>🧾 Budget this month</b> · day ${st.day}/${st.daysInMonth} · ${inr(st.total.spent)} of ${inr(st.total.limit)}</span>
        <span style="font-weight:700;color:${col};">${pct}% used · ${flags}</span></div>
      <div role="progressbar" aria-hidden="true" style="height:6px;border-radius:4px;background:var(--border-soft,rgba(255,255,255,.09));margin-top:8px;overflow:hidden;"><div style="height:100%;width:${Math.min(100, pct)}%;background:${col};"></div></div></a>`;
  }

  if (host) render();
  if (stripHost) renderStrip();
  window.addEventListener('storage', (e) => { if (e.key === 'finos_transactions' || e.key === 'finos_budgets') { if (host) render(); if (stripHost) renderStrip(); } });
})();
