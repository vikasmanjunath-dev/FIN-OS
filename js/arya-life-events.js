/**
 * arya-life-events.js — FIN·OS Proactive Life Events Engine  v1.0
 * ─────────────────────────────────────────────────────────────────
 * Arya initiates conversations when your financial life changes.
 * Monitors delta changes in context → classifies into life events
 * → dispatches 'arya-life-event' → arya-ai.js picks up and speaks.
 *
 * Events covered:
 *   salary_credited · market_crash · goal_deadline · budget_overrun
 *   tax_season · trade_loss_streak · net_worth_milestone · sip_missed
 *   emergency_fund_low · debt_overload
 */
(function (global) {
  'use strict';

  /* ── INR formatter ──────────────────────────────────────────────────── */
  function INR(n) {
    const num = Number(n) || 0;
    if (num >= 1e7) return '₹' + (num / 1e7).toFixed(1) + ' Cr';
    if (num >= 1e5) return '₹' + (num / 1e5).toFixed(1) + ' L';
    if (num >= 1e3) return '₹' + (num / 1e3).toFixed(0) + 'K';
    return '₹' + Math.round(num).toLocaleString('en-IN');
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */
  function safeNum(v) { return Number(v) || 0; }

  function daysUntil(dateStr) {
    if (!dateStr) return Infinity;
    return Math.floor((new Date(dateStr) - Date.now()) / 86400000);
  }

  function monthsOfRunway(ctx) {
    const ef = safeNum(ctx?.financial?.transactions?.emergency_fund
      || ctx?.profile?.emergency_fund_months
      || localStorage.getItem('finos_emergency_fund'));
    const monthly = safeNum(ctx?.budget_tracker?.income_monthly) * (1 - safeNum(ctx?.budget_tracker?.savings_rate) / 100)
      || safeNum(localStorage.getItem('finos_monthly_expenses'))
      || 30000;
    return ef > 0 ? (ef / monthly).toFixed(1) : 0;
  }

  function getName(ctx) {
    return ctx?.identity?.name || localStorage.getItem('finos_display_name') || 'yaar';
  }

  /* ── Life Event Definitions ─────────────────────────────────────────── */
  const EVENTS = [

    /* ─── 1. Salary Credited ─────────────────────────────────────────── */
    {
      id: 'salary_credited',
      priority: 'high',
      cooldown_hrs: 168,
      detect(ctx, prev) {
        const curr = safeNum(ctx?.financial?.transactions?.total_income);
        const last = safeNum(prev?.financial?.transactions?.total_income);
        return curr > last && (curr - last) > 8000;
      },
      message(ctx) {
        const monthlyIncome = safeNum(ctx?.budget_tracker?.income_monthly);
        const spent = safeNum(ctx?.budget_tracker?.spent_total);
        const spare = Math.max(0, monthlyIncome - spent);
        const goals = (ctx?.financial?.goals || [])
          .filter(g => (g.progress || 0) < 100)
          .slice(0, 2)
          .map(g => g.name)
          .join(' aur ');
        return `${getName(ctx)}, salary aa gayi! ${INR(spare)} spare hai is mahine. ${goals ? `"${goals}" goals ke liye perfect time hai invest karne ka.` : 'SIP badhane ka soch?'} Ek smart split plan banaoon?`;
      }
    },

    /* ─── 2. Market Crash ────────────────────────────────────────────── */
    {
      id: 'market_crash',
      priority: 'urgent',
      cooldown_hrs: 12,
      detect(ctx) {
        const pct = safeNum(ctx?.market?.nifty_change_pct);
        return pct <= -3;
      },
      message(ctx) {
        const pct = Math.abs(safeNum(ctx?.market?.nifty_change_pct));
        const portfolioVal = safeNum(ctx?.financial?.portfolio?.total_value);
        const equityPct = safeNum(ctx?.financial?.portfolio?.equity_pct) || 70;
        const impact = portfolioVal * (equityPct / 100) * (pct / 100);
        const riskScore = safeNum(ctx?.dna?.scores?.[0]) || 50;
        const reaction = riskScore > 65
          ? 'Your risk DNA is strong — you can handle this.'
          : 'Deep breath — selling now would lock in losses.';
        return `Nifty ${pct.toFixed(1)}% down aaj. ${portfolioVal > 0 ? `Paper loss: ~${INR(impact)}.` : ''} ${reaction} SIP continue rakho — yahi dips wealth banate hain. Portfolio analyze karoon?`;
      }
    },

    /* ─── 3. Goal Deadline Approaching ──────────────────────────────── */
    {
      id: 'goal_deadline',
      priority: 'high',
      cooldown_hrs: 168,
      detect(ctx) {
        return (ctx?.financial?.goals || []).some(g => {
          const days = daysUntil(g.target_date);
          return days > 0 && days <= 90 && safeNum(g.progress) < 70;
        });
      },
      message(ctx) {
        const g = (ctx?.financial?.goals || []).find(g => {
          const days = daysUntil(g.target_date);
          return days > 0 && days <= 90 && safeNum(g.progress) < 70;
        });
        if (!g) return null;
        const days = daysUntil(g.target_date);
        const gap = safeNum(g.target) - safeNum(g.current || g.saved);
        const monthsLeft = Math.max(1, days / 30);
        const monthlyNeeded = Math.ceil(gap / monthsLeft);
        return `"${g.name}" goal ${days} din baad hai, lekin sirf ${g.progress || 0}% funded hai. ${INR(monthlyNeeded)}/month lagenge gap bharne ke liye. Catch-up plan banate hain?`;
      }
    },

    /* ─── 4. Budget Overrun ──────────────────────────────────────────── */
    {
      id: 'budget_overrun',
      priority: 'medium',
      cooldown_hrs: 72,
      detect(ctx) {
        const income = safeNum(ctx?.budget_tracker?.income_monthly);
        const spent = safeNum(ctx?.budget_tracker?.spent_total);
        return income > 0 && spent > income * 0.88;
      },
      message(ctx) {
        const pct = Math.round(safeNum(ctx?.budget_tracker?.spent_total) / safeNum(ctx?.budget_tracker?.income_monthly) * 100);
        const cats = (ctx?.budget_tracker?.top_categories || []).slice(0, 2).map(c => c.cat).join(', ');
        const dnaDisc = safeNum(ctx?.dna?.scores?.[3]);
        return `Is mahine ${pct}% income spend ho gayi. ${cats ? `Highest: ${cats}.` : ''} ${dnaDisc > 60 ? 'Teri discipline DNA kaafi strong hai — ek review kaafi hai.' : '3 easy cuts suggest karoon?'}`;
      }
    },

    /* ─── 5. Tax Season Alert ────────────────────────────────────────── */
    {
      id: 'tax_season',
      priority: 'high',
      cooldown_hrs: 168,
      detect() {
        const m = new Date().getMonth(); // 0-based
        const d = new Date().getDate();
        return (m === 2 && d >= 1) || (m === 0 && d <= 15) || (m === 5 && d <= 15) || (m === 8 && d <= 15) || (m === 11 && d <= 15);
      },
      message(ctx) {
        const m = new Date().getMonth();
        const invested80c = safeNum(ctx?.profile?.invested_80c || ctx?.tax?.deductions_80c);
        const gap80c = Math.max(0, 150000 - invested80c);
        if (m === 2) {
          return `Tax season ka last stretch! Teri 80C mein ${INR(gap80c)} ka gap hai abhi. ELSS, PPF, NPS — kaunsa best hai teri situation ke liye? Calculate karoon?`;
        }
        return `Advance tax deadline aa rahi hai. Teri income pe roughly ${INR(estimateQtrTax(ctx))} is quarter. Miss mat karna — 1% monthly interest lagti hai. Exact amount calculate karoon?`;
      }
    },

    /* ─── 6. Trade Loss Streak ───────────────────────────────────────── */
    {
      id: 'trade_loss_streak',
      priority: 'medium',
      cooldown_hrs: 48,
      detect(ctx) {
        return safeNum(ctx?.trade_journal?.loss_streak) >= 3;
      },
      message(ctx) {
        const streak = safeNum(ctx?.trade_journal?.loss_streak);
        const lossAmt = safeNum(ctx?.trade_journal?.recent_loss_amount || ctx?.trade_journal?.total_pnl);
        return `${streak} consecutive losing trades bhai. ${lossAmt < 0 ? `Total: ${INR(Math.abs(lossAmt))}.` : ''} Top traders aise mein 24h break lete hain — strategy ko, market ko nahin blame karo. Kya common hai in trades mein? Analyze karoon?`;
      }
    },

    /* ─── 7. Net Worth Milestone ─────────────────────────────────────── */
    {
      id: 'net_worth_milestone',
      priority: 'low',
      cooldown_hrs: 720,
      detect(ctx, prev) {
        const MILESTONES = [100000, 500000, 1000000, 2500000, 5000000, 10000000, 25000000, 50000000, 100000000];
        const curr = safeNum(ctx?.profile?.net_worth);
        const last = safeNum(prev?.profile?.net_worth);
        return MILESTONES.some(m => last < m && curr >= m);
      },
      message(ctx) {
        const nw = safeNum(ctx?.profile?.net_worth);
        const days = safeNum(ctx?.engagement?.days_since_first);
        return `CONGRATULATIONS! Net worth ${INR(nw)} cross kar liya! ${days > 0 ? `${days} din ki mehnat rang layi.` : ''} Is level pe tax harvesting, NPS optimization, aur asset rebalancing important ho jaate hain. Full wealth review karein?`;
      }
    },

    /* ─── 8. SIP Missed ──────────────────────────────────────────────── */
    {
      id: 'sip_missed',
      priority: 'medium',
      cooldown_hrs: 72,
      detect(ctx) {
        return ctx?.alerts?.recent?.some?.(a => a.rule_id === 'sip_missed' && !a.read) || false;
      },
      message(ctx) {
        return `Ek SIP miss hua lagta hai is mahine. Consistency hi compounding ka secret hai — ek missed SIP decades mein thousands ka fark kar sakta hai. Catch-up investment ka option dekhen?`;
      }
    },

    /* ─── 9. Emergency Fund Low ──────────────────────────────────────── */
    {
      id: 'emergency_fund_low',
      priority: 'high',
      cooldown_hrs: 168,
      detect(ctx) {
        const months = safeNum(monthsOfRunway(ctx));
        return months > 0 && months < 3;
      },
      message(ctx) {
        const months = monthsOfRunway(ctx);
        const income = safeNum(ctx?.budget_tracker?.income_monthly) || 50000;
        const target = income * 6;
        const curr = income * parseFloat(months);
        const gap = target - curr;
        return `Emergency fund sirf ${months} months ka cover kar raha hai — minimum 6 chahiye. ${INR(gap)} ki zaroorat hai target tak. Har mahine ${INR(Math.ceil(gap / 12))} set aside karo. Isko pehla goal banate hain?`;
      }
    },

    /* ─── 10. High Debt Load ─────────────────────────────────────────── */
    {
      id: 'debt_overload',
      priority: 'high',
      cooldown_hrs: 240,
      detect(ctx) {
        const debt = safeNum(ctx?.budget_tracker?.total_debt);
        const income = safeNum(ctx?.budget_tracker?.income_monthly) * 12;
        return income > 0 && debt > income * 0.4;
      },
      message(ctx) {
        const debt = safeNum(ctx?.budget_tracker?.total_debt);
        const income = safeNum(ctx?.budget_tracker?.income_monthly);
        const dti = Math.round(debt / (income * 12) * 100);
        return `Tera debt-to-income ratio ${dti}% hai — safe limit 30% se zyada. ${INR(debt)} total debt hai. Debt avalanche strategy se ${INR(Math.round(debt * 0.15))} tak interest bacha sakte hain. Destruction plan banate hain?`;
      }
    },

  ];

  /* ── Snapshot store ─────────────────────────────────────────────────── */
  const SNAP_KEY = 'finos_ctx_snap_v2';

  function saveSnap(ctx) {
    try {
      sessionStorage.setItem(SNAP_KEY, JSON.stringify({
        ts: Date.now(),
        financial: ctx?.financial,
        profile: ctx?.profile,
        market: ctx?.market,
        budget_tracker: ctx?.budget_tracker,
        trade_journal: ctx?.trade_journal,
        alerts: ctx?.alerts
      }));
    } catch (_) {}
  }

  function loadSnap() {
    try { return JSON.parse(sessionStorage.getItem(SNAP_KEY)); }
    catch { return null; }
  }

  /* ── Cooldown manager ───────────────────────────────────────────────── */
  const CD_KEY = 'finos_event_cooldowns_v2';

  function onCooldown(id, hrs) {
    try {
      const cd = JSON.parse(localStorage.getItem(CD_KEY) || '{}');
      return (Date.now() - (cd[id] || 0)) < hrs * 3600000;
    } catch { return false; }
  }

  function setCooldown(id) {
    try {
      const cd = JSON.parse(localStorage.getItem(CD_KEY) || '{}');
      cd[id] = Date.now();
      localStorage.setItem(CD_KEY, JSON.stringify(cd));
    } catch {}
  }

  /* ── Advance tax quarterly estimate ────────────────────────────────── */
  function estimateQtrTax(ctx) {
    const annual = safeNum(ctx?.budget_tracker?.income_monthly) * 12;
    const taxable = Math.max(0, annual - 150000);
    let tax = 0;
    if (taxable > 1500000) tax = 187500 + (taxable - 1500000) * 0.30;
    else if (taxable > 1200000) tax = 112500 + (taxable - 1200000) * 0.25;
    else if (taxable > 900000) tax = 52500 + (taxable - 900000) * 0.20;
    else if (taxable > 600000) tax = 22500 + (taxable - 600000) * 0.10;
    else if (taxable > 300000) tax = (taxable - 300000) * 0.05;
    return Math.round(tax / 4);
  }

  /* ── Proactive bubble UI ────────────────────────────────────────────── */
  function showBubble(msg, priority) {
    document.getElementById('arya-proactive-bubble')?.remove();

    const PAL = { urgent: '#ff4444', high: '#ff9500', medium: '#00d4ff', low: '#7b2ff7' };
    const col = PAL[priority] || PAL.medium;

    const bubble = document.createElement('div');
    bubble.id = 'arya-proactive-bubble';

    bubble.innerHTML = `
      <style>
        @keyframes _aSlide { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes _aPulse { 0%,100% { opacity:1; } 50% { opacity:.4; } }
        #arya-proactive-bubble { animation: _aSlide .3s ease forwards; }
      </style>
      <div style="
        position:fixed;bottom:94px;right:24px;z-index:99999;
        background:linear-gradient(145deg,#0d0f1a,#161929);
        border:1px solid ${col}35;border-left:3px solid ${col};
        border-radius:18px;padding:18px 20px;max-width:310px;width:calc(100vw - 48px);
        box-shadow:0 12px 40px ${col}25,0 4px 16px rgba(0,0,0,.6);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${col};animation:_aPulse 1.4s infinite;flex-shrink:0;"></div>
          <span style="font-size:11px;font-weight:800;color:${col};letter-spacing:1.2px;text-transform:uppercase;">Arya</span>
          <span style="margin-left:auto;font-size:10px;color:rgba(255,255,255,.3);">${priority === 'urgent' ? '🔴 Urgent' : priority === 'high' ? '🟠 Important' : '💬 Hey'}</span>
          <button onclick="document.getElementById('arya-proactive-bubble')?.remove()"
            style="background:none;border:none;color:rgba(255,255,255,.3);cursor:pointer;font-size:18px;line-height:1;padding:0 0 0 4px;">×</button>
        </div>
        <p style="margin:0 0 14px;font-size:13.5px;color:rgba(255,255,255,.88);line-height:1.65;">${msg}</p>
        <div style="display:flex;gap:8px;">
          <button id="arya-bubble-talk-btn" style="
            flex:1;padding:9px;border:1px solid ${col}55;border-radius:10px;
            background:${col}18;color:${col};font-size:12px;font-weight:700;cursor:pointer;">
            🎙️ Talk to Arya
          </button>
          <button onclick="document.getElementById('arya-proactive-bubble')?.remove()" style="
            padding:9px 14px;border:1px solid rgba(255,255,255,.1);border-radius:10px;
            background:rgba(255,255,255,.04);color:rgba(255,255,255,.4);font-size:12px;cursor:pointer;">
            Later
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(bubble);

    // Talk button opens voice agent or chat
    document.getElementById('arya-bubble-talk-btn')?.addEventListener('click', () => {
      bubble.remove();
      if (window.AryaAI?._speak) {
        window.AryaAI._speak(msg);
      } else {
        const fab = document.getElementById('finos-fab');
        if (fab) fab.click();
      }
    });

    // Auto-dismiss after 45 seconds
    setTimeout(() => bubble?.remove(), 45000);

    // Pulse the FAB
    const fab = document.getElementById('finos-fab');
    if (fab) {
      fab.style.boxShadow = `0 0 0 0 ${col}`;
      fab.style.animation = 'none';
      void fab.offsetWidth;
      fab.style.animation = '_fabPulse 1.8s ease-out 4';
      const style = document.createElement('style');
      style.textContent = `@keyframes _fabPulse { 0% { box-shadow:0 0 0 0 ${col}80; } 80%,100% { box-shadow:0 0 0 18px ${col}00; } }`;
      document.head.appendChild(style);
    }
  }

  /* ── Main scanner ───────────────────────────────────────────────────── */
  function scan(ctx) {
    const prev = loadSnap();
    const triggered = [];

    for (const ev of EVENTS) {
      if (onCooldown(ev.id, ev.cooldown_hrs)) continue;
      try {
        if (ev.detect(ctx, prev)) {
          const msg = ev.message(ctx);
          if (msg) {
            triggered.push({ ...ev, msg });
            setCooldown(ev.id);
          }
        }
      } catch (e) {
        console.debug('[LifeEvents] detect error for', ev.id, e);
      }
    }

    const order = { urgent: 0, high: 1, medium: 2, low: 3 };
    triggered.sort((a, b) => order[a.priority] - order[b.priority]);

    if (triggered.length) {
      const top = triggered[0];
      // Dispatch for other listeners
      document.dispatchEvent(new CustomEvent('arya-life-event', {
        detail: { event: top, allTriggered: triggered }
      }));
      // Show proactive bubble
      showBubble(top.msg, top.priority);
    }

    saveSnap(ctx);
  }

  /* ── Wire-up ────────────────────────────────────────────────────────── */
  window.addEventListener('finos-context-ready', e => {
    if (e.detail?.phase !== 'full') return;
    const ctx = window.FINOS_USER_CONTEXT;
    if (!ctx) return;
    // Small delay so page settles and FAB renders
    setTimeout(() => scan(ctx), 4000);
  });

  global.FinosLifeEvents = { scan };

}(window));
