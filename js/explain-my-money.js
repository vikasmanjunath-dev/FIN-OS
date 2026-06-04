/**
 * explain-my-money.js — FIN·OS "Explain My Money" Monthly Report  v1.0
 * ──────────────────────────────────────────────────────────────────────
 * Auto-generates a plain-English monthly financial summary:
 * "Here's your July in plain English: You earned ₹72K, spent ₹51K,
 *  saved ₹21K (29% savings rate). Best: Utilities. Worst: Food delivery..."
 *
 * Output: Rich HTML panel + copyable WhatsApp text + printable view.
 * Depends on: finos-context.js
 */
(function (global) {
  'use strict';

  const INR = n => {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(1) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    if (n >= 1e3) return '₹' + (n / 1e3).toFixed(0) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  };

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  /* ── Build report data from context ─────────────────────────────── */
  function buildReport(ctx, targetMonth) {
    const now      = targetMonth ? new Date(targetMonth) : new Date();
    now.setDate(1);
    const monthName = MONTHS[now.getMonth()];
    const year      = now.getFullYear();

    const budget    = ctx?.budget_tracker || {};
    const txns      = ctx?.financial?.transactions || {};
    const goals     = ctx?.financial?.goals || [];
    const portfolio = ctx?.financial?.portfolio || {};
    const journal   = ctx?.trade_journal || {};
    const sips      = ctx?.financial?.sips || [];

    const income    = Number(budget.income_monthly || localStorage.getItem('finos_monthly_income') || 0);
    const spent     = Number(budget.spent_total || localStorage.getItem('finos_monthly_expenses') || 0);
    const saved     = Math.max(0, income - spent);
    const savingsRate = income > 0 ? Math.round(saved / income * 100) : 0;
    const netWorth  = Number(ctx?.profile?.net_worth || localStorage.getItem('finos_net_worth') || 0);
    const nwChange  = Number(ctx?.profile?.net_worth_change || localStorage.getItem('finos_nw_change_monthly') || 0);

    /* Category analysis */
    const cats = (txns.top_categories || []).map(c => ({
      name: c.cat,
      amount: Number(c.amt),
      budget: Number(c.budget || c.amt * 1.1),
      pct: income > 0 ? Math.round(c.amt / income * 100) : 0,
    }));
    const bestCat   = cats.reduce((b, c) => (!b || (c.budget - c.amount > b.budget - b.amount)) ? c : b, null);
    const worstCat  = cats.reduce((w, c) => (!w || (c.amount - c.budget > w.amount - w.budget)) ? c : w, null);

    /* SIP growth */
    const sipTotal   = sips.reduce((s, x) => s + Number(x.amount || 0), 0);
    const sipGrowth  = sips.reduce((s, x) => s + Number(x.gain_this_month || x.amount * 0.01 || 0), 0);

    /* Goal highlights */
    const bestGoal   = goals.reduce((b, g) => (!b || g.progress > b.progress) ? g : b, null);
    const behindGoal = goals.find(g => g.progress < 30 && g.target_date);

    /* Trading summary */
    const tradePnl   = Number(journal.mtm_pnl || journal.monthly_pnl || 0);

    /* Health score */
    const healthScore = Number(ctx?.profile?.health_score || localStorage.getItem('finos_health_score') || 0);
    const prevHealth  = Number(localStorage.getItem('finos_prev_health_score') || healthScore);
    const healthDelta = healthScore - prevHealth;

    /* Grade */
    const grade = savingsRate >= 30 ? 'A' : savingsRate >= 20 ? 'B' : savingsRate >= 10 ? 'C' : 'D';
    const gradeColor = { A: '#22d3a6', B: '#00d4ff', C: '#f0a500', D: '#ff4444' }[grade];

    return {
      monthName, year, grade, gradeColor,
      income, spent, saved, savingsRate,
      netWorth, nwChange,
      cats, bestCat, worstCat,
      sipTotal, sipGrowth,
      goals, bestGoal, behindGoal,
      tradePnl, healthScore, healthDelta,
      name: ctx?.profile?.name || localStorage.getItem('finos_display_name') || 'Friend',
    };
  }

  /* ── Plain-English summary text ─────────────────────────────────── */
  function buildNarrative(r) {
    const lines = [];

    lines.push(`Here's your ${r.monthName} ${r.year} in plain English:`);
    lines.push('');

    if (r.income > 0) {
      lines.push(`📊 You earned ${INR(r.income)}, spent ${INR(r.spent)}, and saved ${INR(r.saved)} (${r.savingsRate}% savings rate). Grade: ${r.grade}`);
    }

    if (r.bestCat) {
      lines.push(`✅ Best category: ${r.bestCat.name} — you stayed under budget here.`);
    }
    if (r.worstCat && r.worstCat.amount > r.worstCat.budget) {
      lines.push(`⚠️ Watch out: ${r.worstCat.name} — overspent by ${INR(r.worstCat.amount - r.worstCat.budget)}.`);
    }

    if (r.sipTotal > 0) {
      lines.push(`💰 SIPs: ${INR(r.sipTotal)} invested${r.sipGrowth > 0 ? `, grew ${INR(r.sipGrowth)} this month` : ''}.`);
    }

    if (r.netWorth > 0) {
      const sign = r.nwChange >= 0 ? '+' : '';
      lines.push(`📈 Net worth: ${INR(r.netWorth)} (${sign}${INR(r.nwChange)} vs last month).`);
    }

    if (r.bestGoal) {
      lines.push(`🎯 Goal on track: "${r.bestGoal.name}" — ${r.bestGoal.progress?.toFixed(0)}% funded.`);
    }
    if (r.behindGoal) {
      lines.push(`⚡ Behind: "${r.behindGoal.name}" — needs attention.`);
    }

    if (r.tradePnl !== 0) {
      lines.push(`📓 Trading P&L: ${r.tradePnl >= 0 ? '+' : ''}${INR(r.tradePnl)} this month.`);
    }

    if (r.healthScore > 0) {
      const delta = r.healthDelta !== 0 ? ` (${r.healthDelta > 0 ? '+' : ''}${r.healthDelta} pts)` : '';
      lines.push(`🏥 Financial health score: ${r.healthScore}/100${delta}.`);
    }

    lines.push('');
    lines.push(`Generated by FIN·OS · ${r.monthName} ${r.year}`);

    return lines.join('\n');
  }

  /* ── Rich HTML renderer ─────────────────────────────────────────── */
  function renderReportHTML(r) {
    const sign = n => n >= 0 ? '+' : '';

    return `
      <div class="emm-wrap" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;">

        <!-- Header -->
        <div style="background:linear-gradient(135deg,${r.gradeColor}18,rgba(0,0,0,0));border:1px solid ${r.gradeColor}30;border-radius:20px;padding:24px;margin-bottom:18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <div>
              <div style="font-size:11px;color:#8892a4;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px;">Monthly Report</div>
              <div style="font-size:22px;font-weight:900;">${r.monthName} ${r.year}</div>
              <div style="font-size:13px;color:#a0aec0;margin-top:4px;">Hey ${r.name} 👋 Here's how you did</div>
            </div>
            <div style="text-align:center;background:${r.gradeColor}20;border:2px solid ${r.gradeColor}40;border-radius:16px;padding:14px 24px;">
              <div style="font-size:40px;font-weight:900;color:${r.gradeColor};line-height:1;">${r.grade}</div>
              <div style="font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:.06em;margin-top:2px;">This Month</div>
            </div>
          </div>
        </div>

        <!-- Key Metrics -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px;">
          ${_metricCard('Earned', INR(r.income), '#F5F7FA')}
          ${_metricCard('Spent', INR(r.spent), '#ff6666')}
          ${_metricCard('Saved', INR(r.saved), r.savingsRate >= 20 ? '#22d3a6' : '#f0a500')}
          ${_metricCard('Savings Rate', r.savingsRate + '%', r.savingsRate >= 20 ? '#22d3a6' : '#f0a500')}
          ${r.netWorth > 0 ? _metricCard('Net Worth', INR(r.netWorth), '#00d4ff') : ''}
          ${r.nwChange !== 0 ? _metricCard('NW Change', (r.nwChange>=0?'+':'')+INR(r.nwChange), r.nwChange>=0?'#22d3a6':'#ff4444') : ''}
        </div>

        <!-- Narrative -->
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:18px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8892a4;margin-bottom:14px;">📝 Plain English Summary</div>
          <p style="font-size:14px;color:#F5F7FA;line-height:1.8;">
            You earned <strong>${INR(r.income)}</strong>, spent <strong style="color:#ff6666">${INR(r.spent)}</strong>,
            and saved <strong style="color:${r.savingsRate>=20?'#22d3a6':'#f0a500'}">${INR(r.saved)}</strong>
            (${r.savingsRate}% savings rate).
            ${r.bestCat ? `<br>✅ <strong>Best:</strong> ${r.bestCat.name} — stayed under budget.` : ''}
            ${r.worstCat && r.worstCat.amount > r.worstCat.budget
              ? `<br>⚠️ <strong>Over-budget:</strong> ${r.worstCat.name} — ${INR(r.worstCat.amount - r.worstCat.budget)} extra.` : ''}
            ${r.sipTotal > 0 ? `<br>💰 SIPs: ${INR(r.sipTotal)} invested${r.sipGrowth > 0 ? `, grew by ${INR(r.sipGrowth)}` : ''}.` : ''}
            ${r.tradePnl !== 0 ? `<br>📓 Trading: ${sign(r.tradePnl)}${INR(r.tradePnl)} P&L.` : ''}
          </p>
        </div>

        <!-- Spending breakdown -->
        ${r.cats.length > 0 ? `
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:18px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8892a4;margin-bottom:14px;">📊 Spending Breakdown</div>
          ${r.cats.slice(0,6).map(c => {
            const over = c.amount > c.budget;
            const barPct = Math.min(100, r.income > 0 ? c.amount / r.income * 100 : c.pct);
            return `
              <div style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span style="font-size:13px;">${c.name}</span>
                  <span style="font-size:13px;font-weight:700;color:${over?'#ff6666':'#22d3a6'}">${INR(c.amount)} ${over?'⚠️':'✅'}</span>
                </div>
                <div style="height:6px;background:rgba(255,255,255,.08);border-radius:3px;">
                  <div style="height:100%;border-radius:3px;background:${over?'#ff4444':'#22d3a6'};width:${barPct}%;transition:width .6s ease;"></div>
                </div>
                <div style="font-size:10px;color:#8892a4;margin-top:3px;">${c.pct}% of income</div>
              </div>`;
          }).join('')}
        </div>` : ''}

        <!-- Goals snapshot -->
        ${r.goals.length > 0 ? `
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:18px;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#8892a4;margin-bottom:14px;">🎯 Goals Snapshot</div>
          ${r.goals.slice(0,4).map(g => `
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
              <div style="flex:1;">
                <div style="font-size:13px;font-weight:600;">${g.name}</div>
                <div style="height:5px;background:rgba(255,255,255,.08);border-radius:3px;margin-top:5px;">
                  <div style="height:100%;border-radius:3px;background:linear-gradient(90deg,#7b2ff7,#00d4ff);width:${Math.min(100, g.progress||0)}%;"></div>
                </div>
              </div>
              <div style="font-size:13px;font-weight:700;color:${g.progress>=50?'#22d3a6':'#f0a500'};flex-shrink:0;">${(g.progress||0).toFixed(0)}%</div>
            </div>`).join('')}
        </div>` : ''}

        <!-- Health Score -->
        ${r.healthScore > 0 ? `
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:18px;display:flex;align-items:center;gap:16px;margin-bottom:18px;">
          <div style="font-size:36px;font-weight:900;color:${r.healthScore>=70?'#22d3a6':r.healthScore>=50?'#f0a500':'#ff4444'};">${r.healthScore}</div>
          <div>
            <div style="font-size:14px;font-weight:700;">Financial Health Score</div>
            <div style="font-size:12px;color:#8892a4;">${r.healthDelta>0?`↑ Up ${r.healthDelta} pts this month`:r.healthDelta<0?`↓ Down ${Math.abs(r.healthDelta)} pts`:' No change'}</div>
          </div>
        </div>` : ''}

        <!-- Footer -->
        <div style="text-align:center;font-size:11px;color:#8892a4;padding-top:12px;">
          Generated by FIN·OS · ${r.monthName} ${r.year}
        </div>
      </div>
    `;
  }

  function _metricCard(label, value, color) {
    return `<div style="background:rgba(255,255,255,.04);border-radius:12px;padding:14px;text-align:center;">
      <div style="font-size:16px;font-weight:800;color:${color};">${value}</div>
      <div style="font-size:10px;color:#8892a4;margin-top:4px;text-transform:uppercase;letter-spacing:.05em;">${label}</div>
    </div>`;
  }

  /* ── Render into DOM ─────────────────────────────────────────────── */
  function render(containerId, ctx) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const r   = buildReport(ctx || window.FINOS_USER_CONTEXT || {});
    const html = renderReportHTML(r);

    container.innerHTML = `
      <div style="font-family:-apple-system,sans-serif;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
          <div>
            <div style="font-size:18px;font-weight:800;color:#F5F7FA;">📄 Explain My Money</div>
            <div style="font-size:13px;color:#8892a4;">Your ${r.monthName} financial story in plain English</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button onclick="window.ExplainMyMoney.share()" style="padding:9px 16px;border-radius:10px;background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.3);color:#25d366;font-size:12px;font-weight:700;cursor:pointer;">📱 WhatsApp</button>
            <button onclick="window.ExplainMyMoney.print()" style="padding:9px 16px;border-radius:10px;background:rgba(123,47,247,.1);border:1px solid rgba(123,47,247,.3);color:#a78bfa;font-size:12px;font-weight:700;cursor:pointer;">🖨 Print</button>
          </div>
        </div>
        <div id="_emm_content">${html}</div>
      </div>`;

    global.ExplainMyMoney._lastReport = r;
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  const ExplainMyMoney = {
    _lastReport: null,
    build: buildReport,
    render,

    getNarrative(ctx) {
      return buildNarrative(buildReport(ctx || window.FINOS_USER_CONTEXT || {}));
    },

    share() {
      const r = this._lastReport;
      if (!r) return;
      const text = buildNarrative(r);
      const url  = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    },

    print() {
      const r = this._lastReport || buildReport(window.FINOS_USER_CONTEXT || {});
      const win = window.open('', '_blank', 'width=700,height=900');
      win.document.write(`<html><head><title>FIN·OS Report - ${r.monthName} ${r.year}</title><style>body{background:#0a0c14;padding:24px;}</style></head><body>${renderReportHTML(r)}</body></html>`);
      win.document.close();
      setTimeout(() => win.print(), 400);
    },

    /* Called by Arya on context-ready — auto-render if placeholder exists */
    autoMount() {
      const el = document.getElementById('finos-monthly-report');
      if (el) this.render('finos-monthly-report', window.FINOS_USER_CONTEXT || {});
    }
  };

  global.ExplainMyMoney = ExplainMyMoney;

  window.addEventListener('finos-context-ready', e => {
    if (e.detail?.phase !== 'full') return;
    ExplainMyMoney.autoMount();
  });

}(window));
