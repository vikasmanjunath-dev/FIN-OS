/**
 * arya-scenarios.js — FIN·OS "What If" Scenario Engine  v1.0
 * ────────────────────────────────────────────────────────────
 * Six powerful financial scenario simulators — no competitor has these.
 *
 * Usage:
 *   AryaScenarios.run('job_loss', { months: 6 }, outputEl)
 *   AryaScenarios.renderHub(containerEl)   // renders all scenario cards
 */
(function (global) {
  'use strict';

  function INR(n) {
    const num = Number(n) || 0;
    if (num >= 1e7) return '₹' + (num / 1e7).toFixed(1) + ' Cr';
    if (num >= 1e5) return '₹' + (num / 1e5).toFixed(1) + ' L';
    if (num >= 1e3) return '₹' + Math.round(num / 1e3) + 'K';
    return '₹' + Math.round(num).toLocaleString('en-IN');
  }
  function n(v) { return Number(v) || 0; }

  /* ──────────────────────────────────────────────────────────────────
     SCENARIO DEFINITIONS
  ────────────────────────────────────────────────────────────────── */
  const SCENARIOS = {

    /* 1 ── Job Loss ─────────────────────────────────────────────── */
    job_loss: {
      id: 'job_loss', icon: '😰',
      title: 'What if I lose my job?',
      subtitle: 'Survival timeline & goal strategy',
      color: '#ff6b35',
      inputs: [{ id: 'months', label: 'Months without income', type: 'range', min: 1, max: 24, default: 6 }],

      compute(ctx, inp) {
        const income    = n(ctx?.budget_tracker?.income_monthly) || 60000;
        const expenses  = income * (1 - n(ctx?.budget_tracker?.savings_rate || 20) / 100);
        const ef        = n(ctx?.profile?.emergency_fund) || expenses * 2;
        const sipTotal  = n(ctx?.profile?.sip_monthly) || 5000;
        const months    = n(inp.months || 6);

        const runway            = ef / expenses;
        const runwayWithPausedSIP = (ef + sipTotal * months) / expenses;
        const gap               = Math.max(0, months * expenses - ef);
        const targetEF          = months * expenses;
        const monthlyToSave     = gap > 0 ? Math.ceil(gap / 12) : 0;

        const goals = (ctx?.financial?.goals || [])
          .filter(g => n(g.progress) < 100)
          .map(g => ({ name: g.name, monthly: Math.ceil((n(g.target) - n(g.current)) / Math.max(1, 24)) }));

        return {
          income, expenses: Math.round(expenses), ef, runway: +runway.toFixed(1),
          runwayWithPausedSIP: +runwayWithPausedSIP.toFixed(1),
          gap: Math.round(gap), targetEF: Math.round(targetEF),
          monthlyToSave, months, goals,
          actions: [
            `Build emergency fund to ${INR(targetEF)} (${months}-month cover)`,
            `If needed, pause SIPs — saves ${INR(sipTotal)}/month, extends runway to ${runwayWithPausedSIP.toFixed(1)} months`,
            `Cut want-based spending first — keep needs and EMIs going`,
            `DO NOT sell long-term equity — market dips at worst times`,
            goal_reminder(goals)
          ].filter(Boolean)
        };
      },

      prompt(ctx, r) {
        return `Job loss scenario for ${getName(ctx)}: ${r.months} months without income.
EF currently covers ${r.runway} months (target: ${r.months}). Gap: ${INR(r.gap)}.
Monthly savings needed to close gap: ${INR(r.monthlyToSave)}.
If SIPs paused, runway extends to ${r.runwayWithPausedSIP} months.
Give a calm, practical Hinglish survival plan in 4 points. End with one motivating line.`;
      }
    },

    /* 2 ── House Purchase ───────────────────────────────────────── */
    house_purchase: {
      id: 'house_purchase', icon: '🏠',
      title: 'What if I buy a house?',
      subtitle: 'True cost vs. renting + investing',
      color: '#4ecdc4',
      inputs: [
        { id: 'price',    label: 'Property price (₹)',    type: 'number', default: 8000000, min: 1000000, max: 100000000 },
        { id: 'downPct',  label: 'Down payment %',         type: 'range', min: 5, max: 50, default: 20 },
        { id: 'tenure',   label: 'Loan tenure (years)',     type: 'range', min: 5, max: 30, default: 20 }
      ],

      compute(ctx, inp) {
        const price   = n(inp.price || 8000000);
        const downPct = n(inp.downPct || 20);
        const tenure  = n(inp.tenure || 20);
        const down    = price * downPct / 100;
        const loan    = price - down;
        const r       = 8.5 / 100 / 12; // SBI current avg
        const mths    = Math.max(1, Math.round(tenure * 12));
        const _factor = Math.pow(1 + r, mths) - 1;
        const emi     = _factor > 0 ? loan * r * (Math.pow(1 + r, mths) / _factor) : loan / mths;
        const totalInterest = emi * mths - loan;

        // True all-in cost
        const stampDuty   = price * 0.055;
        const registration = price * 0.01;
        const maintenance  = price * 0.01 * tenure; // 1%/yr
        const trueCost     = price + totalInterest + stampDuty + registration + maintenance;

        // Opportunity cost: down + monthly EMI invested in equity @12%
        const r12  = 0.12 / 12;
        const downGrowth = down * Math.pow(1.12, tenure);
        const emiGrowth  = emi * ((Math.pow(1 + r12, mths) - 1) / r12);
        const oppCost    = downGrowth + emiGrowth;

        // Property appreciation @6%/yr
        const propValue = price * Math.pow(1.06, tenure);

        // Break-even year (rough)
        let beYear = 0;
        for (let y = 1; y <= tenure; y++) {
          const propG = price * Math.pow(1.06, y) - (down + emi * 12 * y);
          const invG  = down * Math.pow(1.12, y) + emi * ((Math.pow(1 + r12, y * 12) - 1) / r12);
          if (propG >= invG) { beYear = y; break; }
        }

        const income = n(ctx?.budget_tracker?.income_monthly) || 60000;
        const emiRatio = emi * 12 / (income * 12) * 100;

        return {
          price, down, loan: Math.round(loan),
          emi: Math.round(emi), totalInterest: Math.round(totalInterest),
          stampDuty: Math.round(stampDuty), registration: Math.round(registration),
          maintenance: Math.round(maintenance), trueCost: Math.round(trueCost),
          oppCost: Math.round(oppCost), propValue: Math.round(propValue),
          netDiff: Math.round(oppCost - propValue),
          beYear: beYear || tenure,
          emiRatio: emiRatio.toFixed(1),
          emiSafe: emiRatio <= 40
        };
      },

      prompt(ctx, r, inp) {
        return `House purchase analysis for ${getName(ctx)}: Property ${INR(r.price)}, Down ${INR(r.down)}.
EMI: ${INR(r.emi)}/month (${r.emiRatio}% of income — ${r.emiSafe ? 'safe' : 'HIGH — risky'}).
True total cost (EMI+interest+stamp+maintenance over ${inp.tenure||20}y): ${INR(r.trueCost)}.
Property value after ${inp.tenure||20}y: ${INR(r.propValue)}.
If invested in equity instead: ${INR(r.oppCost)}.
Break-even year: ${r.beYear}.
Give honest Indian-context buy-vs-rent advice in 4 Hinglish points. Mention emotional + financial value of home ownership.`;
      }
    },

    /* 3 ── Market Crash ─────────────────────────────────────────── */
    market_crash: {
      id: 'market_crash', icon: '📉',
      title: 'What if Nifty falls 30%?',
      subtitle: 'Portfolio impact + SIP opportunity',
      color: '#ff4444',
      inputs: [
        { id: 'crashPct', label: 'Market crash %', type: 'range', min: 5, max: 60, default: 30 }
      ],

      compute(ctx, inp) {
        const pct       = n(inp.crashPct || 30);
        const portfolio = ctx?.financial?.portfolio;
        const totalVal  = n(portfolio?.total_value) || n(localStorage.getItem('finos_net_worth')) * 0.6 || 500000;
        const eqFrac    = n(portfolio?.equity_pct || 70) / 100;
        const equityVal = totalVal * eqFrac;
        const loss      = equityVal * pct / 100;
        const afterCrash = totalVal - loss;

        // SIP buy opportunity
        const sipAmt  = n(ctx?.profile?.sip_monthly || localStorage.getItem('finos_sip_monthly') || 5000);
        const navNow  = 100; // relative
        const navCrash = navNow * (1 - pct / 100);
        const extraUnits = sipAmt / navCrash - sipAmt / navNow;

        // FIRE date shift
        const fireNum = n(ctx?.budget_tracker?.fire_number) || totalVal * 25;
        const fireYrs = n(ctx?.budget_tracker?.fire_years_estimate) || 20;
        const crashFireShift = Math.ceil(pct / 10 * 0.8); // rough: 30% crash ≈ +2.4 yrs

        // Historical comparison
        const hist = [
          { year: 2020, drop: 38, months: 8 },
          { year: 2008, drop: 60, months: 36 },
          { year: 2015, drop: 26, months: 14 },
          { year: 2011, drop: 28, months: 15 }
        ];
        const comp = hist.reduce((best, h) => Math.abs(h.drop - pct) < Math.abs(best.drop - pct) ? h : best);

        return {
          pct, totalVal, equityVal: Math.round(equityVal),
          loss: Math.round(loss), afterCrash: Math.round(afterCrash),
          sipAmt, extraUnits: +extraUnits.toFixed(2),
          crashFireShift,
          hist: comp,
          riskScore: n(ctx?.dna?.scores?.[0]) || 50
        };
      },

      prompt(ctx, r) {
        return `Market crash scenario for ${getName(ctx)}: Nifty/portfolio falls ${r.pct}%.
Paper loss: ${INR(r.loss)}. Portfolio drops to ${INR(r.afterCrash)}.
Historical precedent: ${r.hist.year} crash (${r.hist.drop}% drop, recovered in ${r.hist.months} months).
SIP opportunity: extra ${r.extraUnits} units at lower NAV per ${INR(r.sipAmt)} SIP.
FIRE timeline shifts by +${r.crashFireShift} years (unless SIP increased).
Risk DNA score: ${r.riskScore}/100.
Give a psychology-first Hinglish response: acknowledge the pain, give historical context, suggest 2 actions. Don't say "just hold" — explain why.`;
      }
    },

    /* 4 ── SIP Delay ────────────────────────────────────────────── */
    sip_delay: {
      id: 'sip_delay', icon: '⏰',
      title: 'Start SIP now vs. 1 year later?',
      subtitle: 'The cost of waiting — in rupees',
      color: '#c7f000',
      inputs: [
        { id: 'sipAmt',  label: 'Monthly SIP (₹)', type: 'number', default: 10000, min: 500, max: 200000 },
        { id: 'years',   label: 'Investment horizon (years)', type: 'range', min: 5, max: 40, default: 20 },
        { id: 'retRate', label: 'Expected return %', type: 'range', min: 8, max: 18, default: 12 }
      ],

      compute(ctx, inp) {
        const sip   = n(inp.sipAmt || 10000);
        const yrs   = n(inp.years || 20);
        const rate  = n(inp.retRate || 12) / 100 / 12;
        const mths  = yrs * 12;
        const mths1 = (yrs - 1) * 12; // delayed by 1 year

        const fv = (m) => sip * ((Math.pow(1 + rate, m) - 1) / rate) * (1 + rate);
        const corpusNow     = fv(mths);
        const corpusDelayed = fv(mths1);
        const costOfWaiting = corpusNow - corpusDelayed;
        const investedNow   = sip * mths;
        const investedDelay = sip * mths1;
        const wealthGainNow = corpusNow - investedNow;

        // Monthly SIP age of user from profile
        const age = n(ctx?.identity?.age || localStorage.getItem('finos_age') || 28);
        const retirementAge = 60;
        const retYrs = Math.min(yrs, retirementAge - age);

        return {
          sip, yrs, retYrs,
          corpusNow: Math.round(corpusNow),
          corpusDelayed: Math.round(corpusDelayed),
          costOfWaiting: Math.round(costOfWaiting),
          investedNow: Math.round(investedNow),
          investedDelay: Math.round(investedDelay),
          wealthGainNow: Math.round(wealthGainNow),
          extraInvested: sip * 12, // 1 extra year of SIP
          pctLoss: ((corpusNow - corpusDelayed) / corpusNow * 100).toFixed(1)
        };
      },

      prompt(ctx, r) {
        return `SIP delay analysis for ${getName(ctx)}: ${INR(r.sip)}/month for ${r.yrs} years.
Start now → corpus: ${INR(r.corpusNow)}.
Start 1 year late → corpus: ${INR(r.corpusDelayed)}.
Cost of waiting: ${INR(r.costOfWaiting)} (${r.pctLoss}% less wealth!).
By waiting, you lose ${INR(r.costOfWaiting)} to gain just ${INR(r.extraInvested)} in that 1 year.
Explain this compounding magic in Hinglish in 3 sentences. Be dramatic about the cost. End with: "Shuru karo aaj."`;
      }
    },

    /* 5 ── FIRE Date Shift ──────────────────────────────────────── */
    fire_shift: {
      id: 'fire_shift', icon: '🔥',
      title: 'What changes my FIRE date?',
      subtitle: 'See how each lever moves retirement',
      color: '#ff9500',
      inputs: [
        { id: 'savingsRateChange', label: 'Change savings rate by %', type: 'range', min: -10, max: 20, default: 5 },
        { id: 'expenseChange',    label: 'Change monthly expense by ₹', type: 'number', default: -5000, min: -30000, max: 30000 },
        { id: 'returnChange',     label: 'Change expected return by %',  type: 'range', min: -3, max: 3, default: 0 }
      ],

      compute(ctx, inp) {
        const income   = n(ctx?.budget_tracker?.income_monthly) || 60000;
        const currSR   = n(ctx?.budget_tracker?.savings_rate || localStorage.getItem('finos_savings_rate') || 25);
        const currExp  = income * (1 - currSR / 100);
        const nw       = n(ctx?.profile?.net_worth || localStorage.getItem('finos_net_worth') || 0);

        const newSR    = Math.min(95, Math.max(1, currSR + n(inp.savingsRateChange || 5)));
        const newExp   = Math.max(5000, currExp + n(inp.expenseChange || 0));
        const baseRet  = 0.12;
        const newRet   = Math.max(0.04, baseRet + n(inp.returnChange || 0) / 100);

        const fireMultiple = 25;
        const computeFIRE = (sr, exp, ret) => {
          const monthly     = income * sr / 100;
          const fireTarget  = exp * 12 * fireMultiple;
          if (monthly <= 0) return Infinity;
          const r = ret / 12;
          const yrsFIRE = Math.log(1 + (fireTarget - nw) * r / monthly) / Math.log(1 + r) / 12;
          return Math.max(0, +yrsFIRE.toFixed(1));
        };

        const baseFIRE = computeFIRE(currSR, currExp, baseRet);
        const newFIRE  = computeFIRE(newSR, newExp, newRet);
        const delta    = +(baseFIRE - newFIRE).toFixed(1);

        return {
          income, currSR, newSR, currExp: Math.round(currExp), newExp: Math.round(newExp),
          baseFIRE, newFIRE, delta,
          fireTarget: Math.round(newExp * 12 * fireMultiple),
          monthlySaving: Math.round(income * newSR / 100),
          isImprovement: delta > 0
        };
      },

      prompt(ctx, r) {
        return `FIRE date analysis for ${getName(ctx)}.
Current: savings rate ${r.currSR}%, expenses ${INR(r.currExp)}/month, FIRE in ${r.baseFIRE} years.
After change: savings rate ${r.newSR}%, expenses ${INR(r.newExp)}/month, FIRE in ${r.newFIRE} years.
FIRE date ${r.delta > 0 ? 'moves earlier by ' + r.delta + ' years' : 'moves later by ' + Math.abs(r.delta) + ' years'}.
FIRE target corpus: ${INR(r.fireTarget)}.
Explain the impact in 3 Hinglish sentences. If improvement, be encouraging. If worse, suggest alternatives.`;
      }
    },

    /* 6 ── Debt Freedom ─────────────────────────────────────────── */
    extra_payment: {
      id: 'extra_payment', icon: '⛓️',
      title: 'What if I pay extra EMI?',
      subtitle: 'Interest saved + years cut',
      color: '#a855f7',
      inputs: [
        { id: 'loanAmt',   label: 'Loan amount (₹)',       type: 'number', default: 3000000, min: 100000, max: 50000000 },
        { id: 'emiAmt',    label: 'Current EMI (₹)',        type: 'number', default: 25000,  min: 1000,  max: 500000 },
        { id: 'extraAmt',  label: 'Extra payment/month (₹)', type: 'number', default: 5000,  min: 500,   max: 100000 },
        { id: 'ratePA',    label: 'Interest rate %',         type: 'range',  min: 6, max: 20, default: 8.5 }
      ],

      compute(ctx, inp) {
        const loan  = n(inp.loanAmt  || 3000000);
        const emi   = n(inp.emiAmt   || 25000);
        const extra = n(inp.extraAmt || 5000);
        const r     = n(inp.ratePA   || 8.5) / 100 / 12;

        // Standard amortization
        const amortize = (principal, emi, r) => {
          if (emi <= 0 || r <= 0) return { months: 0, totalInt: 0 };
          let bal = principal, months = 0, totalInt = 0, prevBal = Infinity;
          while (bal > 0 && months < 600) {
            const interest = bal * r;
            totalInt += interest;
            bal = bal + interest - emi;
            months++;
            if (bal < 0) bal = 0;
            if (bal >= prevBal) break; // no progress — loan never amortizes (EMI < interest)
            prevBal = bal;
          }
          return { months, totalInt: Math.round(totalInt) };
        };

        const base   = amortize(loan, emi,       r);
        const faster = amortize(loan, emi + extra, r);
        const saved  = base.totalInt - faster.totalInt;
        const mthsSaved = base.months - faster.months;

        return {
          loan, emi, extra,
          baseMths: base.months, fasterMths: faster.months,
          baseInt: base.totalInt, fasterInt: faster.totalInt,
          saved: Math.round(saved), mthsSaved,
          yrsSaved: +(mthsSaved / 12).toFixed(1),
          roi: +((saved / (extra * faster.months)) * 100).toFixed(1)
        };
      },

      prompt(ctx, r) {
        return `Extra EMI analysis for ${getName(ctx)}: Loan ${INR(r.loan)}, EMI ${INR(r.emi)}/month.
Paying extra ${INR(r.extra)}/month → saves ${INR(r.saved)} in interest, loan ends ${r.yrsSaved} years early.
Base timeline: ${Math.floor(r.baseMths/12)}y ${r.baseMths%12}m → New: ${Math.floor(r.fasterMths/12)}y ${r.fasterMths%12}m.
ROI of extra payment: ${r.roi}%.
Explain in 3 Hinglish points. Compare: "that ${INR(r.extra)}/month saved you ${INR(r.saved)}!" Make it feel exciting.`;
      }
    }

  };

  /* ──────────────────────────────────────────────────────────────────
     RUNNER
  ────────────────────────────────────────────────────────────────── */
  async function run(scenarioId, inputs, outputEl) {
    const sc = SCENARIOS[scenarioId];
    if (!sc) { console.warn('[Scenarios] Unknown:', scenarioId); return; }

    const ctx = window.FINOS_USER_CONTEXT || {};

    outputEl.innerHTML = `
      <div style="padding:20px;text-align:center;color:rgba(255,255,255,.5);">
        <div style="font-size:24px;margin-bottom:8px;">⏳</div>
        <div style="font-size:13px;">Computing scenario…</div>
      </div>`;

    let result;
    try { result = sc.compute(ctx, inputs); }
    catch (e) { console.error('[Scenarios] compute error:', e); result = {}; }

    // Render result cards
    renderResult(sc, result, inputs, outputEl);

    // Ask Arya to narrate
    const prompt = sc.prompt(ctx, result, inputs);
    const aryaEl = outputEl.querySelector('.scenario-arya-response');
    if (aryaEl && window.AryaAI) {
      aryaEl.innerHTML = `<div class="arya-thinking"><span></span><span></span><span></span></div>`;
      await window.AryaAI.ask(prompt, (tok) => {
        aryaEl.textContent = (aryaEl.textContent || '') + tok;
      });
    }
  }

  /* ──────────────────────────────────────────────────────────────────
     RESULT RENDERER
  ────────────────────────────────────────────────────────────────── */
  function renderResult(sc, r, inp, el) {
    const metrics = getMetrics(sc.id, r);
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:16px;">
        ${metrics.map(m => `
          <div style="background:rgba(255,255,255,.04);border:1px solid ${sc.color}25;border-radius:12px;padding:14px;text-align:center;">
            <div style="font-size:11px;color:rgba(255,255,255,.45);margin-bottom:4px;">${m.label}</div>
            <div style="font-size:1.15rem;font-weight:800;color:${m.positive ? sc.color : '#ff6b6b'};">${m.value}</div>
          </div>`).join('')}
      </div>
      ${r.actions ? `
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;margin-bottom:14px;">
          <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:8px;letter-spacing:.8px;text-transform:uppercase;">Action Plan</div>
          ${r.actions.filter(Boolean).map(a => `
            <div style="display:flex;gap:8px;margin-bottom:6px;font-size:13px;color:rgba(255,255,255,.8);">
              <span style="color:${sc.color};flex-shrink:0;">→</span><span>${a}</span>
            </div>`).join('')}
        </div>` : ''}
      <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:14px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <div style="width:6px;height:6px;border-radius:50%;background:#00d4ff;animation:pulse 1.5s infinite;"></div>
          <span style="font-size:11px;color:#00d4ff;font-weight:700;letter-spacing:.8px;text-transform:uppercase;">Arya says</span>
        </div>
        <div class="scenario-arya-response" style="font-size:13.5px;color:rgba(255,255,255,.85);line-height:1.7;"></div>
      </div>`;
  }

  function getMetrics(id, r) {
    const yes = true, no = false;
    const M = {
      job_loss: [
        { label: 'Current Runway', value: r.runway + ' months', positive: r.runway >= 6 },
        { label: 'With Paused SIPs', value: r.runwayWithPausedSIP + ' months', positive: r.runwayWithPausedSIP >= 6 },
        { label: 'EF Gap', value: INR(r.gap), positive: r.gap === 0 },
        { label: 'Monthly to Save', value: INR(r.monthlyToSave), positive: yes }
      ],
      house_purchase: [
        { label: 'EMI/month', value: INR(r.emi), positive: r.emiSafe },
        { label: 'True Total Cost', value: INR(r.trueCost), positive: no },
        { label: 'Property Value ' + (inp?.tenure || 20) + 'y', value: INR(r.propValue), positive: yes },
        { label: 'If Invested Instead', value: INR(r.oppCost), positive: yes },
        { label: 'Break-Even Year', value: 'Year ' + r.beYear, positive: r.beYear <= 12 }
      ],
      market_crash: [
        { label: 'Paper Loss', value: INR(r.loss), positive: no },
        { label: 'Portfolio After', value: INR(r.afterCrash), positive: yes },
        { label: 'SIP Extra Units', value: '+' + r.extraUnits, positive: yes },
        { label: 'FIRE Shift', value: '+' + r.crashFireShift + ' yrs', positive: no }
      ],
      sip_delay: [
        { label: 'Start Now', value: INR(r.corpusNow), positive: yes },
        { label: 'Start 1yr Late', value: INR(r.corpusDelayed), positive: no },
        { label: 'Cost of Waiting', value: INR(r.costOfWaiting), positive: no },
        { label: 'Wealth Lost %', value: r.pctLoss + '%', positive: no }
      ],
      fire_shift: [
        { label: 'Current FIRE', value: r.baseFIRE + ' yrs', positive: r.baseFIRE <= 20 },
        { label: 'New FIRE', value: r.newFIRE + ' yrs', positive: r.newFIRE < r.baseFIRE },
        { label: 'Years Changed', value: (r.delta > 0 ? '-' : '+') + Math.abs(r.delta) + ' yrs', positive: r.delta > 0 },
        { label: 'FIRE Corpus', value: INR(r.fireTarget), positive: yes }
      ],
      extra_payment: [
        { label: 'Interest Saved', value: INR(r.saved), positive: yes },
        { label: 'Years Saved', value: r.yrsSaved + ' yrs', positive: yes },
        { label: 'Base Timeline', value: Math.floor(r.baseMths/12) + 'y ' + (r.baseMths%12) + 'm', positive: no },
        { label: 'New Timeline', value: Math.floor(r.fasterMths/12) + 'y ' + (r.fasterMths%12) + 'm', positive: yes }
      ]
    };
    return M[id] || [];
  }

  /* ──────────────────────────────────────────────────────────────────
     SCENARIO HUB RENDERER
  ────────────────────────────────────────────────────────────────── */
  function renderHub(containerEl) {
    containerEl.innerHTML = `
      <style>
        .sc-card { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08);
          border-radius:16px; padding:20px; cursor:pointer; transition:all .2s; }
        .sc-card:hover { transform:translateY(-3px); border-color:rgba(255,255,255,.18);
          box-shadow:0 8px 24px rgba(0,0,0,.3); }
        .sc-input { background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12);
          border-radius:8px; padding:8px 12px; color:#fff; width:100%; font-size:13px; }
        .sc-btn { border:none; border-radius:10px; padding:10px 20px; font-size:13px;
          font-weight:700; cursor:pointer; transition:all .2s; }
        .sc-btn:hover { transform:translateY(-1px); }
        .arya-thinking span { display:inline-block; width:6px; height:6px; border-radius:50%;
          background:#00d4ff; margin:0 2px; animation:_dot .8s infinite; }
        .arya-thinking span:nth-child(2) { animation-delay:.15s; }
        .arya-thinking span:nth-child(3) { animation-delay:.3s; }
        @keyframes _dot { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-6px)} }
      </style>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
        ${Object.values(SCENARIOS).map(sc => `
          <div class="sc-card" data-sc="${sc.id}" style="border-top:3px solid ${sc.color};">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
              <span style="font-size:24px;">${sc.icon}</span>
              <div>
                <div style="font-weight:700;font-size:.95rem;">${sc.title}</div>
                <div style="font-size:11px;color:rgba(255,255,255,.45);">${sc.subtitle}</div>
              </div>
            </div>
            <div class="sc-inputs-${sc.id}" style="margin:12px 0;">
              ${sc.inputs.map(inp => `
                <div style="margin-bottom:8px;">
                  <label style="font-size:11px;color:rgba(255,255,255,.5);display:block;margin-bottom:4px;">${inp.label}</label>
                  ${inp.type === 'range'
                    ? `<div style="display:flex;align-items:center;gap:8px;">
                        <input type="range" min="${inp.min}" max="${inp.max}" value="${inp.default}"
                          data-sc="${sc.id}" data-inp="${inp.id}"
                          oninput="this.nextElementSibling.textContent=this.value+(this.dataset.suffix||'')"
                          style="flex:1;accent-color:${sc.color};">
                        <span style="font-size:13px;font-weight:700;color:${sc.color};min-width:32px;">${inp.default}</span>
                       </div>`
                    : `<input type="number" value="${inp.default}" min="${inp.min}" max="${inp.max}"
                        data-sc="${sc.id}" data-inp="${inp.id}"
                        class="sc-input">`}
                </div>`).join('')}
            </div>
            <button class="sc-btn" data-sc="${sc.id}"
              style="width:100%;background:${sc.color}20;color:${sc.color};border:1px solid ${sc.color}40;">
              Run Scenario →
            </button>
            <div class="sc-result-${sc.id}" style="margin-top:14px;display:none;"></div>
          </div>`).join('')}
      </div>`;

    // Wire up buttons
    containerEl.querySelectorAll('.sc-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.sc;
        const sc = SCENARIOS[id];
        const inputs = {};
        containerEl.querySelectorAll(`[data-sc="${id}"][data-inp]`).forEach(el => {
          inputs[el.dataset.inp] = el.type === 'range' || el.type === 'number' ? +el.value : el.value;
        });
        const resultEl = containerEl.querySelector(`.sc-result-${id}`);
        resultEl.style.display = 'block';
        await run(id, inputs, resultEl);
      });
    });
  }

  /* ── Helpers ────────────────────────────────────────────────────── */
  function getName(ctx) {
    return ctx?.identity?.name || localStorage.getItem('finos_display_name') || 'yaar';
  }
  function goal_reminder(goals) {
    if (!goals?.length) return null;
    return `Goals to review: ${goals.slice(0,2).map(g => g.name).join(', ')}`;
  }

  /* ── Export ─────────────────────────────────────────────────────── */
  global.AryaScenarios = { run, renderHub, SCENARIOS };

}(window));
