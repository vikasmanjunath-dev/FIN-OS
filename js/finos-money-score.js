/**
 * FIN-OS Money Score — a 60-second, fully on-device financial health score.   (v1.0)
 *
 * Why it exists: the conversational onboarding needs a local LLM and ends with prose. This gives every user a number,
 * a plain-English reason for it, and the three moves that would raise it most — computed deterministically, offline.
 *
 * Pure part (works in Node, unit-tested):
 *   FinosMoneyScore.normalize(raw)              → { inputs, errors }
 *   FinosMoneyScore.compute(raw)                → { ok, score, band, pillars[6], actions[≤3], inputs }  |  { ok:false, errors }
 *   FinosMoneyScore.benchmarkMultiple(age)      → invested-assets ÷ annual-income that is typical for that age
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

  /* ── input handling ───────────────────────────────────────────────────── */
  function toNum(v) {
    if (typeof v === 'number') return v;
    const n = Number(String(v == null ? '' : v).replace(/[,₹\s]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }
  const truthy = (v) => v === true || v === 1 || /^(1|true|yes|on)$/i.test(String(v));

  function normalize(raw) {
    raw = raw || {};
    const errors = [];
    const opt = (k, label) => {
      const v = raw[k] === undefined || raw[k] === '' || raw[k] === null ? 0 : toNum(raw[k]);
      if (!Number.isFinite(v) || v < 0) { errors.push(label + ' must be a number, zero or more'); return 0; }
      if (v > 1e11) { errors.push(label + ' looks too large'); return 0; }
      return v;
    };
    const age = toNum(raw.age);
    if (!Number.isFinite(age) || age < 18 || age > 80) errors.push('Age must be between 18 and 80');
    const income = toNum(raw.monthlyIncome);
    if (!Number.isFinite(income) || income <= 0) errors.push('Monthly take-home income must be more than zero');
    else if (income > 1e8) errors.push('Monthly income looks too large');
    // Spending is required: a blank would read as "spends nothing", which flatters the savings and emergency pillars.
    const spend = toNum(raw.monthlyExpenses);
    if (!Number.isFinite(spend) || spend <= 0) errors.push('Monthly spending must be more than zero (rent, food, bills and so on, not counting EMIs)');
    else if (spend > 1e8) errors.push('Monthly spending looks too large');
    const deps = raw.dependents === undefined || raw.dependents === '' ? 0 : toNum(raw.dependents);
    if (!Number.isFinite(deps) || deps < 0 || deps > 10) errors.push('Dependents must be between 0 and 10');
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
    return { inputs, errors };
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
      case 'savings':   return m >= 0 ? 'You keep ' + pct(m) + ' of your income. Aim for 20%.' : 'You spend more than you earn each month.';
      case 'emergency': return 'Savings cover ' + m.toFixed(1) + ' months of spending. Aim for 6.';
      case 'insurance': return (i.dependents > 0 ? 'Term cover ' + pct(m.term) + ' of target' : 'No dependents, so term cover is optional') + ' · health cover ' + pct(m.health) + ' of target.';
      case 'debt':      return 'EMIs take ' + pct(m) + ' of your income' + (i.highInterestDebt ? ', and you carry high-interest debt.' : '. Under 10% is ideal, over 40% is stretched.');
      case 'investing': return 'You invest ' + pct(m) + ' of your income. Aim for 15%.';
      default:          return 'Typical for age ' + i.age + ': ' + benchmarkMultiple(i.age).toFixed(1) + '× annual income invested (' + fmt(m) + ').';
    }
  }

  /* ── next best actions ────────────────────────────────────────────────── */
  const path = (p) => encodeURI(p);
  function candidateActions(i, p) {
    const out = [];
    const outgo = i.monthlyExpenses + i.monthlyEmi;
    const add = (id, title, detail, amount, apply, href, cta, urgent) => out.push({ id, title, detail, amount, apply, href, cta, urgent: !!urgent });

    if (p.debt.score < 100) {
      if (i.highInterestDebt) {
        add('debt-high', 'Clear your high-interest debt first',
          'Credit-card and personal-loan balances cost 24–42% a year, and no investment reliably beats that. Pay these off before adding new investments.',
          0, (x) => ({ ...x, highInterestDebt: false }), path('../calculators/loans, debt & emi/prepayinvest.html'), 'Plan the payoff', true);
      } else {
        const cut = ceilTo(i.monthlyEmi - T.dtiFull * i.monthlyIncome, 100);
        add('debt', 'Bring EMIs down from ' + pct(p.debt.metric) + ' of your income',
          'Lenders see 40%+ as stretched. Compare prepaying a loan with investing the money, or refinance at a lower rate. Under 10% earns full marks.',
          cut, (x) => ({ ...x, monthlyEmi: T.dtiFull * x.monthlyIncome }), path('../calculators/loans, debt & emi/prepayinvest.html'), 'Prepay or invest?');
      }
    }
    if (p.emergency.score < 100) {
      const target = T.emergencyMonths * outgo;
      const gap = ceilTo(target - i.liquidSavings, 1000);
      add('emergency', 'Build your emergency fund by ' + fmt(gap),
        'You have ' + p.emergency.metric.toFixed(1) + ' months of cover; 6 months is ' + fmt(target) + '. Setting aside ' + fmt(ceilTo(gap / 12, 100)) + ' a month gets you there in a year. Keep it in a savings account or liquid fund.',
        gap, (x) => ({ ...x, liquidSavings: T.emergencyMonths * (x.monthlyExpenses + x.monthlyEmi) }), '../html/emergency-fund.html', 'Open the planner', p.emergency.metric < 3);
    }
    if (p.insurance.score < 100) {
      const tGap = Math.max(0, termTarget(i) - i.termCover), hGap = Math.max(0, healthTarget(i) - i.healthCover);
      const parts = [];
      if (tGap > 0) parts.push('term life cover of ' + fmt(termTarget(i)) + ' (10× annual income; you have ' + fmt(i.termCover) + ')');
      if (hGap > 0) parts.push('health cover of ' + fmt(healthTarget(i)) + ' (you have ' + fmt(i.healthCover) + ')');
      add('insurance', 'Close your insurance gap',
        'Add ' + parts.join(' and ') + '. A pure term plan is the cheapest way to protect dependents, and one hospital stay can erase years of savings.',
        tGap + hGap, (x) => ({ ...x, termCover: Math.max(x.termCover, termTarget(x)), healthCover: Math.max(x.healthCover, healthTarget(x)) }),
        tGap > 0 ? '../html/life-cover.html' : '../html/insurance-hub.html', tGap > 0 ? 'Size your cover' : 'Compare health plans');
    }
    if (p.savings.score < 100) {
      const free = ceilTo(outgo - (1 - T.savingsRate) * i.monthlyIncome, 100);
      add('savings', 'Free up ' + fmt(free) + ' a month',
        'You keep ' + (p.savings.metric >= 0 ? pct(p.savings.metric) : 'nothing') + ' of your income after spending and EMIs. The target is 20% (' + fmt(T.savingsRate * i.monthlyIncome) + '). Trim the biggest flexible spends first, and subscriptions are often the easiest.',
        free, (x) => ({ ...x, monthlyExpenses: Math.max(0, x.monthlyExpenses - free) }), '../html/subscription-tracker.html', 'Find the leaks');
    }
    if (p.investing.score < 100) {
      const more = ceilTo(T.investRate * i.monthlyIncome - i.monthlyInvesting, 100);
      add('investing', 'Invest ' + fmt(more) + ' more every month',
        'You invest ' + pct(p.investing.metric) + ' of your income; 15% (' + fmt(T.investRate * i.monthlyIncome) + ') is a strong habit. A step-up SIP makes it painless: raise it each April when the salary revision lands.',
        more, (x) => ({ ...x, monthlyInvesting: T.investRate * x.monthlyIncome }), '../html/sip-stepup.html', 'Plan a step-up SIP');
    }
    if (p.wealth.score < 100) {
      const gap = ceilTo(p.wealth.metric - i.investedTotal, 10000);
      add('wealth', 'Close your wealth-for-age gap',
        'People your age typically have ' + benchmarkMultiple(i.age).toFixed(1) + '× their annual income invested (' + fmt(p.wealth.metric) + '); you have ' + fmt(i.investedTotal) + '. Steady investing over years closes this and no single big jump is needed.',
        gap, (x) => ({ ...x, investedTotal: Math.max(x.investedTotal, benchmarkMultiple(x.age) * 12 * x.monthlyIncome) }), '../html/retirement-planner.html', 'Check retirement odds');
    }
    return out;
  }

  function rankActions(i, p, total) {
    const ranked = candidateActions(i, p).map((a) => {
      const gain = totalOf(pillarScores(a.apply(i))) - total;
      return { id: a.id, title: a.title, detail: a.detail, amount: a.amount, gain: Math.round(gain), rawGain: gain, href: a.href, cta: a.cta, urgent: a.urgent };
    }).filter((a) => a.rawGain >= 0.5);
    // Safety first: high-interest debt and a near-empty emergency fund outrank anything that merely adds points.
    ranked.sort((a, b) => (b.urgent - a.urgent) || (b.rawGain - a.rawGain));
    return ranked.slice(0, 3).map(({ rawGain, ...a }) => a);
  }

  function compute(raw) {
    const { inputs, errors } = normalize(raw);
    if (errors.length) return { ok: false, errors };
    const p = pillarScores(inputs);
    const total = totalOf(p);
    const score = Math.round(total);
    return {
      ok: true, version: VERSION, score, band: bandOf(score), inputs,
      pillars: Object.keys(WEIGHTS).map((id) => ({ id, label: LABELS[id], weight: WEIGHTS[id], score: Math.round(p[id].score), points: +((WEIGHTS[id] * p[id].score) / 100).toFixed(1), detail: pillarDetail(id, inputs, p) })),
      actions: rankActions(inputs, p, total),
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

  const api = { KEY, HKEY, WEIGHTS, LABELS, TARGETS: T, BANDS, normalize, compute, benchmarkMultiple, appendHistory, trend, fmt };
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
    const entry = { inputs: result.inputs, score: result.score, band: result.band.id, pillars: result.pillars.map((p) => ({ id: p.id, score: p.score })), at: new Date().toISOString(), v: VERSION };
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

    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,.65)'; g.font = '600 34px Manrope, system-ui, sans-serif';
    g.fillText('MY FIN-OS MONEY SCORE', W / 2, 120);

    const cx = W / 2, cy = 360, r = 190;
    g.lineWidth = 34; g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,.1)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = tone; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * result.score) / 100); g.stroke();
    g.fillStyle = '#fff'; g.font = '800 170px "Space Grotesk", system-ui, sans-serif';
    g.fillText(String(result.score), cx, cy + 56);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '600 36px Manrope, system-ui, sans-serif';
    g.fillText('out of 100', cx, cy + 112);
    g.fillStyle = tone; g.font = '800 54px "Space Grotesk", system-ui, sans-serif';
    g.fillText(result.band.label, cx, 640);

    g.textAlign = 'left';
    result.pillars.forEach((p, idx) => {
      const col = idx % 2, row = Math.floor(idx / 2);
      const x = 90 + col * 470, y = 720 + row * 90;
      g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '600 26px Manrope, system-ui, sans-serif';
      g.fillText(p.label, x, y);
      g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x, y + 14, 400, 14);
      g.fillStyle = p.score >= 60 ? '#22D3A6' : p.score >= 40 ? '#F59E0B' : '#EF4444';
      g.fillRect(x, y + 14, (400 * p.score) / 100, 14);
    });
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,.5)'; g.font = '600 28px Manrope, system-ui, sans-serif';
    g.fillText('Free · private · calculated on my device', W / 2, 1030);
    return c;
  }

  async function shareCard(result) {
    const canvas = drawCard(result);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    const text = 'My Money Score is ' + result.score + '/100 (' + result.band.label + ') on FIN-OS. What is yours?';
    try {
      const file = new root.File([blob], 'finos-money-score.png', { type: 'image/png' });
      if (root.navigator.canShare && root.navigator.canShare({ files: [file] })) {
        await root.navigator.share({ files: [file], title: 'My FIN-OS Money Score', text });
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

  function prefill() {
    const saved = load();
    if (saved && saved.inputs) return saved.inputs;
    return {
      monthlyIncome: num('finos_monthly_income') || '', monthlyExpenses: num('finos_monthly_expense') || num('finos_expenses') || '',
      liquidSavings: num('finos_emergency_fund') || '', monthlyInvesting: num('finos_sip_monthly') || '',
    };
  }

  function fieldHTML(f, v) {
    const val = v == null ? '' : v;
    const id = 'ms-' + f.id;
    if (f.type === 'select') {
      return '<label class="ms-f" for="' + id + '"><span>' + esc(f.label) + '</span><select id="' + id + '" name="' + f.id + '">' +
        f.opts.map(([k, t]) => '<option value="' + k + '"' + (Number(v) === k || (k === 3 && Number(v) > 3) ? ' selected' : '') + '>' + esc(t) + '</option>').join('') +
        '</select>' + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</label>';
    }
    return '<label class="ms-f" for="' + id + '"><span>' + esc(f.label) + '</span><input id="' + id + '" name="' + f.id + '" type="number" inputmode="numeric" min="' + (f.min || 0) + '"' + (f.max ? ' max="' + f.max + '"' : '') + ' step="1" placeholder="' + esc(f.ph) + '" value="' + esc(val) + '">' + (f.hint ? '<small>' + esc(f.hint) + '</small>' : '') + '</label>';
  }

  function formHTML(v, errors) {
    return '<form class="ms-form" id="ms-form" novalidate>' +
      '<p class="ms-lead">Answer 10 quick questions and get your score, the reasons behind it, and the three moves that would lift it most. Rough numbers are fine. Everything stays on this device.</p>' +
      FIELDS.map((g) => '<fieldset class="ms-group"><legend>' + esc(g.group) + '</legend><div class="ms-grid">' + g.items.map((f) => fieldHTML(f, v[f.id])).join('') + '</div></fieldset>').join('') +
      '<label class="ms-check"><input type="checkbox" id="ms-highInterestDebt" name="highInterestDebt"' + (v.highInterestDebt ? ' checked' : '') + '> <span>I carry credit-card or personal-loan balances (24%+ interest)</span></label>' +
      '<div class="ms-errors" id="ms-errors" role="alert" aria-live="polite">' + (errors && errors.length ? '<ul>' + errors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>' : '') + '</div>' +
      '<div class="ms-actions"><button type="submit" class="ms-btn primary" id="ms-calc">Get my Money Score</button></div>' +
      '<p class="ms-fine">An educational estimate based on common rules of thumb. It is not investment advice.</p></form>';
  }

  function ringSVG(score, color) {
    const R = 54, C = 2 * Math.PI * R;
    return '<svg class="ms-ring" viewBox="0 0 140 140" role="img" aria-label="Money Score ' + score + ' out of 100"><circle cx="70" cy="70" r="' + R + '" fill="none" stroke="rgba(127,127,127,.2)" stroke-width="12"/>' +
      '<circle cx="70" cy="70" r="' + R + '" fill="none" stroke="' + color + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + (C * score / 100).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 70 70)"/>' +
      '<text x="70" y="78" text-anchor="middle" class="ms-ring-n">' + score + '</text></svg>';
  }

  function resultHTML(r, hist) {
    const color = TONE[r.band.tone];
    const t = trend(hist);
    const tr = t ? '<span class="ms-trend ' + (t.delta > 0 ? 'up' : t.delta < 0 ? 'down' : '') + '">' + (t.delta > 0 ? '▲ +' + t.delta : t.delta < 0 ? '▼ ' + t.delta : 'No change') + ' since ' + esc(t.since) + '</span>' : '';
    const acts = r.actions.length
      ? r.actions.map((a, n) => '<li class="ms-action"><div class="ms-action-n">' + (n + 1) + '</div><div class="ms-action-b"><h3>' + esc(a.title) + '</h3><p>' + esc(a.detail) + '</p>' +
          '<div class="ms-action-f"><a class="ms-btn" href="' + esc(a.href) + '">' + esc(a.cta) + ' →</a><span class="ms-gain">+' + a.gain + ' point' + (a.gain === 1 ? '' : 's') + '</span></div></div></li>').join('')
      : '<li class="ms-action"><div class="ms-action-b"><h3>You are doing everything right</h3><p>No pillar has a meaningful gap. Keep the habits going and revisit this each quarter.</p></div></li>';
    return '<div class="ms-result">' +
      '<section class="ms-hero"><div class="ms-hero-ring">' + ringSVG(r.score, color) + '</div><div class="ms-hero-t">' +
      '<div class="ms-band" style="color:' + color + '">' + esc(r.band.label) + '</div><div class="ms-hero-s">Your FIN-OS Money Score is <b>' + r.score + '</b> out of 100.</div>' + tr +
      '<div class="ms-hero-btns"><button type="button" class="ms-btn primary" id="ms-share">Share my score</button><button type="button" class="ms-btn" id="ms-edit">Edit my answers</button></div>' +
      '<div class="ms-status" id="ms-status" role="status" aria-live="polite"></div></div></section>' +
      '<h2 class="ms-h">Your 3 best next moves</h2><ol class="ms-actions-list">' + acts + '</ol>' +
      '<h2 class="ms-h">How the score is built</h2><div class="ms-pillars">' +
      r.pillars.map((p) => '<div class="ms-pillar"><div class="ms-pillar-h"><span>' + esc(p.label) + '</span><b>' + p.score + '<small>/100</small></b></div><div class="ms-bar" aria-hidden="true"><i style="width:' + p.score + '%;background:' + (p.score >= 60 ? '#22D3A6' : p.score >= 40 ? '#F59E0B' : '#EF4444') + '"></i></div><p>' + esc(p.detail) + '</p><small>' + p.weight + '% of your score</small></div>').join('') +
      '</div><p class="ms-fine">Saved on this device only. An educational estimate based on common rules of thumb. It is not investment advice.</p></div>';
  }

  function render(el) {
    if (!el) return;
    let current = null;
    function showForm(errors, values) { current = null; el.innerHTML = formHTML(values || prefill(), errors); const f = el.querySelector('input,select'); if (f && !errors) f.focus({ preventScroll: true }); }
    function showResult(r) {
      current = r;
      el.innerHTML = resultHTML(r, loadHistory());
      const h = el.querySelector('.ms-hero-s'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: false }); }
    }
    el.addEventListener('submit', (e) => {
      if (!e.target || e.target.id !== 'ms-form') return;
      e.preventDefault();
      const fd = new root.FormData(e.target), raw = {};
      fd.forEach((v, k) => { raw[k] = v; });
      raw.highInterestDebt = !!e.target.querySelector('#ms-highInterestDebt').checked;
      const r = compute(raw);
      if (!r.ok) { showForm(r.errors, raw); return; }
      save(r);
      showResult(r);
    });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (!b) return;
      if (b.id === 'ms-edit') showForm(null, (current && current.inputs) || prefill());
      if (b.id === 'ms-share' && current) {
        const st = el.querySelector('#ms-status');
        const out = await shareCard(current);
        if (st) st.textContent = out === 'downloaded' ? 'Score card saved as an image. It shows your score only, never your amounts.' : out === 'shared' ? 'Shared.' : '';
      }
    });
    const saved = load();
    if (saved && saved.inputs) { const r = compute(saved.inputs); if (r.ok) { showResult(r); return; } }
    showForm(null);
  }

  return Object.assign(api, { render, drawCard, shareCard, load, save, loadHistory });
});
