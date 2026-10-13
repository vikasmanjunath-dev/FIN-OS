/* finos-forecast.js — next-month spending forecast used by html/budget-forecast.html
 *
 *   FinosForecast.compute(txns, { monthsBack, events, now })
 *     txns: rows already normalised by FinosBudget.normalize (kind 'expense' | 'income' | 'saving')
 *     → { total, byCategory, trends, riskCats, saveMsg, catMonthly, months, monthsWithData, confidence }
 *
 * Method: per category, Holt's double exponential smoothing over the last N complete months.
 * What it will not do:
 *   • count income or investing as spending (only kind 'expense' is forecast);
 *   • treat months before your first logged expense as ₹0 (that dragged the forecast down and invented a trend);
 *   • pretend a short history is solid: `confidence` is 'low' under 3 months of data.
 * Event adjustments are fixed rules of thumb the person chooses to apply, not something learned from their history.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosForecast = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const EVENT_MULTIPLIERS = {
    'diwali':       { Shopping: 1.8, Entertainment: 1.5, Food: 1.3, Gifts: 2.5 },
    'eid':          { Shopping: 1.6, Food: 1.4, Gifts: 2.0 },
    'christmas':    { Shopping: 1.5, Entertainment: 1.4, Food: 1.3 },
    'new year':     { Entertainment: 1.6, Food: 1.3, Shopping: 1.3 },
    'holi':         { Food: 1.3, Entertainment: 1.4, Shopping: 1.2 },
    'wedding':      { Shopping: 2.0, Food: 1.5, Travel: 1.8 },
    'vacation':     { Travel: 2.5, Entertainment: 1.6, Food: 1.4 },
    'car insurance':{ Insurance: 3.0, Transport: 1.2 },
    'school fees':  { Education: 2.0 },
    'tax filing':   { Investment: 1.5 },
    'medical':      { Healthcare: 2.5, Health: 2.5 },
  };

  const pad = (n) => String(n).padStart(2, '0');

  /** Month keys (YYYY-MM) for the `monthsBack` complete months before `now`, oldest first. */
  function monthKeys(monthsBack, now) {
    const n = now || new Date();
    const keys = [];
    for (let i = monthsBack; i >= 1; i--) {
      const d = new Date(n.getFullYear(), n.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    }
    return keys;
  }

  /** Holt's linear smoothing: the next value of a series (never negative). */
  function holt(series, alpha, beta) {
    const a = alpha === undefined ? 0.3 : alpha, b = beta === undefined ? 0.1 : beta;
    if (!series.length) return 0;
    if (series.length === 1) return series[0];
    let level = series[0];
    let trend = series[1] - series[0];
    for (let i = 1; i < series.length; i++) {
      const prev = level;
      level = a * series[i] + (1 - a) * (level + trend);
      trend = b * (level - prev) + (1 - b) * trend;
    }
    return Math.max(0, level + trend);
  }

  function eventFactor(cat, events) {
    let f = 1;
    const c = String(cat).toLowerCase();
    (events || []).forEach((ev) => {
      const mults = EVENT_MULTIPLIERS[ev] || {};
      for (const [mCat, mult] of Object.entries(mults)) {
        const m = mCat.toLowerCase();
        if (c.includes(m) || m.includes(c)) { f *= mult; break; }
      }
    });
    return f;
  }

  function compute(txns, opts) {
    const o = opts || {};
    const monthsBack = o.monthsBack > 0 ? o.monthsBack : 6;
    const events = o.events || [];
    const months = monthKeys(monthsBack, o.now);
    const inWindow = new Set(months);

    const catMonthly = {};
    const monthHasData = new Set();
    (txns || []).forEach((t) => {
      if (!t || t.kind !== 'expense') return;
      const key = String(t.date).slice(0, 7);
      if (!inWindow.has(key)) return;
      (catMonthly[t.category] = catMonthly[t.category] || {})[key] = ((catMonthly[t.category][key]) || 0) + t.amount;
      monthHasData.add(key);
    });

    // Only months from the first one with any logged spending count: earlier months are "not recorded", not "₹0".
    const firstIdx = months.findIndex((m) => monthHasData.has(m));
    const usable = firstIdx < 0 ? [] : months.slice(firstIdx);

    const byCategory = {}, trends = {}, riskCats = [];
    Object.entries(catMonthly).forEach(([cat, monthly]) => {
      const series = usable.map((m) => monthly[m] || 0);
      if (!series.length || series.every((v) => v === 0)) return;
      const base = holt(series);
      const predicted = base * eventFactor(cat, events);
      byCategory[cat] = Math.round(predicted);

      const last3 = series.slice(-3);
      const avg3 = last3.reduce((a, b) => a + b, 0) / Math.max(1, last3.length);
      const last = series[series.length - 1];
      const pct = avg3 > 0 ? (last - avg3) / avg3 : 0;
      // a trend needs at least three months to mean anything
      trends[cat] = series.length < 3 ? 'stable' : pct > 0.10 ? 'up' : pct < -0.10 ? 'down' : 'stable';
      if (series.length >= 3 && avg3 > 0 && (predicted - avg3) / avg3 > 0.20) riskCats.push(cat);
    });

    const total = Object.values(byCategory).reduce((a, b) => a + b, 0);
    let saveMsg = '';
    if (events.length && riskCats.length) {
      const top = riskCats.slice().sort((a, b) => byCategory[b] - byCategory[a])[0];
      const lock = Math.round(byCategory[top] * 0.3 / 100) * 100;
      saveMsg = `Lock ₹${lock.toLocaleString('en-IN')} in FD before ${events.map((e) => e.charAt(0).toUpperCase() + e.slice(1)).join('/')} spending starts — ${top} category expected to spike.`;
    } else if (total > 0) {
      const amt = Math.round(total * 0.20 / 100) * 100;
      saveMsg = `Set aside ₹${amt.toLocaleString('en-IN')} before the month starts — 20% buffer on predicted ₹${total.toLocaleString('en-IN')} spend.`;
    }
    const monthsWithData = usable.length;
    return {
      total, byCategory, trends, riskCats, saveMsg, catMonthly, months, monthsWithData,
      confidence: monthsWithData >= 3 ? 'ok' : 'low',
    };
  }

  return { EVENT_MULTIPLIERS, monthKeys, holt, eventFactor, compute };
});
