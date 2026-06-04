/**
 * sip-intelligence.js — FIN·OS SIP Intelligence Layer  v1.0
 * ──────────────────────────────────────────────────────────
 * Beyond tracking SIPs — manages them intelligently:
 *   • Missed SIP detection → one-tap catch-up
 *   • Step-up recommendations (overperforming SIPs)
 *   • Underperforming fund alerts (CAGR < category avg 2yr)
 *   • Quarterly SIP Health Report
 *   • Consistency heatmap (missed months calendar)
 *
 * Depends on: finos-context.js, supabase-config.js
 * Dispatches: 'sip-alert' CustomEvent
 */
(function (global) {
  'use strict';

  const INR = n => {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    if (n >= 1e3) return '₹' + (n / 1e3).toFixed(0) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  };

  /* Category average CAGRs (approximate, from AMFI data) */
  const CATEGORY_BENCHMARKS = {
    'large_cap':      { cagr_3y: 13.5, cagr_5y: 12.8 },
    'mid_cap':        { cagr_3y: 17.2, cagr_5y: 15.9 },
    'small_cap':      { cagr_3y: 22.1, cagr_5y: 18.4 },
    'flexi_cap':      { cagr_3y: 14.8, cagr_5y: 13.5 },
    'elss':           { cagr_3y: 13.9, cagr_5y: 13.1 },
    'index':          { cagr_3y: 13.2, cagr_5y: 12.6 },
    'debt':           { cagr_3y: 6.8,  cagr_5y: 7.1  },
    'hybrid':         { cagr_3y: 11.4, cagr_5y: 10.8 },
    'international':  { cagr_3y: 9.2,  cagr_5y: 10.1 },
    'default':        { cagr_3y: 13.0, cagr_5y: 12.0 }
  };

  /* ══════════════════════════════════════════════════════════════════
     CORE ENGINE
  ══════════════════════════════════════════════════════════════════ */
  class SIPIntelligenceEngine {

    constructor() {
      this.sips = [];
      this.alerts = [];
    }

    /* ── Load SIPs from context ────────────────────────────────────── */
    load(ctx) {
      const rawSips = ctx?.financial?.sips
        || ctx?.sips
        || JSON.parse(localStorage.getItem('finos_sips') || '[]');
      this.sips = rawSips.map(s => ({
        id:           s.id || Math.random().toString(36).slice(2),
        name:         s.fund_name || s.name || 'Unknown Fund',
        amount:       Number(s.amount || s.sip_amount || 0),
        category:     (s.category || 'default').toLowerCase().replace(/\s/g, '_'),
        cagr_1y:      Number(s.cagr_1y || s.returns_1y || 0),
        cagr_3y:      Number(s.cagr_3y || s.returns_3y || 0),
        cagr_5y:      Number(s.cagr_5y || s.returns_5y || 0),
        invested:     Number(s.invested || s.total_invested || 0),
        current_val:  Number(s.current_value || s.current_val || 0),
        start_date:   s.start_date || s.created_at || null,
        missed_months: s.missed_months || [],
        is_direct:    s.is_direct || false,
        expense_ratio: Number(s.expense_ratio || s.er || 0),
        folio:        s.folio || null,
      }));
      return this;
    }

    /* ── Analyze all SIPs ──────────────────────────────────────────── */
    analyze() {
      this.alerts = [];
      this.sips.forEach(sip => this._analyzeSip(sip));
      return this;
    }

    _analyzeSip(sip) {
      const bench = CATEGORY_BENCHMARKS[sip.category] || CATEGORY_BENCHMARKS.default;

      /* Underperforming check (3Y CAGR < category avg by >2%) */
      if (sip.cagr_3y > 0 && sip.cagr_3y < bench.cagr_3y - 2) {
        this.alerts.push({
          type:     'underperforming',
          priority: 'high',
          sip,
          bench,
          message:  `${sip.name} — 3Y CAGR ${sip.cagr_3y.toFixed(1)}% vs category avg ${bench.cagr_3y}%. Consider switching to a top quartile fund.`,
          action:   'switch',
          savings:  this._switchSavings(sip, bench)
        });
      }

      /* Step-up opportunity (outperforming + been running 1+ year) */
      const months = sip.start_date
        ? Math.floor((Date.now() - new Date(sip.start_date)) / 2592000000)
        : 12;
      if (months >= 12 && sip.cagr_1y > bench.cagr_3y + 2 && sip.amount < 50000) {
        const stepUp = Math.min(Math.ceil(sip.amount * 0.1 / 500) * 500, 5000);
        this.alerts.push({
          type:     'stepup',
          priority: 'medium',
          sip,
          stepUp,
          message:  `${sip.name} is outperforming! Step up by ${INR(stepUp)}/mo → extra ${INR(this._stepUpCorpus(sip, stepUp))} in 10 years.`,
          action:   'stepup'
        });
      }

      /* Missed SIP check */
      if ((sip.missed_months || []).length > 0) {
        const lastMissed = sip.missed_months[sip.missed_months.length - 1];
        const impact = this._missedImpact(sip.amount);
        this.alerts.push({
          type:     'missed',
          priority: 'medium',
          sip,
          lastMissed,
          message:  `${sip.name} — ${sip.missed_months.length} missed SIP(s). Missing 1 month costs ~${INR(impact)} over 20 years via compounding.`,
          action:   'catchup'
        });
      }

      /* Direct vs Regular check */
      if (!sip.is_direct && sip.expense_ratio > 1.0) {
        const regularVsDirect = this._regularVsDirectDiff(sip);
        this.alerts.push({
          type:     'direct_switch',
          priority: 'low',
          sip,
          message:  `${sip.name} is a Regular plan (ER: ${sip.expense_ratio}%). Switch to Direct → save ~${INR(regularVsDirect)} over 10 years.`,
          action:   'direct'
        });
      }
    }

    /* ── Calculations ──────────────────────────────────────────────── */
    _switchSavings(sip, bench) {
      const years = 10;
      const r1 = sip.cagr_3y / 100 / 12;
      const r2 = bench.cagr_3y / 100 / 12;
      const n  = years * 12;
      const fv1 = sip.amount * ((Math.pow(1 + r1, n) - 1) / r1) * (1 + r1);
      const fv2 = sip.amount * ((Math.pow(1 + r2, n) - 1) / r2) * (1 + r2);
      return Math.max(0, fv2 - fv1);
    }

    _stepUpCorpus(sip, stepUp) {
      const years = 10;
      const r = (sip.cagr_3y || 13) / 100 / 12;
      const n = years * 12;
      return stepUp * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
    }

    _missedImpact(amount) {
      const r = 0.12 / 12;
      const n = 240;
      return amount * Math.pow(1 + r, n);
    }

    _regularVsDirectDiff(sip) {
      const years = 10;
      const erDiff = Math.max(0, sip.expense_ratio - 0.2) / 100;
      return sip.amount * 12 * years * erDiff * 1.5;
    }

    /* ── Get health report ─────────────────────────────────────────── */
    getHealthReport() {
      const totalSIPs  = this.sips.length;
      const totalMonthly = this.sips.reduce((s, x) => s + x.amount, 0);
      const avgCAGR    = totalSIPs
        ? this.sips.reduce((s, x) => s + (x.cagr_3y || 0), 0) / totalSIPs
        : 0;
      const missed     = this.sips.filter(s => s.missed_months?.length > 0).length;
      const underperf  = this.alerts.filter(a => a.type === 'underperforming').length;
      const stepups    = this.alerts.filter(a => a.type === 'stepup').length;
      const score      = Math.max(0, 100 - missed * 15 - underperf * 20 + stepups * 5);

      return {
        totalSIPs, totalMonthly, avgCAGR: avgCAGR.toFixed(1),
        missed, underperf, stepups, score: Math.min(100, score),
        alerts: this.alerts
      };
    }

    /* ── Generate consistency heatmap data ─────────────────────────── */
    getHeatmapData(sipId) {
      const sip = this.sips.find(s => s.id === sipId);
      if (!sip) return [];
      const months = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        months.push({
          month: key,
          label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
          paid: !(sip.missed_months || []).includes(key),
          amount: sip.amount
        });
      }
      return months;
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     UI RENDERER
  ══════════════════════════════════════════════════════════════════ */
  function renderSIPDashboard(containerId, ctx) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const engine = new SIPIntelligenceEngine();
    engine.load(ctx).analyze();
    const report = engine.getHealthReport();

    const scoreColor = report.score >= 80 ? '#22d3a6' : report.score >= 60 ? '#f0a500' : '#ff4444';

    container.innerHTML = `
      <div class="sip-intel-wrap">
        <div class="sip-header">
          <div class="sip-score-ring">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="8"/>
              <circle cx="40" cy="40" r="34" fill="none" stroke="${scoreColor}" stroke-width="8"
                stroke-dasharray="${report.score * 2.135} 213.5" stroke-linecap="round"
                transform="rotate(-90 40 40)" style="transition:stroke-dasharray 1s ease"/>
            </svg>
            <div class="sip-score-val" style="color:${scoreColor}">${report.score}</div>
          </div>
          <div class="sip-stats">
            <div class="sip-stat"><span class="sip-stat-val">${report.totalSIPs}</span><span class="sip-stat-lbl">Active SIPs</span></div>
            <div class="sip-stat"><span class="sip-stat-val">${INR(report.totalMonthly)}</span><span class="sip-stat-lbl">Monthly</span></div>
            <div class="sip-stat"><span class="sip-stat-val">${report.avgCAGR}%</span><span class="sip-stat-lbl">Avg CAGR (3Y)</span></div>
          </div>
        </div>

        ${report.alerts.length === 0
          ? `<div class="sip-no-alerts">✅ All SIPs are healthy! Keep the discipline going.</div>`
          : `<div class="sip-alerts-list">
              ${report.alerts.map(a => _renderAlert(a)).join('')}
            </div>`}

        ${report.totalSIPs === 0
          ? `<div class="sip-empty">
              <p>No SIPs found. Add your SIP details to get intelligent recommendations.</p>
              <button class="sip-btn-primary" onclick="window.location.href='../calculators/sip.html'">Set Up Your First SIP →</button>
            </div>` : ''}
      </div>

      <style>
        .sip-intel-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        .sip-header { display:flex; align-items:center; gap:24px; padding:20px; background:rgba(255,255,255,.03); border-radius:16px; margin-bottom:20px; }
        .sip-score-ring { position:relative; flex-shrink:0; }
        .sip-score-val { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:20px; font-weight:800; }
        .sip-stats { display:flex; gap:24px; flex-wrap:wrap; }
        .sip-stat { display:flex; flex-direction:column; gap:4px; }
        .sip-stat-val { font-size:20px; font-weight:700; color:#F5F7FA; }
        .sip-stat-lbl { font-size:11px; color:#8892a4; text-transform:uppercase; letter-spacing:.06em; }
        .sip-alert-card { border-radius:12px; padding:16px 18px; margin-bottom:12px; border-left:3px solid; }
        .sip-alert--high { background:rgba(255,68,68,.06); border-left-color:#ff4444; }
        .sip-alert--medium { background:rgba(240,165,0,.06); border-left-color:#f0a500; }
        .sip-alert--low { background:rgba(0,212,255,.06); border-left-color:#00d4ff; }
        .sip-alert-title { font-size:13px; font-weight:700; color:#F5F7FA; margin-bottom:6px; }
        .sip-alert-msg { font-size:12.5px; color:#a0aec0; line-height:1.6; margin-bottom:12px; }
        .sip-alert-actions { display:flex; gap:8px; }
        .sip-btn { padding:7px 14px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid; }
        .sip-btn-primary { background:rgba(0,212,255,.15); border-color:rgba(0,212,255,.4); color:#00d4ff; }
        .sip-btn-secondary { background:transparent; border-color:rgba(255,255,255,.1); color:#8892a4; }
        .sip-no-alerts { text-align:center; padding:30px; color:#22d3a6; font-weight:600; }
        .sip-empty { text-align:center; padding:30px; color:#8892a4; }
        .sip-heatmap { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin-top:16px; }
        .sip-hm-cell { padding:8px 4px; border-radius:8px; text-align:center; font-size:10px; }
        .sip-hm-paid { background:rgba(34,211,166,.2); color:#22d3a6; }
        .sip-hm-miss { background:rgba(255,68,68,.2); color:#ff4444; }
      </style>
    `;
  }

  function _renderAlert(a) {
    const ICONS = { underperforming: '📉', stepup: '📈', missed: '⚠️', direct_switch: '💡' };
    const LABELS = { underperforming: 'Underperforming Fund', stepup: 'Step-Up Opportunity', missed: 'Missed SIP', direct_switch: 'Switch to Direct' };
    const cls = { high: 'sip-alert--high', medium: 'sip-alert--medium', low: 'sip-alert--low' }[a.priority] || 'sip-alert--medium';

    let actions = '';
    if (a.action === 'catchup') {
      actions = `<button class="sip-btn sip-btn-primary" onclick="window.FinosSIPIntel?.catchUp('${a.sip.id}')">🔄 Catch-Up Now</button>`;
    } else if (a.action === 'switch') {
      actions = `<button class="sip-btn sip-btn-primary" onclick="window.FinosSIPIntel?.findBetter('${a.sip.id}')">🔍 Find Better Fund</button>`;
    } else if (a.action === 'stepup') {
      actions = `<button class="sip-btn sip-btn-primary" onclick="window.FinosSIPIntel?.stepUp('${a.sip.id}', ${a.stepUp})">⬆️ Step Up ${INR(a.stepUp)}/mo</button>`;
    } else if (a.action === 'direct') {
      actions = `<button class="sip-btn sip-btn-primary" onclick="window.FinosSIPIntel?.switchDirect('${a.sip.id}')">↗️ Switch to Direct</button>`;
    }

    return `
      <div class="sip-alert-card ${cls}">
        <div class="sip-alert-title">${ICONS[a.type] || '📊'} ${LABELS[a.type] || a.type}</div>
        <div class="sip-alert-msg">${a.message}</div>
        <div class="sip-alert-actions">
          ${actions}
          <button class="sip-btn sip-btn-secondary">Dismiss</button>
        </div>
      </div>`;
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  const FinosSIPIntel = {
    engine: null,

    init(ctx) {
      this.engine = new SIPIntelligenceEngine();
      this.engine.load(ctx).analyze();
      return this;
    },

    render(containerId, ctx) {
      renderSIPDashboard(containerId, ctx || window.FINOS_USER_CONTEXT || {});
    },

    getReport() { return this.engine?.getHealthReport() || {}; },
    getHeatmap(sipId) { return this.engine?.getHeatmapData(sipId) || []; },

    catchUp(sipId) {
      const sip = this.engine?.sips.find(s => s.id === sipId);
      if (!sip) return;
      document.dispatchEvent(new CustomEvent('sip-catchup', { detail: { sip } }));
      if (window.AryaAI?._speak) {
        window.AryaAI._speak(`To catch up on ${sip.name}, invest ${INR(sip.amount)} as a lump sum today. It counts as this month's SIP. Want me to calculate the compounding impact?`);
      }
    },

    findBetter(sipId) {
      const sip = this.engine?.sips.find(s => s.id === sipId);
      if (sip) window.location.href = `../html/mf-intelligence.html?category=${sip.category}&switch_from=${sipId}`;
    },

    stepUp(sipId, amount) {
      document.dispatchEvent(new CustomEvent('sip-stepup', { detail: { sipId, amount } }));
      if (window.AryaAI?._speak) window.AryaAI._speak(`Great move! Stepping up by ${INR(amount)} per month — I'll log this and show you the corpus impact.`);
    },

    switchDirect(sipId) {
      document.dispatchEvent(new CustomEvent('sip-direct-switch', { detail: { sipId } }));
    },

    /* Monthly SIP Health Report (returns HTML) */
    buildHealthReport() {
      const r = this.getReport();
      const date = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      return `
        <div style="background:linear-gradient(135deg,#0d0f1a,#161929);border-radius:20px;padding:30px;color:#F5F7FA;font-family:-apple-system,sans-serif;max-width:600px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#8892a4;margin-bottom:8px;">SIP Health Report · ${date}</div>
          <div style="font-size:28px;font-weight:800;margin-bottom:20px;">SIP Score: <span style="color:${r.score>=80?'#22d3a6':r.score>=60?'#f0a500':'#ff4444'}">${r.score}/100</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px;">
            <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:14px;"><div style="font-size:20px;font-weight:700;">${r.totalSIPs}</div><div style="font-size:11px;color:#8892a4;margin-top:4px;">Active SIPs</div></div>
            <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:14px;"><div style="font-size:20px;font-weight:700;">${INR(r.totalMonthly)}</div><div style="font-size:11px;color:#8892a4;margin-top:4px;">Monthly</div></div>
            <div style="background:rgba(255,255,255,.04);border-radius:12px;padding:14px;"><div style="font-size:20px;font-weight:700;">${r.avgCAGR}%</div><div style="font-size:11px;color:#8892a4;margin-top:4px;">Avg CAGR (3Y)</div></div>
          </div>
          ${r.alerts.length ? `<div style="font-size:13px;color:#f0a500;font-weight:600;">⚠ ${r.alerts.length} action(s) needed — check your SIP dashboard.</div>` : '<div style="font-size:13px;color:#22d3a6;font-weight:600;">✅ All SIPs on track!</div>'}
        </div>`;
    }
  };

  global.FinosSIPIntel = FinosSIPIntel;

  /* ── Auto-init ─────────────────────────────────────────────────── */
  window.addEventListener('finos-context-ready', e => {
    if (e.detail?.phase !== 'full') return;
    const ctx = window.FINOS_USER_CONTEXT;
    if (!ctx) return;
    FinosSIPIntel.init(ctx);

    /* Dispatch alerts to Arya life events */
    const report = FinosSIPIntel.getReport();
    if (report.alerts.length) {
      document.dispatchEvent(new CustomEvent('sip-intelligence-ready', { detail: report }));
    }
  });

}(window));
