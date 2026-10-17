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
 *   finos_epf_dob         — date of birth ISO string
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
  const MAX_TRACKED_RUPEES = Number.MAX_SAFE_INTEGER / 100;
  function gs(k) {
    const raw = localStorage.getItem(k);
    if (raw == null || raw === '') return 0;
    if (!/^(?:\d+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(raw)) return 0;
    const digits = raw.replace(/,/g, ''), [whole, fraction = ''] = digits.split('.');
    try {
      const paise = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
      return paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) / 100 : 0;
    } catch (_) { return 0; }
  }
  function gss(k) { return localStorage.getItem(k) || ''; }
  function ss(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} }

  function readMoneyInput(id) {
    const raw = document.getElementById(id)?.value?.trim() || '';
    if (!raw) return 0;
    if (!/^(?:\d+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(raw)) return null;
    const digits = raw.replace(/,/g, ''), [whole, fraction = ''] = digits.split('.');
    try {
      const paise = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
      return paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) / 100 : null;
    } catch (_) { return null; }
  }

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

  function validPastDate(value) {
    if (typeof value !== 'string' || value.length !== 10 || value[4] !== '-' || value[7] !== '-') return false;
    if (![...value.slice(0, 4), ...value.slice(5, 7), ...value.slice(8)].every(c => c >= '0' && c <= '9')) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d), today = new Date();
    today.setHours(0, 0, 0, 0);
    return y >= 1900 && date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d && date <= today;
  }

  function ageAt(doj, dob, retireAge) {
    if (!validPastDate(doj) || !Number.isInteger(retireAge) || retireAge < 50 || retireAge > 65) return { yearsService: 0, monthsToRetire: 0, totalServiceYears: 0 };
    const [dy, dm, dd] = doj.split('-').map(Number);
    const dojDate = new Date(dy, dm - 1, dd);
    const now = new Date();
    const yearsService = (now - dojDate) / (365.25 * 24 * 3600 * 1000);
    if (!validPastDate(dob)) return { yearsService: Math.round(yearsService * 10) / 10, monthsToRetire: 0, totalServiceYears: 0 };
    const [by, bm, bd] = dob.split('-').map(Number);
    const birthDate = new Date(by, bm - 1, bd);
    if (birthDate > dojDate) return { yearsService: Math.round(yearsService * 10) / 10, monthsToRetire: 0, totalServiceYears: 0 };
    const targetYear = by + Math.floor(retireAge);
    const targetDay = Math.min(bd, new Date(targetYear, bm, 0).getDate());
    const retireDate = new Date(targetYear, bm - 1, targetDay);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthsToRetire = Math.max(0, Math.round((retireDate - today) / (30.44 * 24 * 3600 * 1000)));
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
    if (![currentBalance, monthlyEPFContrib].every(n => Number.isFinite(n) && n >= 0 && n <= MAX_TRACKED_RUPEES)
      || !Number.isInteger(monthsToRetire) || monthsToRetire < 0 || monthsToRetire > 1200) return null;
    // Monthly contributions, interest compounded annually in April
    const r = EPF_INTEREST / 100;
    let balance = currentBalance;
    for (let m = 0; m < monthsToRetire; m++) {
      balance += monthlyEPFContrib;
      if ((m + 1) % 12 === 0) {
        balance *= (1 + r);
      }
      if (!Number.isFinite(balance) || balance > MAX_TRACKED_RUPEES) return null;
    }
    // Apply remaining partial-year interest
    const partialMonths = monthsToRetire % 12;
    if (partialMonths > 0) {
      balance += balance * r * (partialMonths / 12);
    }
    if (!Number.isFinite(balance) || balance > MAX_TRACKED_RUPEES) return null;
    return Math.round(balance);
  }

  function calcEPSPension(yearsService, avgBasic) {
    // EPS formula: (Pensionable Salary × Pensionable Service) / 70
    const pensionSalary = Math.min(avgBasic, EPS_WAGE_CAP);
    return Math.round((pensionSalary * Math.min(35, yearsService)) / 70);
  }

  /* ── Save data from form ─────────────────────────────────────────── */
  function saveAll() {
    const bal     = readMoneyInput('epf-balance');
    const basic   = readMoneyInput('epf-basic');
    const doj     = document.getElementById('epf-doj')?.value  || '';
    const dob     = document.getElementById('epf-dob')?.value  || '';
    const uan     = document.getElementById('epf-uan')?.value  || '';
    const retAge  = parseFloat(document.getElementById('epf-retire-age')?.value || RETIRE_AGE_DEF) || RETIRE_AGE_DEF;

    if (bal === null || basic === null) {
      for (const id of ['epf-balance', 'epf-basic']) {
        const field = document.getElementById(id);
        if (field) { field.setAttribute('aria-invalid', 'true'); field.reportValidity?.(); }
      }
      return;
    }
    for (const id of ['epf-balance', 'epf-basic']) document.getElementById(id)?.removeAttribute('aria-invalid');

    ss('finos_epf_value', bal);
    ss('finos_epf_basic', basic);
    ss('finos_epf_doj', doj);
    ss('finos_epf_dob', dob);
    ss('finos_epf_uan', uan);
    ss('finos_epf_retire_age', retAge);

    // Compute projections
    if (bal >= 0 && basic > 0 && validPastDate(doj) && validPastDate(dob) && dob <= doj && Number.isInteger(retAge) && retAge >= 50 && retAge <= 65) {
      const c   = calcContributions(basic);
      const age = ageAt(doj, dob, retAge);
      const proj = calcProjectedCorpus(bal, c.totalEPF, age.monthsToRetire);
      const pen  = calcEPSPension(age.totalServiceYears, basic);
      if (proj === null) {
        ss('finos_epf_projected', 0);
        ss('finos_epf_pension', 0);
        window.FinosContext?.update?.({ epfValue: bal, epfProjected: 0 });
      } else {
        ss('finos_epf_projected', proj);
        ss('finos_epf_pension', pen);
        window.FinosContext?.update?.({ epfValue: bal, epfProjected: proj });
      }
    } else {
      ss('finos_epf_projected', 0);
      ss('finos_epf_pension', 0);
      window.FinosContext?.update?.({ epfValue: bal, epfProjected: 0 });
    }

    // Refresh both panels
    const ov = document.getElementById('epf-panel-overview');
    const pr = document.getElementById('epf-panel-projection');
    if (ov && ov.style.display !== 'none') renderOverview(ov);
    if (pr && pr.style.display !== 'none') renderProjection(pr);
  }

  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* ── Render: input form ─────────────────────────────────────────── */
  function renderForm(el) {
    if (!el) return;
    const bal    = gs('finos_epf_value');
    const basic  = gs('finos_epf_basic');
    const doj    = gss('finos_epf_doj');
    const dob    = gss('finos_epf_dob');
    const uan    = gss('finos_epf_uan');
    const ret    = gs('finos_epf_retire_age') || RETIRE_AGE_DEF;

    el.innerHTML = `
      <div class="epf-form">
        <div class="epf-form-title">Your EPF Details</div>
        <div class="epf-form-hint">Find your balance in EPFO passbook (passbook.epfindia.gov.in) or UMANG app.</div>

        <div class="epf-field-grid">
          <div class="epf-field">
            <label>Current EPF Balance (₹)</label>
            <input type="number" id="epf-balance" class="epf-inp" value="${bal || ''}" placeholder="e.g. 850000" min="0" step="0.01"
              oninput="FinosEPFTracker._autoSave()">
          </div>
          <div class="epf-field">
            <label>Monthly Basic + DA (₹)</label>
            <input type="number" id="epf-basic" class="epf-inp" value="${basic || ''}" placeholder="e.g. 45000" min="0" step="0.01"
              oninput="FinosEPFTracker._autoSave()">
          </div>
          <div class="epf-field">
            <label>Date of Joining (DOJ)</label>
            <input type="date" id="epf-doj" class="epf-inp" value="${esc(doj)}"
              onchange="FinosEPFTracker._autoSave()">
          </div>
          <div class="epf-field">
            <label>Date of Birth</label>
            <input type="date" id="epf-dob" class="epf-inp" value="${esc(dob)}" onchange="FinosEPFTracker._autoSave()" aria-describedby="epf-dob-help">
            <small id="epf-dob-help">Used to calculate your retirement date; no joining-age assumption is made.</small>
          </div>
          <div class="epf-field">
            <label>Retirement Age</label>
            <input type="number" id="epf-retire-age" class="epf-inp" value="${ret}" placeholder="58" min="50" max="65" step="1"
              onchange="FinosEPFTracker._autoSave()">
          </div>
          <div class="epf-field">
            <label>UAN (optional)</label>
            <input type="text" id="epf-uan" class="epf-inp" value="${esc(uan)}" placeholder="100XXXXXXXXXXX" maxlength="20"
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
    const age  = doj ? ageAt(doj, gss('finos_epf_dob'), gs('finos_epf_retire_age') || RETIRE_AGE_DEF) : { yearsService: 0 };
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
          <div class="epf-balance-badge">Projection assumption: 8.25% p.a. for FY 2025-26</div>
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
            <div class="epf-int-lbl">Annual amount added to EPF</div>
            <div class="epf-int-val">${INR(annualTotal)}</div>
          </div>
          <div>
            <div class="epf-int-lbl">Tax status</div>
            <div class="epf-int-val">Conditional — tax limits and withdrawal rules apply</div>
          </div>
        </div>
        <p class="epf-assumption-note">Tax treatment depends on your circumstances. Interest attributable to employee contributions above ₹2.5 lakh in a year may be taxable (₹5 lakh in specified cases where the employer does not contribute); withdrawal exemptions have service conditions. <a href="https://wmstatic-prd.incometaxindia.gov.in/web/guest/w/taxability-of-retirement-benefits" target="_blank" rel="noopener">See Income Tax Department rules</a>.</p>

        <!-- EPF vs alternatives -->
        <div class="epf-section-title" style="margin-top:24px;">Compare the account rules</div>
        <div class="epf-compare-grid">
          ${[
            { label: 'EPF', rate: 'Annual rate', tax: 'Conditional tax treatment', col: '#22D3A6', note: 'Rate is declared for each financial year' },
            { label: 'PPF', rate: 'Quarterly rate', tax: 'Scheme rules apply', col: '#4F7CFF', note: '15-year scheme tenure' },
            { label: 'Bank FD', rate: 'Bank and tenure vary', tax: 'Interest is taxable', col: '#FFB347', note: 'Check the bank’s current offer' },
            { label: 'NPS Tier I', rate: 'Market-linked', tax: 'Withdrawal rules apply', col: '#9B5DE5', note: 'Returns are not guaranteed' },
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
    const dob    = gss('finos_epf_dob');
    const retAge = gs('finos_epf_retire_age') || RETIRE_AGE_DEF;

    if (!basic || !validPastDate(doj) || !validPastDate(dob) || dob > doj || !Number.isInteger(retAge) || retAge < 50 || retAge > 65) {
      ss('finos_epf_projected', 0);
      ss('finos_epf_pension', 0);
      window.FinosContext?.update?.({ epfValue: bal, epfProjected: 0 });
      el.innerHTML = `<div class="epf-empty">Enter EPF balance, Basic salary, Date of Joining, and a valid Date of Birth on or before joining to see your retirement projection.</div>`;
      return;
    }

    const c    = calcContributions(basic);
    const age  = ageAt(doj, dob, retAge);
    const proj = calcProjectedCorpus(bal, c.totalEPF, age.monthsToRetire);
    const pen  = calcEPSPension(age.totalServiceYears, basic);

    if (proj === null) {
      ss('finos_epf_projected', 0);
      ss('finos_epf_pension', 0);
      window.FinosContext?.update?.({ epfValue: bal, epfProjected: 0 });
      el.innerHTML = `<div class="epf-empty">These inputs produce a projection outside the supported calculation range. Reduce the balance or monthly basic pay and try again.</div>`;
      return;
    }

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
            · 8.25% assumed annual rate (FY 2025-26)
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
            Ask your payroll team about voluntary PF contributions and limits. Any 80C deduction depends on eligibility,
            the chosen tax regime and the shared annual limit; interest tax rules can also apply. Even ₹2,000/mo extra compounds to
            <strong>${INR(calcProjectedCorpus(0, 2000, age.monthsToRetire))} more</strong> at retirement.
          </p>
        </div>

        <!-- Assumption note -->
        <div class="epf-assumption-note">
          Assumptions: 8.25% annual rate for FY 2025-26 used as a future estimate · Current salary · Continuous employment till retirement.
          EPS pension capped at 35 years pensionable service · Statutory formula.
        </div>
      </div>`;
  }

  /* ── Export ──────────────────────────────────────────────────────── */
  global.FinosEPFTracker = { renderForm, renderOverview, renderProjection, _autoSave, saveAll };

})(window);
