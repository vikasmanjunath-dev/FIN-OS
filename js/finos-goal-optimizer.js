/* finos-goal-optimizer.js — Financial Goals Intelligence Engine
 *
 * Enhances the existing Life Goals Planner with:
 *   • Required monthly SIP per goal (PMT formula with inflation-adjusted target)
 *   • Goal priority score (urgency × importance × fundedness gap)
 *   • Timeline conflict detection (overlapping peak-funding windows)
 *   • Feasibility probability based on current savings rate vs total SIP required
 *   • Recommended monthly SIP split across all goals
 *
 * Reads from:
 *   finos_goals          — JSON array from Life Goals Planner
 *   finos_monthly_income — net income
 *   finos_savings_rate   — current savings rate %
 *   finos_sip_value      — existing SIP corpus for feasibility estimate
 *
 * Writes to:
 *   finos_goals_priority     — JSON: ranked goal list with SIP requirements
 *   finos_goals_total_sip    — total monthly SIP needed across all goals
 *   finos_goals_feasibility  — feasibility score 0-100
 *
 * Public API (window.FinosGoalOptimizer):
 *   renderPriority(el)   — ranked goals with SIP and priority badge
 *   renderSIPPlan(el)    — monthly SIP split + feasibility
 *   renderConflicts(el)  — timeline conflict detection
 *   _compute()           — raw data
 */
window.FinosGoalOptimizer = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, String(v));
  const gss = k => localStorage.getItem(k) || '';
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');

  const INFLATION = 0.06; // 6% default inflation

  /* ── PMT: monthly SIP to reach target FV ────────────────────────
     FV = PMT × [(1+r)^n - 1] / r  →  PMT = FV × r / [(1+r)^n - 1]
     r = monthly return, n = months
  ────────────────────────────────────────────────────────────────── */
  function _sip(targetFV, annualReturn, months, existingCorpus) {
    if (months <= 0) return 0;
    const r   = annualReturn / 12;
    const fvC = existingCorpus * Math.pow(1 + r, months); // future value of existing savings
    const needed = Math.max(0, targetFV - fvC);
    if (needed <= 0) return 0;
    if (r === 0) return Math.round(needed / months);
    return Math.round(needed * r / (Math.pow(1 + r, months) - 1));
  }

  /* ── Inflation-adjusted target ───────────────────────────────── */
  function _inflatedTarget(todayAmount, years) {
    return Math.round(todayAmount * Math.pow(1 + INFLATION, years));
  }

  /* ── Priority score (0-100) ──────────────────────────────────── */
  function _priorityScore(goal, monthsLeft, sipRequired, income) {
    // Urgency: closer deadline = higher score
    const urgency = monthsLeft <= 0 ? 100 : Math.max(0, 100 - (monthsLeft / 2));
    // Gap: how far from funded
    const progress = Number(goal.progress) || Number(goal.current) / Math.max(1, Number(goal.target)) * 100 || 0;
    const gap      = Math.max(0, 100 - progress);
    // Affordability pressure: SIP as % of income
    const pressure = income > 0 ? Math.min(100, (sipRequired / income) * 100 * 2) : 50;
    return Math.round((urgency * 0.5) + (gap * 0.3) + (pressure * 0.2));
  }

  const GOAL_RETURNS = {
    retirement:  0.10,
    education:   0.10,
    home:        0.08,
    car:         0.07,
    travel:      0.07,
    emergency:   0.065,
    wedding:     0.08,
    default:     0.10,
  };

  function _goalReturn(goal) {
    const type = (goal.type || goal.category || goal.name || '').toLowerCase();
    for (const [key, r] of Object.entries(GOAL_RETURNS)) {
      if (type.includes(key)) return r;
    }
    return GOAL_RETURNS.default;
  }

  /* ── Core computation ──────────────────────────────────────────── */
  function _compute() {
    let goals = [];
    try { goals = JSON.parse(gss('finos_goals') || '[]') || []; } catch {}
    if (!goals.length) {
      // Try context goals
      try { goals = (window.FINOS_USER_CONTEXT?.financial?.goals) || []; } catch {}
    }

    const income        = gs('finos_monthly_income') || gs('finos_salary_take_home') || 60000;
    const savingsRate   = gs('finos_savings_rate') || 20;
    const availableSIP  = Math.round(income * savingsRate / 100);
    const existingSIP   = gs('finos_sip_value');

    const today = new Date();

    const enriched = goals.map((g, i) => {
      const targetDate  = g.target_date ? new Date(g.target_date) : null;
      const monthsLeft  = targetDate ? Math.max(0, Math.round((targetDate - today) / (30.44 * 24 * 3600 * 1000))) : 120;
      const yearsLeft   = monthsLeft / 12;
      const targetToday = Number(g.target) || Number(g.amount) || 0;
      const targetInflated = _inflatedTarget(targetToday, yearsLeft);
      const progress    = Number(g.progress) || (Number(g.current) > 0 ? Math.round(Number(g.current) / Math.max(1, targetToday) * 100) : 0);
      const fundedAmt   = Math.round(targetInflated * progress / 100);
      const annualR     = _goalReturn(g);
      const sipNeeded   = _sip(targetInflated, annualR, monthsLeft, fundedAmt);
      const priority    = _priorityScore(g, monthsLeft, sipNeeded, income);
      const onTrack     = progress >= Math.max(0, 100 - (monthsLeft / (120) * 100)); // rough on-track check

      return {
        ...g,
        id: g.id || `g${i}`,
        monthsLeft, yearsLeft, targetInflated, progress, fundedAmt,
        annualR, sipNeeded, priority, onTrack,
        targetDate: targetDate ? targetDate.toISOString().slice(0, 7) : null,
      };
    }).sort((a, b) => b.priority - a.priority);

    const totalSIPNeeded = enriched.reduce((s, g) => s + g.sipNeeded, 0);
    const feasibility    = totalSIPNeeded > 0 ? Math.min(100, Math.round((availableSIP / totalSIPNeeded) * 100)) : 100;

    // Conflict detection: goals with overlapping peak funding windows (within 12 months of each other)
    const conflicts = [];
    for (let i = 0; i < enriched.length; i++) {
      for (let j = i + 1; j < enriched.length; j++) {
        const a = enriched[i], b = enriched[j];
        if (!a.targetDate || !b.targetDate) continue;
        const diff = Math.abs(a.monthsLeft - b.monthsLeft);
        if (diff <= 12 && a.sipNeeded + b.sipNeeded > availableSIP * 0.8) {
          conflicts.push({ a: a.name || a.goal || `Goal ${i+1}`, b: b.name || b.goal || `Goal ${j+1}`, diff, combined: a.sipNeeded + b.sipNeeded });
        }
      }
    }

    // Persist
    ss('finos_goals_priority',   JSON.stringify(enriched.map(g => ({ id: g.id, name: g.name || g.goal, sipNeeded: g.sipNeeded, priority: g.priority }))));
    ss('finos_goals_total_sip',  totalSIPNeeded);
    ss('finos_goals_feasibility',feasibility);

    return { goals: enriched, income, savingsRate, availableSIP, existingSIP, totalSIPNeeded, feasibility, conflicts };
  }

  /* ── Progress ring ───────────────────────────────────────────── */
  function _ring(pct, color) {
    const r = 36, cx = 50, c = 2 * Math.PI * r, dash = Math.min(pct/100,1) * c;
    return `<svg width="100" height="100" viewBox="0 0 100 100" style="flex-shrink:0;">
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--border-soft)" stroke-width="8"/>
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${color}" stroke-width="8"
        stroke-dasharray="${dash} ${c}" stroke-dashoffset="${c*0.25}" stroke-linecap="round"/>
      <text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="middle"
        font-family="'JetBrains Mono',monospace" font-size="16" font-weight="900" fill="${color}">${Math.round(pct)}%</text>
    </svg>`;
  }

  /* ══════════════════════════════════════════════════════════════
     PRIORITY VIEW
  ══════════════════════════════════════════════════════════════ */
  function renderPriority(container) {
    if (!container) return;
    const c = _compute();

    if (!c.goals.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:14px;">
        No financial goals found. Add goals in <a href="life-goals-planner.html" style="color:#22D3A6;">Life Goals Planner</a> to see priority analysis.
      </div>`;
      return;
    }

    const goalCards = c.goals.map((g, i) => {
      const name = g.name || g.goal || `Goal ${i+1}`;
      const pBadge = g.priority >= 75 ? { label:'🔴 Urgent', bg:'rgba(239,68,68,.12)', border:'rgba(239,68,68,.3)', color:'#EF4444' }
        : g.priority >= 50           ? { label:'🟡 High',   bg:'rgba(255,179,71,.10)', border:'rgba(255,179,71,.3)', color:'#FFB347' }
        : g.priority >= 25           ? { label:'🟢 Medium', bg:'rgba(34,211,166,.08)', border:'rgba(34,211,166,.25)', color:'#22D3A6' }
        :                              { label:'⚪ Low',     bg:'var(--border-soft)', border:'var(--border-medium)', color:'var(--text-muted)' };

      const ringColor = g.progress >= 75 ? '#22D3A6' : g.progress >= 40 ? '#FFB347' : '#EF4444';
      const timeLabel = g.monthsLeft <= 0 ? 'Past due' : g.monthsLeft < 12 ? `${g.monthsLeft}mo left` : `${(g.monthsLeft/12).toFixed(1)}yr left`;

      return `<div style="padding:18px;background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;margin-bottom:12px;display:flex;gap:16px;align-items:flex-start;">
        ${_ring(g.progress, ringColor)}
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
            <div style="font-size:15px;font-weight:800;color:#F5F7FA;">${name}</div>
            <div style="padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:${pBadge.bg};border:1px solid ${pBadge.border};color:${pBadge.color};">${pBadge.label}</div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:8px;">
            <div style="background:var(--border-soft);border-radius:8px;padding:7px 10px;">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Target (today ₹)</div>
              <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:800;color:#F5F7FA;">${INR(g.target || g.amount || 0)}</div>
            </div>
            <div style="background:var(--border-soft);border-radius:8px;padding:7px 10px;">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Inflation-adj. target</div>
              <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:800;color:#FFB347;">${INR(g.targetInflated)}</div>
            </div>
            <div style="background:var(--border-soft);border-radius:8px;padding:7px 10px;">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Monthly SIP needed</div>
              <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:800;color:#4F7CFF;">${INR(g.sipNeeded)}</div>
            </div>
            <div style="background:var(--border-soft);border-radius:8px;padding:7px 10px;">
              <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;">Timeline</div>
              <div style="font-size:13px;font-weight:700;color:${g.monthsLeft <= 6 ? '#EF4444' : '#F5F7FA'};">${timeLabel}${g.targetDate ? ` · ${g.targetDate}` : ''}</div>
            </div>
          </div>
          <div style="height:4px;background:var(--border-soft);border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${Math.min(g.progress,100)}%;background:${ringColor};border-radius:2px;transition:width .6s;"></div>
          </div>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = `
<div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:18px;margin-bottom:20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;">
  <div style="text-align:center;">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Goals</div>
    <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:#4F7CFF;">${c.goals.length}</div>
  </div>
  <div style="text-align:center;">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Total SIP Needed</div>
    <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:#FFB347;">${INR(c.totalSIPNeeded)}</div>
  </div>
  <div style="text-align:center;">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Available SIP</div>
    <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:#22D3A6;">${INR(c.availableSIP)}</div>
  </div>
  <div style="text-align:center;">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Feasibility</div>
    <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:24px;font-weight:900;color:${c.feasibility >= 80 ? '#22D3A6' : c.feasibility >= 50 ? '#FFB347' : '#EF4444'};">${c.feasibility}%</div>
  </div>
</div>

<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px;">Goals by Priority (highest first)</div>
${goalCards}`;
  }

  /* ══════════════════════════════════════════════════════════════
     SIP PLAN VIEW
  ══════════════════════════════════════════════════════════════ */
  function renderSIPPlan(container) {
    if (!container) return;
    const c = _compute();

    if (!c.goals.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:14px;">No goals to plan. Add goals in Life Goals Planner first.</div>`;
      return;
    }

    const feasColor  = c.feasibility >= 80 ? '#22D3A6' : c.feasibility >= 50 ? '#FFB347' : '#EF4444';
    const surplus    = c.availableSIP - c.totalSIPNeeded;
    const maxBar     = Math.max(...c.goals.map(g => g.sipNeeded), c.availableSIP, 1);

    const sipRows = c.goals.map((g, i) => {
      const name   = g.name || g.goal || `Goal ${i+1}`;
      const barW   = Math.round((g.sipNeeded / maxBar) * 100);
      const colors = ['#4F7CFF','#22D3A6','#FFB347','#9B5DE5','#00D4FF','#EF4444'];
      const color  = colors[i % colors.length];
      return `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <div style="font-size:13px;font-weight:700;color:#F5F7FA;">${name}</div>
          <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:800;color:${color};">${INR(g.sipNeeded)}/mo</div>
        </div>
        <div style="height:8px;background:var(--border-soft);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${barW}%;background:${color};border-radius:4px;"></div>
        </div>
      </div>`;
    }).join('');

    // Scenario: what if savings rate increases?
    const scenarios = [5, 10, 15].map(extra => {
      const newRate = Math.min(c.savingsRate + extra, 70);
      const newAvail= Math.round(c.income * newRate / 100);
      const newFeas = Math.min(100, Math.round(newAvail / Math.max(1, c.totalSIPNeeded) * 100));
      return `<div style="padding:10px 14px;background:var(--border-soft);border:1px solid var(--border-soft);border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:12px;color:var(--text-secondary);">+${extra}% savings rate → ${newRate}% (${INR(newAvail)}/mo)</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:800;color:${newFeas >= 80 ? '#22D3A6' : '#FFB347'};">${newFeas}% feasible</div>
      </div>`;
    }).join('');

    container.innerHTML = `
<div style="background:${feasColor}12;border:1px solid ${feasColor}30;border-radius:20px;padding:24px;margin-bottom:22px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Goal Feasibility</div>
  <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">
    <div>
      <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:52px;font-weight:900;color:${feasColor};line-height:1;">${c.feasibility}%</div>
      <div style="font-size:13px;color:var(--text-muted);margin-top:4px;">of goals achievable at current savings rate</div>
    </div>
    <div style="flex:1;min-width:200px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:12px;color:var(--text-muted);">
        <span>Available SIP: ${INR(c.availableSIP)}/mo</span>
        <span>Needed: ${INR(c.totalSIPNeeded)}/mo</span>
      </div>
      <div style="height:10px;background:var(--border-soft);border-radius:5px;overflow:hidden;">
        <div style="height:100%;width:${Math.min(c.feasibility,100)}%;background:${feasColor};border-radius:5px;transition:width .6s;"></div>
      </div>
      <div style="margin-top:8px;font-size:13px;font-weight:700;color:${surplus >= 0 ? '#22D3A6' : '#EF4444'};">
        ${surplus >= 0 ? `✓ Surplus ${INR(surplus)}/mo after all goals` : `⚠ Gap: ${INR(-surplus)}/mo — increase savings or push timelines`}
      </div>
    </div>
  </div>
</div>

<div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;margin-bottom:16px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:14px;">Monthly SIP Allocation by Goal</div>
  ${sipRows}
  <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-soft);display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:13px;font-weight:700;color:#F5F7FA;">Total Required</div>
    <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:16px;font-weight:900;color:#FFB347;">${INR(c.totalSIPNeeded)}/mo</div>
  </div>
</div>

<div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;margin-bottom:16px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px;">If You Increase Savings Rate…</div>
  <div style="display:flex;flex-direction:column;gap:8px;">${scenarios}</div>
</div>

<div style="background:rgba(34,211,166,.05);border:1px solid rgba(34,211,166,.12);border-radius:14px;padding:16px;font-size:12px;color:var(--text-secondary);line-height:1.7;">
  💡 <strong>How SIP amounts are calculated</strong><br>
  Each goal uses PMT formula: monthly SIP to grow from current funded amount to inflation-adjusted target by deadline.
  Return assumed: Equity goals 10% p.a. · Home/Wedding 8% · Emergency/Debt 6.5% · All goals inflation-adjusted at 6% p.a.
</div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     CONFLICTS VIEW
  ══════════════════════════════════════════════════════════════ */
  function renderConflicts(container) {
    if (!container) return;
    const c = _compute();

    if (!c.goals.length) {
      container.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:14px;">No goals to analyse for conflicts.</div>`;
      return;
    }

    // Timeline visualisation — sort by target date
    const sorted = [...c.goals].filter(g => g.targetDate).sort((a, b) => a.monthsLeft - b.monthsLeft);
    const maxMonths = Math.max(...sorted.map(g => g.monthsLeft), 12);

    const timelineRows = sorted.map((g, i) => {
      const name   = g.name || g.goal || `Goal ${i+1}`;
      const left   = 0;
      const width  = Math.max(2, Math.round((g.monthsLeft / maxMonths) * 100));
      const colors = ['#4F7CFF','#22D3A6','#FFB347','#9B5DE5','#00D4FF','#EF4444'];
      const color  = colors[i % colors.length];
      const label  = g.monthsLeft < 12 ? `${g.monthsLeft}mo` : `${(g.monthsLeft/12).toFixed(1)}yr`;
      return `<div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <div style="font-size:13px;font-weight:700;color:#F5F7FA;">${name}</div>
          <div style="font-size:12px;color:var(--text-muted);">${label} · ${INR(g.sipNeeded)}/mo SIP · ${g.targetDate || ''}</div>
        </div>
        <div style="height:16px;background:var(--border-soft);border-radius:4px;overflow:hidden;position:relative;">
          <div style="position:absolute;left:0;top:0;height:100%;width:${width}%;background:${color};border-radius:4px;opacity:.85;"></div>
          <div style="position:absolute;left:6px;top:0;height:100%;display:flex;align-items:center;font-size:10px;font-weight:700;color:#fff;white-space:nowrap;">${name}</div>
        </div>
      </div>`;
    }).join('');

    const conflictCards = c.conflicts.map(cf => `
      <div style="padding:14px 16px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:12px;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:700;color:#EF4444;margin-bottom:4px;">⚠️ Funding Conflict: "${cf.a}" + "${cf.b}"</div>
        <div style="font-size:12px;color:var(--text-secondary);">These goals peak within ${cf.diff} months of each other. Combined SIP ${INR(cf.combined)}/mo may strain cash flow.</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:6px;">💡 Consider pushing one deadline by 6-12 months or partially pre-funding the closer goal now.</div>
      </div>`).join('');

    const tips = [
      'Stagger goals 12+ months apart when possible to smooth SIP load',
      'For short-term goals (&lt;3yr), use debt funds or RD — not equity',
      'For goals 7yr+, pure equity SIP maximises corpus via CAGR compounding',
      'Use annual bonus / increments to pre-fund the nearest goal and reduce its SIP burden',
      'Prioritise non-negotiable goals (education, retirement) over lifestyle goals (car, travel)',
    ];

    container.innerHTML = `
<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:14px;">Goal Timeline</div>
<div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;margin-bottom:20px;">
  <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px;">Bar width proportional to time remaining · Dashed = 0 months (now) → right = ${(maxMonths/12).toFixed(1)} years</div>
  ${timelineRows || '<div style="color:var(--text-muted);font-size:13px;">Set target dates in Life Goals Planner to see timeline.</div>'}
</div>

${c.conflicts.length ? `
<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#EF4444;margin-bottom:12px;">⚠️ Detected Conflicts (${c.conflicts.length})</div>
${conflictCards}` : `
<div style="background:rgba(34,211,166,.06);border:1px solid rgba(34,211,166,.18);border-radius:12px;padding:14px 18px;margin-bottom:20px;font-size:13px;font-weight:700;color:#22D3A6;">
  ✅ No funding conflicts detected — goal timelines are well-spaced
</div>`}

<div style="background:rgba(79,124,255,.05);border:1px solid rgba(79,124,255,.12);border-radius:14px;padding:16px;">
  <div style="font-size:13px;font-weight:800;color:#4F7CFF;margin-bottom:10px;">Goal Planning Best Practices</div>
  <div style="display:flex;flex-direction:column;gap:6px;">
    ${tips.map(t => `<div style="font-size:12px;color:var(--text-secondary);">💡 ${t}</div>`).join('')}
  </div>
</div>`;
  }

  return { renderPriority, renderSIPPlan, renderConflicts, _compute };
})();
