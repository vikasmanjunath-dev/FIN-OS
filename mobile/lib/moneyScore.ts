// Money Score — port of the pure core of js/finos-money-score.js (the website's 60-second, fully on-device financial health score).
// Six pillars (savings 20, emergency fund 20, insurance 20, debt 15, investing 15, wealth-for-age 10), a 0-100 total, and the three
// moves that would raise it most — computed deterministically, offline. The browser part of the website module (form, share card,
// storage) is not here; the app has its own screen. Rules of thumb for education, not personalised investment advice.
//
// The scoring body is kept line-for-line identical to the website's so the two can never disagree; __tests__/moneyScore.parity.test.mts
// feeds both the same random inputs. It stays untyped JavaScript, so strict checking is off for this file only.
// @ts-nocheck
const root: any = {};   // the website reads an optional i18n global from here; the app is English-only for now


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



export { KEY, HKEY, WEIGHTS, LABELS, T as TARGETS, BANDS, normalize, compute, deriveInputs, whatIf, leverRanges, applyWhatIf, benchmarkMultiple, appendHistory, trend, fmt, tr };
