/**
 * finos-fd-tracker.js — Fixed Income Portfolio Tracker  v1.0  (Phase 27)
 * ─────────────────────────────────────────────────────────────────────────
 * Tracks FD, RD, PPF, NSC, SCSS, Sukanya Samriddhi, and Government Bonds
 * entirely client-side — no backend needed.  Pure compound-interest math.
 *
 * Public API:
 *   FinosFD.renderDashboard(containerEl)   — main tracker UI
 *   FinosFD.renderMaturityCalendar(el)     — 12-month maturity view
 *   FinosFD.getPortfolio()                 — returns current array
 *   FinosFD.getTotals()                    — { principal, currentValue, interest, yld }
 */
(function (global) {
  'use strict';

  const STORE_KEY = 'finos_fd_portfolio';

  /* ── Instrument definitions ────────────────────────────────────── */
  const INSTRUMENTS = {
    fd:       { label: 'Fixed Deposit',                color: '#00D4FF', icon: '🏦', compoundFreq: 4  },
    rd:       { label: 'Recurring Deposit',             color: '#22D3A6', icon: '📅', compoundFreq: 4  },
    ppf:      { label: 'Public Provident Fund',         color: '#7B2FF7', icon: '🏛️', compoundFreq: 1, rate: 7.1, maxYears: 15 },
    nsc:      { label: 'National Savings Certificate',  color: '#F0A500', icon: '📜', compoundFreq: 2, rate: 7.7, termYears: 5  },
    scss:     { label: 'Senior Citizens Savings Scheme',color: '#FF8C42', icon: '👴', compoundFreq: 4, rate: 8.2, maxYears: 5   },
    sukanya:  { label: 'Sukanya Samriddhi Yojana',      color: '#E879F9', icon: '👧', compoundFreq: 1, rate: 8.2, maxYears: 21  },
    bond:     { label: 'Government Bond / SGB',         color: '#34D399', icon: '📊', compoundFreq: 2  },
    post_td:  { label: 'Post Office Time Deposit',      color: '#60A5FA', icon: '✉️', compoundFreq: 4, rate: 7.5 },
  };

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function INR(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L';
    if (n >= 1e3) return '₹' + Math.round(n / 1e3) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  function yearsFrom(startDate) {
    const s = new Date(startDate), now = new Date();
    return (now - s) / (365.25 * 86400000);
  }

  function addYears(startDate, years) {
    const d = new Date(startDate);
    d.setFullYear(d.getFullYear() + Math.floor(years));
    d.setMonth(d.getMonth() + Math.round((years % 1) * 12));
    return d;
  }

  function daysUntil(date) {
    return Math.ceil((new Date(date) - new Date()) / 86400000);
  }

  function fmtDate(d) {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  /* ── Compound interest for FD / bond ───────────────────────────── */
  function calcFD(entry) {
    const { principal, rate, startDate, termMonths } = entry;
    const n         = INSTRUMENTS[entry.type]?.compoundFreq || 4;
    const termYears = termMonths / 12;
    const elapsed   = Math.min(yearsFrom(startDate), termYears);
    const r         = rate / 100;

    const currentValue  = principal * Math.pow(1 + r / n, n * elapsed);
    const maturityValue = principal * Math.pow(1 + r / n, n * termYears);
    const maturityDate  = addYears(startDate, termYears);

    return { currentValue, maturityValue, maturityDate, interestEarned: currentValue - principal };
  }

  /* ── RD: MV = P × [(1+r/n)^nt - 1] / (r/n) ──────────────────── */
  function calcRD(entry) {
    const { monthlyAmount, rate, startDate, termMonths } = entry;
    const n         = 4; // quarterly compounding (standard bank RD)
    const r         = rate / 100;
    const termYears = termMonths / 12;
    const elapsed   = Math.min(yearsFrom(startDate), termYears);

    function rdValue(years) {
      const t = years;
      return monthlyAmount * 12 / n * ((Math.pow(1 + r / n, n * t) - 1) / (r / n));
    }

    const totalInvested = monthlyAmount * Math.min(termMonths, Math.round(elapsed * 12));
    const currentValue  = rdValue(elapsed);
    const maturityValue = rdValue(termYears);
    const maturityDate  = addYears(startDate, termYears);

    return { currentValue, maturityValue, maturityDate, interestEarned: currentValue - totalInvested, totalInvested };
  }

  /* ── PPF: annual contributions, 15-year lock-in ─────────────────── */
  function calcPPF(entry) {
    const { annualAmount, startDate } = entry;
    const rate        = (entry.rate || INSTRUMENTS.ppf.rate) / 100;
    const elapsed     = yearsFrom(startDate);
    const maxYears    = 15;
    const yearsInvested = Math.min(elapsed, maxYears);
    const totalInvested = annualAmount * Math.ceil(yearsInvested);
    const maturityDate  = addYears(startDate, maxYears);

    // PPF balance = sum of A*(1+r)^t for each year's contribution
    let balance = 0;
    for (let y = 0; y < Math.ceil(yearsInvested); y++) {
      const remainingYears = Math.max(0, yearsInvested - y);
      balance += annualAmount * Math.pow(1 + rate, remainingYears);
    }
    const maturityBalance = (() => {
      let b = 0;
      for (let y = 0; y < maxYears; y++) {
        b += annualAmount * Math.pow(1 + rate, maxYears - y);
      }
      return b;
    })();

    return { currentValue: balance, maturityValue: maturityBalance, maturityDate, interestEarned: balance - totalInvested, totalInvested };
  }

  /* ── NSC: 5-year, compounded semi-annually ─────────────────────── */
  function calcNSC(entry) {
    const { principal, startDate } = entry;
    const rate      = (entry.rate || INSTRUMENTS.nsc.rate) / 100;
    const termYears = 5;
    const elapsed   = Math.min(yearsFrom(startDate), termYears);
    const n         = 2;

    const currentValue  = principal * Math.pow(1 + rate / n, n * elapsed);
    const maturityValue = principal * Math.pow(1 + rate / n, n * termYears);
    const maturityDate  = addYears(startDate, termYears);

    return { currentValue, maturityValue, maturityDate, interestEarned: currentValue - principal };
  }

  /* ── Generic fixed-rate compounding ─────────────────────────────── */
  function calcGeneric(entry) {
    const inst     = INSTRUMENTS[entry.type] || {};
    const rate     = (entry.rate || inst.rate || 7) / 100;
    const n        = inst.compoundFreq || 4;
    const termYears = (entry.termMonths || (inst.termYears || inst.maxYears || 5) * 12) / 12;
    const principal = entry.principal || entry.annualAmount || 0;
    const elapsed   = Math.min(yearsFrom(entry.startDate), termYears);

    const currentValue  = principal * Math.pow(1 + rate / n, n * elapsed);
    const maturityValue = principal * Math.pow(1 + rate / n, n * termYears);
    const maturityDate  = addYears(entry.startDate, termYears);

    return { currentValue, maturityValue, maturityDate, interestEarned: currentValue - principal };
  }

  /* ── Dispatch to correct calculator ─────────────────────────────── */
  function calcEntry(entry) {
    switch (entry.type) {
      case 'rd':  return calcRD(entry);
      case 'ppf': return calcPPF(entry);
      case 'nsc': return calcNSC(entry);
      default:    return entry.termMonths ? calcFD(entry) : calcGeneric(entry);
    }
  }

  /* ── Data layer ─────────────────────────────────────────────────── */
  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; } }
  function save(arr) { localStorage.setItem(STORE_KEY, JSON.stringify(arr)); }

  function getTotals() {
    const portfolio = load();
    let principal = 0, currentValue = 0;
    portfolio.forEach(entry => {
      const m = calcEntry(entry);
      const p = entry.principal || entry.annualAmount || entry.monthlyAmount || 0;
      principal     += entry.type === 'rd' ? (m.totalInvested || p) : (entry.type === 'ppf' ? (m.totalInvested || p) : p);
      currentValue  += m.currentValue;
    });
    const interest = currentValue - principal;
    const yld = principal > 0 ? ((currentValue / principal - 1) * 100) : 0;
    return { principal, currentValue, interest, yld };
  }

  /* ── Context push ───────────────────────────────────────────────── */
  function pushContext() {
    const t = getTotals();
    localStorage.setItem('finos_fd_value', t.currentValue.toString());
    localStorage.setItem('finos_fd_principal', t.principal.toString());
    if (window.FinosContext?.update) {
      window.FinosContext.update({ fdPortfolio: load(), fdTotals: t });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     DASHBOARD RENDERER
  ══════════════════════════════════════════════════════════════════ */
  function renderDashboard(container) {
    if (!container) return;
    const portfolio = load();
    const enriched  = portfolio.map(e => ({ ...e, metrics: calcEntry(e) }));
    const totals    = getTotals();
    pushContext();

    const overallColor = totals.interest >= 0 ? '#22D3A6' : '#FF4444';

    container.innerHTML = `
      <style>
        .fd-summary { display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px; }
        .fd-pill { background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:14px 18px;flex:1;min-width:130px; }
        .fd-pill-label { font-size:10px;font-weight:700;color:var(--text-muted,#8892A4);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px; }
        .fd-pill-value { font-size:20px;font-weight:800;color:var(--text-primary,#F5F7FA); }
        .fd-card { background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:16px;margin-bottom:12px; }
        .fd-card-top { display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px; }
        .fd-card-name { font-size:14px;font-weight:800;color:var(--text-primary,#F5F7FA);display:flex;align-items:center;gap:8px; }
        .fd-card-sub { font-size:11px;color:var(--text-muted,#8892A4);margin-top:2px; }
        .fd-card-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px; }
        .fd-metric-label { font-size:10px;font-weight:700;color:var(--text-muted,#8892A4);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px; }
        .fd-metric-value { font-size:14px;font-weight:700;color:var(--text-primary,#F5F7FA); }
        .fd-tag { display:inline-block;padding:3px 9px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase; }
        .fd-del-btn { background:none;border:none;color:rgba(255,68,68,.4);cursor:pointer;font-size:18px;padding:2px 8px;border-radius:6px; }
        .fd-del-btn:hover { background:rgba(255,68,68,.1);color:#FF4444; }
        .fd-add-btn { display:inline-flex;align-items:center;gap:6px;padding:10px 18px;border-radius:12px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.3);color:#00D4FF;font-size:13px;font-weight:700;cursor:pointer; }
        .fd-maturity-bar { height:5px;background:rgba(255,255,255,.08);border-radius:3px;margin-top:10px;overflow:hidden; }
        .fd-maturity-fill { height:100%;border-radius:3px;transition:width .6s ease; }
        .fd-type-group { margin-bottom:24px; }
        .fd-type-header { font-size:11px;font-weight:700;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;display:flex;align-items:center;gap:8px; }
        .fd-empty { text-align:center;padding:40px;color:#8892A4;font-size:13px; }
      </style>

      <!-- Summary pills -->
      <div class="fd-summary">
        <div class="fd-pill">
          <div class="fd-pill-label">Total Principal</div>
          <div class="fd-pill-value">${INR(totals.principal)}</div>
        </div>
        <div class="fd-pill">
          <div class="fd-pill-label">Current Value</div>
          <div class="fd-pill-value">${INR(totals.currentValue)}</div>
        </div>
        <div class="fd-pill">
          <div class="fd-pill-label">Interest Earned</div>
          <div class="fd-pill-value" style="color:${overallColor};">+${INR(totals.interest)}</div>
        </div>
        <div class="fd-pill">
          <div class="fd-pill-label">Avg Yield</div>
          <div class="fd-pill-value" style="color:#00D4FF;">${totals.yld.toFixed(1)}%</div>
        </div>
      </div>

      <!-- Actions -->
      <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">
        <button class="fd-add-btn" onclick="FinosFD._openAddModal()">+ Add Investment</button>
      </div>

      <!-- Cards grouped by type -->
      <div id="fd-cards-container">
        ${enriched.length === 0 ? `
          <div class="fd-empty">
            <div style="font-size:32px;margin-bottom:10px;">🏦</div>
            <div style="font-weight:700;margin-bottom:6px;">No fixed income investments yet</div>
            <div>Add your FDs, PPF, NSC, RD — track interest and upcoming maturities in one place.</div>
          </div>` : _renderGroupedCards(enriched)
        }
      </div>

      <div style="font-size:11px;color:rgba(255,255,255,.2);text-align:right;margin-top:12px;">
        Interest computed with compound-interest math · Rates as entered · For reference only
      </div>`;
  }

  function _renderGroupedCards(enriched) {
    const groups = {};
    enriched.forEach(e => {
      const g = e.type || 'fd';
      if (!groups[g]) groups[g] = [];
      groups[g].push(e);
    });

    return Object.entries(groups).map(([type, entries]) => {
      const inst = INSTRUMENTS[type] || { label: type.toUpperCase(), color: '#8892A4', icon: '💰' };
      return `
        <div class="fd-type-group">
          <div class="fd-type-header">
            <span>${inst.icon}</span>
            <span>${inst.label}</span>
          </div>
          ${entries.map(e => _fdCard(e, inst)).join('')}
        </div>`;
    }).join('');
  }

  function _fdCard(entry, inst) {
    const m       = entry.metrics;
    const days    = daysUntil(m.maturityDate);
    const elapsed = yearsFrom(entry.startDate);
    const termYrs = (entry.termMonths || (inst.termYears || inst.maxYears || 15) * 12) / 12;
    const pctDone = Math.min((elapsed / termYrs) * 100, 100);

    const urgency = days <= 0 ? '#FF4444' : days <= 90 ? '#F0A500' : inst.color;
    const principal = entry.principal || entry.annualAmount || entry.monthlyAmount || 0;
    const invested  = m.totalInvested || principal;
    const interestColor = (m.interestEarned || 0) >= 0 ? '#22D3A6' : '#FF4444';

    const rateDisplay = entry.rate ? `${entry.rate}% p.a.` : (inst.rate ? `${inst.rate}% p.a. (current)` : '—');
    const principalLabel = entry.type === 'rd' ? 'Monthly' : entry.type === 'ppf' ? 'Annual' : 'Principal';
    const principalVal   = entry.type === 'rd' ? INR(entry.monthlyAmount) : entry.type === 'ppf' ? INR(entry.annualAmount) : INR(entry.principal);

    return `
      <div class="fd-card">
        <div class="fd-card-top">
          <div>
            <div class="fd-card-name">
              <span>${inst.icon}</span>
              ${entry.label || inst.label}
              <span class="fd-tag" style="background:${inst.color}22;color:${inst.color};">${entry.bank || entry.type.toUpperCase()}</span>
            </div>
            <div class="fd-card-sub">
              Since ${fmtDate(entry.startDate)} &nbsp;·&nbsp; ${rateDisplay}
              ${entry.nominee ? ` &nbsp;·&nbsp; Nominee: ${entry.nominee}` : ''}
            </div>
          </div>
          <button class="fd-del-btn" onclick="FinosFD._deleteEntry('${entry.id}')">×</button>
        </div>

        <div class="fd-card-grid">
          <div>
            <div class="fd-metric-label">${principalLabel}</div>
            <div class="fd-metric-value">${principalVal}</div>
          </div>
          <div>
            <div class="fd-metric-label">Current Value</div>
            <div class="fd-metric-value">${INR(m.currentValue)}</div>
          </div>
          <div>
            <div class="fd-metric-label">Interest Earned</div>
            <div class="fd-metric-value" style="color:${interestColor};">+${INR(m.interestEarned)}</div>
          </div>
          <div>
            <div class="fd-metric-label">Maturity Value</div>
            <div class="fd-metric-value" style="color:#00D4FF;">${INR(m.maturityValue)}</div>
          </div>
          <div>
            <div class="fd-metric-label">Matures</div>
            <div class="fd-metric-value" style="color:${urgency};">${fmtDate(m.maturityDate)}</div>
            <div style="font-size:10px;color:${urgency};">${days <= 0 ? 'Matured' : days + ' days'}</div>
          </div>
        </div>

        <!-- Progress to maturity -->
        <div class="fd-maturity-bar" title="${pctDone.toFixed(0)}% of term elapsed">
          <div class="fd-maturity-fill" style="width:${pctDone}%;background:${urgency};"></div>
        </div>
      </div>`;
  }

  /* ══════════════════════════════════════════════════════════════════
     MATURITY CALENDAR
  ══════════════════════════════════════════════════════════════════ */
  function renderMaturityCalendar(container) {
    if (!container) return;
    const portfolio = load();
    const now       = new Date();
    const horizon   = new Date(now); horizon.setFullYear(horizon.getFullYear() + 2);

    const upcoming = portfolio
      .map(e => {
        const m    = calcEntry(e);
        const inst = INSTRUMENTS[e.type] || { label: e.type, color: '#8892A4', icon: '💰' };
        return { entry: e, maturityDate: m.maturityDate, maturityValue: m.maturityValue, inst };
      })
      .filter(x => new Date(x.maturityDate) <= horizon)
      .sort((a, b) => new Date(a.maturityDate) - new Date(b.maturityDate));

    container.innerHTML = `
      <p style="font-size:13px;color:#8892A4;margin-bottom:16px;">
        Investments maturing within the next 24 months — plan your reinvestment strategy.
      </p>
      ${upcoming.length === 0 ? `
        <div style="text-align:center;padding:40px;color:#8892A4;font-size:13px;">
          No maturities in the next 24 months — or no investments added yet.
        </div>` : upcoming.map(x => {
          const days  = daysUntil(x.maturityDate);
          const color = days <= 0 ? '#FF4444' : days <= 30 ? '#F0A500' : days <= 90 ? '#00D4FF' : '#22D3A6';
          return `
            <div style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:14px;margin-bottom:10px;">
              <div style="font-size:24px;">${x.inst.icon}</div>
              <div style="flex:1;">
                <div style="font-size:13px;font-weight:700;color:#F5F7FA;">${x.entry.label || x.inst.label}</div>
                <div style="font-size:11px;color:#8892A4;">${x.entry.bank || ''} &nbsp;·&nbsp; ${x.entry.rate || x.inst.rate || '—'}% p.a.</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:16px;font-weight:800;color:#F5F7FA;">${INR(x.maturityValue)}</div>
                <div style="font-size:11px;color:${color};font-weight:700;">${days <= 0 ? 'MATURED' : days + ' days — ' + fmtDate(x.maturityDate)}</div>
              </div>
            </div>`;
        }).join('')
      }`;
  }

  /* ══════════════════════════════════════════════════════════════════
     ADD MODAL
  ══════════════════════════════════════════════════════════════════ */
  let _modalOpen = false;

  function _openAddModal() {
    if (_modalOpen) return;
    _modalOpen = true;

    const modal = document.createElement('div');
    modal.id = 'fd-add-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:20px;';

    const typeOptions = Object.entries(INSTRUMENTS)
      .map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`)
      .join('');

    modal.innerHTML = `
      <div style="background:linear-gradient(145deg,#0d0f1a,#0f1525);border:1px solid rgba(0,212,255,.2);border-radius:20px;padding:28px;max-width:480px;width:100%;font-family:-apple-system,sans-serif;max-height:90vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <div style="font-size:17px;font-weight:800;color:#F5F7FA;">+ Add Fixed Income Investment</div>
          <button onclick="FinosFD._closeModal()" style="background:none;border:none;color:#8892A4;font-size:22px;cursor:pointer;">×</button>
        </div>

        <div style="margin-bottom:14px;">
          <label style="${_lbl}">Investment Type</label>
          <select id="fd-type" onchange="FinosFD._onTypeChange()" style="${_inp}">
            ${typeOptions}
          </select>
        </div>

        <div style="margin-bottom:14px;">
          <label style="${_lbl}">Label / Nickname</label>
          <input id="fd-label" type="text" placeholder="e.g. SBI 1-Year FD, My PPF" style="${_inp}">
        </div>

        <div style="margin-bottom:14px;">
          <label style="${_lbl}">Bank / Institution</label>
          <input id="fd-bank" type="text" placeholder="e.g. SBI, HDFC, Post Office" style="${_inp}">
        </div>

        <div id="fd-principal-row" style="margin-bottom:14px;">
          <label id="fd-principal-label" style="${_lbl}">Principal Amount (₹)</label>
          <input id="fd-principal" type="number" min="1000" step="1000" placeholder="100000" style="${_inp}">
        </div>

        <div id="fd-rate-row" style="margin-bottom:14px;">
          <label style="${_lbl}">Interest Rate (% per annum)</label>
          <input id="fd-rate" type="number" min="1" max="20" step="0.1" placeholder="7.5" style="${_inp}">
          <div id="fd-rate-hint" style="font-size:11px;color:#8892A4;margin-top:4px;"></div>
        </div>

        <div style="margin-bottom:14px;">
          <label style="${_lbl}">Start Date</label>
          <input id="fd-start" type="date" style="${_inp}" max="${new Date().toISOString().slice(0,10)}">
        </div>

        <div id="fd-term-row" style="margin-bottom:14px;">
          <label style="${_lbl}">Term (months)</label>
          <input id="fd-term" type="number" min="1" max="600" step="1" placeholder="12" style="${_inp}">
        </div>

        <div id="fd-nominee-row" style="margin-bottom:20px;">
          <label style="${_lbl}">Nominee (optional)</label>
          <input id="fd-nominee" type="text" placeholder="Name of nominee" style="${_inp}">
        </div>

        <button onclick="FinosFD._save()"
          style="width:100%;padding:13px;border-radius:12px;background:linear-gradient(135deg,rgba(0,212,255,.3),rgba(34,211,166,.2));border:1px solid rgba(0,212,255,.4);color:#00D4FF;font-size:14px;font-weight:800;cursor:pointer;">
          Save Investment
        </button>
        <div id="fd-save-status" style="margin-top:10px;font-size:12px;text-align:center;color:#8892A4;min-height:18px;"></div>
      </div>`;

    document.body.appendChild(modal);

    // Set today as default start date
    document.getElementById('fd-start').value = new Date().toISOString().slice(0, 10);
    _onTypeChange();
  }

  const _lbl = 'font-size:11px;font-weight:700;color:#8892A4;text-transform:uppercase;letter-spacing:.6px;display:block;margin-bottom:6px;';
  const _inp = 'width:100%;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#F5F7FA;font-size:13px;box-sizing:border-box;outline:none;';

  function _onTypeChange() {
    const type = document.getElementById('fd-type')?.value;
    if (!type) return;
    const inst = INSTRUMENTS[type];

    // Update principal label for RD / PPF
    const principalLabel = document.getElementById('fd-principal-label');
    const termRow        = document.getElementById('fd-term-row');
    const rateRow        = document.getElementById('fd-rate-row');
    const rateHint       = document.getElementById('fd-rate-hint');
    const rateInput      = document.getElementById('fd-rate');

    if (principalLabel) {
      principalLabel.textContent = type === 'rd' ? 'Monthly Amount (₹)' : type === 'ppf' ? 'Annual Contribution (₹)' : 'Principal Amount (₹)';
    }

    // Hide term row for PPF/NSC/SCSS (fixed terms)
    if (termRow) termRow.style.display = ['ppf', 'nsc', 'scss', 'sukanya'].includes(type) ? 'none' : 'block';

    // Auto-fill government rates
    if (inst?.rate && rateInput) {
      rateInput.value = inst.rate;
      if (rateRow) rateRow.style.opacity = '0.65';
    } else {
      if (rateInput) rateInput.value = '';
      if (rateRow) rateRow.style.opacity = '1';
    }
    if (rateHint) {
      rateHint.textContent = inst?.rate ? `Government rate: ${inst.rate}% (auto-filled — update if changed)` : '';
    }
  }

  function _closeModal() {
    document.getElementById('fd-add-modal')?.remove();
    _modalOpen = false;
  }

  function _save() {
    const type       = document.getElementById('fd-type')?.value;
    const label      = document.getElementById('fd-label')?.value?.trim();
    const bank       = document.getElementById('fd-bank')?.value?.trim();
    const principal  = parseFloat(document.getElementById('fd-principal')?.value || '0');
    const rate       = parseFloat(document.getElementById('fd-rate')?.value || '0');
    const startDate  = document.getElementById('fd-start')?.value;
    const termMonths = parseInt(document.getElementById('fd-term')?.value || '0', 10);
    const nominee    = document.getElementById('fd-nominee')?.value?.trim();
    const statusEl   = document.getElementById('fd-save-status');

    const inst = INSTRUMENTS[type] || {};

    if (!principal || principal < 100) { if (statusEl) statusEl.textContent = '⚠️ Enter a valid amount (min ₹100)'; return; }
    if (!rate && !inst.rate)           { if (statusEl) statusEl.textContent = '⚠️ Enter the interest rate'; return; }
    if (!startDate)                    { if (statusEl) statusEl.textContent = '⚠️ Select a start date'; return; }
    const termNeeded = !['ppf', 'nsc', 'scss', 'sukanya'].includes(type);
    if (termNeeded && (!termMonths || termMonths < 1)) { if (statusEl) statusEl.textContent = '⚠️ Enter the term in months'; return; }

    const entry = {
      id:          `fd_${Date.now()}`,
      type,
      label:       label || inst.label,
      bank:        bank || '',
      startDate,
      rate:        rate || inst.rate,
      nominee:     nominee || '',
      addedAt:     new Date().toISOString(),
    };

    if (type === 'rd') {
      entry.monthlyAmount = principal;
      entry.termMonths    = termMonths;
    } else if (type === 'ppf') {
      entry.annualAmount = principal;
    } else if (['nsc', 'scss', 'sukanya', 'post_td'].includes(type) && !termNeeded) {
      entry.principal = principal;
    } else {
      entry.principal  = principal;
      entry.termMonths = termMonths;
    }

    const portfolio = load();
    portfolio.push(entry);
    save(portfolio);

    if (statusEl) statusEl.textContent = '✅ Saved!';
    setTimeout(() => {
      _closeModal();
      const el = document.getElementById('fd-dashboard');
      if (el) renderDashboard(el);
    }, 500);
  }

  function _deleteEntry(id) {
    if (!confirm('Remove this investment from your tracker?')) return;
    save(load().filter(e => e.id !== id));
    const el = document.getElementById('fd-dashboard');
    if (el) renderDashboard(el);
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  const FinosFD = {
    renderDashboard,
    renderMaturityCalendar,
    getPortfolio: load,
    getTotals,
    _openAddModal,
    _closeModal,
    _onTypeChange,
    _save,
    _deleteEntry,
  };

  global.FinosFD = FinosFD;

  // Auto-push context on load
  document.addEventListener('finos-context-ready', () => pushContext());

}(window));
