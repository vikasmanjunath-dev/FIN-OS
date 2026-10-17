/**
 * FIN-OS personal facts record — one honest, unit-labelled snapshot of what the app KNOWS about the person.   (v1.0)
 *
 * Why: the assistant (Arya / RAG) needs the person's own numbers, and today every consumer re-reads a different set
 * of localStorage keys with its own defaults (28, 30, 5000, 50000 ...). This builds one record where
 *   - every number carries its unit in the field name (`_inr`, `_monthly`, `_pct`)
 *   - every value carries where it came from (`source`) and, where it matters, how precise it is (`precision`)
 *   - anything we do NOT know is listed in `gaps` — never replaced by a default ("skip rather than guess").
 *
 *   FinosFacts.resolveIncome(storage?)      → { value_inr, precision:'exact'|'bucket_midpoint'|'unknown', source }
 *   FinosFacts.build({storage?, now?})      → record (schema 2), see below
 *   FinosFacts.forPrompt(record, allowed)   → copy with ONLY the allow-listed top-level fields + gaps (privacy)
 *   FinosFacts.toFactCards(record)          → [{title, text}] plain-language cards, each text <= 480 chars, Indian grouping
 *   FinosFacts.formatInr(n)                 → '₹1,40,000'
 *
 * Record top-level fields (allow-list names for forPrompt):
 *   profile, income_monthly_inr, expenses_monthly_inr, expenses_declared_monthly_inr, investing_monthly_inr,
 *   emergency_fund_inr, net_worth_inr, credit_score, insurance, liabilities, goals, scores, learning, gaps
 *   (+ schema, as_of, which forPrompt drops unless they are allow-listed)
 *
 * Precision: 'exact' (a number the person typed), 'bucket_midpoint' (a range they picked, midpoint used),
 * 'unverified' (key exists, but the writer/unit could not be confirmed in the repo — see docs/PENDING.md known quirks).
 * Duplicate keys (finos_profile vs finos-profile, finos_monthly_expense vs finos_monthly_expenses) are NOT merged or
 * aliased: each is read defensively from its own key and labelled with that key.
 *
 * Reads only. Never writes to storage. Never throws on corrupt values. Display name / phone are deliberately not read.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosFacts = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const SCHEMA = 2;
  const CARD_MAX = 480;

  /* Same buckets/midpoints as js/finos-context.js resolveIncome() (the profile page <select> values). */
  const INCOME_MAP = { '0-25k': 15000, '25k-1L': 50000, '1L-2.5L': 150000, '2.5L+': 300000 };
  const INCOME_RANGE = { '0-25k': [0, 25000], '25k-1L': [25000, 100000], '1L-2.5L': [100000, 250000], '2.5L+': [250000, null] };
  const MAX_MONTHLY_INCOME = 1e8;            // above ₹10 crore a month is treated as a typo, not a fact
  const INS_TYPES = ['health', 'life_term', 'vehicle', 'critical'];   // html/insurance-hub.html TYPE_META keys

  const BudgetLib = (function () {
    if (root && root.FinosBudget) return root.FinosBudget;
    try { if (typeof require === 'function') return require('./finos-budget.js'); } catch (_) { /* optional */ }
    return null;
  })();

  /* ── storage access (read-only, never throws) ─────────────────────────────── */
  function defaultStorage() {
    try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch (_) { return null; }
  }
  function readRaw(storage, key) {
    try { const v = storage && storage.getItem(key); return v === undefined ? null : v; } catch (_) { return null; }
  }
  function readJson(storage, key) {
    const raw = readRaw(storage, key);
    if (raw === null || raw === '') return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
  }
  /** Strict number: '31', '"31"', '₹1,20,000', 31.5 → number; '12abc', '', 'NaN', null → NaN. */
  function parseNum(raw) {
    if (typeof raw === 'number') return isFinite(raw) ? raw : NaN;
    if (typeof raw !== 'string') return NaN;
    const s = raw.trim().replace(/^"(.*)"$/, '$1').replace(/[₹,\s]/g, '');
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }
  function readNum(storage, key) { return parseNum(readRaw(storage, key)); }
  /** Plain string value (Store.set writes plain strings unquoted; JSON-quoted strings are also accepted). */
  function readStr(storage, key, max) {
    let raw = readRaw(storage, key);
    if (typeof raw !== 'string') return null;
    raw = raw.trim();
    if (/^".*"$/.test(raw)) { try { raw = String(JSON.parse(raw)); } catch (_) { /* keep raw */ } }
    return clean(raw, max || 60);
  }
  function clean(s, max) {                                   // user-entered text goes into prompts: flatten + cap
    const t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max || 60);
    return t || null;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const fact = (value, source, extra) => Object.assign({ value, source }, extra || {});

  /* ── income ───────────────────────────────────────────────────────────────── */
  function resolveIncome(storage) {
    const st = storage === undefined ? defaultStorage() : storage;
    const exact = readNum(st, 'finos_monthly_income');
    if (exact > 0 && exact <= MAX_MONTHLY_INCOME) return { value_inr: exact, precision: 'exact', source: 'finos_monthly_income' };
    const bucket = readStr(st, 'finos_income', 20);
    if (bucket && Object.prototype.hasOwnProperty.call(INCOME_MAP, bucket)) {
      return { value_inr: INCOME_MAP[bucket], precision: 'bucket_midpoint', source: 'finos_income' };
    }
    return { value_inr: null, precision: 'unknown', source: null };
  }

  /* ── pieces of the record ─────────────────────────────────────────────────── */
  function buildExpenses(storage, now) {
    const raw = readJson(storage, 'finos_transactions');
    if (!Array.isArray(raw) || !BudgetLib) return null;
    const cur = ym(now);
    const tx = BudgetLib.normalizeAll(raw).filter((t) => t.kind === 'expense' && t.date.slice(0, 7) <= cur);   // future-dated rows are not history
    if (!tx.length) return null;
    const first = tx.reduce((m, t) => (t.date.slice(0, 7) < m ? t.date.slice(0, 7) : m), cur);
    // A month in progress understates spending, so average complete months only — unless it is all we have.
    const partialOnly = first === cur;
    const months = [];
    let [y, m] = first.split('-').map(Number);
    for (;;) {
      const key = `${y}-${pad(m)}`;
      if (key > cur || (key === cur && !partialOnly)) break;
      months.push(key);
      if (key === cur) break;
      m += 1; if (m > 12) { m = 1; y += 1; }
    }
    const span = new Set(months);
    const byCat = {}; let total = 0;
    tx.forEach((t) => { if (span.has(t.date.slice(0, 7))) { byCat[t.category] = (byCat[t.category] || 0) + t.amount; total += t.amount; } });
    const n = months.length;
    const out = {};
    Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).forEach((c) => { out[c] = Math.round(byCat[c] / n); });
    out.total = Math.round(total / n);
    out.months_observed = n;
    out.first_month = first;
    if (partialOnly) out.partial_current_month = true;
    return out;
  }

  function buildLiabilities(storage) {
    const raw = readJson(storage, 'finos_debts');
    if (!Array.isArray(raw)) return [];
    const pos = (v) => { const n = parseNum(v); return n > 0 ? n : null; };
    return raw.filter((d) => d && typeof d === 'object' && !Array.isArray(d)).slice(0, 20).map((d) => ({
      name: clean(d.name || d.label || d.type, 60) || 'Loan',
      balance_inr: pos(d.amount != null ? d.amount : d.balance),
      rate_pct: pos(d.rate != null ? d.rate : d.interest_rate),
      min_payment_monthly_inr: pos(d.minPayment),
      source: 'finos_debts',
    })).filter((d) => d.balance_inr !== null || d.min_payment_monthly_inr !== null);
  }

  function buildGoals(storage) {
    const raw = readJson(storage, 'finos_goals');
    if (!Array.isArray(raw)) return [];
    const pos = (v) => { const n = parseNum(v); return n >= 0 ? n : null; };
    return raw.filter((g) => g && typeof g === 'object' && !Array.isArray(g)).slice(0, 20).map((g) => {
      const target = pos(g.target != null ? g.target : g.target_amount);
      const dl = parseNum(g.deadlineMonths);
      return {
        name: clean(g.name, 60),
        target_inr: target > 0 ? target : null,
        saved_inr: pos(g.current != null ? g.current : g.current_amount),       // missing stays null, not 0
        deadline_months: dl > 0 ? Math.round(dl) : null,
        priority: clean(g.priority, 20),
        source: 'finos_goals',
      };
    }).filter((g) => g.name && g.target_inr !== null);
  }

  function buildInsurance(storage) {
    const raw = readJson(storage, 'finos_insurance_policies');
    if (!Array.isArray(raw)) return null;
    const rows = raw.filter((p) => p && typeof p === 'object' && !Array.isArray(p));
    if (!rows.length) return null;
    const cover = {};
    rows.forEach((p) => {
      const t = INS_TYPES.indexOf(p.type) >= 0 ? p.type : 'other';
      const s = parseNum(p.sum_assured);
      cover[t] = (cover[t] || 0) + (s > 0 ? s : 0);
    });
    return { policies: rows.length, cover_inr_by_type: cover, source: 'finos_insurance_policies' };
  }

  function buildScores(storage) {
    const scores = {};
    const ms = readJson(storage, 'finos_money_score');
    if (ms && typeof ms === 'object' && isFinite(+ms.score) && +ms.score >= 0 && +ms.score <= 100) {
      const at = typeof ms.at === 'string' && /^\d{4}-\d{2}-\d{2}/.test(ms.at) ? ms.at.slice(0, 10) : null;
      scores.money_score = fact(Math.round(+ms.score), 'finos_money_score', {
        band: clean(ms.band, 24), weakest_pillar: ms.weakest && typeof ms.weakest === 'object' ? clean(ms.weakest.label || ms.weakest.id, 40) : null,
        as_of: at,
      });
    }
    const sr = readNum(storage, 'finos_savings_rate');
    if (sr > 0 && sr <= 100) scores.savings_rate_pct = fact(sr, 'finos_savings_rate', { precision: 'unverified' });
    return scores;
  }

  function buildLearning(storage) {
    const v = readJson(storage, 'finos_learn_visited');
    const visited = Array.isArray(v) ? v.filter((x) => typeof x === 'string').map((x) => clean(x, 80)).filter(Boolean).slice(0, 200) : [];
    const dna = readStr(storage, 'finos_financial_dna', 40);
    return { visited, dna: dna ? fact(dna, 'finos_financial_dna') : null };
  }

  function positiveFact(storage, key, precision) {
    const n = readNum(storage, key);
    return n > 0 ? fact(n, key, { precision }) : null;
  }

  /* ── build ────────────────────────────────────────────────────────────────── */
  function build(opts) {
    const o = opts || {};
    const storage = o.storage === undefined ? defaultStorage() : o.storage;
    const now = o.now instanceof Date && !isNaN(o.now) ? o.now : new Date();
    const gaps = [];

    const profile = {};
    const age = readNum(storage, 'finos_age');
    if (age >= 10 && age <= 100) profile.age = fact(Math.round(age), 'finos_age', { precision: 'unverified' });   // no writer for this key found in js/ or html/
    else gaps.push('age');
    const lang = readStr(storage, 'finos_lang', 8);
    if (lang && /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(lang)) profile.language = fact(lang, 'finos_lang');
    else gaps.push('language');
    const stage = readStr(storage, 'finos_stage', 40);
    if (stage) profile.stage = fact(stage, 'finos_stage');
    else gaps.push('life_stage');
    const onboarding = readJson(storage, 'finos_profile');                       // onboarding answers; `age` there is a life-phase BAND, not years
    if (onboarding && typeof onboarding === 'object' && !Array.isArray(onboarding) && typeof onboarding.age === 'string') {
      const band = clean(onboarding.age, 60);
      if (band) profile.life_phase_band = fact(band, 'finos_profile.age', { precision: 'band' });
    }

    const inc = resolveIncome(storage);
    const income_monthly_inr = { value: inc.value_inr, source: inc.source, precision: inc.precision };
    if (inc.precision === 'bucket_midpoint') income_monthly_inr.range_inr = INCOME_RANGE[readStr(storage, 'finos_income', 20)];
    if (inc.value_inr === null) gaps.push('income_monthly');

    const expenses = buildExpenses(storage, now);
    let declared = null;
    const dExp = readNum(storage, 'finos_monthly_expense');                      // written by money-score seeding; unit assumed monthly ₹
    const dExps = readNum(storage, 'finos_monthly_expenses');                    // read as "spent_total" elsewhere: may be this-month-so-far
    if (dExp > 0) declared = fact(dExp, 'finos_monthly_expense', { precision: 'unverified' });
    else if (dExps > 0) declared = fact(dExps, 'finos_monthly_expenses', { precision: 'unverified' });
    if (!expenses && !declared) gaps.push('expenses_monthly');

    const liabilities = buildLiabilities(storage);
    if (!liabilities.length) gaps.push('liabilities');
    const goals = buildGoals(storage);
    if (!goals.length) gaps.push('goals');

    const cibil = readNum(storage, 'finos_cibil_score');                         // only stored once the person enters one
    const credit_score = cibil >= 300 && cibil <= 900 ? fact(Math.round(cibil), 'finos_cibil_score') : null;
    if (!credit_score) gaps.push('credit_score');

    const insurance = buildInsurance(storage);
    if (!insurance) gaps.push('insurance_cover');

    const emergency = positiveFact(storage, 'finos_emergency_fund', 'unverified');
    if (!emergency) gaps.push('emergency_fund');
    const investing = positiveFact(storage, 'finos_sip_monthly', 'unverified');
    if (!investing) gaps.push('investing_monthly');
    const nw = readNum(storage, 'finos_net_worth');                              // finos-net-worth.js writes "0" when nothing is entered → 0 means unknown
    const net_worth = nw !== 0 && isFinite(nw) ? fact(nw, 'finos_net_worth', { precision: 'unverified' }) : null;
    if (!net_worth) gaps.push('net_worth');

    const scores = buildScores(storage);
    if (!scores.money_score) gaps.push('money_score');

    return {
      schema: SCHEMA,
      as_of: ymd(now),
      profile,
      income_monthly_inr,
      expenses_monthly_inr: expenses,
      expenses_declared_monthly_inr: declared,
      investing_monthly_inr: investing,
      emergency_fund_inr: emergency,
      net_worth_inr: net_worth,
      credit_score,
      insurance,
      liabilities,
      goals,
      scores,
      learning: buildLearning(storage),
      gaps,
    };
  }

  /* ── privacy projection ───────────────────────────────────────────────────── */
  function forPrompt(record, allowedFields) {
    const out = {};
    if (!record || typeof record !== 'object') return { gaps: [] };
    const allow = Array.isArray(allowedFields) ? allowedFields : [];
    allow.forEach((k) => {
      if (k !== 'gaps' && Object.prototype.hasOwnProperty.call(record, k)) out[k] = JSON.parse(JSON.stringify(record[k]));
    });
    out.gaps = Array.isArray(record.gaps) ? record.gaps.slice() : [];
    return out;
  }

  /* ── formatting + fact cards ──────────────────────────────────────────────── */
  function groupIndian(n) {
    const s = String(Math.abs(Math.round(n)));
    if (s.length <= 3) return s;
    const tail = s.slice(-3);
    const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return `${head},${tail}`;
  }
  function formatInr(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    return `${n < 0 ? '-' : ''}₹${groupIndian(n)}`;
  }
  const cut = (s) => (s.length <= CARD_MAX ? s : `${s.slice(0, CARD_MAX - 1).replace(/[\s;,.]+\S*$/, '')}…`);
  const humanize = (k) => String(k).replace(/_/g, ' ');

  /** Greedy-pack `items` after `lead` into as many cards as needed so no card exceeds the limit. */
  function packCards(title, lead, items, sep, end) {
    const cards = [];
    let text = lead;
    let first = true;
    items.forEach((it) => {
      const add = (first ? '' : sep) + it;
      if (!first && (text + add + end).length > CARD_MAX) {
        cards.push({ title: cards.length ? `${title} (${cards.length + 1})` : title, text: cut(text + end) });
        text = lead + it; first = false; return;
      }
      text += add; first = false;
    });
    cards.push({ title: cards.length ? `${title} (${cards.length + 1})` : title, text: cut(text + end) });
    return cards;
  }

  function toFactCards(record) {
    const r = record || {};
    const cards = [];
    const p = r.profile || {};

    // profile + position
    const parts = [];
    if (p.age) parts.push(`age ${p.age.value}`);
    if (p.life_phase_band) parts.push(`life phase "${p.life_phase_band.value}"`);
    if (p.stage) parts.push(`stage ${p.stage.value}`);
    if (p.language) parts.push(`app language ${p.language.value}`);
    const inc = r.income_monthly_inr;
    if (inc && inc.value !== null && inc.value !== undefined) {
      if (inc.precision === 'exact') parts.push(`monthly income ${formatInr(inc.value)} (as entered)`);
      else if (inc.range_inr) {
        const [lo, hi] = inc.range_inr;
        parts.push(`monthly income in the range ${hi === null ? `${formatInr(lo)} and above` : `${formatInr(lo)} to ${formatInr(hi)}`} (only a range was given; ${formatInr(inc.value)} is its midpoint)`);
      }
    }
    if (r.emergency_fund_inr) parts.push(`emergency fund ${formatInr(r.emergency_fund_inr.value)}`);
    if (r.net_worth_inr) parts.push(`net worth ${formatInr(r.net_worth_inr.value)}`);
    if (r.investing_monthly_inr) parts.push(`monthly investing ${formatInr(r.investing_monthly_inr.value)}`);
    if (r.credit_score) parts.push(`credit score ${r.credit_score.value}`);
    if (parts.length) cards.push(...packCards('Profile', 'Profile: ', parts, '; ', '.'));

    // spending
    const e = r.expenses_monthly_inr;
    if (e) {
      const cats = Object.keys(e).filter((k) => typeof e[k] === 'number' && !['total', 'months_observed'].includes(k));
      const lead = `Average monthly spending is ${formatInr(e.total)}, over ${e.months_observed} month${e.months_observed === 1 ? '' : 's'} of logged expenses from ${e.first_month}${e.partial_current_month ? ' (the current month is still in progress)' : ''}. SIPs and income are not counted as spending. By category: `;
      cards.push(...packCards('Monthly spending', lead, cats.map((c) => `${c} ${formatInr(e[c])}`), '; ', '.'));
    } else if (r.expenses_declared_monthly_inr) {
      cards.push({ title: 'Monthly spending', text: `A monthly expense figure of ${formatInr(r.expenses_declared_monthly_inr.value)} is recorded, but no itemised transactions are logged, so the figure is unverified.` });
    }

    // liabilities
    if (Array.isArray(r.liabilities) && r.liabilities.length) {
      const items = r.liabilities.map((l) => {
        const bits = [];
        if (l.balance_inr !== null && l.balance_inr !== undefined) bits.push(`outstanding ${formatInr(l.balance_inr)}`);
        if (l.rate_pct !== null && l.rate_pct !== undefined) bits.push(`${l.rate_pct}% interest`);
        if (l.min_payment_monthly_inr !== null && l.min_payment_monthly_inr !== undefined) bits.push(`minimum payment ${formatInr(l.min_payment_monthly_inr)} a month`);
        return `${l.name}: ${bits.join(', ')}`;
      });
      cards.push(...packCards('Liabilities', 'Loans and debts: ', items, '; ', '.'));
    }

    // goals: one card each
    (Array.isArray(r.goals) ? r.goals : []).forEach((g) => {
      let t = `Goal "${g.name}": target ${formatInr(g.target_inr)}`;
      if (g.saved_inr !== null && g.saved_inr !== undefined) t += `; saved so far ${formatInr(g.saved_inr)}; remaining ${formatInr(Math.max(0, g.target_inr - g.saved_inr))}`;
      else t += '; amount saved so far is not recorded';
      if (g.deadline_months) t += `; deadline in ${g.deadline_months} months`;
      if (g.priority) t += `; priority ${g.priority}`;
      cards.push({ title: `Goal - ${g.name}`, text: cut(`${t}.`) });
    });

    // insurance
    if (r.insurance) {
      const by = Object.keys(r.insurance.cover_inr_by_type || {}).map((k) => `${humanize(k)} cover ${formatInr(r.insurance.cover_inr_by_type[k])}`);
      cards.push(...packCards('Insurance', `${r.insurance.policies} polic${r.insurance.policies === 1 ? 'y' : 'ies'} recorded: `, by, '; ', '.'));
    }

    // scores
    const s = r.scores || {};
    const sb = [];
    if (s.money_score) sb.push(`Money Score ${s.money_score.value} out of 100${s.money_score.band ? ` (${s.money_score.band})` : ''}${s.money_score.weakest_pillar ? `, weakest area ${s.money_score.weakest_pillar}` : ''}${s.money_score.as_of ? `, computed ${s.money_score.as_of}` : ''}`);
    if (s.savings_rate_pct) sb.push(`declared savings rate ${s.savings_rate_pct.value}% (unverified)`);
    if (r.learning && r.learning.dna) sb.push(`money personality ${r.learning.dna.value}`);
    if (r.learning && r.learning.visited && r.learning.visited.length) sb.push(`${r.learning.visited.length} learning pages visited`);
    if (sb.length) cards.push(...packCards('Scores and learning', 'Scores: ', sb, '; ', '.'));

    // what we do not know
    const gaps = Array.isArray(r.gaps) ? r.gaps : [];
    cards.push(gaps.length
      ? ({ title: 'Not provided', text: cut(`Not provided / unknown (do not guess these): ${gaps.map(humanize).join(', ')}.`) })
      : ({ title: 'Not provided', text: 'Every tracked fact has been provided.' }));
    return cards;
  }

  return { SCHEMA, INCOME_MAP, resolveIncome, build, forPrompt, toFactCards, formatInr };
});
