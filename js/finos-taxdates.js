/**
 * FIN-OS Indian tax calendar — generated from rules, never hardcoded to a year.   (v1.0)
 *
 *   FinosTaxDates.events('2026-10-01', '2027-12-31')  → [{date,title,sub,type:'tax'}…] sorted
 *   FinosTaxDates.next('2026-10-01')                  → first event on/after that date
 *   FinosTaxDates.fyOf('2026-05-10')                  → 2026   (FY 2026-27 starts 1 Apr 2026)
 *
 * Per financial year Y (1 Apr Y → 31 Mar Y+1):
 *   15 Jun  Y     advance tax instalment 1 (15%)       15 Jun Y+1  Form 16 / TDS certificates for FY Y
 *   15 Sep  Y     advance tax instalment 2 (45%)       31 Jul Y+1  ITR due date (individuals, no audit)
 *   15 Dec  Y     advance tax instalment 3 (75%)       31 Dec Y+1  belated / revised return window closes
 *   15 Mar  Y+1   advance tax instalment 4 (100%)
 *   31 Mar  Y+1   last day for 80C / ELSS / PPF / NPS / 80D investments to count for FY Y
 *
 * These are the statutory defaults. The government sometimes extends deadlines, and presumptive /
 * senior-citizen / audit cases differ — every event says so, and users are pointed to the Income Tax portal.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FinosTaxDates = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const NOTE = ' Statutory default — verify on incometax.gov.in (deadlines are sometimes extended).';

  function fyOf(dateStr) {
    const d = new Date(dateStr);
    return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  }
  const fyLabel = (y) => `FY ${y}-${pad((y + 1) % 100)}`;

  function forFY(y) {
    const L = fyLabel(y);
    return [
      { date: iso(y, 6, 15),     title: `Advance Tax Q1 (${L})`,        sub: '15% of estimated annual tax due if your liability exceeds ₹10,000.' + NOTE },
      { date: iso(y, 9, 15),     title: `Advance Tax Q2 (${L})`,        sub: 'Cumulative 45% of annual tax liability due.' + NOTE },
      { date: iso(y, 12, 15),    title: `Advance Tax Q3 (${L})`,        sub: 'Cumulative 75% of annual tax liability due.' + NOTE },
      { date: iso(y + 1, 3, 15), title: `Advance Tax Q4 (${L})`,        sub: 'Cumulative 100% of annual tax liability due.' + NOTE },
      { date: iso(y + 1, 3, 31), title: `Tax-saving deadline (${L})`,   sub: 'Last date for 80C (ELSS, PPF, EPF top-up), NPS and 80D investments to count for this year.' },
      { date: iso(y + 1, 6, 15), title: `Form 16 due from employer (${L})`, sub: 'Employers must issue Form 16 by this date. Needed to file your return.' },
      { date: iso(y + 1, 7, 31), title: `ITR filing deadline (${L})`,   sub: 'Due date for individuals not requiring an audit. File before this to avoid late fees.' + NOTE },
      { date: iso(y + 1, 12, 31), title: `Belated / revised ITR closes (${L})`, sub: 'Last chance to file a late or revised return for this year (late fee applies).' + NOTE },
    ].map((e) => Object.assign(e, { type: 'tax' }));
  }

  function events(from, to) {
    const a = from || iso(new Date().getFullYear(), 1, 1);
    const b = to || iso(new Date().getFullYear() + 1, 12, 31);
    const out = [];
    for (let y = fyOf(a) - 1; y <= fyOf(b); y++) out.push(...forFY(y));   // y-1: its ITR/Form 16/belated dates fall in later years
    return out.filter((e) => e.date >= a && e.date <= b).sort((x, y) => x.date.localeCompare(y.date));
  }

  function next(from) {
    const a = from || new Date().toISOString().slice(0, 10);
    const y = fyOf(a);
    return events(a, iso(y + 2, 12, 31))[0] || null;
  }

  return { events, next, forFY, fyOf, fyLabel };
});
