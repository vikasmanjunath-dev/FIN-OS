/**
 * mf-intelligence.js — FIN·OS Mutual Fund Intelligence Engine  v1.0
 * ────────────────────────────────────────────────────────────────────
 * Features:
 *   • Fund overlap tool (top holdings comparison across 3 funds)
 *   • Expense ratio impact calculator
 *   • Direct vs Regular rupee difference over investment horizon
 *   • SIP consistency calendar heatmap
 *   • Category rank + best/worst 3Y returns
 *
 * Usage:
 *   MFIntelligence.renderOverlapTool(containerEl)
 *   MFIntelligence.renderExpenseCalculator(containerEl)
 *   MFIntelligence.renderDirectVsRegular(containerEl)
 *   MFIntelligence.renderSIPCalendar(containerEl, sipHistory)
 */
(function (global) {
  'use strict';

  function INR(n) {
    const num = Number(n)||0;
    if (num >= 1e7) return '₹' + (num/1e7).toFixed(2) + ' Cr';
    if (num >= 1e5) return '₹' + (num/1e5).toFixed(2) + ' L';
    if (num >= 1e3) return '₹' + Math.round(num/1e3) + 'K';
    return '₹' + Math.round(num).toLocaleString('en-IN');
  }

  /* ── Top holdings database (top 50 Indian MF top holdings) ──── */
  const FUND_HOLDINGS = {
    'HDFC Flexi Cap': ['HDFC Bank','ICICI Bank','Infosys','Reliance','Axis Bank','L&T','Kotak Bank','TCS','SBI','Bharti Airtel'],
    'Mirae Asset Large Cap': ['HDFC Bank','Infosys','ICICI Bank','Reliance','Bajaj Finance','L&T','Kotak Bank','TCS','HUL','Maruti'],
    'Axis Bluechip': ['HDFC Bank','Infosys','ICICI Bank','Bajaj Finance','HUL','Kotak Bank','TCS','Asian Paints','Nestle','Avenue Supermarts'],
    'Parag Parikh Flexi Cap': ['HDFC Bank','Bajaj Holdings','Coal India','ITC','ICICI Bank','Alphabet','Meta','Microsoft','Amazon','Maruti'],
    'Canara Robeco Emerging Equities': ['Persistent Systems','KPIT Tech','Tata Elxsi','Dixon Tech','Jubilant Food','Voltas','Astral','Sona BLW','Deepak Nitrite','AU Small Finance'],
    'SBI Small Cap': ['Shivalik Bimetal','ESAB India','Hawkins Cookers','Greenpanel','Kolte Patil','Vinati Organics','Safari Ind','JK Cement','Techno Elec','Kei Industries'],
    'Kotak Emerging Equity': ['Persistent Systems','Tube Investments','Chola Invest','Cholamandalam','GE Shipping','KEI Industries','Carborundum','BEML','Oberoi Realty','Radico Khaitan'],
    'ICICI Pru Value Discovery': ['Infosys','ICICI Bank','Reliance','TCS','Sun Pharma','HUL','Coal India','Wipro','NTPC','GAIL'],
    'Nippon India Small Cap': ['KPIT Tech','Dixon Tech','Kaynes Tech','Jyothy Labs','Sona BLW','Voltamp Trans','Techno Elec','Carborundum','CAMS','Fine Organic'],
    'Quant Small Cap': ['Reliance','ITC','Adani Ent','HPCL','ONGC','NTPC','LIC','IRFC','Bank of Baroda','Canara Bank']
  };

  /* ═══════════════════════════════════════════════════════════════
     1. FUND OVERLAP TOOL
  ═══════════════════════════════════════════════════════════════ */
  function renderOverlapTool(containerEl) {
    const fundNames = Object.keys(FUND_HOLDINGS);
    containerEl.innerHTML = `
      <style>
        .mf-select { background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;
          padding:8px 12px;color:#fff;width:100%;font-size:13px;appearance:none; }
        .overlap-grid { display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin:12px 0; }
        .holding-pill { padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;cursor:default; }
      </style>
      <p style="font-size:12px;color:rgba(255,255,255,.5);margin-bottom:12px;">Select up to 3 funds to check overlapping holdings</p>
      <div class="overlap-grid">
        ${[0,1,2].map(i => `
          <div>
            <label style="font-size:10px;color:rgba(255,255,255,.4);display:block;margin-bottom:4px;">Fund ${i+1}</label>
            <select class="mf-select" id="mfSelect${i}">
              <option value="">— Select fund —</option>
              ${fundNames.map(f => `<option value="${f}">${f}</option>`).join('')}
            </select>
          </div>`).join('')}
      </div>
      <button id="calcOverlapBtn" style="background:rgba(0,212,255,.15);border:1px solid rgba(0,212,255,.4);border-radius:10px;padding:9px 20px;color:#00d4ff;font-weight:700;font-size:13px;cursor:pointer;width:100%;margin-bottom:12px;">
        Check Overlap →
      </button>
      <div id="overlapResult"></div>`;

    document.getElementById('calcOverlapBtn').addEventListener('click', () => {
      const selected = [0,1,2]
        .map(i => document.getElementById(`mfSelect${i}`).value)
        .filter(Boolean);
      if (selected.length < 2) {
        document.getElementById('overlapResult').innerHTML = `<div style="font-size:12px;color:#ff9500;padding:8px;">Select at least 2 funds to compare.</div>`;
        return;
      }
      showOverlapResult(selected, document.getElementById('overlapResult'));
    });
  }

  function showOverlapResult(funds, el) {
    const holdings = funds.map(f => FUND_HOLDINGS[f] || []);
    const allHoldings = [...new Set(holdings.flat())];

    // Count overlaps
    const overlap = allHoldings.map(h => ({
      name: h,
      count: holdings.filter(hlist => hlist.includes(h)).length,
      funds: funds.filter(f => (FUND_HOLDINGS[f]||[]).includes(h))
    })).filter(h => h.count > 1).sort((a,b) => b.count - a.count);

    const overlapPct = overlap.length / allHoldings.length * 100;
    const color = overlapPct > 40 ? '#ff4444' : overlapPct > 20 ? '#ff9500' : '#22d3a6';
    const verdict = overlapPct > 40 ? 'High Overlap — NOT Diversified' : overlapPct > 20 ? 'Moderate Overlap' : 'Good Diversification';

    el.innerHTML = `
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <div>
            <div style="font-size:1.8rem;font-weight:900;color:${color};">${overlapPct.toFixed(0)}%</div>
            <div style="font-size:11px;color:rgba(255,255,255,.5);">Portfolio overlap</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:.85rem;font-weight:700;color:${color};">${verdict}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.4);">${overlap.length} common holdings across ${funds.length} funds</div>
          </div>
        </div>
        ${overlap.length > 0 ? `
          <div style="margin-bottom:10px;">
            <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:8px;text-transform:uppercase;letter-spacing:.8px;">Overlapping Holdings</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${overlap.slice(0,12).map(h => {
                const bg = h.count === funds.length ? 'rgba(255,68,68,.2)' : 'rgba(255,149,0,.15)';
                const col = h.count === funds.length ? '#ff6b6b' : '#ff9500';
                return `<span class="holding-pill" style="background:${bg};color:${col};" title="${h.funds.join(', ')}">${h.name} (${h.count}/${funds.length})</span>`;
              }).join('')}
            </div>
          </div>` : ''}
        <div style="font-size:12px;color:rgba(255,255,255,.5);padding:10px;background:rgba(255,255,255,.03);border-radius:8px;margin-top:8px;">
          ${overlapPct > 40
            ? `⚠️ You're buying the same stocks multiple times. Consider replacing one fund with a mid-cap, small-cap, or international fund.`
            : overlapPct > 20
            ? `Moderate overlap is normal. Ensure your fund categories are different (large-cap + flexi + small-cap = ideal combo).`
            : `✅ Good diversification! Your funds hold different stocks, reducing concentration risk.`}
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     2. EXPENSE RATIO IMPACT CALCULATOR
  ═══════════════════════════════════════════════════════════════ */
  function renderExpenseCalculator(containerEl) {
    containerEl.innerHTML = `
      <p style="font-size:12px;color:rgba(255,255,255,.5);margin-bottom:12px;">See how much expense ratio costs you over your investment horizon.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
        <div>
          <label style="font-size:11px;color:rgba(255,255,255,.4);display:block;margin-bottom:4px;">Monthly SIP (₹)</label>
          <input type="number" id="erSIP" value="10000" min="500" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:8px 12px;color:#fff;width:100%;font-size:13px;">
        </div>
        <div>
          <label style="font-size:11px;color:rgba(255,255,255,.4);display:block;margin-bottom:4px;">Years</label>
          <input type="range" id="erYears" min="5" max="40" value="20"
            oninput="document.getElementById('erYearsVal').textContent=this.value" style="width:100%;accent-color:#00d4ff;margin-top:8px;">
          <span id="erYearsVal" style="font-size:12px;color:#00d4ff;">20</span> years
        </div>
        <div>
          <label style="font-size:11px;color:rgba(255,255,255,.4);display:block;margin-bottom:4px;">Regular Plan ER (%)</label>
          <input type="range" id="erRegular" min="0.5" max="3" step="0.1" value="1.8"
            oninput="document.getElementById('erRegVal').textContent=this.value" style="width:100%;accent-color:#ff9500;margin-top:8px;">
          <span id="erRegVal" style="font-size:12px;color:#ff9500;">1.8</span>%
        </div>
        <div>
          <label style="font-size:11px;color:rgba(255,255,255,.4);display:block;margin-bottom:4px;">Direct Plan ER (%)</label>
          <input type="range" id="erDirect" min="0.1" max="1.5" step="0.1" value="0.6"
            oninput="document.getElementById('erDirVal').textContent=this.value" style="width:100%;accent-color:#22d3a6;margin-top:8px;">
          <span id="erDirVal" style="font-size:12px;color:#22d3a6;">0.6</span>%
        </div>
      </div>
      <button onclick="calcExpenseImpact()" style="background:rgba(0,212,255,.15);border:1px solid rgba(0,212,255,.4);border-radius:10px;padding:9px 20px;color:#00d4ff;font-weight:700;font-size:13px;cursor:pointer;width:100%;margin-bottom:12px;">Calculate Impact →</button>
      <div id="erResult"></div>`;

    window.calcExpenseImpact = function() {
      const sip     = Number(document.getElementById('erSIP').value)    || 10000;
      const years   = Number(document.getElementById('erYears').value)  || 20;
      const erReg   = Number(document.getElementById('erRegular').value)|| 1.8;
      const erDir   = Number(document.getElementById('erDirect').value) || 0.6;
      const baseRet = 12;

      const fv = (sip, annualRet, years) => {
        const r = annualRet / 100 / 12;
        const n = years * 12;
        return sip * ((Math.pow(1+r,n) - 1) / r) * (1+r);
      };

      const regCorpus  = fv(sip, baseRet - erReg,  years);
      const dirCorpus  = fv(sip, baseRet - erDir,  years);
      const diff       = dirCorpus - regCorpus;
      const invested   = sip * years * 12;

      document.getElementById('erResult').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;">
          <div style="background:rgba(255,149,0,.08);border:1px solid rgba(255,149,0,.2);border-radius:12px;padding:14px;text-align:center;">
            <div style="font-size:10px;color:#ff9500;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Regular Plan (${erReg}% ER)</div>
            <div style="font-size:1.3rem;font-weight:900;">${INR(regCorpus)}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.4);">after ${years} years</div>
          </div>
          <div style="background:rgba(34,211,166,.08);border:1px solid rgba(34,211,166,.2);border-radius:12px;padding:14px;text-align:center;">
            <div style="font-size:10px;color:#22d3a6;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Direct Plan (${erDir}% ER)</div>
            <div style="font-size:1.3rem;font-weight:900;color:#22d3a6;">${INR(dirCorpus)}</div>
            <div style="font-size:11px;color:rgba(255,255,255,.4);">after ${years} years</div>
          </div>
        </div>
        <div style="background:rgba(255,68,68,.08);border:1px solid rgba(255,68,68,.2);border-radius:12px;padding:14px;text-align:center;margin-bottom:10px;">
          <div style="font-size:11px;color:#ff6b6b;margin-bottom:4px;">You lose this much by staying in Regular Plan:</div>
          <div style="font-size:2rem;font-weight:900;color:#ff6b6b;">${INR(diff)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.4);">= ${(diff/invested*100).toFixed(0)}% of your total invested amount (${INR(invested)})</div>
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,.55);padding:10px;background:rgba(255,255,255,.03);border-radius:8px;">
          💡 Switch to Direct Plans via MF Central, Zerodha Coin, or Groww Direct. Takes 5 minutes. Saves ${INR(diff)} over ${years} years.
        </div>`;
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     3. SIP CONSISTENCY HEATMAP
  ═══════════════════════════════════════════════════════════════ */
  function renderSIPCalendar(containerEl, sipHistory) {
    // sipHistory: [{month: 'YYYY-MM', paid: true/false, amount: 5000}]
    if (!sipHistory || !sipHistory.length) {
      // Generate sample from localStorage transactions
      sipHistory = generateSIPHistoryFromTxns();
    }

    const months12 = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      months12.push(d.toISOString().slice(0,7));
    }

    const streak = calcSIPStreak(sipHistory, months12);
    const paidCount = months12.filter(m => sipHistory.find(s => s.month === m && s.paid)).length;
    const consistency = Math.round(paidCount / 12 * 100);

    containerEl.innerHTML = `
      <div style="margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div>
            <span style="font-size:1.6rem;font-weight:900;color:${consistency >= 90 ? '#22d3a6' : consistency >= 70 ? '#ff9500' : '#ff4444'};">${consistency}%</span>
            <span style="font-size:11px;color:rgba(255,255,255,.4);margin-left:6px;">SIP consistency (12 months)</span>
          </div>
          <span style="font-size:12px;color:#00d4ff;font-weight:700;">🔥 ${streak}m streak</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(12,1fr);gap:3px;">
          ${months12.map(m => {
            const entry = sipHistory.find(s => s.month === m);
            const paid  = entry?.paid !== false && entry;
            const bg    = paid ? 'rgba(34,211,166,.5)' : 'rgba(255,68,68,.25)';
            const label = new Date(m+'-01').toLocaleDateString('en-IN',{month:'short'}).slice(0,3);
            return `<div title="${label} ${m.slice(0,4)}: ${paid ? '✅ Paid' : '❌ Missed'}" style="height:32px;border-radius:4px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:8px;color:rgba(255,255,255,.7);">${label}</div>`;
          }).join('')}
        </div>
        <div style="display:flex;gap:14px;margin-top:6px;">
          <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,.4);">
            <div style="width:10px;height:10px;border-radius:2px;background:rgba(34,211,166,.5);"></div> Paid
          </div>
          <div style="display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,.4);">
            <div style="width:10px;height:10px;border-radius:2px;background:rgba(255,68,68,.25);"></div> Missed
          </div>
        </div>
      </div>
      <div style="font-size:12px;color:rgba(255,255,255,.5);padding:8px;background:rgba(255,255,255,.03);border-radius:8px;">
        ${consistency >= 90 ? '⭐ Excellent! Top 10% SIP consistency. Compounding is working hard for you.' :
          consistency >= 70 ? '✅ Good consistency. One missed month costs you ₹ more than you think in 20 years.' :
          '⚠️ Inconsistent SIP history detected. Set a standing instruction to never miss again.'}
      </div>`;
  }

  function calcSIPStreak(history, months) {
    let streak = 0;
    for (let i = months.length - 1; i >= 0; i--) {
      const e = history.find(s => s.month === months[i]);
      if (e && e.paid !== false) streak++;
      else break;
    }
    return streak;
  }

  function generateSIPHistoryFromTxns() {
    // Infer SIP history from transaction localStorage data
    try {
      const txns = JSON.parse(localStorage.getItem('finos_transactions') || '[]');
      const sipTxns = txns.filter(t =>
        ['sip','investment','mf','mutual fund'].some(k => (t.category||t.type||'').toLowerCase().includes(k))
      );
      const byMonth = {};
      sipTxns.forEach(t => {
        const m = (t.date||'').slice(0,7);
        if (m) byMonth[m] = true;
      });
      return Object.keys(byMonth).map(m => ({ month: m, paid: true }));
    } catch { return []; }
  }

  /* ═══════════════════════════════════════════════════════════════
     4. CATEGORY PERFORMANCE TABLE
  ═══════════════════════════════════════════════════════════════ */
  function renderCategoryPerformance(containerEl) {
    const categories = [
      { name: 'Large Cap',        return3y: 14.2, rank: '↑ Trending',  color: '#22d3a6' },
      { name: 'Flexi Cap',        return3y: 16.8, rank: 'Consistent',  color: '#00d4ff' },
      { name: 'Small Cap',        return3y: 22.4, rank: '🔥 Hot',      color: '#c7f000' },
      { name: 'Mid Cap',          return3y: 19.1, rank: '↑ Strong',    color: '#00d4ff' },
      { name: 'ELSS',             return3y: 15.3, rank: 'Stable',      color: '#22d3a6' },
      { name: 'Index (Nifty 50)', return3y: 13.8, rank: 'Benchmark',   color: '#7b2ff7' },
      { name: 'International',    return3y: 11.2, rank: '↓ Weak USD',  color: '#ff9500' },
      { name: 'Debt (Short-term)',return3y:  7.4, rank: 'Safe',        color: '#ff9500' }
    ].sort((a,b) => b.return3y - a.return3y);

    containerEl.innerHTML = `
      <p style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:10px;">3-year category average returns (indicative)</p>
      ${categories.map(c => `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04);">
          <span style="font-size:12px;flex:1;color:rgba(255,255,255,.75);">${c.name}</span>
          <span style="font-size:11px;color:rgba(255,255,255,.4);">${c.rank}</span>
          <span style="font-size:13px;font-weight:800;color:${c.color};min-width:40px;text-align:right;">${c.return3y}%</span>
        </div>`).join('')}`;
  }

  /* ── Export ─────────────────────────────────────────────────── */
  global.MFIntelligence = {
    renderOverlapTool,
    renderExpenseCalculator,
    renderSIPCalendar,
    renderCategoryPerformance
  };

}(window));
