/**
 * FIN-OS Money Score — a 60-second, fully on-device financial health score.   (v1.0)
 *
 * Why it exists: the conversational onboarding needs a local LLM and ends with prose. This gives every user a number,
 * a plain-English reason for it, and the three moves that would raise it most — computed deterministically, offline.
 *
 * Pure part (works in Node, unit-tested):
 *   FinosMoneyScore.normalize(raw)              → { inputs, errors }
 *   FinosMoneyScore.compute(raw, ctx)           → { ok, score, band, pillars[6], actions[≤3], inputs }  |  { ok:false, errors }
 *                                                  ctx.leakMonthly (optional) points the savings move at the user's measured leak
 *   FinosMoneyScore.deriveInputs(data)          → { values, sources }: answers FIN-OS can already fill in from what the user tracks
 *   FinosMoneyScore.benchmarkMultiple(age)      → invested-assets ÷ annual-income that is typical for that age
 *   FinosMoneyScore.whatIf(raw, levers)         → { before, after, delta, pillars[{before,after}], surplusBefore/After, ranges }
 *   FinosMoneyScore.leverRanges(inputs)         → slider ranges from the person's own gaps; max 0 = does not apply to them
 *   FinosMoneyScore.appendHistory(hist, entry)  → one entry per day, last 24 kept
 *   FinosMoneyScore.trend(hist)                 → { delta, since } vs the previous snapshot, or null
 *
 * Browser part:
 *   FinosMoneyScore.render(el)                  → questionnaire → result, saved on this device
 *   FinosMoneyScore.drawCard(result)            → 1080×1080 canvas (score + pillar scores only — never any ₹ amount)
 *   FinosMoneyScore.load() / save(entry)        → keys `finos_money_score`, `finos_money_score_history`
 *
 * Pillars (weights add to 100). Each pillar scores 0–100; the total is the weighted mean.
 *   savings    20  share of income left after spending and EMIs        — full marks at 20%
 *   emergency  20  liquid savings ÷ monthly outgo                      — full marks at 6 months
 *   insurance  20  term cover (dependents only) and health cover       — 10× annual income / ₹5–10L
 *   debt       15  EMIs ÷ income                                       — full marks ≤10%, zero ≥50%; high-interest debt caps it at 40
 *   investing  15  money put to work each month ÷ income               — full marks at 15%
 *   wealth     10  invested assets vs the usual multiple of income for the age
 *
 * These are rules of thumb for education, not personalised investment advice.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosMoneyScore = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const KEY = 'finos_money_score';
  const HKEY = 'finos_money_score_history';
  const VERSION = 1;

  const WEIGHTS = { savings: 20, emergency: 20, insurance: 20, debt: 15, investing: 15, wealth: 10 };
  const LABELS = {
    savings: 'Savings rate', emergency: 'Emergency fund', insurance: 'Insurance cover',
    debt: 'Debt load', investing: 'Investing habit', wealth: 'Wealth for your age',
  };
  const T = {
    savingsRate: 0.20, investRate: 0.15, emergencyMonths: 6,
    dtiFull: 0.10, dtiZero: 0.50, highInterestCap: 40,
    termMultiple: 10, healthBase: 500000, healthPerDependent: 250000, healthDependentCap: 2,
  };
  // [age, invested assets as a multiple of annual income] — widely used milestones, linearly interpolated.
  const BENCH = [[22, 0], [30, 1], [40, 3], [50, 6], [60, 8], [65, 10]];
  const BANDS = [
    { id: 'attention', min: 0,  label: 'Needs attention', tone: 'error' },
    { id: 'building',  min: 40, label: 'Getting there',   tone: 'warn' },
    { id: 'ontrack',   min: 60, label: 'On track',        tone: 'good' },
    { id: 'strong',    min: 80, label: 'Strong',          tone: 'great' },
  ];

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const ceilTo = (x, step) => Math.ceil(Math.max(0, x) / step) * step;

  function fmt(n) {
    n = Math.round(Number(n) || 0);
    const a = Math.abs(n);
    const s = a >= 1e7 ? '₹' + (a / 1e7).toFixed(2) + ' Cr' : a >= 1e5 ? '₹' + (a / 1e5).toFixed(2) + ' L' : '₹' + a.toLocaleString('en-IN');
    return n < 0 ? '-' + s : s;
  }
  const pct = (x) => Math.round(x * 100) + '%';

  /* ── translatable text ────────────────────────────────────────────────────────────────────────────────────────
     Every sentence with numbers is an English template plus parameters. The result carries the English text (interpolated here, so
     tests, PULSE and Arya keep reading English) AND { key, params }, so the page can show the same sentence in the person's language
     with money formatted locally. Param markers: { m: rupees }, { p: ratio shown as a percent }, { d: number shown with one decimal },
     { t: another template, translated on its own }. */
  const M = (n) => ({ m: n }), Pc = (r) => ({ p: r }), Dc = (x) => ({ d: x }), Tt = (k) => ({ t: k });
  function fill(key, params, f) {
    return String(key).replace(/\{(\w+)\}/g, (_, name) => {
      const v = params && params[name];
      if (v && typeof v === 'object') {
        if ('m' in v) return f.money(v.m);
        if ('p' in v) return f.pct(v.p);
        if ('d' in v) return Number(v.d).toFixed(1);
        if ('t' in v) return f.t(v.t);
      }
      return v == null ? '' : String(v);
    });
  }
  const EN = { money: (n) => fmt(n), pct: (r) => pct(r), t: (k) => k };
  /** A sentence: its English text now, plus what the page needs to translate it. */
  const S = (key, params) => ({ text: fill(key, params, EN), key, params: params || {} });

  /* ── input handling ───────────────────────────────────────────────────── */
  function toNum(v) {
    if (typeof v === 'number') return v;
    const n = Number(String(v == null ? '' : v).replace(/[,₹\s]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }
  const truthy = (v) => v === true || v === 1 || /^(1|true|yes|on)$/i.test(String(v));

  function normalize(raw) {
    raw = raw || {};
    const errors = [], errorsT = [];
    const err = (key, params) => { const t = S(key, params); errors.push(t.text); errorsT.push({ key: t.key, params: t.params }); };
    const opt = (k, label) => {
      const v = raw[k] === undefined || raw[k] === '' || raw[k] === null ? 0 : toNum(raw[k]);
      if (!Number.isFinite(v) || v < 0) { err('{label} must be a number, zero or more', { label: Tt(label) }); return 0; }
      if (v > 1e11) { err('{label} looks too large', { label: Tt(label) }); return 0; }
      return v;
    };
    const age = toNum(raw.age);
    if (!Number.isFinite(age) || age < 18 || age > 80) err('Age must be between 18 and 80');
    const income = toNum(raw.monthlyIncome);
    if (!Number.isFinite(income) || income <= 0) err('Monthly take-home income must be more than zero');
    else if (income > 1e8) err('Monthly income looks too large');
    // Spending is required: a blank would read as "spends nothing", which flatters the savings and emergency pillars.
    const spend = toNum(raw.monthlyExpenses);
    if (!Number.isFinite(spend) || spend <= 0) err('Monthly spending must be more than zero (rent, food, bills and so on, not counting EMIs)');
    else if (spend > 1e8) err('Monthly spending looks too large');
    const deps = raw.dependents === undefined || raw.dependents === '' ? 0 : toNum(raw.dependents);
    if (!Number.isFinite(deps) || deps < 0 || deps > 10) err('Dependents must be between 0 and 10');
    const inputs = {
      age: Math.round(age) || 0,
      monthlyIncome: income > 0 ? income : 0,
      monthlyExpenses: spend > 0 ? spend : 0,
      monthlyEmi: opt('monthlyEmi', 'Monthly EMIs'),
      liquidSavings: opt('liquidSavings', 'Savings you can reach quickly'),
      monthlyInvesting: opt('monthlyInvesting', 'Monthly investing'),
      investedTotal: opt('investedTotal', 'Total invested'),
      termCover: opt('termCover', 'Term cover'),
      healthCover: opt('healthCover', 'Health cover'),
      dependents: Math.round(deps) || 0,
      highInterestDebt: truthy(raw.highInterestDebt),
    };
    return { inputs, errors, errorsT };
  }

  /* ── pillars ──────────────────────────────────────────────────────────── */
  function benchmarkMultiple(age) {
    if (age <= BENCH[0][0]) return BENCH[0][1];
    for (let i = 1; i < BENCH.length; i++) {
      if (age <= BENCH[i][0]) {
        const [a0, m0] = BENCH[i - 1], [a1, m1] = BENCH[i];
        return m0 + ((age - a0) / (a1 - a0)) * (m1 - m0);
      }
    }
    return BENCH[BENCH.length - 1][1];
  }
  const healthTarget = (i) => T.healthBase + T.healthPerDependent * Math.min(i.dependents, T.healthDependentCap);
  const termTarget = (i) => (i.dependents > 0 ? T.termMultiple * 12 * i.monthlyIncome : 0);

  function pillarScores(i) {
    const outgo = i.monthlyExpenses + i.monthlyEmi;
    const saveRate = (i.monthlyIncome - outgo) / i.monthlyIncome;
    const months = outgo > 0 ? i.liquidSavings / outgo : T.emergencyMonths;
    const dti = i.monthlyEmi / i.monthlyIncome;
    const investRate = i.monthlyInvesting / i.monthlyIncome;
    const tTarget = termTarget(i), hTarget = healthTarget(i);
    const termScore = tTarget > 0 ? clamp01(i.termCover / tTarget) : 1;
    const healthScore = clamp01(i.healthCover / hTarget);
    const wTarget = benchmarkMultiple(i.age) * 12 * i.monthlyIncome;
    let debt = 100 * clamp01((T.dtiZero - dti) / (T.dtiZero - T.dtiFull));
    if (i.highInterestDebt) debt = Math.min(debt, T.highInterestCap);
    return {
      savings:   { score: 100 * clamp01(saveRate / T.savingsRate), metric: saveRate },
      emergency: { score: 100 * clamp01(months / T.emergencyMonths), metric: months },
      insurance: { score: 100 * (0.5 * termScore + 0.5 * healthScore), metric: { term: termScore, health: healthScore } },
      debt:      { score: debt, metric: dti },
      investing: { score: 100 * clamp01(investRate / T.investRate), metric: investRate },
      wealth:    { score: wTarget > 0 ? 100 * clamp01(i.investedTotal / wTarget) : 100, metric: wTarget },
    };
  }
  const totalOf = (p) => Object.keys(WEIGHTS).reduce((s, k) => s + (WEIGHTS[k] * p[k].score) / 100, 0);
  const bandOf = (score) => BANDS.slice().reverse().find((b) => score >= b.min);

  function pillarDetail(id, i, p) {
    const m = p[id].metric;
    switch (id) {
      case 'savings':   return m >= 0 ? S('You keep {p} of your income. Aim for 20%.', { p: Pc(m) }) : S('You spend more than you earn each month.');
      case 'emergency': return S('Savings cover {m} months of spending. Aim for 6.', { m: Dc(m) });
      case 'insurance': return i.dependents > 0 ? S('Term cover {t} of target · health cover {h} of target.', { t: Pc(m.term), h: Pc(m.health) })
                                                : S('No dependents, so term cover is optional · health cover {h} of target.', { h: Pc(m.health) });
      case 'debt':      return i.highInterestDebt ? S('EMIs take {p} of your income, and you carry high-interest debt.', { p: Pc(m) })
                                                  : S('EMIs take {p} of your income. Under 10% is ideal, over 40% is stretched.', { p: Pc(m) });
      case 'investing': return S('You invest {p} of your income. Aim for 15%.', { p: Pc(m) });
      default:          return S('Typical for age {age}: {x}× annual income invested ({amt}).', { age: i.age, x: Dc(benchmarkMultiple(i.age)), amt: M(m) });
    }
  }

  /* ── next best actions ────────────────────────────────────────────────── */
  const path = (p) => encodeURI(p);
  function candidateActions(i, p, ctx) {
    const out = [];
    const outgo = i.monthlyExpenses + i.monthlyEmi;
    const add = (id, title, detail, amount, apply, href, cta, urgent) => out.push({ id, title, detail, amount, apply, href, cta, urgent: !!urgent });

    if (p.debt.score < 100) {
      if (i.highInterestDebt) {
        add('debt-high', S('Clear your high-interest debt first'),
          S('Credit-card and personal-loan balances cost 24–42% a year, and no investment reliably beats that. Pay these off before adding new investments.'),
          0, (x) => ({ ...x, highInterestDebt: false }), path('../calculators/loans, debt & emi/prepayinvest.html'), 'Plan the payoff', true);
      } else {
        const cut = ceilTo(i.monthlyEmi - T.dtiFull * i.monthlyIncome, 100);
        add('debt', S('Bring EMIs down from {p} of your income', { p: Pc(p.debt.metric) }),
          S('Lenders see 40%+ as stretched. Compare prepaying a loan with investing the money, or refinance at a lower rate. Under 10% earns full marks.'),
          cut, (x) => ({ ...x, monthlyEmi: T.dtiFull * x.monthlyIncome }), path('../calculators/loans, debt & emi/prepayinvest.html'), 'Prepay or invest?');
      }
    }
    if (p.emergency.score < 100) {
      const target = T.emergencyMonths * outgo;
      const gap = ceilTo(target - i.liquidSavings, 1000);
      add('emergency', S('Build your emergency fund by {gap}', { gap: M(gap) }),
        S('You have {m} months of cover; 6 months is {target}. Setting aside {monthly} a month gets you there in a year. Keep it in a savings account or liquid fund.', { m: Dc(p.emergency.metric), target: M(target), monthly: M(ceilTo(gap / 12, 100)) }),
        gap, (x) => ({ ...x, liquidSavings: T.emergencyMonths * (x.monthlyExpenses + x.monthlyEmi) }), '../html/emergency-fund.html', 'Open the planner', p.emergency.metric < 3);
    }
    if (p.insurance.score < 100) {
      const tGap = Math.max(0, termTarget(i) - i.termCover), hGap = Math.max(0, healthTarget(i) - i.healthCover);
      const tail = ' A pure term plan is the cheapest way to protect dependents, and one hospital stay can erase years of savings.';
      const pr = { tt: M(termTarget(i)), th: M(i.termCover), ht: M(healthTarget(i)), hh: M(i.healthCover) };
      const detail = tGap > 0 && hGap > 0 ? S('Add term life cover of {tt} (10× annual income; you have {th}) and health cover of {ht} (you have {hh}).' + tail, pr)
        : tGap > 0 ? S('Add term life cover of {tt} (10× annual income; you have {th}).' + tail, pr)
        : S('Add health cover of {ht} (you have {hh}).' + tail, pr);
      add('insurance', S('Close your insurance gap'), detail,
        tGap + hGap, (x) => ({ ...x, termCover: Math.max(x.termCover, termTarget(x)), healthCover: Math.max(x.healthCover, healthTarget(x)) }),
        tGap > 0 ? '../html/life-cover.html' : '../html/insurance-hub.html', tGap > 0 ? 'Size your cover' : 'Compare health plans');
    }
    if (p.savings.score < 100) {
      const free = ceilTo(outgo - (1 - T.savingsRate) * i.monthlyIncome, 100);
      const leak = ctx && ctx.leakMonthly > 0 ? Math.round(ctx.leakMonthly) : 0;
      const neg = p.savings.metric < 0;
      const pr = { p: Pc(p.savings.metric), target: M(T.savingsRate * i.monthlyIncome), leak: M(leak) };
      const head = neg ? 'You keep nothing of your income after spending and EMIs. The target is 20% ({target}). ' : 'You keep {p} of your income after spending and EMIs. The target is 20% ({target}). ';
      const detail = leak ? S(head + 'Your Future Loss check already found {leak} a month in discretionary leaks, so start there.', pr)
                          : S(head + 'Trim the biggest flexible spends first, and subscriptions are often the easiest.', pr);
      add('savings', S('Free up {free} a month', { free: M(free) }), detail,
        free, (x) => ({ ...x, monthlyExpenses: Math.max(0, x.monthlyExpenses - free) }),
        leak ? '../html/system-leak.html#radar-module' : '../html/subscription-tracker.html', leak ? 'See your leak' : 'Find the leaks');
    }
    if (p.investing.score < 100) {
      const more = ceilTo(T.investRate * i.monthlyIncome - i.monthlyInvesting, 100);
      add('investing', S('Invest {more} more every month', { more: M(more) }),
        S('You invest {p} of your income; 15% ({target}) is a strong habit. A step-up SIP makes it painless: raise it each April when the salary revision lands.', { p: Pc(p.investing.metric), target: M(T.investRate * i.monthlyIncome) }),
        more, (x) => ({ ...x, monthlyInvesting: T.investRate * x.monthlyIncome }), '../html/sip-stepup.html', 'Plan a step-up SIP');
    }
    if (p.wealth.score < 100) {
      const gap = ceilTo(p.wealth.metric - i.investedTotal, 10000);
      add('wealth', S('Close your wealth-for-age gap'),
        S('People your age typically have {x}× their annual income invested ({target}); you have {have}. Steady investing over years closes this and no single big jump is needed.', { x: Dc(benchmarkMultiple(i.age)), target: M(p.wealth.metric), have: M(i.investedTotal) }),
        gap, (x) => ({ ...x, investedTotal: Math.max(x.investedTotal, benchmarkMultiple(x.age) * 12 * x.monthlyIncome) }), '../html/retirement-planner.html', 'Check retirement odds');
    }
    return out;
  }

  function rankActions(i, p, total, ctx) {
    const ranked = candidateActions(i, p, ctx).map((a) => {
      const gain = totalOf(pillarScores(a.apply(i))) - total;
      return { id: a.id, title: a.title.text, detail: a.detail.text, titleT: { key: a.title.key, params: a.title.params }, detailT: { key: a.detail.key, params: a.detail.params },
        amount: a.amount, gain: Math.round(gain), rawGain: gain, href: a.href, cta: a.cta, urgent: a.urgent };
    }).filter((a) => a.rawGain >= 0.5);
    // Safety first: high-interest debt and a near-empty emergency fund outrank anything that merely adds points.
    ranked.sort((a, b) => (b.urgent - a.urgent) || (b.rawGain - a.rawGain));
    return ranked.slice(0, 3).map(({ rawGain, ...a }) => a);
  }

  function compute(raw, ctx) {
    const { inputs, errors, errorsT } = normalize(raw);
    if (errors.length) return { ok: false, errors, errorsT };
    const p = pillarScores(inputs);
    const total = totalOf(p);
    const score = Math.round(total);
    return {
      ok: true, version: VERSION, score, band: bandOf(score), inputs,
      pillars: Object.keys(WEIGHTS).map((id) => ({ id, label: LABELS[id], weight: WEIGHTS[id], score: Math.round(p[id].score), points: +((WEIGHTS[id] * p[id].score) / 100).toFixed(1), ...(() => { const d = pillarDetail(id, inputs, p); return { detail: d.text, detailT: { key: d.key, params: d.params } }; })() })),
      actions: rankActions(inputs, p, total, ctx),
    };
  }

  /* ── what-if: how far could these moves lift the score? ─────────────────────────────────────────────────────
     Every lever is applied to the normalised answers and re-scored by compute(), so a what-if can never drift from the real score. */
  const LEVER_STEP = { spendLess: 500, investMore: 500, emiLess: 500, cashAdd: 10000, termAdd: 500000, healthAdd: 50000 };
  const floorTo = (x, step) => Math.floor(Math.max(0, x) / step) * step;

  /** Slider ranges from the person's own gaps. A lever whose max is 0 does not apply to them (no EMI, cover already full, ...). */
  function leverRanges(i) {
    const outgo = i.monthlyExpenses + i.monthlyEmi;
    const max = {
      spendLess: floorTo(i.monthlyExpenses * 0.5, LEVER_STEP.spendLess),                          // up to half of today's spending
      investMore: floorTo(i.monthlyIncome * 0.2, LEVER_STEP.investMore),                          // up to 20% of income
      emiLess: floorTo(i.monthlyEmi, LEVER_STEP.emiLess),
      cashAdd: floorTo(T.emergencyMonths * outgo - i.liquidSavings, LEVER_STEP.cashAdd),          // up to a full 6-month cushion
      termAdd: floorTo(termTarget(i) - i.termCover, LEVER_STEP.termAdd),
      healthAdd: floorTo(healthTarget(i) - i.healthCover, LEVER_STEP.healthAdd),
    };
    return Object.fromEntries(Object.keys(max).map((k) => [k, { step: LEVER_STEP[k], max: max[k] }]));
  }

  /** levers: { spendLess, investMore, emiLess, cashAdd, termAdd, healthAdd } in rupees. Junk is 0; out-of-range is clamped. */
  function applyWhatIf(inputs, levers) {
    const r = leverRanges(inputs), lv = levers || {};
    const get = (k) => { const v = Number(lv[k]); return Number.isFinite(v) ? Math.min(r[k].max, Math.max(0, v)) : 0; };
    return Object.assign({}, inputs, {
      monthlyExpenses: Math.max(1, inputs.monthlyExpenses - get('spendLess')),
      monthlyInvesting: inputs.monthlyInvesting + get('investMore'),
      monthlyEmi: Math.max(0, inputs.monthlyEmi - get('emiLess')),
      liquidSavings: inputs.liquidSavings + get('cashAdd'),
      termCover: inputs.termCover + get('termAdd'),
      healthCover: inputs.healthCover + get('healthAdd'),
    });
  }

  function whatIf(raw, levers, ctx) {
    const base = compute(raw, ctx);
    if (!base.ok) return base;
    const after = compute(applyWhatIf(base.inputs, levers), ctx);
    const surplus = (i) => Math.round(i.monthlyIncome - i.monthlyExpenses - i.monthlyEmi - i.monthlyInvesting);   // what is left after spending, EMIs and investing
    return {
      ok: true, before: base.score, after: after.score, delta: after.score - base.score, bandBefore: base.band, bandAfter: after.band,
      pillars: after.pillars.map((p, k) => ({ id: p.id, label: p.label, before: base.pillars[k].score, after: p.score })),
      surplusBefore: surplus(base.inputs), surplusAfter: surplus(after.inputs),
      ranges: leverRanges(base.inputs), inputs: after.inputs,
    };
  }

  /* ── history ──────────────────────────────────────────────────────────── */
  function appendHistory(hist, entry) {
    const list = (Array.isArray(hist) ? hist : []).filter((h) => h && h.date && h.date !== entry.date);
    list.push({ date: entry.date, score: entry.score });
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    return list.slice(-24);
  }
  function trend(hist) {
    if (!Array.isArray(hist) || hist.length < 2) return null;
    const last = hist[hist.length - 1], prev = hist[hist.length - 2];
    return { delta: last.score - prev.score, since: prev.date };
  }

  /* ── prefill: answers FIN-OS can already work out from what the user tracks ──────────────────────────────────────── */
  const dayNum = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
  const isoToday = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const MIN_HISTORY_DAYS = 14, HISTORY_WINDOW = 90;
  const EMI_CATEGORY = 'EMI & Loans';

  /** Monthly average per category over the last 90 days (same method as FinosLeak). Under 14 days of history is not scaled up. */
  function monthlyByCategory(txns, now) {
    const today = dayNum(isoToday(now instanceof Date ? now : new Date())), start = today - (HISTORY_WINDOW - 1);
    const win = (Array.isArray(txns) ? txns : []).filter((t) => t && t.kind === 'expense' && t.amount > 0 && dayNum(t.date) >= start && dayNum(t.date) <= today);
    const first = win.reduce((m, t) => Math.min(m, dayNum(t.date)), Infinity);
    const days = win.length ? today - first + 1 : 0;
    const out = { days, enough: days >= MIN_HISTORY_DAYS, byCat: {} };
    if (out.enough) win.forEach((t) => { out.byCat[t.category] = (out.byCat[t.category] || 0) + (t.amount * 30) / days; });
    return out;
  }

  /**
   * data: { income, age, dependents, termCover, emergencyFund, sipMonthly, txns[normalized], now,
   *         values: { portfolio, mfImport, sip, epf, ppf, nps, gold } }
   * Only positive, plausible numbers are returned. Every value is a suggestion the user can edit.
   */
  function deriveInputs(data) {
    data = data || {};
    const values = {}, sources = {};
    const set = (k, v, why) => { v = Math.round(Number(v)); if (Number.isFinite(v) && v > 0) { values[k] = v; sources[k] = why; } };
    set('monthlyIncome', data.income, 'your income');
    if (Number(data.age) >= 18 && Number(data.age) <= 80) { values.age = Math.round(Number(data.age)); sources.age = 'your profile'; }
    if (Number(data.dependents) >= 1) { values.dependents = Math.min(3, Math.round(Number(data.dependents))); sources.dependents = 'your profile'; }
    set('termCover', data.termCover, 'your insurance tracker');
    set('liquidSavings', data.emergencyFund, 'your emergency fund');
    set('monthlyInvesting', data.sipMonthly, 'your SIPs');
    const v = data.values || {};
    const n = (x) => (Number(x) > 0 ? Number(x) : 0);
    // The SIP tracker and a CAS import can describe the same units, so take the larger rather than the sum.
    set('investedTotal', n(v.portfolio) + Math.max(n(v.mfImport), n(v.sip)) + n(v.epf) + n(v.ppf) + n(v.nps) + n(v.gold), 'your investment trackers');
    const m = monthlyByCategory(data.txns, data.now);
    if (m.enough) {
      const emi = m.byCat[EMI_CATEGORY] || 0;
      const spend = Object.keys(m.byCat).reduce((s, c) => s + (c === EMI_CATEGORY ? 0 : m.byCat[c]), 0);
      set('monthlyExpenses', spend, 'your last ' + Math.min(m.days, HISTORY_WINDOW) + ' days of logged spending');
      set('monthlyEmi', emi, 'your logged EMI payments');
    }
    return { values, sources };
  }

  /* ── language ─────────────────────────────────────────────────────────────────────────────────────────────── */
  const lang = () => (root.FinosI18n && root.FinosI18n.lang && root.FinosI18n.lang()) || 'en';
  /** Money as the person reads it: ₹4.40 L in English, ₹4.40 लाख in Hindi. */
  const fmtL = (n) => (lang() === 'hi' ? fmt(n).replace(/(\d) Cr\b/, '$1 करोड़').replace(/(\d) L\b/, '$1 लाख') : fmt(n));
  /** Translate an English template (the exact key) and fill its parameters. With no entry for the language it shows the English. */
  function tr(key, params) {
    const raw = lang() === 'en' || !root.FinosI18n || !root.FinosI18n.t ? key : root.FinosI18n.t(key, key);
    return fill(raw, params, { money: fmtL, pct, t: (k) => tr(k) });
  }
  /** A {key, params} pair that the core attached to a sentence, shown in the current language. */
  const trT = (t) => tr(t.key, t.params);


  const api = { KEY, HKEY, WEIGHTS, LABELS, TARGETS: T, BANDS, normalize, compute, deriveInputs, whatIf, leverRanges, applyWhatIf, benchmarkMultiple, appendHistory, trend, fmt, tr };
  if (typeof root.document === 'undefined') return api;

  /* ═════════════════════ browser part ═════════════════════ */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TONE = { error: '#EF4444', warn: '#F59E0B', good: '#22D3A6', great: '#4F7CFF' };
  const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

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
  const num = (k) => { const v = rd(k, 0); const n = Number(v); return Number.isFinite(n) ? n : 0; };

  function load() { return rd(KEY, null); }
  function loadHistory() { return rd(HKEY, []); }

  /** Seed shared keys other tools read, but never overwrite what the user already entered there. */
  function seedSharedKeys(i) {
    const seed = { finos_monthly_income: i.monthlyIncome, finos_monthly_expense: i.monthlyExpenses, finos_emergency_fund: i.liquidSavings, finos_sip_monthly: i.monthlyInvesting };
    Object.keys(seed).forEach((k) => { if (!num(k) && seed[k] > 0) wr(k, seed[k]); });
  }

  function save(result) {
    // `weakest` and `top` let PULSE and Arya show the headline and the next move without loading this module.
    const weakest = result.pillars.slice().sort((a, b) => a.score - b.score)[0];
    const top = result.actions[0];
    const entry = {
      inputs: result.inputs, score: result.score, band: result.band.id, pillars: result.pillars.map((p) => ({ id: p.id, score: p.score })),
      weakest: weakest ? { id: weakest.id, label: weakest.label, score: weakest.score } : null,
      top: top ? { id: top.id, title: top.title, titleT: top.titleT || null, gain: top.gain, href: top.href, cta: top.cta } : null,
      at: new Date().toISOString(), v: VERSION,
    };
    wr(KEY, entry);
    const hist = appendHistory(loadHistory(), { date: todayISO(), score: result.score });
    wr(HKEY, hist);
    seedSharedKeys(result.inputs);
    return { entry, hist };
  }

  /* ── share card ───────────────────────────────────────────────────────── */
  function drawCard(result) {
    const W = 1080, H = 1080;
    const c = root.document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const tone = TONE[result.band.tone];
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0B0D12'); bg.addColorStop(1, '#171B2A');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.5, 330, 0, W * 0.5, 330, 520);
    glow.addColorStop(0, tone + '33'); glow.addColorStop(1, 'transparent');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);

    const SANS = ', "Noto Sans Devanagari", "Kohinoor Devanagari", system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,.65)'; g.font = '600 34px Manrope' + SANS;
    g.fillText(tr('MY FIN-OS MONEY SCORE'), W / 2, 120);

    const cx = W / 2, cy = 360, r = 190;
    g.lineWidth = 34; g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = tone; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * result.score) / 100); g.stroke();
    g.fillStyle = '#fff'; g.font = '800 170px "Space Grotesk"' + SANS;
    g.fillText(String(result.score), cx, cy + 56);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '600 36px Manrope' + SANS;
    g.fillText(tr('out of 100'), cx, cy + 112);
    g.fillStyle = tone; g.font = '800 54px "Space Grotesk"' + SANS;
    g.fillText(tr(result.band.label), cx, 640);

    g.textAlign = 'left';
    result.pillars.forEach((p, idx) => {
      const col = idx % 2, row = Math.floor(idx / 2);
      const x = 90 + col * 470, y = 720 + row * 90;
      g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '600 26px Manrope' + SANS;
      g.fillText(tr(p.label), x, y);
      g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x, y + 14, 400, 14);
      g.fillStyle = p.score >= 60 ? '#22D3A6' : p.score >= 40 ? '#F59E0B' : '#EF4444';
      g.fillRect(x, y + 14, (400 * p.score) / 100, 14);
    });
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '600 28px Manrope' + SANS;
    g.fillText(tr('Free · private · calculated on my device'), W / 2, 1030);
    return c;
  }

  async function shareCard(result) {
    const canvas = drawCard(result);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const text = tr('My Money Score is {score}/100 ({band}) on FIN-OS. What is yours?', { score: result.score, band: Tt(result.band.label) });
    try {
      const file = new root.File([blob], 'finos-money-score.png', { type: 'image/png' });
      if (root.navigator.canShare && root.navigator.canShare({ files: [file] })) {
        await root.navigator.share({ files: [file], title: tr('My FIN-OS Money Score'), text });
        return 'shared';
      }
    } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
    const a = root.document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'finos-money-score.png';
    root.document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'downloaded';
  }

  /* ── UI ───────────────────────────────────────────────────────────────── */
  const FIELDS = [
    { group: 'About you', items: [
      { id: 'age', label: 'Your age', ph: '30', min: 18, max: 80, hint: '' },
      { id: 'dependents', label: 'People who depend on your income', type: 'select', opts: [[0, 'None'], [1, '1'], [2, '2'], [3, '3 or more']], hint: 'Spouse, children, parents' },
    ] },
    { group: 'Every month', items: [
      { id: 'monthlyIncome', label: 'Take-home income', ph: '75000', hint: 'After tax and PF' },
      { id: 'monthlyExpenses', label: 'Spending (rent, food, bills, fun)', ph: '35000', hint: 'Required. Not counting EMIs' },
      { id: 'monthlyEmi', label: 'Loan EMIs', ph: '0', hint: 'Home, car, personal, education' },
      { id: 'monthlyInvesting', label: 'You invest', ph: '10000', hint: 'SIPs, PPF, NPS, EPF top-ups' },
    ] },
    { group: 'What you have', items: [
      { id: 'liquidSavings', label: 'Savings you can reach in a day', ph: '150000', hint: 'Savings account, liquid funds, FDs' },
      { id: 'investedTotal', label: 'Total invested so far', ph: '500000', hint: 'Mutual funds, stocks, EPF, PPF, NPS, gold' },
      { id: 'termCover', label: 'Term life cover', ph: '0', hint: 'Sum assured; skip employer cover' },
      { id: 'healthCover', label: 'Health insurance cover', ph: '0', hint: 'Personal or family floater' },
    ] },
  ];

  function gatherData() {
    let txns = [];
    if (root.FinosBudget && root.FinosBudget.transactions) { try { txns = root.FinosBudget.transactions(); } catch (e) { txns = []; } }
    return {
      income: num('finos_monthly_income'), age: num('finos_age'), dependents: num('finos_dependents'), termCover: num('finos_term_insurance'),
      emergencyFund: num('finos_emergency_fund'), sipMonthly: num('finos_sip_monthly'), txns, now: new Date(),
      values: { portfolio: num('finos_portfolio_value'), mfImport: num('finos_mf_import_value'), sip: num('finos_sip_value'),
                epf: num('finos_epf_value'), ppf: num('finos_ppf_value'), nps: num('finos_nps_value'), gold: num('finos_gold_value') },
    };
  }
  const scoreCtx = () => ({ leakMonthly: num('finos_leak_monthly') });

  /** Saved answers win. Otherwise fill what FIN-OS already knows and remember where each answer came from. */
  function prefill() {
    const saved = load();
    if (saved && saved.inputs) return { values: saved.inputs, sources: {} };
    const d = deriveInputs(gatherData());
    if (!d.values.monthlyExpenses && num('finos_monthly_expense')) { d.values.monthlyExpenses = num('finos_monthly_expense'); d.sources.monthlyExpenses = 'your budget'; }
    return d;
  }

  /** Where a prefilled answer came from, in the current language ("your last 30 days of logged spending" carries a number). */
  function srcT(src) {
    const m = /^your last (\d+) days of logged spending$/.exec(src);
    return m ? tr('your last {n} days of logged spending', { n: m[1] }) : tr(src);
  }

  function hintHTML(f, src) {
    if (src) return '<small class="ms-src">' + esc(tr('✓ From {source}. Edit if it is off.', { source: srcT(src) })) + '</small>';
    return f.hint ? '<small>' + esc(tr(f.hint)) + '</small>' : '';
  }

  function fieldHTML(f, v, src) {
    const val = v == null ? '' : v;
    const id = 'ms-' + f.id;
    if (f.type === 'select') {
      return '<label class="ms-f" for="' + id + '"><span>' + esc(tr(f.label)) + '</span><select id="' + id + '" name="' + f.id + '">' +
        f.opts.map(([k, t]) => '<option value="' + k + '"' + (Number(v) === k || (k === 3 && Number(v) > 3) ? ' selected' : '') + '>' + esc(tr(t)) + '</option>').join('') +
        '</select>' + hintHTML(f, src) + '</label>';
    }
    return '<label class="ms-f" for="' + id + '"><span>' + esc(tr(f.label)) + '</span><input id="' + id + '" name="' + f.id + '" type="number" inputmode="numeric" min="' + (f.min || 0) + '"' + (f.max ? ' max="' + f.max + '"' : '') + ' step="1" placeholder="' + esc(f.ph) + '" value="' + esc(val) + '">' + hintHTML(f, src) + '</label>';
  }

  function formHTML(v, errors, sources, errorsT) {
    sources = sources || {};
    const filled = Object.keys(sources).length;
    const errs = errorsT && errorsT.length ? errorsT.map(trT) : (errors || []);
    return '<form class="ms-form" id="ms-form" novalidate>' +
      '<p class="ms-lead">' + esc(tr('Answer 10 quick questions and get your score, the reasons behind it, and the three moves that would lift it most. Rough numbers are fine. Everything stays on this device.')) +
      (filled ? ' <b class="ms-prefill">' + esc(filled === 1 ? tr('We filled in 1 answer from what you already track in FIN-OS.') : tr('We filled in {n} answers from what you already track in FIN-OS.', { n: filled })) + '</b> ' + esc(tr('Check them and complete the rest.')) : '') + '</p>' +
      FIELDS.map((g) => '<fieldset class="ms-group"><legend>' + esc(tr(g.group)) + '</legend><div class="ms-grid">' + g.items.map((f) => fieldHTML(f, v[f.id], sources[f.id])).join('') + '</div></fieldset>').join('') +
      '<label class="ms-check"><input type="checkbox" id="ms-highInterestDebt" name="highInterestDebt"' + (v.highInterestDebt ? ' checked' : '') + '> <span>' + esc(tr('I carry credit-card or personal-loan balances (24%+ interest)')) + '</span></label>' +
      '<div class="ms-errors" id="ms-errors" role="alert" aria-live="polite">' + (errs.length ? '<ul>' + errs.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '') + '</div>' +
      '<div class="ms-actions"><button type="submit" class="ms-btn primary" id="ms-calc">' + esc(tr('Get my Money Score')) + '</button></div>' +
      '<p class="ms-fine">' + esc(tr('An educational estimate based on common rules of thumb. It is not investment advice.')) + '</p></form>';
  }

  function ringSVG(score, color) {
    const R = 54, C = 2 * Math.PI * R;
    return '<svg class="ms-ring" viewBox="0 0 140 140" role="img" aria-label="' + esc(tr('Money Score {score} out of 100', { score })) + '"><circle cx="70" cy="70" r="' + R + '" fill="none" stroke="rgba(127,127,127,.2)" stroke-width="12"/>' +
      '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + (C * score / 100).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 70 70)"/>' +
      '<text x="70" y="78" text-anchor="middle" class="ms-ring-n">' + score + '</text></svg>';
  }

  const points = (n) => (n === 1 ? tr('+1 point') : tr('+{n} points', { n }));

  function resultHTML(r, hist) {
    const color = TONE[r.band.tone];
    const t = trend(hist);
    const tr_ = t ? '<span class="ms-trend ' + (t.delta > 0 ? 'up' : t.delta < 0 ? 'down' : '') + '">' + esc(t.delta > 0 ? tr('▲ +{n} since {date}', { n: t.delta, date: t.since }) : t.delta < 0 ? tr('▼ {n} since {date}', { n: t.delta, date: t.since }) : tr('No change since {date}', { date: t.since })) + '</span>' : '';
    const acts = r.actions.length
      ? r.actions.map((a, n) => '<li class="ms-action"><div class="ms-action-n">' + (n + 1) + '</div><div class="ms-action-b"><h3>' + esc(a.titleT ? trT(a.titleT) : a.title) + '</h3><p>' + esc(a.detailT ? trT(a.detailT) : a.detail) + '</p>' +
          '<div class="ms-action-f"><a class="ms-btn" href="' + esc(a.href) + '">' + esc(tr('{cta} →', { cta: Tt(a.cta) })) + '</a><span class="ms-gain">' + esc(points(a.gain)) + '</span></div></div></li>').join('')
      : '<li class="ms-action"><div class="ms-action-b"><h3>' + esc(tr('You are doing everything right')) + '</h3><p>' + esc(tr('No pillar has a meaningful gap. Keep the habits going and revisit this each quarter.')) + '</p></div></li>';
    return '<div class="ms-result">' +
      '<section class="ms-hero"><div class="ms-hero-ring">' + ringSVG(r.score, color) + '</div><div class="ms-hero-t">' +
      '<div class="ms-band" style="color:' + color + '">' + esc(tr(r.band.label)) + '</div><div class="ms-hero-s">' + tr('Your FIN-OS Money Score is <b>{score}</b> out of 100.', { score: r.score }) + '</div>' + tr_ +
      '<div class="ms-hero-btns"><button type="button" class="ms-btn primary" id="ms-share">' + esc(tr('Share my score')) + '</button><button type="button" class="ms-btn" id="ms-edit">' + esc(tr('Edit my answers')) + '</button></div>' +
      '<div class="ms-status" id="ms-status" role="status" aria-live="polite"></div></div></section>' +
      '<h2 class="ms-h">' + esc(tr('Your 3 best next moves')) + '</h2><ol class="ms-actions-list">' + acts + '</ol>' +
      whatIfHTML(r) + '<h2 class="ms-h">' + esc(tr('How the score is built')) + '</h2><div class="ms-pillars">' +
      r.pillars.map((p) => '<div class="ms-pillar"><div class="ms-pillar-h"><span>' + esc(tr(p.label)) + '</span><b>' + p.score + '<small>/100</small></b></div><div class="ms-bar" aria-hidden="true"><i style="width:' + p.score + '%;background:' + (p.score >= 60 ? '#22D3A6' : p.score >= 40 ? '#F59E0B' : '#EF4444') + '"></i></div><p>' + esc(p.detailT ? trT(p.detailT) : p.detail) + '</p><small>' + esc(tr('{w}% of your score', { w: p.weight })) + '</small></div>').join('') +
      '</div><div id="ms-feedback" class="ms-feedback"></div><p class="ms-fine">' + esc(tr('Saved on this device only. An educational estimate based on common rules of thumb. It is not investment advice.')) + '</p></div>';
  }

  /* ── what-if panel ──────────────────────────────────────────────────────────────────────────────────────── */
  const WI = [
    { k: 'spendLess',  label: 'Spend less each month',          unit: '/mo' },
    { k: 'investMore', label: 'Invest more each month',         unit: '/mo' },
    { k: 'emiLess',    label: 'Bring EMIs down by',             unit: '/mo' },
    { k: 'cashAdd',    label: 'Add to your emergency fund',     unit: '' },
    { k: 'termAdd',    label: 'Add term life cover',            unit: '' },
    { k: 'healthAdd',  label: 'Add health cover',               unit: '' },
  ];

  function whatIfHTML(r) {
    const ranges = leverRanges(r.inputs);
    const rows = WI.filter((l) => ranges[l.k].max > 0).map((l) =>
      '<div class="ms-wi-row"><label for="ms-wi-' + l.k + '"><span>' + esc(tr(l.label)) + '</span><output id="ms-wi-' + l.k + '-v" for="ms-wi-' + l.k + '">' + esc(fmtL(0)) + '</output></label>' +
      '<input type="range" class="ms-wi-in" id="ms-wi-' + l.k + '" data-k="' + l.k + '" min="0" max="' + ranges[l.k].max + '" step="' + ranges[l.k].step + '" value="0"></div>').join('');
    if (!rows) return '';
    return '<h2 class="ms-h">' + esc(tr('Try it: what would move your score?')) + '</h2><section class="ms-wi" id="ms-wi" aria-label="' + esc(tr('What-if explorer')) + '">' +
      '<p class="ms-wi-lead">' + esc(tr('Drag a slider to see how your score would change. Each range comes from your own gaps. Nothing here is saved, so your real score stays as it is.')) + '</p>' +
      '<div class="ms-wi-out" id="ms-wi-out" role="status" aria-live="polite"></div>' + rows +
      '<div class="ms-wi-surplus" id="ms-wi-surplus"></div><ul class="ms-wi-pillars" id="ms-wi-pillars"></ul>' +
      '<button type="button" class="ms-btn" id="ms-wi-reset">' + esc(tr('Reset')) + '</button></section>';
  }

  /** The what-if sentence. One full sentence per case, so each language can order the words naturally. */
  function whatIfSentence(w) {
    const same = w.bandAfter.id === w.bandBefore.id;
    const p = { after: w.after, before: w.before, delta: w.delta, from: Tt(w.bandBefore.label), to: Tt(w.bandAfter.label), band: Tt(w.bandAfter.label) };
    if (w.delta > 0) {
      const one = w.delta === 1;
      return tr(one ? (same ? 'Your score would be <b class="ms-wi-after">{after}</b> (now {before}), <span class="ms-wi-up">+1 point</span>. You stay in <b>{band}</b>.' : 'Your score would be <b class="ms-wi-after">{after}</b> (now {before}), <span class="ms-wi-up">+1 point</span>. That moves you from <b>{from}</b> to <b>{to}</b>.')
                    : (same ? 'Your score would be <b class="ms-wi-after">{after}</b> (now {before}), <span class="ms-wi-up">+{delta} points</span>. You stay in <b>{band}</b>.' : 'Your score would be <b class="ms-wi-after">{after}</b> (now {before}), <span class="ms-wi-up">+{delta} points</span>. That moves you from <b>{from}</b> to <b>{to}</b>.'), p);
    }
    if (w.delta < 0) {
      return tr(same ? 'Your score would be <b class="ms-wi-after">{after}</b> (now {before}), <span class="ms-wi-down">{delta} points</span>. You stay in <b>{band}</b>.' : 'Your score would be <b class="ms-wi-after">{after}</b> (now {before}), <span class="ms-wi-down">{delta} points</span>. That moves you from <b>{from}</b> to <b>{to}</b>.', p);
    }
    return tr(same ? 'Your score would be <b class="ms-wi-after">{after}</b> (now {before}), no change. You stay in <b>{band}</b>.' : 'Your score would be <b class="ms-wi-after">{after}</b> (now {before}), no change. That moves you from <b>{from}</b> to <b>{to}</b>.', p);
  }

  function whatIfUpdate(el, r) {
    const panel = el.querySelector('#ms-wi');
    if (!panel) return;
    const levers = {};
    panel.querySelectorAll('.ms-wi-in').forEach((inp) => {
      const k = inp.dataset.k, v = Number(inp.value) || 0, l = WI.find((x) => x.k === k);
      levers[k] = v;
      const o = panel.querySelector('#ms-wi-' + k + '-v'); if (o) o.textContent = fmtL(v) + (v > 0 && l.unit ? tr(l.unit) : '');
    });
    const w = whatIf(r.inputs, levers, scoreCtx());
    const moved = Object.keys(levers).some((k) => levers[k] > 0);
    const out = panel.querySelector('#ms-wi-out');
    out.innerHTML = !moved ? tr('Your score is <b>{score}</b>. Move a slider to see the effect.', { score: r.score }) : whatIfSentence(w);
    const sur = panel.querySelector('#ms-wi-surplus');
    sur.className = 'ms-wi-surplus' + (moved && w.surplusAfter < 0 ? ' warn' : '');
    sur.textContent = !moved ? ''
      : w.surplusAfter < 0 ? tr('Heads up: this plan spends {amount} a month more than you earn. Pair it with a spending cut.', { amount: M(-w.surplusAfter) })
      : w.surplusAfter !== w.surplusBefore ? tr('After spending, EMIs and investing you would have {amount} left each month (now {before}).', { amount: M(w.surplusAfter), before: M(w.surplusBefore) })
      : tr('After spending, EMIs and investing you would have {amount} left each month.', { amount: M(w.surplusAfter) });
    panel.querySelector('#ms-wi-pillars').innerHTML = !moved ? '' : w.pillars.filter((p) => p.after !== p.before)
      .map((p) => '<li><span>' + esc(tr(p.label)) + '</span><b>' + p.before + ' → ' + p.after + '</b></li>').join('');
  }

  function render(el) {
    if (!el) return;
    let current = null;
    function showForm(errors, values, errorsT) {
      current = null;
      const pre = values ? { values, sources: {} } : prefill();
      el.innerHTML = formHTML(pre.values, errors, pre.sources, errorsT);
      const f = el.querySelector('input,select'); if (f && !errors) f.focus({ preventScroll: true });
    }
    function showResult(r) {
      current = r;
      el.innerHTML = resultHTML(r, loadHistory());
      whatIfUpdate(el, r);
      // Optional: a one-tap check on whether the score felt right. Saved on this device; shared only with consent (see finos-feedback.js).
      if (root.FinosFeedback && root.FinosFeedback.mountPrompt) root.FinosFeedback.mountPrompt(el.querySelector('#ms-feedback'), { topic: 'money-score', question: 'Did your Money Score feel right?', page: 'html/money-score.html' });
      const h = el.querySelector('.ms-hero-s'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: false }); }
    }
    el.addEventListener('submit', (e) => {
      if (!e.target || e.target.id !== 'ms-form') return;
      e.preventDefault();
      const fd = new root.FormData(e.target), raw = {};
      fd.forEach((v, k) => { raw[k] = v; });
      raw.highInterestDebt = !!e.target.querySelector('#ms-highInterestDebt').checked;
      const r = compute(raw, scoreCtx());
      if (!r.ok) { showForm(r.errors, raw, r.errorsT); return; }
      save(r);
      showResult(r);
    });
    el.addEventListener('input', (e) => { if (current && e.target.classList && e.target.classList.contains('ms-wi-in')) whatIfUpdate(el, current); });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (!b) return;
      if (b.id === 'ms-edit') showForm(null, (current && current.inputs) || prefill().values);
      if (b.id === 'ms-wi-reset' && current) { el.querySelectorAll('.ms-wi-in').forEach((i) => { i.value = 0; }); whatIfUpdate(el, current); }
      if (b.id === 'ms-share' && current) {
        const st = el.querySelector('#ms-status');
        const out = await shareCard(current);
        if (st) st.textContent = out === 'downloaded' ? tr('Score card saved as an image. It shows your score only, never your amounts.') : out === 'shared' ? tr('Shared.') : '';
      }
    });
    // The language can arrive after the page first renders (the translation file loads on demand), or change later. Draw again in the new
    // language, keeping what was typed or the result being shown.
    if (root.addEventListener) {
      root.addEventListener('finos:lang', () => {
        if (!el.isConnected) return;
        if (current) { showResult(current); return; }
        const form = el.querySelector('#ms-form');
        if (!form) return;
        const raw = {}; new root.FormData(form).forEach((v, k) => { raw[k] = v; });
        raw.highInterestDebt = !!form.querySelector('#ms-highInterestDebt').checked;
        const ae = el.contains(root.document.activeElement) ? root.document.activeElement : null;
        showForm(null, raw);
        if (ae && ae.id) { const again = el.querySelector('#' + ae.id); if (again) again.focus({ preventScroll: true }); }
      });
    }
    const saved = load();
    if (saved && saved.inputs) { const r = compute(saved.inputs, scoreCtx()); if (r.ok) { showResult(r); return; } }
    showForm(null);
  }

  return Object.assign(api, { render, drawCard, shareCard, load, save, loadHistory, _whatIfSentence: whatIfSentence });   // _whatIfSentence: a test hook, so every wording can be checked
});
