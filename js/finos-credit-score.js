/* finos-credit-score.js — Credit Score Tracker & CIBIL Tips
 *
 * Helps users track and improve their CIBIL/credit score (300-900 scale).
 * Since live CIBIL API access is not available in a local-first app, this
 * module works from user-entered score + derived indicators.
 *
 * Score factors (CIBIL weighting):
 *   Payment History       35%  — on-time vs late payments
 *   Credit Utilization    30%  — outstanding / credit limit
 *   Credit Age            15%  — age of oldest account
 *   Credit Mix            10%  — secured + unsecured mix
 *   Hard Inquiries         5%  — recent applications
 *   (New Accounts)         5%  — new credit accounts
 *
 * Home loan rate impact by score band:
 *   750+ → best rate · 700-749 → +0.25% · 650-699 → +0.50% · <650 → +1%+
 *
 * localStorage written:
 *   finos_cibil_score       — user's CIBIL score
 *   finos_credit_util_pct   — credit utilization %
 *   finos_credit_health     — 'good' | 'fair' | 'poor'
 *
 * Exported: window.FinosCreditScore
 */
window.FinosCreditScore = (function () {
  'use strict';

  const gs  = k => parseFloat(localStorage.getItem(k)) || 0;
  const ss  = (k, v) => localStorage.setItem(k, String(v));
  const gss = k => localStorage.getItem(k) || '';

  /* ── Score bands ───────────────────────────────────────────────── */
  const BANDS = [
    { min:800, max:900, label:'Excellent',  color:'#22D3A6', icon:'🏆', hlRate:8.50,  desc:'You qualify for the best home loan rates and highest credit limits.' },
    { min:750, max:799, label:'Very Good',  color:'#4ADE80', icon:'✅', hlRate:8.75,  desc:'Strong credit profile. Minor improvements push you into the top tier.' },
    { min:700, max:749, label:'Good',       color:'#FFB347', icon:'👍', hlRate:9.00,  desc:'Most lenders will approve you, but premium rates need a higher score.' },
    { min:650, max:699, label:'Fair',       color:'#FFA07A', icon:'⚠️', hlRate:9.50,  desc:'Approvals possible but at higher rates. Focus on payment discipline.' },
    { min:600, max:649, label:'Poor',       color:'#FF6B6B', icon:'🚨', hlRate:10.50, desc:'Some lenders will decline. Secured cards and on-time payments help most.' },
    { min:300, max:599, label:'Very Poor',  color:'#FF3B3B', icon:'💀', hlRate:0,     desc:'Most credit applications will be declined. Start with a secured credit card.' },
  ];

  function _band(score) {
    return BANDS.find(b => score >= b.min && score <= b.max) || BANDS[BANDS.length - 1];
  }

  /* ── Improvement tips matrix ───────────────────────────────────── */
  const TIPS = {
    utilization: [
      { check: u => u > 30, priority:'HIGH', tip:'Reduce credit utilization below 30%', detail:`Your current utilization is above 30% — the key CIBIL threshold. Pay down balances or request a limit increase to drop below.`, impact:'+30-50 pts' },
      { check: u => u > 10, priority:'MED',  tip:'Push utilization below 10% for max score', detail:'Keeping utilization under 10% can add 15-25 points over 3-6 months.', impact:'+15-25 pts' },
    ],
    payments: [
      { priority:'HIGH', tip:'Never miss an EMI or credit card due date', detail:'A single 30-day late payment can drop your score by 50-100 points and stays on record for 7 years. Set auto-pay for the minimum amount.', impact:'Protect score' },
      { priority:'HIGH', tip:'Clear any existing delinquencies', detail:'Past-due accounts (DPD > 0) are the single biggest negative factor. Contact the lender, negotiate a settlement, and get a NOC/closure letter.', impact:'+50-100 pts' },
    ],
    age: [
      { priority:'LOW', tip:'Keep your oldest credit card open', detail:'Even if you don\'t use it, your oldest account raises the average credit age — a 15% scoring factor.', impact:'+5-15 pts' },
    ],
    inquiries: [
      { priority:'MED', tip:'Avoid multiple loan applications within 6 months', detail:'Each hard inquiry from a lender drops your score ~5-10 pts and stays visible for 2 years. Use pre-approval checks (soft inquiries) first.', impact:'+5-10 pts per avoided inquiry' },
    ],
    mix: [
      { priority:'LOW', tip:'Maintain a healthy mix of secured + unsecured credit', detail:'Having both a home/car loan (secured) and a credit card (unsecured) demonstrates credit maturity. Credit mix is 10% of the score.', impact:'+5-10 pts' },
    ],
  };

  /* ── Load / save inputs ────────────────────────────────────────── */
  function _loadInputs() {
    return {
      score:           parseInt(gss('finos_cibil_score')       || '720'),
      utilization:     parseFloat(gss('finos_credit_util_pct') || '35'),
      creditLimit:     parseFloat(gss('finos_credit_limit')    || '200000'),
      outstanding:     parseFloat(gss('finos_credit_outstanding')|| '70000'),
      oldestAgeYears:  parseFloat(gss('finos_credit_age_yrs')  || '3'),
      recentInquiries: parseInt(gss('finos_credit_inquiries')  || '2'),
      latePayments:    parseInt(gss('finos_credit_late')       || '0'),
      securedAccounts: parseInt(gss('finos_credit_secured')    || '1'),
      unsecuredAccounts:parseInt(gss('finos_credit_unsecured') || '1'),
    };
  }

  function _compute(p) {
    const b = _band(p.score);
    const health = p.score >= 750 ? 'good' : p.score >= 650 ? 'fair' : 'poor';
    ss('finos_cibil_score',     p.score);
    ss('finos_credit_util_pct', p.utilization);
    ss('finos_credit_health',   health);

    // Rate spread on ₹50L home loan over 20 years
    const baseRate = 8.50;
    const rateSpread = b.hlRate > 0 ? (b.hlRate - baseRate).toFixed(2) : 'N/A';

    // Extra interest cost from spread (₹50L, 20yr)
    let extraInterestCost = 0;
    if (b.hlRate > 0 && rateSpread !== 'N/A' && parseFloat(rateSpread) > 0) {
      const principal = 5000000;
      const years     = 20;
      const rBest = baseRate / 100 / 12;
      const rCurr = b.hlRate   / 100 / 12;
      const n     = years * 12;
      const emiBest = principal * rBest * Math.pow(1+rBest,n) / (Math.pow(1+rBest,n)-1);
      const emiCurr = principal * rCurr * Math.pow(1+rCurr,n) / (Math.pow(1+rCurr,n)-1);
      extraInterestCost = Math.round((emiCurr - emiBest) * n);
    }

    // Active tips
    const activeTips = [];
    if (p.utilization > 30) activeTips.push({ ...TIPS.utilization[0], category:'Utilization' });
    else if (p.utilization > 10) activeTips.push({ ...TIPS.utilization[1], category:'Utilization' });
    if (p.latePayments > 0) activeTips.push({ ...TIPS.payments[0], category:'Payments' });
    activeTips.push({ ...TIPS.payments[1], category:'Payments' });
    if (p.oldestAgeYears < 5) activeTips.push({ ...TIPS.age[0], category:'Credit Age' });
    if (p.recentInquiries >= 2) activeTips.push({ ...TIPS.inquiries[0], category:'Inquiries' });
    if (p.securedAccounts === 0 || p.unsecuredAccounts === 0) activeTips.push({ ...TIPS.mix[0], category:'Credit Mix' });

    // Score projection if top 3 tips done
    const scoreProjection = Math.min(850, p.score + (p.utilization > 30 ? 40 : p.utilization > 10 ? 20 : 0) + (p.latePayments > 0 ? 60 : 0) + (p.recentInquiries >= 2 ? 15 : 0));

    return { b, health, rateSpread, extraInterestCost, activeTips, scoreProjection };
  }

  /* ── Input row ──────────────────────────────────────────────────── */
  function _inp(id, label, val, min, max, step, unit, hint) {
    return `<div style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <label style="font-size:12px;font-weight:700;color:var(--text-secondary);">${label}</label>
        <div style="display:flex;align-items:center;gap:6px;">
          <input type="number" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"
            style="width:100px;background:var(--border-soft);border:1px solid var(--border-medium);border-radius:8px;color:var(--text-primary);font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;font-weight:800;padding:5px 10px;text-align:right;outline:none;"
            oninput="_csRecalc()">
          <span style="font-size:11px;color:var(--text-muted);">${unit}</span>
        </div>
      </div>
      ${hint ? `<div style="font-size:11px;color:var(--text-muted);">${hint}</div>` : ''}
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     SCORE DASHBOARD TAB
  ══════════════════════════════════════════════════════════════ */
  function renderDashboard(container) {
    if (!container) return;
    const p = _loadInputs();
    const c = _compute(p);
    const scorePct = ((p.score - 300) / 600) * 100;
    const INR = v => '₹' + Math.abs(Math.round(v)).toLocaleString('en-IN');

    const bandBars = BANDS.slice().reverse().map(b => {
      const isActive = p.score >= b.min && p.score <= b.max;
      return `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;background:${isActive ? 'var(--border-soft)' : 'transparent'};border:1px solid ${isActive ? 'var(--border-medium)' : 'transparent'};">
        <div style="font-size:14px;">${b.icon}</div>
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;font-weight:${isActive?800:600};color:${isActive?b.color:'var(--text-muted)'};">${b.label}</span>
            <span style="font-size:11px;color:var(--text-muted);">${b.min}–${b.max}</span>
          </div>
          <div style="margin-top:4px;background:var(--border-soft);border-radius:3px;height:4px;overflow:hidden;">
            <div style="height:100%;width:${((b.max - 300) / 600 * 100).toFixed(0)}%;background:${b.color};opacity:${isActive ? 1 : 0.25};border-radius:3px;"></div>
          </div>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = `
<style>
.cs-box{background:var(--border-soft);border:1px solid var(--border-soft);border-radius:16px;padding:20px;margin-bottom:16px;}
</style>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
  <!-- Score card -->
  <div class="cs-box" style="border-color:rgba(${c.b.color === '#22D3A6' ? '34,211,166' : c.b.color === '#4ADE80' ? '74,222,128' : c.b.color === '#FFB347' ? '255,179,71' : '255,107,107'},.2);">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:10px;">Your CIBIL Score</div>
    <!-- Score gauge -->
    <div style="position:relative;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div id="cs-score-badge" style="width:90px;height:90px;border-radius:50%;background:conic-gradient(${c.b.color} 0% ${scorePct.toFixed(1)}%, var(--border-soft) ${scorePct.toFixed(1)}% 100%);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <div style="width:70px;height:70px;border-radius:50%;background:var(--bg,#0A0B0F);display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div id="cs-score-num" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:22px;font-weight:900;color:${c.b.color};">${p.score}</div>
          </div>
        </div>
        <div>
          <div id="cs-band-label" style="font-size:20px;font-weight:900;color:${c.b.color};">${c.b.icon} ${c.b.label}</div>
          <div id="cs-band-desc" style="font-size:11px;color:var(--text-muted);margin-top:4px;line-height:1.5;">${c.b.desc}</div>
          ${c.scoreProjection > p.score ? `<div style="margin-top:8px;font-size:11px;color:#22D3A6;">With top fixes → <strong>${c.scoreProjection}</strong> possible</div>` : ''}
        </div>
      </div>
    </div>
    ${_inp('cs-score', 'Enter Your CIBIL Score', p.score, 300, 900, 1, '/900', 'Get your free score at CIBIL.com, BankBazaar, Bajaj Markets, or your bank app')}
    ${_inp('cs-util',  'Credit Utilization %',    p.utilization, 0, 100, 1, '%',  'Total outstanding / total credit limit across all cards')}
    ${_inp('cs-latepmts', 'Late Payments (last 2yr)', p.latePayments, 0, 24, 1, 'count', '0 = all on time; each "30 DPD" entry hurts significantly')}
    ${_inp('cs-inquiries','Recent Hard Inquiries', p.recentInquiries, 0, 20, 1, 'last 12mo', 'New loan/card applications cause hard inquiries')}
  </div>

  <!-- Band reference -->
  <div class="cs-box">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px;">Score Bands</div>
    <div style="display:flex;flex-direction:column;gap:4px;">${bandBars}</div>
  </div>
</div>

<!-- Home loan rate impact -->
<div class="cs-box" style="background:linear-gradient(135deg,rgba(79,124,255,.05),rgba(34,211,166,.03));">
  <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px;">Home Loan Rate Impact (₹50L, 20-year loan)</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px;">
    <div>
      <div style="font-size:10px;color:var(--text-muted);">Your Rate (est.)</div>
      <div id="cs-hl-rate" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:26px;font-weight:900;color:#4F7CFF;">${c.b.hlRate > 0 ? c.b.hlRate.toFixed(2) + '%' : 'N/A'}</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);">vs Best Rate (750+)</div>
      <div id="cs-hl-spread" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:26px;font-weight:900;color:${parseFloat(c.rateSpread) > 0 ? '#FF6B6B' : '#22D3A6'};">${parseFloat(c.rateSpread) > 0 ? '+' + c.rateSpread + '%' : 'Best rate ✓'}</div>
    </div>
    <div>
      <div style="font-size:10px;color:var(--text-muted);">Extra Interest (20yr)</div>
      <div id="cs-hl-extra" style="font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:26px;font-weight:900;color:${c.extraInterestCost > 0 ? '#FF6B6B' : '#22D3A6'};">${c.extraInterestCost > 0 ? INR(c.extraInterestCost) : '₹0'}</div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">extra vs 800+ score</div>
    </div>
  </div>
</div>

<script>
(function(){
  window._csRecalc = function() {
    const score = parseInt(document.getElementById('cs-score')?.value)||720;
    const util  = parseFloat(document.getElementById('cs-util')?.value)||35;
    const late  = parseInt(document.getElementById('cs-latepmts')?.value)||0;
    const inq   = parseInt(document.getElementById('cs-inquiries')?.value)||2;
    const p = { score, utilization:util, latePayments:late, recentInquiries:inq,
      creditLimit:200000, outstanding:0, oldestAgeYears:3, securedAccounts:1, unsecuredAccounts:1 };
    if (window.FinosCreditScore) {
      const c = window.FinosCreditScore._compute(p);
      const INR = v => '₹'+Math.abs(Math.round(v)).toLocaleString('en-IN');
      const upd = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
      upd('cs-score-num', score);
      upd('cs-band-label', c.b.icon+' '+c.b.label);
      upd('cs-band-desc',  c.b.desc);
      upd('cs-hl-rate',    c.b.hlRate > 0 ? c.b.hlRate.toFixed(2)+'%' : 'N/A');
      upd('cs-hl-spread',  parseFloat(c.rateSpread) > 0 ? '+'+c.rateSpread+'%' : 'Best rate ✓');
      upd('cs-hl-extra',   c.extraInterestCost > 0 ? INR(c.extraInterestCost) : '₹0');
      ['cs-score-num','cs-band-label'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.color = c.b.color;
      });
      const badge = document.getElementById('cs-score-badge');
      const pct = ((score-300)/600*100).toFixed(1);
      if(badge) badge.style.background = 'conic-gradient(' + c.b.color + ' 0% ' + pct + '%, var(--border-soft) ' + pct + '% 100%)';
      localStorage.setItem('finos_cibil_score', String(score));
      localStorage.setItem('finos_credit_util_pct', String(util));
    }
  };
})();
<\/script>`;
  }

  /* ══════════════════════════════════════════════════════════════
     IMPROVEMENT TIPS TAB
  ══════════════════════════════════════════════════════════════ */
  function renderTips(container) {
    if (!container) return;
    const p = _loadInputs();
    const c = _compute(p);

    const priorityColor = { HIGH:'#FF6B6B', MED:'#FFB347', LOW:'#22D3A6' };

    const tipCards = c.activeTips.slice(0, 6).map(t => `
      <div style="background:var(--border-soft);border:1px solid var(--border-soft);border-radius:14px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:800;color:var(--text-primary);">${t.tip}</div>
          <span style="flex-shrink:0;margin-left:8px;background:rgba(${t.priority==='HIGH'?'255,107,107':t.priority==='MED'?'255,179,71':'34,211,166'},.12);color:${priorityColor[t.priority]};padding:2px 8px;border-radius:5px;font-size:10px;font-weight:800;">${t.priority}</span>
        </div>
        <div style="font-size:11px;color:var(--text-muted);line-height:1.6;margin-bottom:8px;">${t.detail}</div>
        <div style="font-size:11px;font-weight:700;color:#4F7CFF;">Expected impact: ${t.impact}</div>
      </div>`).join('');

    const timeline = [
      { period:'Month 1-2',  action:'Pay down credit card to below 30% utilization; set EMI auto-pay', expected:'+20-40 pts' },
      { period:'Month 3-6',  action:'No missed payments; avoid new loan applications; close settled delinquencies', expected:'+30-50 pts' },
      { period:'Month 6-12', action:'Request credit limit increase (utilization drops); get a secured card if needed', expected:'+15-30 pts' },
      { period:'Year 1-2',   action:'Old accounts age, score stabilises; apply for new credit only if needed', expected:'+10-20 pts' },
    ];

    container.innerHTML = `
<div style="margin-bottom:16px;">
  <div style="background:linear-gradient(135deg,rgba(34,211,166,.06),rgba(79,124,255,.04));border:1px solid rgba(34,211,166,.15);border-radius:16px;padding:18px;display:flex;gap:16px;align-items:center;">
    <div style="font-size:32px;">🎯</div>
    <div>
      <div style="font-size:13px;font-weight:800;color:var(--text-primary);">Score Projection</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">If you implement the HIGH priority tips above, your score could reach <strong style="color:#22D3A6;">${c.scoreProjection}</strong> within 6-12 months (currently ${p.score}).</div>
    </div>
  </div>
</div>

<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px;">Your Personalised Improvement Tips</div>
<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">${tipCards || '<div style="color:var(--text-muted);font-size:13px;">No critical issues found — maintain your good habits!</div>'}</div>

<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin-bottom:12px;">Improvement Timeline</div>
<div style="overflow-x:auto;border-radius:14px;border:1px solid var(--border-soft);">
<table style="width:100%;border-collapse:collapse;">
  <thead><tr style="background:var(--border-soft);">
    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Period</th>
    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);">Actions</th>
    <th style="padding:10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#22D3A6;">Expected Gain</th>
  </tr></thead>
  <tbody>
    ${timeline.map(r => `<tr style="border-top:1px solid var(--border-soft);">
      <td style="padding:10px;font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:12px;color:#4F7CFF;white-space:nowrap;">${r.period}</td>
      <td style="padding:10px;font-size:12px;color:var(--text-secondary);">${r.action}</td>
      <td style="padding:10px;font-size:12px;font-weight:800;color:#22D3A6;white-space:nowrap;">${r.expected}</td>
    </tr>`).join('')}
  </tbody>
</table>
</div>

<div style="margin-top:14px;background:rgba(79,124,255,.05);border:1px solid rgba(79,124,255,.1);border-radius:14px;padding:14px;">
  <div style="font-size:12px;font-weight:800;color:#4F7CFF;margin-bottom:8px;">📋 Where to Check Your Free CIBIL Score</div>
  <div style="font-size:11px;color:var(--text-muted);line-height:1.8;">
    🔗 CIBIL.com (1 free report/year) · BankBazaar · Paisabazaar · Bajaj Markets · OneScore (monthly free) · Your bank app (Axis, HDFC, ICICI offer free monthly score)
  </div>
</div>`;
  }

  return { renderDashboard, renderTips, _compute };
})();
