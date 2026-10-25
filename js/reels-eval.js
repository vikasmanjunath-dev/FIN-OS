/**
 * FIN-OS Money Reels (web): the small maths the interactive beats need.
 *
 * A line-for-line copy of the pure functions the app uses (mobile/lib/reels/figures.ts and beats.ts): the what-if sliders for every model
 * kind, the guess scale and its verdict, rupee wording, the fixed shuffle for "put in order". tests/reels-web.test.js runs the app's own
 * TypeScript for every slider position and holds this file to the same answers, so a figure on the web cannot drift from the app.
 * Text comes as [english, hindi] pairs (see js/reels-data.json). Nothing here touches the page, the network or storage.
 *
 *   FinosReelsEval.evalModel(model, x)   → { value, put, base, lost, diff, years? }
 *   FinosReelsEval.sliderLine(beat, x)   → [en, hi] takeaway with the figures in
 *   FinosReelsEval.sliderBars(beat, x)   → two bars under the slider
 *   FinosReelsEval.posToValue / valueToPos / scoreGuess / niceRound / orderDeck / money
 *   FinosReelsEval.scoreMyth / scoreSpot / scoreSort / scoreOrder   how the other beats are marked
 *   FinosReelsEval.seasonOf / factIndex / weekOf / weekLine         the seasonal look, the fact of the day, the week at the calm stop
 *   FinosReelsEval.toggleSaved / addPledge / removePledge           the saved list and "I'll do this" (plain lists, kept by the page)
 *   FinosReelsEval.expand(data)                                     turns js/reels-data.json (short keys, shared texts) into the long form
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosReelsEval = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const LANG = { en: 0, hi: 1 };
  const tax = () => root.FinosTaxCore || (typeof require === 'function' ? require('./finos-taxcore.js') : null);

  // ── figures.ts ──────────────────────────────────────────────────────────────────────────────────────────────
  function sipFutureValue(monthly, annualPct, years) {
    const i = annualPct / 100 / 12, n = Math.round(years * 12);
    if (!(monthly >= 0) || !(years >= 0) || !Number.isFinite(i)) return NaN;
    if (i === 0) return monthly * n;
    return monthly * ((Math.pow(1 + i, n) - 1) / i);
  }
  const inflatedValue = (amount, ratePct, years) => amount / Math.pow(1 + ratePct / 100, years);
  function emi(principal, annualPct, years) {
    const r = annualPct / 100 / 12, n = Math.round(years * 12);
    if (r === 0) return principal / n;
    const g = Math.pow(1 + r, n);
    return (principal * r * g) / (g - 1);
  }
  function sipNeeded(target, annualPct, years) {
    const i = annualPct / 100 / 12, n = Math.round(years * 12);
    if (!(target > 0) || !(years > 0)) return NaN;
    return i === 0 ? target / n : (target * i) / (Math.pow(1 + i, n) - 1);
  }
  function stepUpSipFutureValue(monthly, stepPct, annualPct, years) {
    const i = annualPct / 100 / 12; let total = 0, sip = monthly;
    for (let y = 0; y < years; y++) {
      for (let m = 0; m < 12; m++) total = total * (1 + i) + sip;
      sip *= 1 + stepPct / 100;
    }
    return total;
  }
  function monthsToDeplete(corpus, annualPct, withdrawal) {
    const r = annualPct / 100 / 12;
    if (!(corpus > 0) || !(withdrawal > 0)) return NaN;
    if (r === 0) return corpus / withdrawal;
    if (withdrawal <= corpus * r) return Infinity;
    return -Math.log(1 - (corpus * r) / withdrawal) / Math.log(1 + r);
  }
  const unpaidBalance = (balance, monthlyPct, months) => balance * Math.pow(1 + monthlyPct / 100, months);

  const group = (n) => {
    const s = String(Math.round(n)), l = s.slice(-3), r = s.slice(0, -3);
    return r ? r.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + l : l;
  };
  const trim = (x) => (Math.round(x * 100) / 100).toString();

  /** "₹8,997", "₹49 lakh", "₹1.75 crore" in English; "₹49 लाख", "₹1.75 करोड़" in Hindi, as [en, hi]. */
  function money(n) {
    if (n < 100000) { const t = '₹' + group(n); return [t, t]; }
    if (n < 10000000) { const lakh = n / 100000, v = lakh >= 10 ? String(Math.round(lakh)) : trim(lakh); return ['₹' + v + ' lakh', '₹' + v + ' लाख']; }
    const v = trim(n / 10000000); return ['₹' + v + ' crore', '₹' + v + ' करोड़'];
  }

  // ── beats.ts ────────────────────────────────────────────────────────────────────────────────────────────────
  const FOREVER_YEARS = 60;

  function evalModel(m, x) {
    const fig = (value, put, base, lost, years) => Object.assign({ value, put, base, lost, diff: Math.abs(value - base) }, years ? { years: true } : {});
    const T = tax();
    switch (m.kind) {
      case 'sip-years': { const value = sipFutureValue(m.monthly, m.rate, x); return fig(value, m.monthly * 12 * x, value, 0); }
      case 'sip-delay': {
        const years = Math.max(0, m.horizon - x);
        const value = sipFutureValue(m.monthly, m.rate, years), base = sipFutureValue(m.monthly, m.rate, m.horizon);
        return fig(value, m.monthly * 12 * years, base, base - value);
      }
      case 'inflation-years': { const value = inflatedValue(m.amount, m.rate, x); return fig(value, m.amount, m.amount, m.amount - value); }
      case 'emi-rate': { const value = emi(m.principal, x, m.years), base = emi(m.principal, m.rate0, m.years); return fig(value, m.principal, base, base - value); }
      case 'emi-tenure': { const value = emi(m.principal, m.rate, x), paid = value * x * 12; return fig(value, paid, m.principal, paid - m.principal); }
      case 'goal-sip': { const value = sipNeeded(m.target, m.rate, x), paid = value * 12 * x; return fig(value, paid, m.target, m.target - paid); }
      case 'step-up': {
        const value = stepUpSipFutureValue(m.monthly, x, m.rate, m.years), base = stepUpSipFutureValue(m.monthly, 0, m.rate, m.years);
        let paid = 0, sip = m.monthly; for (let y = 0; y < m.years; y++) { paid += sip * 12; sip *= 1 + x / 100; }
        return fig(value, paid, base, base - value);
      }
      case 'tax-income': { const value = T.taxNew(Math.max(0, x - T.STD_NEW)), base = T.taxOld(Math.max(0, x - T.STD_OLD - m.deduction)); return fig(value, x, base, base - value); }
      case 'corpus-spend': {
        const months = monthsToDeplete(m.corpus, m.rate, x), years = Number.isFinite(months) ? Math.min(FOREVER_YEARS, months / 12) : months === Infinity ? FOREVER_YEARS : NaN;
        return fig(years, m.corpus, 0, 0, true);
      }
      case 'card-interest': { const value = unpaidBalance(m.balance, m.monthlyPct, x); return fig(value, m.balance, m.balance, m.balance - value); }
      default: return fig(NaN, NaN, NaN, NaN);
    }
  }

  /** The slider's own value as the viewer reads it. */
  function xText(b, x, lang) {
    if (b.xFormat === 'inr') return money(x)[LANG[lang]];
    const u = b.unit[LANG[lang]];
    return (x + (u.startsWith('%') ? '' : ' ') + u).trim();
  }

  const yearsText = (n, lang) => { const v = n >= FOREVER_YEARS ? FOREVER_YEARS + '+' : String(Math.round(n * 10) / 10); return lang === 'en' ? v + ' years' : v + ' साल'; };

  /** The takeaway for the slider's current position, with the figures dropped in, as [en, hi]. */
  function sliderLine(b, x) {
    const f = evalModel(b.model, x);
    const fmt = (n) => (f.years ? [yearsText(n, 'en'), yearsText(n, 'hi')] : money(n));
    const xs = (lang) => (b.xFormat === 'inr' ? money(x)[LANG[lang]] : b.unit[LANG[lang]].startsWith('%') ? x + '%' : String(x));
    const vals = { x: [xs('en'), xs('hi')], xu: [xText(b, x, 'en'), xText(b, x, 'hi')], value: fmt(f.value), put: money(f.put), base: fmt(f.base), lost: money(Math.abs(f.lost)), diff: fmt(f.diff) };
    const run = (s, lang) => s.replace(/\{(\w+)\}/g, (_, k) => (vals[k] ? vals[k][LANG[lang]] : ''));
    return [run(b.takeaway[0], 'en'), run(b.takeaway[1], 'hi')];
  }

  /** The two bars under the slider: [{ label:[en,hi], frac:0..1, text:[en,hi], tone:'a'|'b' }, …]. */
  function sliderBars(b, x) {
    const m = b.model, f = evalModel(m, x);
    const l = (en, hi) => [en, hi];
    const years = (n) => [yearsText(n, 'en'), yearsText(n, 'hi')];
    const pair = (a, c) => { const top = Math.max(a.v, c.v, 1); return [{ label: a.label, frac: a.v / top, text: a.text, tone: 'a' }, { label: c.label, frac: c.v / top, text: c.text, tone: 'b' }]; };
    switch (m.kind) {
      case 'sip-years': return pair({ label: l('You put in', 'आपने लगाया'), v: f.put, text: money(f.put) }, { label: l('It becomes', 'बनता है'), v: f.value, text: money(f.value) });
      case 'sip-delay': return pair({ label: l('Start today', 'आज शुरू करें'), v: f.base, text: money(f.base) }, { label: l('With your wait', 'आपके इंतज़ार के साथ'), v: f.value, text: money(f.value) });
      case 'inflation-years': return pair({ label: l('Today', 'आज'), v: f.base, text: money(f.base) }, { label: l('Buying power', 'खरीदने की ताक़त'), v: f.value, text: money(f.value) });
      case 'emi-rate': return pair({ label: l('EMI at the start rate', 'शुरुआती दर पर EMI'), v: f.base, text: money(f.base) }, { label: l('EMI at this rate', 'इस दर पर EMI'), v: f.value, text: money(f.value) });
      case 'emi-tenure': return pair({ label: l('Loan', 'लोन'), v: m.principal, text: money(m.principal) }, { label: l('Total you pay', 'कुल आप चुकाते हैं'), v: f.put, text: money(f.put) });
      case 'goal-sip': return pair({ label: l('You put in', 'आप लगाते हैं'), v: f.put, text: money(f.put) }, { label: l('The goal', 'लक्ष्य'), v: m.target, text: money(m.target) });
      case 'step-up': return pair({ label: l('No step-up', 'कोई बढ़ोतरी नहीं'), v: f.base, text: money(f.base) }, { label: l('With step-up', 'बढ़ोतरी के साथ'), v: f.value, text: money(f.value) });
      case 'tax-income': return pair({ label: l('New regime', 'नया रिजीम'), v: f.value, text: money(f.value) }, { label: l('Old regime', 'पुराना रिजीम'), v: f.base, text: money(f.base) });
      case 'corpus-spend': return pair({ label: l('Lasts', 'चलेगा'), v: f.value, text: years(f.value) }, { label: l('Longest shown', 'सबसे लंबा'), v: FOREVER_YEARS, text: years(FOREVER_YEARS) });
      case 'card-interest': return pair({ label: l('You owe now', 'अभी बकाया'), v: f.base, text: money(f.base) }, { label: l('After the wait', 'इंतज़ार के बाद'), v: f.value, text: money(f.value) });
      default: return [];
    }
  }

  // ── guess first ─────────────────────────────────────────────────────────────────────────────────────────────
  function niceRound(v) {
    if (!(v > 0) || !Number.isFinite(v)) return 0;
    const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    return Math.round(v / mag) * mag;
  }
  function posToValue(pos, min, max) {
    const p = Math.min(1, Math.max(0, Number.isFinite(pos) ? pos : 0));
    return niceRound(min * Math.pow(max / min, p));
  }
  function valueToPos(v, min, max) {
    if (!(v > 0)) return 0;
    return Math.min(1, Math.max(0, Math.log(v / min) / Math.log(max / min)));
  }
  /** Within 15% is spot on, within 60% close, anything else far. A guess is never a failure: the screen only shows the gap. */
  function scoreGuess(guess, answer) {
    if (!(guess > 0) || !(answer > 0)) return { verdict: 'far', times: Infinity, side: 'low' };
    const times = Math.max(guess / answer, answer / guess);
    const side = guess === answer ? 'exact' : guess < answer ? 'low' : 'high';
    return { verdict: times <= 1.15 ? 'spot' : times <= 1.6 ? 'close' : 'far', times, side };
  }

  // ── sort and order ──────────────────────────────────────────────────────────────────────────────────────────
  /** The order the items are shown in: a fixed shuffle (never the correct order for 3 or more items). */
  function orderDeck(n) {
    const out = Array.from({ length: n }, (_, i) => i);
    if (n < 3) return out;
    const shift = Math.ceil(n / 2);
    return out.map((i) => (i + shift) % n);
  }


  // ── the other beats: how they are marked (beats.ts) ─────────────────────────────────────────────────────────
  /** `answers[i]` is true for "fact", false for "myth", null/undefined if not answered. */
  function scoreMyth(cards, answers) {
    let right = 0, answered = 0;
    cards.forEach((c, i) => { const a = answers[i]; if (a === null || a === undefined) return; answered++; if (a === c.fact) right++; });
    return { right, answered, total: cards.length };
  }
  /** `picked[i]` is true if piece i was tapped; a piece with a `flag` is a red flag. */
  function scoreSpot(parts, picked) {
    let found = 0, flags = 0; const missed = [], wrong = [];
    parts.forEach((p, i) => {
      const isFlag = !!p.flag, tapped = picked[i] === true;
      if (isFlag) { flags++; if (tapped) found++; else missed.push(i); } else if (tapped) wrong.push(i);
    });
    return { found, flags, missed, wrong };
  }
  function scoreSort(cards, answers) {
    let right = 0, answered = 0;
    cards.forEach((c, i) => { const a = answers[i]; if (a === null || a === undefined) return; answered++; if (a === c.bin) right++; });
    return { right, answered, total: cards.length };
  }
  /** `chosen` lists item indices in the order they were tapped; the items are stored in the correct order. */
  function scoreOrder(chosen, total) {
    let right = 0;
    chosen.slice(0, total).forEach((idx, pos) => { if (idx === pos) right++; });
    return { right, total };
  }

  // ── seasons (seasons.ts): same dates, plain calendar arithmetic ─────────────────────────────────────────────
  const SEASONS = {
    diwali: { id: 'diwali', badge: '🪔', label: ['Diwali week', 'दिवाली का हफ़्ता'], tint: ['#2A1405', '#4A2208'] },
    budget: { id: 'budget', badge: '📜', label: ['Budget week', 'बजट का हफ़्ता'], tint: ['#0B1F33', '#12304A'] },
    yearend: { id: 'yearend', badge: '🗓️', label: ['Year-end in March', 'मार्च का वित्त-वर्ष अंत'], tint: ['#1F1A0A', '#3A2F0B'] },
  };
  /** The day of Lakshmi Puja by year, [month, day]. Years after 2030 are not listed and the season then does not show (check these each year). */
  const DIWALI = { 2026: [11, 8], 2027: [10, 29], 2028: [10, 17], 2029: [11, 5], 2030: [10, 26] };
  const DAY = 86400000;
  function seasonOf(date) {
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    const t = Date.UTC(y, m - 1, d), dv = DIWALI[y];
    if (dv) { const gap = (t - Date.UTC(y, dv[0] - 1, dv[1])) / DAY; if (gap >= -5 && gap <= 2) return SEASONS.diwali; }
    if ((m === 1 && d >= 29) || (m === 2 && d <= 4)) return SEASONS.budget;
    if (m === 3 && d >= 15) return SEASONS.yearend;
    return null;
  }

  /** The fact of the day: an index into the exported list, changing daily and cycling (facts.ts). */
  function factIndex(date, count) {
    const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
    return ((day % count) + count) % count;
  }

  // ── the week at the calm stop (weekly.ts) ───────────────────────────────────────────────────────────────────
  const dayKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  /** state = { days: { 'YYYY-MM-DD': { fin, pledges, moves, receipts, together, saves } } }; the seven days ending today, added up. */
  function weekOf(state, now) {
    const w = { days: 0, reels: 0, pledges: 0, moves: 0, receipts: 0, together: 0, saves: 0 };
    for (let i = 0; i < 7; i++) {
      const r = state.days[dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i))];
      if (!r) continue;
      if (r.fin > 0) w.days += 1;
      w.reels += r.fin || 0; w.pledges += r.pledges || 0; w.moves += r.moves || 0; w.receipts += r.receipts || 0; w.together += r.together || 0; w.saves += r.saves || 0;
    }
    return w;
  }
  const countText = (k, en1, enN, hi) => [k + ' ' + (k === 1 ? en1 : enN), k + ' ' + hi];
  /** One sentence about the week as [en, hi], or null in a week with no reels (nothing is said about a quiet week). */
  function weekLine(w) {
    if (w.reels <= 0) return null;
    const parts = [[w.reels + ' ' + (w.reels === 1 ? 'reel' : 'reels') + ' on ' + w.days + ' ' + (w.days === 1 ? 'day' : 'days'), w.days + ' दिन में ' + w.reels + ' रीलें']];
    if (w.pledges > 0) parts.push(countText(w.pledges, 'move on your list', 'moves on your list', 'काम आपकी सूची में'));
    if (w.moves > 0) parts.push(countText(w.moves, 'move started', 'moves started', 'काम शुरू किए'));
    if (w.receipts > 0) parts.push(countText(w.receipts, 'real change noticed', 'real changes noticed', 'असली बदलाव दिखे'));
    if (w.together > 0) parts.push(countText(w.together, 'round played together', 'rounds played together', 'बार साथ खेले'));
    return ['This week: ' + parts.map((p) => p[0]).join(', ') + '.', 'इस हफ़्ते: ' + parts.map((p) => p[1]).join(', ') + '।'];
  }

  // ── saved reels and "I'll do this" (reelsProfile.ts): plain lists ───────────────────────────────────────────
  const ID = /^[a-z0-9-]{1,40}$/, MAX_SAVED = 60, MAX_PLEDGES = 20;
  /** Keeps a reel to watch later, or lets it go if it was kept. */
  function toggleSaved(list, id) {
    if (!ID.test(id)) return { list, kept: false };
    if (list.includes(id)) return { list: list.filter((x) => x !== id), kept: false };
    return { list: list.concat([id]).slice(-MAX_SAVED), kept: true };
  }
  /** "I'll do this": the reel goes on the list once, with when. */
  function addPledge(list, id, now) {
    if (!ID.test(id) || list.some((x) => x.id === id)) return list;
    return list.concat([{ id, at: now.toISOString() }]).slice(-MAX_PLEDGES);
  }
  const removePledge = (list, id) => (list.some((x) => x.id === id) ? list.filter((x) => x.id !== id) : list);

  // ── the data file: short keys and shared texts, written by mobile/scripts/export-reels-web.mts ──────────────
  /** Long key → short key. Keys not listed (id, to, q, s, t and anything new) are written as they are. */
  const KEYS = { mood: 'a', say: 'b', ms: 'c', label: 'd', kind: 'e', options: 'f', answer: 'g', scenes: 'h', prop: 'i', title: 'j', topic: 'k', why: 'l', items: 'm', assumes: 'n', formula: 'o', tone: 'p', value: 'r', quiz: 'u', text: 'v', trust: 'w', href: 'x', asOf: 'y', act: 'z', big: 'A', after: 'B', beat: 'C', fact: 'D', format: 'E', from: 'F', flag: 'G', takeaway: 'H', parts: 'I', result: 'J', bin: 'K', unit: 'L', cards: 'M', model: 'N', start: 'O', max: 'P', min: 'Q', who: 'R', sub: 'S', step: 'T', reveal: 'U', todo: 'V', centre: 'W', rate: 'X', verdict: 'Y', setup: 'Z', bins: 'aa', monthly: 'ab', principal: 'ac', count: 'ad', points: 'ae', xFormat: 'af', amount: 'ag', years: 'ah', horizon: 'ai', corpus: 'aj', target: 'ak', monthlyPct: 'al', rate0: 'am', deduction: 'an', balance: 'ao' };
  const LONG = Object.fromEntries(Object.entries(KEYS).map(([long, short]) => [short, long]));
  /** The long form of the data file: every short key spelled out, and the shared texts (data.texts) put back where reels point at them. */
  function expand(data) {
    const walk = (v) => (Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [LONG[k] || k, walk(x)])) : v);
    const out = walk(data), texts = out.texts || [];
    out.reels.forEach((r) => {
      if (r.trust && typeof r.trust.formula === 'number') r.trust.formula = texts[r.trust.formula];
      if (r.act && typeof r.act.label === 'number') r.act.label = texts[r.act.label];
    });
    return out;
  }

  return { KEYS, expand, SEASONS, DIWALI, FOREVER_YEARS, scoreMyth, scoreSpot, scoreSort, scoreOrder, seasonOf, factIndex, weekOf, weekLine, dayKey, toggleSaved, addPledge, removePledge, money, evalModel, xText, sliderLine, sliderBars, niceRound, posToValue, valueToPos, scoreGuess, orderDeck, sipFutureValue, emi, sipNeeded, monthsToDeplete };
});
