/* finos-ppf-tracker.js — PPF & Small Savings Tracker
 *
 * Instruments supported:
 *   PPF  — 15-yr lock-in, 7.1% p.a. compounded annually (Apr), ₹500–₹1.5L/yr, tax-free maturity
 *   SSY  — Sukanya Samriddhi Yojana, 8.2% p.a., 21 yr / girl's marriage, ₹250–₹1.5L/yr
 *   NSC  — National Savings Certificate, 7.7% p.a. compounded half-yearly, 5-yr lock-in, taxable maturity
 *   SCSS — Senior Citizens Savings Scheme, 8.2% p.a. quarterly payout, 5+3 yr, age 60+
 *   KVP  — Kisan Vikas Patra, 7.5% p.a. compounded, ~115 months to double
 *
 * Public API (window.FinosPPFTracker):
 *   renderOverview(el)    — portfolio summary + all accounts
 *   renderProjection(el)  — maturity projection table + comparison chart
 *   renderTax(el)         — 80C deduction breakdown
 *
 * localStorage written:
 *   finos_ppf_portfolio   — JSON array of accounts
 *   finos_ppf_value       — total current value across all accounts
 *   finos_ppf_80c         — total annual contribution eligible for 80C
 */
window.FinosPPFTracker = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, v);
  const ls  = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');

  /* ── Instrument metadata ─────────────────────────────────────── */
  const INSTRUMENTS = {
    PPF:  { name: 'Public Provident Fund',            rate: 7.1,  compounding: 'annual',      maxYrs: 15, minAmt: 500,    maxAmt: 150000, taxFree: true,  c80c: true,  color: '#00D4FF' },
    SSY:  { name: 'Sukanya Samriddhi Yojana',         rate: 8.2,  compounding: 'annual',      maxYrs: 21, minAmt: 250,    maxAmt: 150000, taxFree: true,  c80c: true,  color: '#9B5DE5' },
    NSC:  { name: 'National Savings Certificate',     rate: 7.7,  compounding: 'half-yearly', maxYrs: 5,  minAmt: 1000,   maxAmt: null,   taxFree: false, c80c: true,  color: '#FFB347' },
    SCSS: { name: 'Senior Citizens Savings Scheme',   rate: 8.2,  compounding: 'quarterly',   maxYrs: 5,  minAmt: 1000,   maxAmt: 3000000,taxFree: false, c80c: true,  color: '#22D3A6' },
    KVP:  { name: 'Kisan Vikas Patra',                rate: 7.5,  compounding: 'annual',      maxYrs: 9.6,minAmt: 1000,   maxAmt: null,   taxFree: false, c80c: false, color: '#EF4444' },
  };

  /* ── Compound interest ───────────────────────────────────────── */
  function _maturityValue(principal, ratePA, type, years) {
    const r = ratePA / 100;
    switch (type) {
      case 'half-yearly': return Math.round(principal * Math.pow(1 + r / 2, years * 2));
      case 'quarterly':   return Math.round(principal * Math.pow(1 + r / 4, years * 4));
      default:            return Math.round(principal * Math.pow(1 + r, years));
    }
  }

  /* ── PPF annual-deposit projection (deposited every year, grows) */
  function _ppfProjection(currentBalance, annualDeposit, yearsLeft, rate) {
    let bal = currentBalance;
    const r = rate / 100;
    for (let y = 0; y < yearsLeft; y++) {
      bal = (bal + annualDeposit) * (1 + r);
    }
    return Math.round(bal);
  }

  /* ── Load/save accounts ──────────────────────────────────────── */
  function _load() { return ls('finos_ppf_portfolio') || []; }
  function _save(accounts) {
    localStorage.setItem('finos_ppf_portfolio', JSON.stringify(accounts));
    _recompute(accounts);
  }
  function _recompute(accounts) {
    accounts = accounts || _load();
    const total = accounts.reduce((s, a) => s + (a.currentBalance || 0), 0);
    const c80c  = accounts.filter(a => INSTRUMENTS[a.type]?.c80c)
                          .reduce((s, a) => s + Math.min(a.annualDeposit || 0, INSTRUMENTS[a.type]?.maxAmt || Infinity), 0);
    ss('finos_ppf_value', total);
    ss('finos_ppf_80c',   c80c);
    if (window.FinosContext?.update) window.FinosContext.update({ ppfValue: total });
    return { total, c80c };
  }

  /* ── Add/delete ──────────────────────────────────────────────── */
  function _add(type, nickname, currentBalance, annualDeposit, openDate) {
    const accounts = _load();
    accounts.push({ id: Date.now(), type, nickname, currentBalance: +currentBalance, annualDeposit: +annualDeposit, openDate });
    _save(accounts);
  }
  function _delete(id) {
    _save(_load().filter(a => a.id !== id));
  }

  /* ══════════════════════════════════════════════════════════════
     OVERVIEW RENDERER
  ══════════════════════════════════════════════════════════════ */
  function renderOverview(container) {
    if (!container) return;

    const accounts = _load();
    const { total, c80c } = _recompute(accounts);

    const typeBreakdown = {};
    accounts.forEach(a => {
      typeBreakdown[a.type] = (typeBreakdown[a.type] || 0) + (a.currentBalance || 0);
    });

    const typeRows = Object.entries(typeBreakdown).map(([t, v]) => {
      const inst = INSTRUMENTS[t];
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:10px;margin-bottom:5px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${inst.color};"></div>
          <span style="font-size:13px;color:#F5F7FA;">${inst.name}</span>
          <span style="font-size:11px;color:rgba(255,255,255,.35);">${inst.rate}% p.a.</span>
        </div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;font-weight:800;color:${inst.color};">${INR(v)}</div>
      </div>`;
    }).join('');

    const acctCards = accounts.map(a => {
      const inst = INSTRUMENTS[a.type] || {};
      const openYr = a.openDate ? new Date(a.openDate).getFullYear() : null;
      const ageYrs = openYr ? new Date().getFullYear() - openYr : null;
      const yearsLeft = inst.maxYrs && ageYrs !== null ? Math.max(inst.maxYrs - ageYrs, 0) : null;
      const projected = (a.type === 'PPF' || a.type === 'SSY')
        ? (yearsLeft > 0 ? _ppfProjection(a.currentBalance, a.annualDeposit || 0, yearsLeft, inst.rate) : a.currentBalance)
        : _maturityValue(a.currentBalance, inst.rate, inst.compounding, yearsLeft || inst.maxYrs || 5);

      return `<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-left:3px solid ${inst.color};border-radius:14px;padding:16px 18px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-size:14px;font-weight:800;color:#F5F7FA;">${a.nickname || inst.name}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px;">${a.type} · ${inst.rate}% p.a. · ${inst.compounding} compounding</div>
          </div>
          <button onclick="window.FinosPPFTracker._delete(${a.id});window.FinosPPFTracker.renderOverview(document.getElementById('ppf-panel-overview'));"
            style="background:none;border:none;cursor:pointer;font-size:13px;color:rgba(255,255,255,.2);transition:color .2s;" onmouseover="this.style.color='#EF4444'" onmouseout="this.style.color='rgba(255,255,255,.2)'">✕</button>
        </div>
        <div style="display:flex;gap:20px;margin-top:12px;flex-wrap:wrap;">
          <div><div style="font-size:10px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">Current Balance</div>
            <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:900;color:${inst.color};">${INR(a.currentBalance)}</div></div>
          ${a.annualDeposit ? `<div><div style="font-size:10px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">Annual Deposit</div>
            <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:900;color:rgba(255,255,255,.7);">${INR(a.annualDeposit)}</div></div>` : ''}
          ${yearsLeft !== null ? `<div><div style="font-size:10px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">Years Left</div>
            <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:900;color:rgba(255,255,255,.7);">${yearsLeft}</div></div>` : ''}
          <div><div style="font-size:10px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px;">Projected Maturity</div>
            <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:900;color:#22D3A6;">${INR(projected)}</div></div>
        </div>
        ${inst.taxFree ? '<div style="margin-top:8px;font-size:11px;color:#22D3A6;">✓ EEE — Maturity tax-free (80C + growth exempt)</div>'
          : '<div style="margin-top:8px;font-size:11px;color:#FFB347;">⚠ Maturity taxable as per income slab</div>'}
      </div>`;
    }).join('');

    container.innerHTML = `
<style>
.ppf-hero{background:linear-gradient(135deg,rgba(0,212,255,.07),rgba(34,211,166,.04));border:1px solid rgba(0,212,255,.18);border-radius:20px;padding:24px;margin-bottom:20px;}
.ppf-hero-lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;}
.ppf-hero-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:42px;font-weight:900;color:#00D4FF;letter-spacing:-1px;line-height:1;}
.ppf-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:12px;margin-bottom:22px;}
.ppf-stat{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;text-align:center;}
.ppf-stat-lbl{font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;}
.ppf-stat-val{font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:18px;font-weight:800;color:#fff;}
.ppf-form{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px;margin-bottom:20px;}
.ppf-sec{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.4);margin:0 0 12px;}
.ppf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:14px;}
.ppf-field{display:flex;flex-direction:column;gap:6px;}
.ppf-field label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:rgba(255,255,255,.4);}
.ppf-inp{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;color:#fff;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:14px;padding:10px 14px;width:100%;box-sizing:border-box;outline:none;transition:border-color .2s;}
.ppf-inp:focus{border-color:rgba(0,212,255,.5);background:rgba(0,212,255,.05);}
.ppf-add-btn{display:block;width:100%;padding:13px;border-radius:12px;background:linear-gradient(135deg,rgba(0,212,255,.12),rgba(0,212,255,.06));border:1px solid rgba(0,212,255,.3);color:#00D4FF;font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:800;cursor:pointer;transition:all .25s;}
.ppf-add-btn:hover{box-shadow:0 0 0 1px rgba(0,212,255,.3),0 6px 20px rgba(0,212,255,.1);}
[data-theme="light"] .ppf-hero{background:rgba(0,212,255,.05);}
[data-theme="light"] .ppf-stat,.ppf-form{background:#fff;border-color:rgba(0,0,0,.08);}
[data-theme="light"] .ppf-inp{background:#F4F6FB;border-color:rgba(0,0,0,.12);color:#0B0D12;}
[data-theme="light"] .ppf-stat-val,.ppf-hero-val{color:#0B0D12;}
</style>

<div class="ppf-hero">
  <div class="ppf-hero-lbl">Total Small Savings Corpus</div>
  <div class="ppf-hero-val">${INR(total)}</div>
  <div style="font-size:13px;color:rgba(255,255,255,.4);margin-top:8px;">${accounts.length} account${accounts.length!==1?'s':''} tracked · ₹${Math.min(c80c,150000).toLocaleString('en-IN')} eligible for 80C this year</div>
</div>

<div class="ppf-stats">
  <div class="ppf-stat" style="border-color:rgba(0,212,255,.2);">
    <div class="ppf-stat-lbl">Total Corpus</div>
    <div class="ppf-stat-val" style="color:#00D4FF;">${INR(total)}</div>
  </div>
  <div class="ppf-stat" style="border-color:rgba(34,211,166,.2);">
    <div class="ppf-stat-lbl">80C Eligible / yr</div>
    <div class="ppf-stat-val" style="color:#22D3A6;">${INR(Math.min(c80c, 150000))}</div>
    <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:3px;">of ₹1.5L limit</div>
  </div>
  <div class="ppf-stat" style="border-color:rgba(155,93,229,.2);">
    <div class="ppf-stat-lbl">Accounts</div>
    <div class="ppf-stat-val" style="color:#9B5DE5;">${accounts.length}</div>
  </div>
  <div class="ppf-stat" style="border-color:rgba(255,179,71,.2);">
    <div class="ppf-stat-lbl">Annual Deposits</div>
    <div class="ppf-stat-val" style="color:#FFB347;">${INR(accounts.reduce((s,a)=>s+(a.annualDeposit||0),0))}</div>
  </div>
</div>

${accounts.length ? `
<div style="margin-bottom:20px;">
  <p class="ppf-sec">Your Accounts</p>
  ${typeRows ? `<div style="margin-bottom:14px;">${typeRows}</div>` : ''}
  ${acctCards}
</div>` : ''}

<div class="ppf-form">
  <p class="ppf-sec">Add Account</p>
  <div class="ppf-grid">
    <div class="ppf-field">
      <label>Instrument</label>
      <select class="ppf-inp" id="ppf-type">
        ${Object.entries(INSTRUMENTS).map(([k,v])=>`<option value="${k}">${k} — ${v.name}</option>`).join('')}
      </select>
    </div>
    <div class="ppf-field">
      <label>Nickname (optional)</label>
      <input class="ppf-inp" type="text" id="ppf-nick" placeholder="e.g. My PPF SBI">
    </div>
    <div class="ppf-field">
      <label>Current Balance (₹)</label>
      <input class="ppf-inp" type="number" min="0" step="1000" id="ppf-bal" placeholder="0">
    </div>
    <div class="ppf-field">
      <label>Annual Deposit (₹)</label>
      <input class="ppf-inp" type="number" min="0" step="500" id="ppf-dep" placeholder="0">
    </div>
    <div class="ppf-field">
      <label>Account Opening Date</label>
      <input class="ppf-inp" type="date" id="ppf-date">
    </div>
  </div>
  <button class="ppf-add-btn" onclick="_ppfAdd()">+ Add Account</button>
</div>

<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:16px;font-size:12px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(255,255,255,.4);margin-bottom:10px;">Current Interest Rates (Q1 FY 2025-26)</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;">
    ${Object.entries(INSTRUMENTS).map(([k,v])=>`
      <div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid rgba(255,255,255,.05);">
        <span style="color:${v.color};font-weight:700;font-size:12px;">${k}</span>
        <span style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:rgba(255,255,255,.7);">${v.rate}%</span>
        <span style="font-size:10px;color:rgba(255,255,255,.35);">${v.c80c?'80C':'—'} ${v.taxFree?'EEE':''}</span>
      </div>`).join('')}
  </div>
</div>

<script>
function _ppfAdd(){
  const t=document.getElementById('ppf-type').value;
  const n=document.getElementById('ppf-nick').value;
  const b=parseFloat(document.getElementById('ppf-bal').value)||0;
  const d=parseFloat(document.getElementById('ppf-dep').value)||0;
  const dt=document.getElementById('ppf-date').value;
  if(!b&&!d){alert('Enter at least a balance or annual deposit.');return;}
  window.FinosPPFTracker._add(t,n,b,d,dt);
  window.FinosPPFTracker.renderOverview(document.getElementById('ppf-panel-overview'));
}
</script>`;
  }

  /* ══════════════════════════════════════════════════════════════
     PROJECTION TAB
  ══════════════════════════════════════════════════════════════ */
  function renderProjection(container) {
    if (!container) return;
    const accounts = _load();

    if (!accounts.length) {
      container.innerHTML = '<div style="text-align:center;padding:36px;color:rgba(255,255,255,.35);font-size:13px;">Add at least one account in the Overview tab to see projections.</div>';
      return;
    }

    const rows = accounts.map(a => {
      const inst = INSTRUMENTS[a.type] || {};
      const openYr = a.openDate ? new Date(a.openDate).getFullYear() : null;
      const ageYrs = openYr ? new Date().getFullYear() - openYr : null;
      const yearsLeft = inst.maxYrs && ageYrs !== null ? Math.max(inst.maxYrs - ageYrs, 0) : inst.maxYrs || 5;
      const maturityYr = openYr ? openYr + inst.maxYrs : new Date().getFullYear() + yearsLeft;
      const projected = (a.type === 'PPF' || a.type === 'SSY')
        ? _ppfProjection(a.currentBalance, a.annualDeposit || 0, yearsLeft, inst.rate)
        : _maturityValue(a.currentBalance, inst.rate, inst.compounding, yearsLeft);
      const gain = projected - a.currentBalance;

      return `<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 1fr;padding:12px 14px;font-size:13px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px;margin-bottom:6px;align-items:center;gap:8px;flex-wrap:wrap;">
        <div>
          <div style="font-weight:700;color:#F5F7FA;">${a.nickname || inst.name}</div>
          <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:2px;">${a.type} · ${inst.rate}% · matures ${maturityYr}</div>
        </div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);color:rgba(255,255,255,.7);">${INR(a.currentBalance)}</div>
        <div style="color:rgba(255,255,255,.5);">${yearsLeft} yr</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);color:#22D3A6;font-weight:800;">${INR(projected)}</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);color:#4F7CFF;">${INR(gain)}</div>
      </div>`;
    }).join('');

    const totalProjected = accounts.reduce((s, a) => {
      const inst = INSTRUMENTS[a.type] || {};
      const openYr = a.openDate ? new Date(a.openDate).getFullYear() : null;
      const ageYrs = openYr ? new Date().getFullYear() - openYr : null;
      const yearsLeft = inst.maxYrs && ageYrs !== null ? Math.max(inst.maxYrs - ageYrs, 0) : inst.maxYrs || 5;
      return s + ((a.type === 'PPF' || a.type === 'SSY')
        ? _ppfProjection(a.currentBalance, a.annualDeposit || 0, yearsLeft, inst.rate)
        : _maturityValue(a.currentBalance, inst.rate, inst.compounding, yearsLeft));
    }, 0);

    container.innerHTML = `
<div style="background:rgba(34,211,166,.06);border:1px solid rgba(34,211,166,.18);border-radius:18px;padding:20px;margin-bottom:20px;">
  <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;">Total Projected Maturity Value</div>
  <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:38px;font-weight:900;color:#22D3A6;">${INR(totalProjected)}</div>
  <div style="font-size:13px;color:rgba(255,255,255,.4);margin-top:6px;">across ${accounts.length} account${accounts.length!==1?'s':''} at respective maturity dates</div>
</div>

<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 1fr;padding:8px 14px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.35);">
  <span>Account</span><span>Current</span><span>Years Left</span><span>At Maturity</span><span>Gain</span>
</div>
${rows}`;
  }

  /* ══════════════════════════════════════════════════════════════
     TAX TAB
  ══════════════════════════════════════════════════════════════ */
  function renderTax(container) {
    if (!container) return;
    const accounts = _load();
    const eligible = accounts.filter(a => INSTRUMENTS[a.type]?.c80c);
    const totalDeposits = eligible.reduce((s, a) => s + (a.annualDeposit || 0), 0);
    const c80cUsed = Math.min(totalDeposits, 150000);
    const existingC80c = gs('finos_80c_used') || 0;
    const remaining80c = Math.max(150000 - existingC80c - c80cUsed, 0);

    const rows = eligible.map(a => {
      const inst = INSTRUMENTS[a.type];
      const claimable = Math.min(a.annualDeposit || 0, inst.maxAmt || Infinity);
      return `<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;padding:11px 14px;font-size:13px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:10px;margin-bottom:5px;align-items:center;gap:8px;">
        <div style="font-weight:700;color:#F5F7FA;">${a.nickname||inst.name}<span style="font-size:10px;color:rgba(255,255,255,.35);margin-left:6px;">${a.type}</span></div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);color:rgba(255,255,255,.7);">${INR(a.annualDeposit||0)}</div>
        <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);color:#4F7CFF;">${INR(claimable)}</div>
        <div style="font-size:11px;color:${inst.taxFree?'#22D3A6':'#FFB347'};">${inst.taxFree?'EEE — full exemption':'Taxable at maturity'}</div>
      </div>`;
    }).join('');

    container.innerHTML = `
<div style="background:rgba(79,124,255,.06);border:1px solid rgba(79,124,255,.18);border-radius:20px;padding:24px;margin-bottom:22px;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;">
  <div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;">Annual Deposits (80C eligible)</div>
    <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:28px;font-weight:900;color:#4F7CFF;">${INR(c80cUsed)}</div>
    <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:4px;">of ₹1.5L 80C limit</div>
  </div>
  <div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;">80C Remaining Capacity</div>
    <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:28px;font-weight:900;color:${remaining80c>0?'#FFB347':'#22D3A6'};">${INR(remaining80c)}</div>
    <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:4px;">${remaining80c>0?'can still invest for deduction':'80C maxed ✓'}</div>
  </div>
  <div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:rgba(255,255,255,.4);margin-bottom:6px;">Tax Saved @30%</div>
    <div style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:28px;font-weight:900;color:#22D3A6;">${INR(Math.round(c80cUsed * 0.312))}</div>
    <div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:4px;">approx (30% slab + cess)</div>
  </div>
</div>

${eligible.length ? `
<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;padding:8px 14px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.35);">
  <span>Instrument</span><span>Deposit/yr</span><span>80C Claimable</span><span>Tax Treatment</span>
</div>
${rows}` : '<div style="color:rgba(255,255,255,.35);font-size:13px;padding:16px 0;">Add accounts in Overview tab to see tax breakdown.</div>'}

<div style="background:rgba(255,179,71,.05);border:1px solid rgba(255,179,71,.12);border-radius:14px;padding:18px;margin-top:20px;">
  <div style="font-size:13px;font-weight:800;color:#FFB347;margin-bottom:12px;">Small Savings Tax Guide</div>
  <div style="display:flex;flex-direction:column;gap:7px;font-size:13px;color:rgba(255,255,255,.65);line-height:1.65;">
    <span>🟢 <b>PPF & SSY</b>: Triple exempt (EEE) — 80C deduction, corpus growth tax-free, maturity tax-free.</span>
    <span>🟡 <b>NSC</b>: 80C on deposit; interest accrues and is also deemed re-invested (80C eligible); maturity proceeds taxable.</span>
    <span>🟡 <b>SCSS</b>: 80C on deposit; quarterly interest is taxable as income; TDS if interest > ₹50,000/yr.</span>
    <span>🔴 <b>KVP</b>: No 80C benefit; maturity proceeds taxable as income.</span>
    <span>💡 PPF contribution deadline: <b>April 5</b> each year — deposit before April 5 to earn interest for the full month of April.</span>
    <span>💡 NSC interest for years 1–4 is <b>eligible for 80C</b> as deemed reinvestment — claim it even if no fresh investment.</span>
  </div>
</div>`;
  }

  /* Public */
  return { renderOverview, renderProjection, renderTax, _add, _delete, _recompute };
})();
