/**
 * goal-auto-fund.js — FIN·OS Goal Auto-Funding Engine  v1.0
 * ─────────────────────────────────────────────────────────
 * When salary is credited → shows available surplus → one-tap
 * fund allocation across goals by deadline priority.
 *
 * Features:
 *   • Smart priority: closest deadline goals funded first
 *   • "Goal autopilot" mode — exact monthly transfer amounts
 *   • One-tap fund allocation UI
 *   • Salary credit detection via life events
 *
 * Depends on: finos-context.js
 * Dispatches: 'goal-funded' CustomEvent
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

  function daysLeft(dateStr) {
    if (!dateStr) return 9999;
    return Math.max(0, Math.floor((new Date(dateStr) - Date.now()) / 86400000));
  }

  function monthsLeft(dateStr) {
    return Math.max(1, Math.ceil(daysLeft(dateStr) / 30));
  }

  /* ══════════════════════════════════════════════════════════════════
     ALLOCATION ENGINE
  ══════════════════════════════════════════════════════════════════ */
  class GoalAllocationEngine {

    constructor() {
      this.goals = [];
      this.surplus = 0;
      this.autopilot = false;
    }

    load(ctx) {
      const rawGoals = ctx?.financial?.goals
        || ctx?.goals
        || JSON.parse(localStorage.getItem('finos_goals') || '[]');

      const income    = Number(ctx?.budget_tracker?.income_monthly || localStorage.getItem('finos_monthly_income') || 0);
      const expenses  = Number(ctx?.budget_tracker?.spent_total || localStorage.getItem('finos_monthly_expenses') || 0);
      const sipTotal  = Number(ctx?.financial?.sip_total || 0);
      this.surplus    = Math.max(0, income - expenses - sipTotal);

      this.goals = rawGoals
        .filter(g => (g.progress || 0) < 100)
        .map(g => ({
          id:          g.id || (g.name.replace(/\s+/g, '_').toLowerCase() + '_' + (g.target_date || g.target || Math.random().toString(36).slice(2,7))),
          name:        g.name,
          target:      Number(g.target || g.target_amount || 0),
          current:     Number(g.current || g.saved || g.current_amount || 0),
          target_date: g.target_date || g.deadline || null,
          priority:    g.priority || 'medium',
          icon:        g.icon || _goalIcon(g.name),
          progress:    Number(g.progress || 0),
        }))
        .sort((a, b) => daysLeft(a.target_date) - daysLeft(b.target_date)); // deadline-first

      return this;
    }

    /* ── Smart allocation plan ─────────────────────────────────────── */
    getAllocationPlan() {
      const plan = [];
      let remaining = this.surplus;

      for (const goal of this.goals) {
        if (remaining <= 0) break;
        const gap      = Math.max(0, goal.target - goal.current);
        if (gap === 0) continue;
        const ml       = monthsLeft(goal.target_date);
        const needed   = Math.ceil(gap / ml);
        const alloc    = Math.min(remaining, needed);

        plan.push({
          goal,
          gap,
          needed_monthly: needed,
          allocated: alloc,
          months_left: ml,
          on_track: alloc >= needed,
        });

        remaining -= alloc;
      }

      return {
        plan,
        total_surplus: this.surplus,
        total_allocated: this.surplus - remaining,
        unallocated: remaining
      };
    }

    /* ── Autopilot monthly guide ───────────────────────────────────── */
    getAutopilotGuide() {
      return this.goals.map(g => {
        const gap  = Math.max(0, g.target - g.current);
        const ml   = monthsLeft(g.target_date);
        const monthly = gap > 0 ? Math.ceil(gap / ml) : 0;
        return { ...g, gap, months_left: ml, monthly_needed: monthly };
      });
    }
  }

  function _goalIcon(name = '') {
    const n = name.toLowerCase();
    if (/emergency|fund/.test(n))  return '🛡️';
    if (/home|house|flat/.test(n)) return '🏠';
    if (/car|vehicle/.test(n))     return '🚗';
    if (/education|college/.test(n))return '🎓';
    if (/retire|fire/.test(n))     return '🌅';
    if (/travel|trip|vacation/.test(n)) return '✈️';
    if (/marriage|wedding/.test(n))return '💍';
    if (/health|medical/.test(n))  return '❤️';
    if (/child|kid|baby/.test(n))  return '👶';
    return '🎯';
  }

  /* ══════════════════════════════════════════════════════════════════
     SALARY CREDIT PANEL (shown when salary_credited life event fires)
  ══════════════════════════════════════════════════════════════════ */
  function showSalaryFundingPanel(ctx) {
    const engine = new GoalAllocationEngine();
    engine.load(ctx);
    const { plan, total_surplus, total_allocated, unallocated } = engine.getAllocationPlan();

    if (plan.length === 0) return;

    const existing = document.getElementById('finos-goal-fund-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'finos-goal-fund-panel';

    panel.innerHTML = `
      <style>
        #finos-goal-fund-panel {
          position:fixed;bottom:0;left:0;right:0;z-index:99998;
          background:linear-gradient(180deg,transparent,rgba(0,0,0,.4));
          padding-bottom:env(safe-area-inset-bottom,0);
        }
        .gaf-sheet {
          background:linear-gradient(145deg,#0d0f1a,#161929);
          border-top:1px solid rgba(0,212,255,.2);
          border-radius:24px 24px 0 0;
          padding:28px 24px 32px;
          max-height:80vh;overflow-y:auto;
        }
        .gaf-handle { width:36px;height:4px;background:rgba(255,255,255,.15);border-radius:2px;margin:0 auto 20px; }
        .gaf-title { font-size:18px;font-weight:800;color:#F5F7FA;margin-bottom:4px; }
        .gaf-sub { font-size:13px;color:#8892a4;margin-bottom:20px; }
        .gaf-surplus { display:flex;align-items:center;justify-content:space-between;background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.2);border-radius:14px;padding:14px 18px;margin-bottom:20px; }
        .gaf-surplus-label { font-size:12px;color:#8892a4;font-weight:600;text-transform:uppercase;letter-spacing:.05em; }
        .gaf-surplus-amount { font-size:22px;font-weight:800;color:#00d4ff; }
        .gaf-goal-row { display:flex;align-items:center;gap:14px;padding:14px;background:rgba(255,255,255,.03);border-radius:12px;margin-bottom:10px;border:1px solid rgba(255,255,255,.05); }
        .gaf-icon { font-size:24px;flex-shrink:0; }
        .gaf-info { flex:1;min-width:0; }
        .gaf-goal-name { font-size:13px;font-weight:700;color:#F5F7FA;margin-bottom:3px; }
        .gaf-goal-meta { font-size:11px;color:#8892a4; }
        .gaf-alloc { text-align:right;flex-shrink:0; }
        .gaf-alloc-amt { font-size:16px;font-weight:800;color:#22d3a6; }
        .gaf-alloc-label { font-size:10px;color:#8892a4;margin-top:2px; }
        .gaf-warning { font-size:11px;color:#f0a500; }
        .gaf-progress-bar { height:4px;background:rgba(255,255,255,.08);border-radius:2px;margin-top:8px; }
        .gaf-progress-fill { height:100%;border-radius:2px;background:linear-gradient(90deg,#7b2ff7,#00d4ff);transition:width .6s ease; }
        .gaf-actions { display:flex;gap:10px;margin-top:20px; }
        .gaf-btn { flex:1;padding:14px;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;border:1px solid;text-align:center; }
        .gaf-btn-primary { background:linear-gradient(135deg,#7b2ff7,#00d4ff);border:none;color:#fff; }
        .gaf-btn-secondary { background:transparent;border-color:rgba(255,255,255,.1);color:#8892a4; }
        .gaf-unalloc { text-align:center;font-size:12px;color:#8892a4;margin-top:14px; }
      </style>

      <div class="gaf-sheet">
        <div class="gaf-handle"></div>
        <div class="gaf-title">💰 Salary Credited!</div>
        <div class="gaf-sub">Here's your smart funding plan for this month:</div>

        <div class="gaf-surplus">
          <div>
            <div class="gaf-surplus-label">Available Surplus</div>
            <div class="gaf-surplus-amount">${INR(total_surplus)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:11px;color:#8892a4;">After expenses + SIPs</div>
            <div style="font-size:13px;font-weight:700;color:#22d3a6;">Allocate → ${INR(total_allocated)}</div>
          </div>
        </div>

        ${plan.map(item => `
          <div class="gaf-goal-row">
            <div class="gaf-icon">${item.goal.icon}</div>
            <div class="gaf-info">
              <div class="gaf-goal-name">${item.goal.name}</div>
              <div class="gaf-goal-meta">${item.months_left} months left · ${INR(item.gap)} gap</div>
              <div class="gaf-progress-bar">
                <div class="gaf-progress-fill" style="width:${item.goal.progress}%"></div>
              </div>
              ${!item.on_track ? `<div class="gaf-warning">⚠ Needs ${INR(item.needed_monthly)}/mo · short by ${INR(item.needed_monthly - item.allocated)}</div>` : ''}
            </div>
            <div class="gaf-alloc">
              <div class="gaf-alloc-amt">${INR(item.allocated)}</div>
              <div class="gaf-alloc-label">This month</div>
            </div>
          </div>
        `).join('')}

        ${unallocated > 0 ? `<div class="gaf-unalloc">${INR(unallocated)} unallocated — add to emergency fund or step up a SIP</div>` : ''}

        <div class="gaf-actions">
          <button class="gaf-btn gaf-btn-primary" onclick="window.FinosGoalFund.confirmAllocation()">
            ✅ Fund All Goals
          </button>
          <button class="gaf-btn gaf-btn-secondary" onclick="document.getElementById('finos-goal-fund-panel')?.remove()">
            Later
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    /* Store plan for confirmation */
    global.FinosGoalFund._pendingPlan = { plan, total_surplus, total_allocated };
  }

  /* ══════════════════════════════════════════════════════════════════
     AUTOPILOT WIDGET
  ══════════════════════════════════════════════════════════════════ */
  function renderAutopilotWidget(containerId, ctx) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const engine = new GoalAllocationEngine();
    engine.load(ctx);
    const guide = engine.getAutopilotGuide();

    container.innerHTML = `
      <div style="font-family:-apple-system,sans-serif;">
        <div style="font-size:13px;font-weight:700;color:#8892a4;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px;">
          🤖 Goal Autopilot — Monthly Transfer Guide
        </div>
        ${guide.map(g => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,255,255,.03);border-radius:12px;margin-bottom:8px;">
            <span style="font-size:20px;">${g.icon}</span>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;color:#F5F7FA;">${g.name}</div>
              <div style="font-size:11px;color:#8892a4;">${g.months_left} months · ${g.progress.toFixed(0)}% funded</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:15px;font-weight:800;color:#22d3a6;">${INR(g.monthly_needed)}</div>
              <div style="font-size:10px;color:#8892a4;">per month</div>
            </div>
          </div>
        `).join('')}
        <div style="font-size:11px;color:#8892a4;margin-top:12px;text-align:center;">
          Transfer these amounts on the 1st of every month after salary credit.
        </div>
      </div>
    `;
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  const FinosGoalFund = {
    _pendingPlan: null,

    init(ctx) {
      const engine = new GoalAllocationEngine();
      engine.load(ctx);
      return engine;
    },

    showPanel(ctx) {
      showSalaryFundingPanel(ctx || window.FINOS_USER_CONTEXT || {});
    },

    renderAutopilot(containerId, ctx) {
      renderAutopilotWidget(containerId, ctx || window.FINOS_USER_CONTEXT || {});
    },

    confirmAllocation() {
      const plan = this._pendingPlan;
      if (!plan) return;

      document.dispatchEvent(new CustomEvent('goal-funded', { detail: plan }));

      /* Update localStorage goals */
      try {
        const goals = JSON.parse(localStorage.getItem('finos_goals') || '[]');
        plan.plan.forEach(item => {
          const g = goals.find(g => g.id === item.goal.id || g.name === item.goal.name);
          if (g) g.current = (Number(g.current) || 0) + item.allocated;
        });
        localStorage.setItem('finos_goals', JSON.stringify(goals));
      } catch (_) {}

      document.getElementById('finos-goal-fund-panel')?.remove();

      /* Arya confirmation */
      if (window.AryaAI?._speak) {
        window.AryaAI._speak(`Done! ${INR(plan.total_allocated)} allocated across ${plan.plan.length} goals. Your future self thanks you! 🎯`);
      } else {
        window.FinosToast?.show?.(`✅ ${INR(plan.total_allocated)} allocated across ${plan.plan.length} goals!`, 'success');
      }
    },

    getAllocationPlan(ctx) {
      const engine = new GoalAllocationEngine();
      engine.load(ctx || window.FINOS_USER_CONTEXT || {});
      return engine.getAllocationPlan();
    }
  };

  global.FinosGoalFund = FinosGoalFund;

  /* ── Auto-show panel when salary credited ─────────────────────── */
  document.addEventListener('arya-life-event', e => {
    if (e.detail?.event?.id === 'salary_credited') {
      setTimeout(() => {
        FinosGoalFund.showPanel(window.FINOS_USER_CONTEXT || {});
      }, 6000); /* Show 6s after life event bubble */
    }
  });

  window.addEventListener('finos-context-ready', e => {
    if (e.detail?.phase !== 'full') return;
    /* Check if salary was credited today from context */
    const ctx = window.FINOS_USER_CONTEXT;
    const lastSalaryCreditKey = 'finos_last_salary_panel';
    const today = new Date().toDateString();
    if (localStorage.getItem(lastSalaryCreditKey) !== today) {
      const income = Number(ctx?.budget_tracker?.income_monthly || 0);
      const lastTx = ctx?.financial?.transactions?.last_credit_date;
      const lastCreditDay = lastTx ? new Date(lastTx).getDate() : 0;
      const today_day = new Date().getDate();
      if (income > 0 && Math.abs(today_day - lastCreditDay) <= 2) {
        localStorage.setItem(lastSalaryCreditKey, today);
        setTimeout(() => FinosGoalFund.showPanel(ctx), 8000);
      }
    }
  });

}(window));
