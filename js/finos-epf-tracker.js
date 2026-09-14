/**
 * finos-epf-tracker.js — EPF / EPS / PF Tracker  v1.0  (Phase 36)
 * ─────────────────────────────────────────────────────────────────
 * Tracks Employee Provident Fund balance, monthly contribution
 * breakdown (employee EPF + employer EPF + EPS), projects corpus
 * at retirement, and estimates EPS pension.
 *
 * Indian rules (FY 2025-26):
 *   - Employee EPF:  12% of Basic+DA
 *   - Employer EPF:  3.67% of Basic+DA  (rest goes to EPS)
 *   - EPS:           8.33% of Basic+DA  capped at ₹15,000 → max ₹1,250/mo
 *   - EPF interest:  8.25% p.a. (compounded annually, credited in April)
 *   - EPS pension:   (pensionable salary × service years) / 70
 *
 * localStorage keys written:
 *   finos_epf_value       — current EPF balance (number)
 *   finos_epf_basic       — monthly basic + DA (number)
 *   finos_epf_doj         — date of joining ISO string
 *   finos_epf_uan         — UAN (string, not displayed back to Arya)
 *   finos_epf_retire_age  — retirement age (default 58)
 *   finos_epf_projected   — projected EPF corpus at retirement
 *   finos_epf_pension     — estimated monthly EPS pension
 */
(function (global) {
  'use strict';

  /* ── Constants ──────────────────────────────────────────────────── */
  const EPF_EMP_RATE   = 0.12;    // 12% of basic
  const EPF_EMPR_RATE  = 0.0367;  // 3.67% to EPF
  const EPS_RATE       = 0.0833;  // 8.33% to EPS
  const EPS_WAGE_CAP   = 15000;   // EPS pensionable wage cap
  const EPF_INTEREST   = 8.25;    // % p.a. FY 2025-26
  const RETIRE_AGE_DEF = 58;

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function gs(k) { return parseFloat(localStorage.getItem(k) || '0') || 0; }
  function gss(k) { return localStorage.getItem(k) || ''; }
  function ss(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} }

  function INR(n) {
    n = Number(n) || 0;
    if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
    if (n >= 1e3) return '₹' + Math.round(n / 1e3) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  function yearsMonths(months) {
    const y = Math.floor(months / 12), m = months % 12;
    return (y > 0 ? y + ' yr ' : '') + (m > 0 ? m + ' mo' : '');
  }

  function ageAt(doj, retireAge) {
    if (!doj) return { yearsService: 0, monthsToRetire: 0 };
    const dojDate = new Date(doj);
    const now = new Date();
    const birthEstimate = new Date(dojDate);
    birthEstimate.setFullYear(dojDate.getFullYear() - 22); // assume joined at 22
    const yearsService = (now - dojDate) / (365.25 * 24 * 3600 * 1000);
    const retireDate = new Date(birthEstimate);
    retireDate.setFullYear(birthEstimate.getFullYear() + retireAge);
    const monthsToRetire = Math.max(0, Math.round((retireDate - now) / (30.44 * 24 * 3600 * 1000)));
    const totalServiceYears = yearsService + monthsToRetire / 12;
    return { yearsService: Math.round(yearsService * 10) / 10, monthsToRetire, totalServiceYears };
  }

  /* ── Financial calculations ─────────────────────────────────────── */
  function calcContributions(basic) {
    const empEPF  = Math.round(basic * EPF_EMP_RATE);
    const empWage = Math.min(basic, EPS_WAGE_CAP);
    const eps     = Math.round(empWage * EPS_RATE);
    const emprEPF = Math.round(basic * EPF_EMPR_RATE);
    const totalEPF = empEPF + emprEPF;    // what actually goes into EPF account
    return { empEPF, eps, emprEPF, totalEPF, total: empEPF + eps + emprEPF };
  }

  function calcProjectedCorpus(currentBalance, monthlyEPFContrib, monthsToRetire) {
    // Monthly contributions, interest compounded annually in April
    const r = EPF_INTEREST / 100;
    let balance = currentBalance;
    for (let m = 0; m < monthsToRetire; m++) {
      balance += monthlyEPFContrib;
      if ((m + 1) % 12 === 0) {
        balance *= (1 + r);
      }
    }
    // Apply remaining partial-year interest
    const partialMonths = monthsToRetire % 12;
    if (partialMonths > 0) {
      balance += balance * r * (partialMonths / 12);
    }
    return Math.round(balance);
  }

  function calcEPSPension(yearsService, avgBasic) {
    // EPS formula: (Pensionable Salary × Pensionable Service) / 70
    const pensionSalary = Math.min(avgBasic, EPS_WAGE_CAP);
    return Math.round((pensionSalary * Math.min(35, yearsService)) / 70);
  }

  /* ── Save data from form ─────────────────────────────────────────── */
  function saveAll() {
    const bal     = parseFloat(document.getElementById('epf-balance')?.value  || '0') || 0;
    const basic   = parseFloat(document.getElementById('epf-basic')?.value    || '0') || 0;
    const doj     = document.getElementById('epf-doj')?.value  || '';
    const uan     = document.getElementById('epf-uan')?.value  || '';
    const retAge  = parseFloat(document.getElementById('epf-retire-age')?.value || RETIRE_AGE_DEF) || RETIRE_AGE_DEF;

    ss('finos_epf_value', bal);
    ss('finos_epf_basic', basic);
    ss('finos_epf_doj', doj);
    ss('finos_epf_uan', uan);
    ss('finos_epf_retire_age', retAge);

    // Compute projections
    if (bal >= 0 && basic > 0 && doj) {
      const c   = calcContributions(basic);
      const age = ageAt(doj, retAge);
      const proj = calcProjectedCorpus(bal, c.totalEPF, age.monthsToRetire);
      const pen  = calcEPSPension(age.totalServiceYears, basic);
      ss('finos_epf_projected', proj);
      ss('finos_epf_pension', pen);
      window.FinosContext?.update?.({ epfValue: bal, epfProjected: proj });
    }

    // Refresh both panels
    const ov = document.getElementById('epf-panel-overview');
    const pr = document.getElementById('epf-panel-projection');
    if (ov && ov.style.display !== 'none') renderOverview(ov);
    if (pr && pr.style.display !== 'none') renderProjection(pr);
  }

  /* ── Render: input form ─────────────────────────────────────────── */
  function renderForm(el) {
    if (!el) return;
    const bal    = gs('finos_epf_value');
    const basic  = gs('finos_epf_basic');
    const doj    = gss('finos_epf_doj');
    const uan    = gss('finos_epf_uan');
    const ret    = gs('finos_epf_retire_age') || RETIRE_AGE_DEF;

    el.innerHTML = `
      <div class="epf-form">
        <div class="epf-form-title">Your EPF Details</div>
        <div class="epf-form-hint">Find your balance in EPFO passbook (passbook.epfindia.gov.in) or UMANG app.</div>

        <div class="epf-field-grid">
          <div class="epf-field">
            <label>Current EPF Balance (₹)</label>
            <input type="number" id="epf-balance" class="epf-inp" value="${bal || ''}" placeholder="e.g. 850000"
              oninput="FinosEPFTracker._autoSave()">
          </div>
          <div class="epf-field">
            <label>Monthly Basic + DA (₹)</label>
            <input type="number" id="epf-basic" class="epf-inp" value="${basic || ''}" placeholder="e.g. 45000"
              oninput="FinosEPFTracker._autoSave()">
          </div>
          <div class="epf-field">
            <label>Date of Joining (DOJ)</label>
            <input type="date" id="epf-doj" class="epf-inp" value="${doj}"
              onchange="FinosEPFTracker._autoSave()">
          </div>
          <div class="epf-field">
            <label>Retirement Age</label>
            <input type="number" id="epf-retire-age" class="epf-inp" value="${ret}" placeholder="58" min="50" max="65"
              onchange="FinosEPFTracker._autoSave()">
          </div>
          <div class="epf-field">
            <label>UAN (optional)</label>
            <input type="text" id="epf-uan" class="epf-inp" value="${uan}" placeholder="100XXXXXXXXXXX" maxlength="20"
              oninput="FinosEPFTracker._autoSave()">
          </div>
        </div>

        <div class="epf-rates-box">
          <div class="epf-rate-item"><span class="epf-rate-lbl">EPF Interest Rate</span><span class="epf-rate-val">8.25% p.a.</span><span class="epf-rate-note">FY 2025-26</span></div>
          <div class="epf-rate-item"><span class="epf-rate-lbl">Employee EPF</span><span class="epf-rate-val">12%</span><span class="epf-rate-note">of Basic+DA</span></div>
          <div class="epf-rate-item"><span class="epf-rate-lbl">Employer EPF</span><span class="epf-rate-val">3.67%</span><span class="epf-rate-note">of Basic+DA</span></div>
          <div class="epf-rate-item"><span class="epf-rate-lbl">EPS contribution</span><span class="epf-rate-val">8.33%</span><span class="epf-rate-note">cap ₹1,250/mo</span></div>
        </div>
      </div>`;
  }

  let _saveTimer = null;
  function _autoSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(saveAll, 600);
  }

  /* ── Render: overview tab ───────────────────────────────────────── */
  function renderOverview(el) {
    if (!el) return;
    const bal   = gs('finos_epf_value');
    const basic = gs('finos_epf_basic');
    const doj   = gss('finos_epf_doj');

    if (!bal && !basic) {
      el.innerHTML = `<div class="epf-empty">Enter your EPF balance and Basic salary above to see your overview.</div>`;
      return;
    }

    const c    = basic > 0 ? calcContributions(basic) : { empEPF: 0, eps: 0, emprEPF: 0, totalEPF: 0, total: 0 };
    const age  = doj ? ageAt(doj, gs('finos_epf_retire_age') || RETIRE_AGE_DEF) : { yearsService: 0 };
    const ytdInterest = Math.round(bal * (EPF_INTEREST / 100) * Math.min(1, age.yearsService > 0 ? 1 : 0.5));

    const annualEmp  = c.empEPF  * 12;
    const annualEmpr = c.emprEPF * 12;
    const annualEPS  = c.eps     * 12;
    const annualTotal = (c.empEPF + c.emprEPF) * 12;

    el.innerHTML = `
      <div class="epf-overview">

        <!-- Balance hero -->
        <div class="epf-balance-card">
          <div class="epf-balance-lbl">Current EPF Corpus</div>
          <div class="epf-balance-val">${INR(bal)}</div>
          ${doj ? `<div class="epf-balance-sub">Service: ${age.yearsService} years</div>` : ''}
          <div class="epf-balance-badge">🔒 8.25% guaranteed</div>
        </div>

        <!-- Contribution breakdown -->
        <div class="epf-section-title">Monthly Contribution Breakdown</div>
        <div class="epf-contrib-grid">
          <div class="epf-contrib-card epf-contrib-emp">
            <div class="epf-contrib-lbl">Your contribution<br><span style="font-size:10px;opacity:.6">(12% of Basic)</span></div>
            <div class="epf-contrib-val">${INR(c.empEPF)}<span class="epf-per-mo">/mo</span></div>
            <div class="epf-contrib-annual">₹${annualEmp.toLocaleString('en-IN')}/yr</div>
          </div>
          <div class="epf-contrib-card epf-contrib-empr">
            <div class="epf-contrib-lbl">Employer EPF<br><span style="font-size:10px;opacity:.6">(3.67% of Basic)</span></div>
            <div class="epf-contrib-val">${INR(c.emprEPF)}<span class="epf-per-mo">/mo</span></div>
            <div class="epf-contrib-annual">₹${annualEmpr.toLocaleString('en-IN')}/yr</div>
          </div>
          <div class="epf-contrib-card epf-contrib-eps">
            <div class="epf-contrib-lbl">EPS (Pension fund)<br><span style="font-size:10px;opacity:.6">(8.33%, max ₹1,250)</span></div>
            <div class="epf-contrib-val">${INR(c.eps)}<span class="epf-per-mo">/mo</span></div>
            <div class="epf-contrib-annual">₹${annualEPS.toLocaleString('en-IN')}/yr</div>
          </div>
          <div class="epf-contrib-card epf-contrib-total">
            <div class="epf-contrib-lbl">Total to EPF account<br><span style="font-size:10px;opacity:.6">(your + employer)</span></div>
            <div class="epf-contrib-val">${INR(c.totalEPF)}<span class="epf-per-mo">/mo</span></div>
            <div class="epf-contrib-annual">₹${annualTotal.toLocaleString('en-IN')}/yr</div>
          </div>
        </div>

        <!-- Interest info -->
        <div class="epf-interest-banner">
          <div>
            <div class="epf-int-lbl">Estimated annual interest</div>
            <div class="epf-int-val">${INR(bal * EPF_INTEREST / 100)}</div>
          </div>
          <div>
            <div class="epf-int-lbl">Effective interest (on contributions)</div>
            <div class="epf-int-val">${INR(annualTotal * EPF_INTEREST / 100)}</div>
          </div>
          <div>
            <div class="epf-int-lbl">Tax status</div>
            <div class="epf-int-val" style="color:#22D3A6;">EEE — Fully exempt</div>
          </div>
        </div>

        <!-- EPF vs alternatives -->
        <div class="epf-section-title" style="margin-top:24px;">How EPF Compares</div>
        <div class="epf-compare-grid">
          ${[
            { label: 'EPF', rate: '8.25%', tax: 'EEE', col: '#22D3A6', note: 'Guaranteed, risk-free' },
            { label: 'PPF', rate: '7.10%', tax: 'EEE', col: '#4F7CFF', note: '15-yr lock-in' },
            { label: 'FD (SBI)', rate: '7.00%', tax: 'Taxable', col: '#FFB347', note: 'Flexible tenure' },
            { label: 'NPS Tier I', rate: '~10%', tax: 'EET', col: '#9B5DE5', note: 'Partial at 60' },
          ].map(x => `
            <div class="epf-compare-item">
              <div class="epf-compare-name">${x.label}</div>
              <div class="epf-compare-rate" style="color:${x.col}">${x.rate}</div>
              <div class="epf-compare-tax">${x.tax}</div>
              <div class="epf-compare-note">${x.note}</div>
            </div>`).join('')}
        </div>

        <a href="https://passbook.epfindia.gov.in/MemberPassBook/Login" target="_blank" rel="noopener" class="epf-passbook-link">
          📋 View EPFO Passbook →
        </a>
      </div>`;
  }

  /* ── Render: projection tab ─────────────────────────────────────── */
  function renderProjection(el) {
    if (!el) return;
    const bal    = gs('finos_epf_value');
    const basic  = gs('finos_epf_basic');
    const doj    = gss('finos_epf_doj');
    const retAge = gs('finos_epf_retire_age') || RETIRE_AGE_DEF;

    if (!bal || !basic || !doj) {
      el.innerHTML = `<div class="epf-empty">Enter EPF balance, Basic salary, and Date of Joining to see your retirement projection.</div>`;
      return;
    }

    const c    = calcContributions(basic);
    const age  = ageAt(doj, retAge);
    const proj = calcProjectedCorpus(bal, c.totalEPF, age.monthsToRetire);
    const pen  = calcEPSPension(age.totalServiceYears, basic);

    ss('finos_epf_projected', proj);
    ss('finos_epf_pension', pen);
    window.FinosContext?.update?.({ epfValue: bal, epfProjected: proj });

    // Monthly withdrawable at 4% SWR
    const monthlyDraw = Math.round(proj * 0.04 / 12);

    // Simple milestone projections (3yr, 5yr, 10yr)
    const milestones = [3, 5, 10].map(yr => ({
      yr, value: calcProjectedCorpus(bal, c.totalEPF, Math.min(yr * 12, age.monthsToRetire))
    })).filter(m => m.yr * 12 <= age.monthsToRetire);

    el.innerHTML = `
      <div class="epf-projection">

        <!-- Retirement hero -->
        <div class="epf-proj-hero">
          <div class="epf-proj-sub">Expected EPF corpus at retirement (age ${retAge})</div>
          <div class="epf-proj-val">${INR(proj)}</div>
          <div class="epf-proj-meta">
            ${yearsMonths(age.monthsToRetire)} to go
            · ${INR(c.totalEPF)}/mo contribution
            · 8.25% compounded
          </div>
        </div>

        <!-- Key numbers -->
        <div class="epf-proj-strip">
          <div class="epf-proj-item">
            <div class="epf-proj-lbl">Monthly SWR (4%)</div>
            <div class="epf-proj-num" style="color:#22D3A6">${INR(monthlyDraw)}/mo</div>
            <div class="epf-proj-note">Sustainable retirement draw</div>
          </div>
          <div class="epf-proj-item">
            <div class="epf-proj-lbl">EPS Pension (est.)</div>
            <div class="epf-proj-num" style="color:#4F7CFF">${INR(pen)}/mo</div>
            <div class="epf-proj-note">Based on ${Math.round(age.totalServiceYears)}yr service, ₹${Math.min(basic, EPS_WAGE_CAP).toLocaleString('en-IN')} pensionable salary</div>
          </div>
          <div class="epf-proj-item">
            <div class="epf-proj-lbl">Total retirement income</div>
            <div class="epf-proj-num" style="color:#c7f000">${INR(monthlyDraw + pen)}/mo</div>
            <div class="epf-proj-note">EPF SWR + EPS pension</div>
          </div>
        </div>

        <!-- Growth milestones -->
        ${milestones.length > 0 ? `
        <div class="epf-section-title">Growth Milestones</div>
        <div class="epf-milestone-row">
          <div class="epf-milestone current">
            <div class="epf-ms-dot"></div>
            <div class="epf-ms-lbl">Today</div>
            <div class="epf-ms-val">${INR(bal)}</div>
          </div>
          ${milestones.map(m => `
          <div class="epf-milestone">
            <div class="epf-ms-dot"></div>
            <div class="epf-ms-lbl">+${m.yr}yr</div>
            <div class="epf-ms-val">${INR(m.value)}</div>
          </div>`).join('')}
          <div class="epf-milestone retire">
            <div class="epf-ms-dot retire-dot"></div>
            <div class="epf-ms-lbl">Retirement</div>
            <div class="epf-ms-val">${INR(proj)}</div>
          </div>
        </div>` : ''}

        <!-- Voluntary PF (VPF) boost -->
        <div class="epf-vpf-box">
          <div class="epf-vpf-title">💡 Voluntary PF (VPF) — Boost Your Corpus</div>
          <p class="epf-vpf-body">
            VPF lets you contribute <strong>up to 100% of basic</strong> at the same 8.25% EPF rate —
            fully tax-free under Section 80C. Even ₹2,000/mo extra compounds to
            <strong>${INR(calcProjectedCorpus(0, 2000, age.monthsToRetire))} more</strong> at retirement.
          </p>
        </div>

        <!-- Assumption note -->
        <div class="epf-assumption-note">
          Assumptions: 8.25% interest p.a. compounded annually · Current salary · Continuous employment till retirement.
          EPS pension capped at 35 years pensionable service · Statutory formula.
        </div>
      </div>`;
  }

  /* ── Export ──────────────────────────────────────────────────────── */
  global.FinosEPFTracker = { renderForm, renderOverview, renderProjection, _autoSave, saveAll };

})(window);
