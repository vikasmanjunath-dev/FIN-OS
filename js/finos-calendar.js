/**
 * finos-calendar.js — Financial Calendar  v1.0  (Phase 33)
 * ─────────────────────────────────────────────────────────
 * Aggregates time-sensitive financial events from all tracker
 * localStorage keys and renders a month-view calendar + upcoming
 * events timeline.
 *
 * Event sources:
 *   finos_sip_portfolio      — SIP debit dates (monthly, day 1)
 *   finos_fd_portfolio       — FD / RD / PPF / NSC maturity dates
 *   finos_insurance_policies — renewal dates (annual)
 *   finos_goals              — goal deadline dates
 *   India tax calendar       — advance tax, ITR, 80C hardcoded
 */
(function (global) {
  'use strict';

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function ls(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }

  function addYears(startDate, years) {
    const d = new Date(startDate);
    d.setFullYear(d.getFullYear() + Math.floor(years));
    d.setMonth(d.getMonth() + Math.round((years % 1) * 12));
    return d;
  }

  function INR(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(1) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    if (n >= 1e3) return '₹' + Math.round(n / 1e3) + 'K';
    return '₹' + Math.round(n);
  }

  function isoDate(d) { return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10); }

  function today() { return new Date(); }

  /* ── Event type metadata ─────────────────────────────────────────── */
  const EVENT_META = {
    sip:       { icon: '📈', color: '#00D4FF', label: 'SIP Debit'         },
    fd:        { icon: '💰', color: '#22D3A6', label: 'FD / RD Matures'   },
    ppf:       { icon: '📜', color: '#7B2FF7', label: 'PPF Matures'       },
    insurance: { icon: '🛡️', color: '#F97316', label: 'Insurance Renewal' },
    goal:      { icon: '🎯', color: '#C7F000', label: 'Goal Deadline'     },
    tax:       { icon: '🧾', color: '#EF4444', label: 'Tax Deadline'      },
  };

  /* ── India Tax Calendar (FY 2025-26 and 2026-27) ─────────────────── */
  const TAX_EVENTS = [
    { date: '2025-09-15', title: 'Advance Tax Q2 (FY 2025-26)', sub: '45% of annual tax liability due',       type: 'tax' },
    { date: '2025-12-15', title: 'Advance Tax Q3 (FY 2025-26)', sub: '75% of annual tax liability due',       type: 'tax' },
    { date: '2026-03-15', title: 'Advance Tax Q4 (FY 2025-26)', sub: '100% of annual tax liability due',      type: 'tax' },
    { date: '2026-03-31', title: '80C / PPF Deadline (FY 2025-26)', sub: 'Last date for 80C investments, PPF deposits, ELSS', type: 'tax' },
    { date: '2026-04-05', title: 'PPF Interest Date', sub: 'PPF balance on this date earns annual interest', type: 'tax' },
    { date: '2026-07-31', title: 'ITR Filing Deadline (FY 2025-26)', sub: 'File income tax return by today', type: 'tax' },
    { date: '2026-09-15', title: 'Advance Tax Q2 (FY 2026-27)', sub: '45% of annual tax liability due',       type: 'tax' },
    { date: '2026-12-15', title: 'Advance Tax Q3 (FY 2026-27)', sub: '75% of annual tax liability due',       type: 'tax' },
    { date: '2027-03-15', title: 'Advance Tax Q4 (FY 2026-27)', sub: '100% of annual tax liability due',      type: 'tax' },
    { date: '2027-03-31', title: '80C / PPF Deadline (FY 2026-27)', sub: 'Last date for 80C investments, PPF deposits, ELSS', type: 'tax' },
  ];

  /* ── Event collectors ────────────────────────────────────────────── */

  function collectSIPEvents(fromDate, toDate) {
    const portfolio = ls('finos_sip_portfolio') || [];
    const events = [];
    portfolio.forEach(sip => {
      if (!sip.amount || !sip.startDate) return;
      const sipStart = new Date(sip.startDate);
      const label = (sip.fund || sip.name || 'SIP').slice(0, 28);

      // Generate monthly events from sipStart through toDate
      let cur = new Date(Math.max(sipStart, fromDate));
      cur.setDate(1);
      while (cur <= toDate) {
        if (cur >= fromDate && cur >= sipStart) {
          events.push({
            date: isoDate(cur),
            title: label,
            sub:   INR(sip.amount) + '/mo debit',
            type:  'sip',
            amount: sip.amount,
          });
        }
        cur.setMonth(cur.getMonth() + 1);
      }
    });
    return events;
  }

  function collectFDEvents() {
    const portfolio = ls('finos_fd_portfolio') || [];
    const events = [];
    portfolio.forEach(entry => {
      if (!entry.startDate) return;
      const termYears = entry.type === 'ppf' ? 15
                      : entry.type === 'nsc' ? 5
                      : entry.type === 'scss' ? 5
                      : ((entry.termMonths || 12) / 12);
      const matDate = addYears(entry.startDate, termYears);
      const label = (entry.bank || entry.institution || entry.type?.toUpperCase() || 'FD');
      const principal = entry.principal || entry.annualAmount || entry.monthlyAmount * 12 || 0;
      events.push({
        date:  isoDate(matDate),
        title: label + ' Matures',
        sub:   principal > 0 ? INR(principal) + ' principal' : '',
        type:  entry.type === 'ppf' ? 'ppf' : 'fd',
        amount: principal,
      });
    });
    return events;
  }

  function collectInsuranceEvents() {
    const policies = ls('finos_insurance_policies') || [];
    const events = [];
    policies.forEach(p => {
      if (!p.renewal_date) return;
      events.push({
        date:  p.renewal_date.slice(0, 10),
        title: (p.name || p.type || 'Insurance') + ' Renewal',
        sub:   p.premium ? 'Premium: ' + INR(p.premium) : '',
        type:  'insurance',
        amount: p.premium || 0,
      });
    });
    return events;
  }

  function collectGoalEvents() {
    const goals = ls('finos_goals') || [];
    const events = [];
    goals.forEach(g => {
      const deadline = g.deadline || g.target_date;
      if (!deadline) return;
      events.push({
        date:  deadline.slice(0, 10),
        title: (g.name || 'Financial Goal'),
        sub:   g.target ? 'Target: ' + INR(g.target) : '',
        type:  'goal',
        amount: g.target || 0,
      });
    });
    return events;
  }

  /* ── Master collect ──────────────────────────────────────────────── */
  function collectEvents(monthsAhead = 12) {
    const from  = new Date(); from.setDate(1);
    const to    = new Date(from); to.setMonth(to.getMonth() + monthsAhead);

    const all = [
      ...collectSIPEvents(from, to),
      ...collectFDEvents(),
      ...collectInsuranceEvents(),
      ...collectGoalEvents(),
      ...TAX_EVENTS,
    ].filter(e => e.date >= isoDate(new Date(Date.now() - 7 * 86400000)));

    all.sort((a, b) => a.date.localeCompare(b.date));
    return all;
  }

  /* ── Build date-indexed map ──────────────────────────────────────── */
  function buildDateMap(events) {
    const map = {};
    events.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }

  /* ── Calendar renderer ───────────────────────────────────────────── */
  function renderCalendar(el, year, month) {
    if (!el) return;

    const events  = collectEvents(14);
    const dateMap = buildDateMap(events);
    const todayStr = isoDate(today());

    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
    const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;

    const monthName = firstDay.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    let cells = '';
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startDow + 1;
      if (dayNum < 1 || dayNum > lastDay.getDate()) {
        cells += `<div class="fc-cell fc-cell--empty"></div>`;
        continue;
      }
      const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
      const dayEvents = dateMap[dateStr] || [];
      const isToday   = dateStr === todayStr;
      const isPast    = dateStr < todayStr;

      const dots = dayEvents.slice(0, 4).map(e =>
        `<span class="fc-dot" style="background:${EVENT_META[e.type]?.color || '#888'}" title="${e.title}"></span>`
      ).join('');

      cells += `
        <div class="fc-cell${isToday ? ' fc-cell--today' : ''}${isPast ? ' fc-cell--past' : ''}"
             data-date="${dateStr}" data-has="${dayEvents.length}">
          <span class="fc-day-num">${dayNum}</span>
          ${dots ? `<div class="fc-dots">${dots}</div>` : ''}
        </div>`;
    }

    el.innerHTML = `
      <div class="fc-header">
        <button class="fc-nav" id="fc-prev" aria-label="Previous month">‹</button>
        <h3 class="fc-month-title">${monthName}</h3>
        <button class="fc-nav" id="fc-next" aria-label="Next month">›</button>
      </div>
      <div class="fc-grid">
        ${DOW.map(d => `<div class="fc-dow">${d}</div>`).join('')}
        ${cells}
      </div>
      <div id="fc-day-detail" class="fc-day-detail" style="display:none;"></div>`;

    // Wire day click
    el.querySelectorAll('.fc-cell[data-has]').forEach(cell => {
      const dateStr = cell.dataset.date;
      const dayEvts = dateMap[dateStr] || [];
      if (!dayEvts.length) return;
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => {
        el.querySelectorAll('.fc-cell--selected').forEach(c => c.classList.remove('fc-cell--selected'));
        cell.classList.add('fc-cell--selected');
        showDayDetail(document.getElementById('fc-day-detail'), dateStr, dayEvts);
      });
    });

    // Wire nav buttons
    document.getElementById('fc-prev').addEventListener('click', () => {
      const newMonth = month === 0 ? 11 : month - 1;
      const newYear  = month === 0 ? year - 1 : year;
      renderCalendar(el, newYear, newMonth);
    });
    document.getElementById('fc-next').addEventListener('click', () => {
      const newMonth = month === 11 ? 0 : month + 1;
      const newYear  = month === 11 ? year + 1 : year;
      renderCalendar(el, newYear, newMonth);
    });
  }

  function showDayDetail(el, dateStr, events) {
    if (!el) return;
    const d = new Date(dateStr);
    const dLabel = d.toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' });
    el.style.display = 'block';
    el.innerHTML = `
      <div class="fc-detail-title">📅 ${dLabel}</div>
      <div class="fc-detail-list">
        ${events.map(e => {
          const m = EVENT_META[e.type] || {};
          return `<div class="fc-detail-item">
            <span class="fc-detail-dot" style="background:${m.color || '#888'}"></span>
            <div>
              <div class="fc-detail-name">${m.icon || ''} ${e.title}</div>
              ${e.sub ? `<div class="fc-detail-sub">${e.sub}</div>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>`;
  }

  /* ── Upcoming events timeline ────────────────────────────────────── */
  function renderUpcoming(el, days = 45) {
    if (!el) return;
    const events  = collectEvents(4);
    const cutoff  = isoDate(new Date(Date.now() + days * 86400000));
    const todayStr = isoDate(today());
    const upcoming = events.filter(e => e.date >= todayStr && e.date <= cutoff);

    if (!upcoming.length) {
      el.innerHTML = `<div class="fc-empty">No upcoming events in the next ${days} days</div>`;
      return;
    }

    // Group by week label
    let html = '';
    let lastWeek = null;
    upcoming.forEach(e => {
      const d = new Date(e.date);
      const diff = Math.ceil((d - new Date(todayStr)) / 86400000);
      const weekLabel = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow'
        : diff <= 7 ? 'This week' : diff <= 14 ? 'Next week' : diff <= 30 ? 'This month' : 'Later';

      if (weekLabel !== lastWeek) {
        html += `<div class="fc-week-label">${weekLabel}</div>`;
        lastWeek = weekLabel;
      }
      const m = EVENT_META[e.type] || {};
      const dLabel = d.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
      const urgency = diff <= 7 ? 'fc-event--urgent' : diff <= 14 ? 'fc-event--soon' : '';
      html += `
        <div class="fc-event-row ${urgency}">
          <div class="fc-event-date">${dLabel}</div>
          <div class="fc-event-dot" style="background:${m.color || '#888'}"></div>
          <div class="fc-event-body">
            <div class="fc-event-title">${m.icon || ''} ${e.title}</div>
            ${e.sub ? `<div class="fc-event-sub">${e.sub}</div>` : ''}
          </div>
        </div>`;
    });
    el.innerHTML = html;
  }

  /* ── Monthly outflow summary ─────────────────────────────────────── */
  function renderSummary(el) {
    if (!el) return;
    const events = collectEvents(2);
    const now = today();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

    const sipTotal = events.filter(e => e.type === 'sip' && e.date.startsWith(thisMonth))
      .reduce((s, e) => s + (e.amount || 0), 0);
    const emiTotal = (parseFloat(localStorage.getItem('finos_home_loan_emi') || '0')
                   + parseFloat(localStorage.getItem('finos_car_loan_emi')   || '0')
                   + parseFloat(localStorage.getItem('finos_personal_loan_emi') || '0'));
    const insurThis = events.filter(e => e.type === 'insurance' && e.date.startsWith(thisMonth))
      .reduce((s, e) => s + (e.amount || 0), 0);

    const taxNext = TAX_EVENTS.find(e => e.date >= isoDate(now));

    el.innerHTML = `
      <div class="fc-summary-grid">
        <div class="fc-summary-card">
          <div class="fc-summary-icon">📈</div>
          <div class="fc-summary-label">SIP this month</div>
          <div class="fc-summary-val" style="color:#00D4FF">${sipTotal > 0 ? INR(sipTotal) : '—'}</div>
        </div>
        <div class="fc-summary-card">
          <div class="fc-summary-icon">🏠</div>
          <div class="fc-summary-label">EMI this month</div>
          <div class="fc-summary-val" style="color:#EF4444">${emiTotal > 0 ? INR(emiTotal) : '—'}</div>
        </div>
        <div class="fc-summary-card">
          <div class="fc-summary-icon">🛡️</div>
          <div class="fc-summary-label">Insurance due</div>
          <div class="fc-summary-val" style="color:#F97316">${insurThis > 0 ? INR(insurThis) : '—'}</div>
        </div>
        <div class="fc-summary-card">
          <div class="fc-summary-icon">🧾</div>
          <div class="fc-summary-label">Next tax date</div>
          <div class="fc-summary-val" style="color:#EF4444;font-size:12px">${taxNext ? new Date(taxNext.date).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '—'}</div>
        </div>
      </div>`;
  }

  /* ── Export ──────────────────────────────────────────────────────── */
  global.FinosCalendar = { renderCalendar, renderUpcoming, renderSummary, collectEvents };

})(window);
