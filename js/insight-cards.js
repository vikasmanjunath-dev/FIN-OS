/* ═══════════════════════════════════════════════════════════════
   FINOS — TODAY'S INSIGHTS · Interactive Card Engine
   insight-cards.js
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Utility: format INR ───────────────────────────────────── */
  function inr(n, short = true) {
    if (short) {
      if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr';
      if (n >= 1e5) return '₹' + (n / 1e5).toFixed(1) + ' L';
      if (n >= 1e3) return '₹' + (n / 1e3).toFixed(0) + 'K';
    }
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  /* ── Compound growth helper ─────────────────────────────────── */
  function sipCorpus(monthly, years, rate = 12) {
    const r = rate / 100 / 12;
    const n = years * 12;
    return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  }

  /* ── Counter animation ──────────────────────────────────────── */
  function animateCounter(el, from, to, duration = 1200, prefix = '', suffix = '') {
    const start = performance.now();
    function step(now) {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      const val = from + (to - from) * ease;
      el.textContent = prefix + Math.round(val).toLocaleString('en-IN') + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ── Progress bar animation ─────────────────────────────────── */
  function animateBar(el, targetPct, delay = 0) {
    setTimeout(() => { el.style.width = targetPct + '%'; }, delay);
  }

  /* ══════════════════════════════════════════════════════════════
     INSIGHT DEFINITIONS
     ══════════════════════════════════════════════════════════════ */
  const INSIGHTS = [
    {
      id: 'sip',
      icon: '📈',
      badge: 'Mutual Funds',
      title: '₹500 SIP started today vs waiting for "more income"',
      sub: 'Time beats amount — always. The math will shock you.',
      accent: '#00ffa3',
      accentDim: 'rgba(0,255,163,0.12)',
      accentDim2: 'rgba(0,255,163,0.25)',
      shadow: 'rgba(0,255,163,0.2)',
      gradient: 'linear-gradient(135deg,#00ffa3,#00d4ff)',
      miniChartType: 'growth',
      tabs: ['The Math', 'Calculator', 'How to Start'],
      href: 'insight-sip.html',
      ctaLabel: 'Open SIP Calculator',
      ctaHref: '../calculators.html',
    },
    {
      id: 'fno',
      icon: '⚠️',
      badge: 'F&O Markets',
      title: '95% of F&O traders lose — are you the 5%?',
      sub: 'The data SEBI published that brokers won\'t show you.',
      accent: '#ff6b35',
      accentDim: 'rgba(255,107,53,0.12)',
      accentDim2: 'rgba(255,107,53,0.25)',
      shadow: 'rgba(255,107,53,0.2)',
      gradient: 'linear-gradient(135deg,#ff6b35,#ff4444)',
      miniChartType: 'donut',
      tabs: ['SEBI Data', 'What Kills Traders', 'The 5% Playbook'],
      href: null,
      ctaLabel: 'Practice in Simulator',
      ctaHref: 'simulator-landing.html',
    },
    {
      id: 'mf',
      icon: '💡',
      badge: 'Direct Plans',
      title: 'Regular vs Direct MF — you\'re paying ₹3L+ more',
      sub: 'The 1% expense ratio difference that compounds into crores.',
      accent: '#c7f000',
      accentDim: 'rgba(199,240,0,0.1)',
      accentDim2: 'rgba(199,240,0,0.25)',
      shadow: 'rgba(199,240,0,0.18)',
      gradient: 'linear-gradient(135deg,#c7f000,#00d4ff)',
      miniChartType: 'bar',
      tabs: ['The Gap', 'How Much You\'re Losing', 'How to Switch'],
      href: 'mf-intelligence.html',
      ctaLabel: 'Check MF Intelligence',
      ctaHref: 'mf-intelligence.html',
    },
    {
      id: 'inflation',
      icon: '🔥',
      badge: 'Macro',
      title: 'Why inflation quietly destroys your savings every year',
      sub: '7% Indian inflation explained with real numbers.',
      accent: '#ff4444',
      accentDim: 'rgba(255,68,68,0.1)',
      accentDim2: 'rgba(255,68,68,0.25)',
      shadow: 'rgba(255,68,68,0.2)',
      gradient: 'linear-gradient(135deg,#ff4444,#ff6b35)',
      miniChartType: 'decay',
      tabs: ['The Reality', 'Your FD vs Inflation', 'What Beats It'],
      href: 'insight-inflation.html',
      ctaLabel: 'Check Inflation Calculator',
      ctaHref: '../calculators.html',
    },
    {
      id: 'debt',
      icon: '🏦',
      badge: 'Debt & Loans',
      title: 'Good debt vs bad debt — the India reality check',
      sub: 'EMIs are normalized without understanding cost.',
      accent: '#00d4ff',
      accentDim: 'rgba(0,212,255,0.1)',
      accentDim2: 'rgba(0,212,255,0.25)',
      shadow: 'rgba(0,212,255,0.18)',
      gradient: 'linear-gradient(135deg,#00d4ff,#7b2ff7)',
      miniChartType: 'split',
      tabs: ['Good vs Bad', 'EMI Front-Loading', 'Pre-Pay Strategy'],
      href: 'insight-debt.html',
      ctaLabel: 'Go to EMI Calculator',
      ctaHref: '../calculators.html',
    },
  ];

  /* ══════════════════════════════════════════════════════════════
     MINI CHART RENDERERS
     ══════════════════════════════════════════════════════════════ */
  function renderMiniChart(canvas, ins) {
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    const accent = ins.accent;

    if (ins.miniChartType === 'growth') {
      const labels = [0,5,10,15,20,25,30];
      const early  = labels.map(y => sipCorpus(500, y) / 1e5);
      const late   = labels.map(y => y >= 10 ? sipCorpus(500, y - 10) / 1e5 : 0);
      new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { data: early, borderColor: accent, borderWidth: 2, fill: true,
              backgroundColor: (c) => { const g = c.chart.ctx.createLinearGradient(0,0,0,52); g.addColorStop(0,'rgba(0,255,163,0.3)'); g.addColorStop(1,'rgba(0,255,163,0)'); return g; },
              tension: 0.4, pointRadius: 0 },
            { data: late,  borderColor: 'rgba(255,255,255,0.2)', borderWidth: 1.5,
              borderDash: [4,3], tension: 0.4, pointRadius: 0, fill: false },
          ]
        },
        options: { animation:false, responsive:true, maintainAspectRatio:false,
          plugins:{legend:{display:false},tooltip:{enabled:false}},
          scales:{x:{display:false},y:{display:false}} }
      });

    } else if (ins.miniChartType === 'donut') {
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          datasets: [{ data:[95,5],
            backgroundColor:['rgba(255,68,68,0.7)','rgba(0,255,163,0.7)'],
            borderWidth:0, hoverOffset:0 }]
        },
        options: { animation:{duration:0}, responsive:true, maintainAspectRatio:false,
          cutout:'72%', plugins:{legend:{display:false},tooltip:{enabled:false}} }
      });

    } else if (ins.miniChartType === 'bar') {
      const yrs = [5,10,15,20];
      const reg = yrs.map(y => sipCorpus(10000,y,11) / 1e5);
      const dir = yrs.map(y => sipCorpus(10000,y,12) / 1e5);
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: yrs.map(y => y+'y'),
          datasets: [
            { data: reg, backgroundColor:'rgba(255,179,71,0.5)', borderRadius:4 },
            { data: dir, backgroundColor:'rgba(199,240,0,0.6)',  borderRadius:4 },
          ]
        },
        options: { animation:false, responsive:true, maintainAspectRatio:false,
          plugins:{legend:{display:false},tooltip:{enabled:false}},
          scales:{x:{display:false},y:{display:false}} }
      });

    } else if (ins.miniChartType === 'decay') {
      const yrs = Array.from({length:21},(_,i)=>i);
      const fd  = yrs.map(y => 100000 * Math.pow(1.07, y) / 1e5);
      const real= yrs.map(y => 100000 * Math.pow(1.0, y) / 1e5);
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: yrs,
          datasets: [
            { data: fd, borderColor:'rgba(255,68,68,0.6)', borderWidth:1.5,
              tension:0.4, pointRadius:0, fill: false, borderDash:[4,3] },
            { data: real, borderColor:'rgba(0,212,255,0.5)', borderWidth:2,
              tension:0.4, pointRadius:0, fill:true,
              backgroundColor: (c)=>{ const g=c.chart.ctx.createLinearGradient(0,0,0,52); g.addColorStop(0,'rgba(0,212,255,0.15)'); g.addColorStop(1,'rgba(0,212,255,0)'); return g; } }
          ]
        },
        options: { animation:false, responsive:true, maintainAspectRatio:false,
          plugins:{legend:{display:false},tooltip:{enabled:false}},
          scales:{x:{display:false},y:{display:false}} }
      });

    } else if (ins.miniChartType === 'split') {
      new Chart(ctx, {
        type: 'doughnut',
        data: {
          datasets: [{ data:[80,20],
            backgroundColor:['rgba(255,107,53,0.7)','rgba(0,212,255,0.7)'],
            borderWidth:0 }]
        },
        options: { animation:{duration:0}, responsive:true, maintainAspectRatio:false,
          cutout:'68%', plugins:{legend:{display:false},tooltip:{enabled:false}} }
      });
    }
  }

  /* ══════════════════════════════════════════════════════════════
     CARD HTML BUILDER
     ══════════════════════════════════════════════════════════════ */
  function buildCard(ins, idx) {
    return `
    <div class="ic-card" data-insight="${ins.id}"
      style="--ic-accent:${ins.accent};--ic-accent-dim:${ins.accentDim};--ic-accent-dim2:${ins.accentDim2};--ic-shadow:${ins.shadow};--ic-glow:${ins.gradient};"
      role="button" tabindex="0" aria-label="Open insight: ${ins.title}">
      <div class="ic-light"></div>
      <div class="ic-badge">${ins.badge}</div>
      <div class="ic-icon">${ins.icon}</div>
      <div class="ic-title">${ins.title}</div>
      <div class="ic-sub">${ins.sub}</div>
      <div class="ic-mini-chart"><canvas id="mini-chart-${ins.id}"></canvas></div>
      <div class="ic-cta">
        <span class="ic-cta-text">→ Read</span>
        <div class="ic-cta-arrow">↗</div>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════════
     MODAL CONTENT BUILDERS
     ══════════════════════════════════════════════════════════════ */

  /* ── SIP CONTENT ────────────────────────────────────────────── */
  function buildSIPContent() {
    return {
      tabs: ['The Math', 'Calculator', 'How to Start'],
      panels: [
        /* TAB 0 */
        `<div class="ic-section">
          <div class="ic-section-label">The brutal truth</div>
          <div class="ic-stats-row">
            <div class="ic-stat-card" style="--sc-color:#00ffa3">
              <div class="ic-stat-label">Start at 25 · ₹5K/mo · 35 yrs</div>
              <div class="ic-stat-value" id="sip-val1">₹1.7 Cr</div>
              <div class="ic-stat-meta">Invested: ₹21L · Gain: ₹1.49 Cr</div>
            </div>
            <div class="ic-stat-card" style="--sc-color:#ffb347">
              <div class="ic-stat-label">Start at 30 · ₹5K/mo · 30 yrs</div>
              <div class="ic-stat-value" id="sip-val2">₹88L</div>
              <div class="ic-stat-meta">Invested: ₹18L · Gain: ₹70L</div>
            </div>
            <div class="ic-stat-card" style="--sc-color:#ff4444">
              <div class="ic-stat-label">Start at 35 · ₹5K/mo · 25 yrs</div>
              <div class="ic-stat-value" id="sip-val3">₹48L</div>
              <div class="ic-stat-meta">Invested: ₹15L · Gain: ₹33L</div>
            </div>
          </div>
          <div class="ic-callout danger">
            <div class="ic-callout-title">⚡ 10-year delay costs ₹1.2 Crore</div>
            <div class="ic-callout-body">Waiting from 25→35 at ₹5,000/month costs you over ₹1.2 Crore in final corpus — with the same monthly investment. This is the power of compounding working <em>against</em> procrastination.</div>
          </div>
        </div>
        <div class="ic-section">
          <div class="ic-section-label">Wealth growth curves</div>
          <div class="ic-chart-wrap">
            <div class="ic-chart-title">Corpus at 60 — Start Age vs SIP Amount (@ 12% CAGR)</div>
            <canvas id="sip-main-chart"></canvas>
          </div>
        </div>
        <div class="ic-section">
          <div class="ic-section-label">Why does this happen?</div>
          <div class="ic-steps">
            <div class="ic-step">
              <div class="ic-step-num">1</div>
              <div class="ic-step-content">
                <div class="ic-step-title">You earn return on your return</div>
                <div class="ic-step-desc">At 12% CAGR, money doubles every 6 years. Starting 10 years earlier means 1.7 extra doublings — which is compounding at its most dramatic.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">2</div>
              <div class="ic-step-content">
                <div class="ic-step-title">₹500 is enough to start</div>
                <div class="ic-step-desc">₹500/month at 12% for 35 years = ₹17.3 Lakhs. The amount matters far less than the habit and start date.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">3</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Market timing is a myth</div>
                <div class="ic-step-desc">Systematic investing through all market cycles beats trying to time lows. The longest-time investor almost always wins.</div>
              </div>
            </div>
          </div>
        </div>`,

        /* TAB 1 */
        `<div class="ic-section">
          <div class="ic-section-label">Your personal SIP projection</div>
          <div class="ic-slider-section" style="--modal-accent:#00ffa3">
            <div class="ic-slider-label">
              <span>Monthly SIP Amount</span>
              <span class="ic-slider-val" id="sip-amount-val">₹5,000</span>
            </div>
            <input type="range" class="ic-slider" id="sip-amount" min="500" max="50000" step="500" value="5000">
            <div class="ic-slider-label">
              <span>Your Current Age</span>
              <span class="ic-slider-val" id="sip-age-val">25 years</span>
            </div>
            <input type="range" class="ic-slider" id="sip-age" min="18" max="45" step="1" value="25">
            <div class="ic-slider-label">
              <span>Expected Return (CAGR)</span>
              <span class="ic-slider-val" id="sip-rate-val">12%</span>
            </div>
            <input type="range" class="ic-slider" id="sip-rate" min="8" max="18" step="0.5" value="12">
          </div>
          <div class="ic-result-display">
            <div class="ic-result-item">
              <div class="ic-result-label">Corpus at 60</div>
              <div class="ic-result-value accent" id="sip-corpus">₹1.70 Cr</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Total Invested</div>
              <div class="ic-result-value" id="sip-invested">₹21.0 L</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Wealth Gain</div>
              <div class="ic-result-value accent" id="sip-gain">₹1.49 Cr</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Investment Years</div>
              <div class="ic-result-value" id="sip-years">35 yrs</div>
            </div>
          </div>
          <div class="ic-chart-wrap" style="margin-top:16px">
            <canvas id="sip-calc-chart" style="max-height:200px"></canvas>
          </div>
        </div>
        <div class="ic-callout success">
          <div class="ic-callout-title">📌 Rule of 72</div>
          <div class="ic-callout-body">At 12% CAGR, money doubles every 6 years (72 ÷ 12 = 6). Starting at 24 vs 30 means one extra doubling — which can mean ₹50L+ difference at retirement.</div>
        </div>`,

        /* TAB 2 */
        `<div class="ic-section">
          <div class="ic-section-label">Start in 3 steps</div>
          <div class="ic-steps">
            <div class="ic-step">
              <div class="ic-step-num">1</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Pick a Direct MF Platform</div>
                <div class="ic-step-desc">Groww, Kuvera, Coin by Zerodha, or direct AMC website. All SEBI-registered. Zero commission on direct plans.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">2</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Choose a Nifty 50 Index Fund</div>
                <div class="ic-step-desc">For beginners: UTI Nifty 50 Index or HDFC Index Fund - Nifty 50. Low cost (0.1–0.2% expense ratio), tracks India's top 50 companies.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">3</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Set Up Auto-Debit, Forget It</div>
                <div class="ic-step-desc">Link bank account, set SIP date to 5 days after salary credit, automate. Don't check daily — just let it compound.</div>
              </div>
            </div>
          </div>
          <div class="ic-callout info">
            <div class="ic-callout-title">💡 The ₹500 SIP Fact</div>
            <div class="ic-callout-body">₹500/month invested from age 22 at 12% = ₹16.3 Lakhs by age 60. You only put in ₹2.3 Lakhs. The remaining ₹14L is pure compounding. That's a 7x return on your discipline.</div>
          </div>
          <div class="ic-callout warn">
            <div class="ic-callout-title">⚠️ Tax Note</div>
            <div class="ic-callout-body">Equity MF gains above ₹1 Lakh/year are taxed at 10% (LTCG after 1 year). Still beats FD post-tax significantly. Track annual gains and plan redemptions smartly.</div>
          </div>
        </div>`
      ]
    };
  }

  /* ── F&O CONTENT ─────────────────────────────────────────────── */
  function buildFNOContent() {
    return {
      tabs: ['SEBI Data', 'What Kills Traders', 'The 5% Playbook'],
      panels: [
        /* TAB 0 */
        `<div class="ic-section">
          <div class="ic-section-label">SEBI Study FY22–FY24</div>
          <div class="ic-stats-row">
            <div class="ic-stat-card" style="--sc-color:#ff4444">
              <div class="ic-stat-label">Retail traders who lost money</div>
              <div class="ic-stat-value">93%</div>
              <div class="ic-stat-meta">FY22: 89% · FY23: 91% · FY24: 93%</div>
            </div>
            <div class="ic-stat-card" style="--sc-color:#ff6b35">
              <div class="ic-stat-label">Average annual loss per trader</div>
              <div class="ic-stat-value">₹1.1L</div>
              <div class="ic-stat-meta">Median retail trader in F&O</div>
            </div>
            <div class="ic-stat-card" style="--sc-color:#ffb347">
              <div class="ic-stat-label">Total retail F&O losses FY24</div>
              <div class="ic-stat-value">₹75K Cr</div>
              <div class="ic-stat-meta">SEBI disclosed in July 2024</div>
            </div>
          </div>
          <div class="ic-section-label" style="margin-top:8px">Loss concentration</div>
          <div class="ic-progress-row" id="fno-bars">
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">Bottom 50% of traders</span><span class="val">Lost avg ₹64,000/yr</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#ff4444" data-width="93"></div></div>
            </div>
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">Traded > 5 yrs still losing</span><span class="val">75% of them</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#ff6b35" data-width="75"></div></div>
            </div>
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">Profitable traders</span><span class="val">Only 7%</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#00ffa3" data-width="7"></div></div>
            </div>
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">Consistently profitable (3+ yrs)</span><span class="val">Only 1%</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#c7f000" data-width="1"></div></div>
            </div>
          </div>
          <div class="ic-chart-wrap">
            <div class="ic-chart-title">Profit vs Loss distribution of F&O retail traders (₹ Lakhs)</div>
            <canvas id="fno-chart"></canvas>
          </div>
          <div class="ic-callout danger">
            <div class="ic-callout-title">🚨 The Hidden Cost Brokers Won't Show You</div>
            <div class="ic-callout-body">Even if you break-even on trades, STT (Securities Transaction Tax), brokerage, SEBI fees, GST, and stamp duty can cost ₹8,000–15,000/month on active F&O trading. You need consistent gains just to cover costs.</div>
          </div>
        </div>`,

        /* TAB 1 */
        `<div class="ic-section">
          <div class="ic-section-label">Why most traders fail</div>
          <div class="ic-compare">
            <div class="ic-compare-col bad">
              <div class="ic-compare-head">❌ Fatal Mistakes</div>
              <div class="ic-compare-item"><span class="dot"></span>No stop-loss — letting losses run</div>
              <div class="ic-compare-item"><span class="dot"></span>Revenge trading after loss</div>
              <div class="ic-compare-item"><span class="dot"></span>Over-leveraging (10x–20x notional)</div>
              <div class="ic-compare-item"><span class="dot"></span>Trading without understanding Greeks</div>
              <div class="ic-compare-item"><span class="dot"></span>Taking tips from Telegram/YouTube</div>
              <div class="ic-compare-item"><span class="dot"></span>No position sizing discipline</div>
              <div class="ic-compare-item"><span class="dot"></span>Ignoring IV crush post-events</div>
            </div>
            <div class="ic-compare-col good">
              <div class="ic-compare-head">✅ What Winners Do</div>
              <div class="ic-compare-item"><span class="dot"></span>Hard stop-loss before entry</div>
              <div class="ic-compare-item"><span class="dot"></span>Max 2% portfolio risk per trade</div>
              <div class="ic-compare-item"><span class="dot"></span>Trade journal — every single trade</div>
              <div class="ic-compare-item"><span class="dot"></span>Understand Delta, Theta, Vega</div>
              <div class="ic-compare-item"><span class="dot"></span>Backtest strategies 3+ years</div>
              <div class="ic-compare-item"><span class="dot"></span>Clear edge, not just pattern-spotting</div>
              <div class="ic-compare-item"><span class="dot"></span>Treat it as a business, not a game</div>
            </div>
          </div>
          <div class="ic-callout warn">
            <div class="ic-callout-title">⚡ The Gambler's Ruin Problem</div>
            <div class="ic-callout-body">F&O is high-variance. Even with a 60% win rate, 20 consecutive losses can blow a trading account if position sizing is wrong. Probability matters more than individual win/loss.</div>
          </div>
          <div class="ic-section-label">The true cost of F&O addiction</div>
          <div class="ic-chart-wrap">
            <div class="ic-chart-title">₹10L account: SIP vs F&O trading (worst 80% vs best 5%)</div>
            <canvas id="fno-compare-chart"></canvas>
          </div>
        </div>`,

        /* TAB 2 */
        `<div class="ic-section">
          <div class="ic-section-label">If you're serious about trading</div>
          <div class="ic-steps">
            <div class="ic-step">
              <div class="ic-step-num">1</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Paper Trade for 3 Months First</div>
                <div class="ic-step-desc">Use virtual money to test your strategy. If you can't profit on paper, real money won't magically help. NSE's Paathshala has a simulator.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">2</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Learn the Greeks Deeply</div>
                <div class="ic-step-desc">Delta (directional), Theta (time decay), Gamma (delta change), Vega (volatility impact). Options buyers pay theta daily. Option sellers collect it.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">3</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Never Risk More Than 2% Per Trade</div>
                <div class="ic-step-desc">With ₹5L capital, risk max ₹10,000 per trade. This lets you survive 50 consecutive losses without being wiped out. Survival = opportunity.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">4</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Journal Every Trade</div>
                <div class="ic-step-desc">Entry reason, exit, P&L, emotional state, lesson. After 100 trades, patterns emerge. Most losing traders can't explain why they entered a trade.</div>
              </div>
            </div>
          </div>
          <div class="ic-tag-grid">
            <div class="ic-tag highlight">📊 Backtest first</div>
            <div class="ic-tag highlight">🛑 Hard stop-loss</div>
            <div class="ic-tag highlight">📔 Trade journal</div>
            <div class="ic-tag">IV Rank awareness</div>
            <div class="ic-tag">Position sizing</div>
            <div class="ic-tag">Greeks understanding</div>
            <div class="ic-tag">No revenge trading</div>
            <div class="ic-tag">Monthly P&L review</div>
          </div>
        </div>`
      ]
    };
  }

  /* ── MF DIRECT CONTENT ──────────────────────────────────────── */
  function buildMFContent() {
    return {
      tabs: ['The Gap', 'How Much You\'re Losing', 'How to Switch'],
      panels: [
        /* TAB 0 */
        `<div class="ic-section">
          <div class="ic-section-label">Regular vs Direct — what's different?</div>
          <div class="ic-compare">
            <div class="ic-compare-col bad">
              <div class="ic-compare-head">❌ Regular Plan</div>
              <div class="ic-compare-item"><span class="dot"></span>Bought through broker/agent/bank</div>
              <div class="ic-compare-item"><span class="dot"></span>Expense ratio: 1.0% – 2.5%</div>
              <div class="ic-compare-item"><span class="dot"></span>Agent earns 0.5–1% commission</div>
              <div class="ic-compare-item"><span class="dot"></span>Lower NAV (fund deducts fees daily)</div>
              <div class="ic-compare-item"><span class="dot"></span>Same underlying stocks as Direct</div>
            </div>
            <div class="ic-compare-col good">
              <div class="ic-compare-head">✅ Direct Plan</div>
              <div class="ic-compare-item"><span class="dot"></span>Bought directly from AMC/platform</div>
              <div class="ic-compare-item"><span class="dot"></span>Expense ratio: 0.1% – 1.0%</div>
              <div class="ic-compare-item"><span class="dot"></span>Zero commission — all yours</div>
              <div class="ic-compare-item"><span class="dot"></span>Higher NAV (lower fees = higher growth)</div>
              <div class="ic-compare-item"><span class="dot"></span>Identical portfolio, more returns</div>
            </div>
          </div>
          <div class="ic-stats-row">
            <div class="ic-stat-card" style="--sc-color:#ff6b35">
              <div class="ic-stat-label">Avg expense ratio gap</div>
              <div class="ic-stat-value">~1%</div>
              <div class="ic-stat-meta">Regular: 1.5% · Direct: 0.5%</div>
            </div>
            <div class="ic-stat-card" style="--sc-color:#c7f000">
              <div class="ic-stat-label">₹10K SIP · 20 yrs · Gap</div>
              <div class="ic-stat-value">₹7.3L</div>
              <div class="ic-stat-meta">Direct earns this more vs Regular</div>
            </div>
          </div>
          <div class="ic-callout warn">
            <div class="ic-callout-title">🏦 Why Banks Push Regular Plans</div>
            <div class="ic-callout-body">A bank relationship manager earns 0.5–1% trail commission annually on every rupee you invest. On ₹10 Lakh invested, that's ₹5,000–10,000/year straight to them, compounding — not to you. It's not advice. It's a sales commission.</div>
          </div>
        </div>`,

        /* TAB 1 */
        `<div class="ic-section">
          <div class="ic-section-label">The compound cost — your money</div>
          <div class="ic-slider-section" style="--modal-accent:#c7f000">
            <div class="ic-slider-label">
              <span>Monthly SIP</span>
              <span class="ic-slider-val" id="mf-sip-val">₹10,000</span>
            </div>
            <input type="range" class="ic-slider" id="mf-sip" min="1000" max="100000" step="1000" value="10000">
            <div class="ic-slider-label">
              <span>Investment Duration</span>
              <span class="ic-slider-val" id="mf-yr-val">20 years</span>
            </div>
            <input type="range" class="ic-slider" id="mf-yr" min="5" max="30" step="1" value="20">
          </div>
          <div class="ic-result-display">
            <div class="ic-result-item">
              <div class="ic-result-label">Direct Plan Corpus</div>
              <div class="ic-result-value accent" id="mf-direct">₹99.9 L</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Regular Plan Corpus</div>
              <div class="ic-result-value danger" id="mf-regular">₹92.5 L</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">You Lose (Commission)</div>
              <div class="ic-result-value danger" id="mf-loss">₹7.4 L</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Extra returns %</div>
              <div class="ic-result-value accent" id="mf-pct">+8%</div>
            </div>
          </div>
          <div class="ic-chart-wrap" style="margin-top:16px">
            <div class="ic-chart-title">Regular vs Direct corpus over time (₹ Lakhs)</div>
            <canvas id="mf-chart"></canvas>
          </div>
        </div>`,

        /* TAB 2 */
        `<div class="ic-section">
          <div class="ic-section-label">Switch in 4 steps — takes 15 minutes</div>
          <div class="ic-steps">
            <div class="ic-step">
              <div class="ic-step-num">1</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Log in to MF Central or AMC Website</div>
                <div class="ic-step-desc">MFCentral.in aggregates all your mutual funds. You can see Regular vs Direct breakdown across all AMCs in one place.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">2</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Check LTCG Before Switching</div>
                <div class="ic-step-desc">Switching from Regular → Direct is a redemption + purchase = capital gains event. If gains < ₹1 Lakh, it's tax-free (LTCG exemption). Plan accordingly.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">3</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Use Kuvera, Groww or Coin for Direct</div>
                <div class="ic-step-desc">These platforms offer zero-commission direct plans. Kuvera also has a "Switch Regular to Direct" tool that auto-calculates tax impact before you decide.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">4</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Set Up New SIP in Direct Plan</div>
                <div class="ic-step-desc">Stop the old SIP in regular plan. Start a fresh SIP in the same fund (direct variant) on a new platform. Done — you now keep 100% of returns.</div>
              </div>
            </div>
          </div>
          <div class="ic-callout success">
            <div class="ic-callout-title">✅ Best Direct Platforms (2024)</div>
            <div class="ic-callout-body">Kuvera (best for portfolios), Groww (simplest UX), Coin by Zerodha (traders), MF Central (official CAMS + Karvy). All regulated by SEBI. Zero commission.</div>
          </div>
        </div>`
      ]
    };
  }

  /* ── INFLATION CONTENT ─────────────────────────────────────── */
  function buildInflationContent() {
    return {
      tabs: ['The Reality', 'Your FD vs Inflation', 'What Beats It'],
      panels: [
        /* TAB 0 */
        `<div class="ic-section">
          <div class="ic-section-label">What inflation actually means for you</div>
          <div class="ic-stats-row">
            <div class="ic-stat-card" style="--sc-color:#ff4444">
              <div class="ic-stat-label">Official CPI (2024 avg)</div>
              <div class="ic-stat-value">~5.5%</div>
              <div class="ic-stat-meta">Rice, wheat, vegetables index</div>
            </div>
            <div class="ic-stat-card" style="--sc-color:#ff6b35">
              <div class="ic-stat-label">Urban Lifestyle Inflation</div>
              <div class="ic-stat-value">10–12%</div>
              <div class="ic-stat-meta">School fees, health, rent, tech</div>
            </div>
            <div class="ic-stat-card" style="--sc-color:#ffb347">
              <div class="ic-stat-label">Education Inflation India</div>
              <div class="ic-stat-value">10–15%</div>
              <div class="ic-stat-meta">IIT/IIM fees rising 10% per year</div>
            </div>
          </div>
          <div class="ic-section-label">Purchasing power decay</div>
          <div class="ic-slider-section" style="--modal-accent:#ff4444">
            <div class="ic-slider-label">
              <span>Starting Amount</span>
              <span class="ic-slider-val" id="inf-amt-val">₹1,00,000</span>
            </div>
            <input type="range" class="ic-slider" id="inf-amt" min="10000" max="1000000" step="10000" value="100000">
          </div>
          <div class="ic-section-label">Real purchasing power over time (at 7% inflation)</div>
          <div class="ic-progress-row" id="inf-bars">
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">Today</span><span class="val ic-inf-now">₹1,00,000</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#00ffa3" data-width="100"></div></div>
            </div>
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">After 5 years</span><span class="val ic-inf-5">₹71,299</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#c7f000" data-width="71"></div></div>
            </div>
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">After 10 years</span><span class="val ic-inf-10">₹50,835</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#ffb347" data-width="51"></div></div>
            </div>
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">After 20 years</span><span class="val ic-inf-20">₹25,842</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#ff4444" data-width="26"></div></div>
            </div>
          </div>
          <div class="ic-callout danger">
            <div class="ic-callout-title">🔥 The FD Illusion</div>
            <div class="ic-callout-body">A bank FD at 7% feels safe. But at 7% inflation, your real return is 0%. After 30% income tax on interest, real return is <strong>-2.1%</strong>. You're getting poorer while feeling safe.</div>
          </div>
        </div>`,

        /* TAB 1 */
        `<div class="ic-section">
          <div class="ic-section-label">Real return calculator</div>
          <div class="ic-slider-section" style="--modal-accent:#ff4444">
            <div class="ic-slider-label">
              <span>FD Interest Rate</span>
              <span class="ic-slider-val" id="fd-rate-val">7.0%</span>
            </div>
            <input type="range" class="ic-slider" id="fd-rate" min="4" max="9" step="0.1" value="7">
            <div class="ic-slider-label">
              <span>Inflation Rate</span>
              <span class="ic-slider-val" id="inf-rate-val">6.5%</span>
            </div>
            <input type="range" class="ic-slider" id="inf-rate" min="4" max="12" step="0.1" value="6.5">
            <div class="ic-slider-label">
              <span>Your Tax Bracket</span>
              <span class="ic-slider-val" id="tax-val">30%</span>
            </div>
            <input type="range" class="ic-slider" id="tax-rate" min="0" max="30" step="5" value="30">
          </div>
          <div class="ic-result-display">
            <div class="ic-result-item">
              <div class="ic-result-label">FD Return</div>
              <div class="ic-result-value" id="fd-nominal">7.0%</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Post-Tax Return</div>
              <div class="ic-result-value" id="fd-posttax">4.9%</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Real Return</div>
              <div class="ic-result-value danger" id="fd-real">-1.6%</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Verdict</div>
              <div class="ic-result-value danger" id="fd-verdict">LOSING</div>
            </div>
          </div>
          <div class="ic-chart-wrap" style="margin-top:16px">
            <div class="ic-chart-title">₹10 Lakh: Nominal value vs Real purchasing power</div>
            <canvas id="inf-chart"></canvas>
          </div>
        </div>`,

        /* TAB 2 */
        `<div class="ic-section">
          <div class="ic-section-label">Asset class real returns (10-yr avg, India)</div>
          <div class="ic-progress-row">
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">🟢 Nifty 50 Equity (~15% CAGR)</span><span class="val">Real: +8%</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#00ffa3" data-width="90"></div></div>
            </div>
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">🟡 Gold (~10% CAGR)</span><span class="val">Real: +3%</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#c7f000" data-width="60"></div></div>
            </div>
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">🟠 Real Estate (~8–10% CAGR)</span><span class="val">Real: +1–3%</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#ffb347" data-width="50"></div></div>
            </div>
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">🔴 Fixed Deposit (~7%)</span><span class="val">Real: 0% (taxed: -2%)</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#ff6b35" data-width="15"></div></div>
            </div>
            <div class="ic-progress-item">
              <div class="ic-progress-top"><span class="label">🔴 Savings Account (~3.5%)</span><span class="val">Real: -3.5%</span></div>
              <div class="ic-progress-bar"><div class="ic-progress-fill" style="--bar-color:#ff4444" data-width="5"></div></div>
            </div>
          </div>
          <div class="ic-callout success">
            <div class="ic-callout-title">✅ The Core Principle</div>
            <div class="ic-callout-body">Beat inflation → invest in growth assets. Keep 3–6 months emergency fund in high-yield savings or liquid MF. Everything beyond that should compound above inflation rate — ideally in equity, gold, or real assets.</div>
          </div>
          <div class="ic-callout info">
            <div class="ic-callout-title">💡 Liquid Fund > Savings Account</div>
            <div class="ic-callout-body">Liquid mutual funds return 6–7% with near-instant 1-day redemption. Better than 3.5% savings account for your emergency fund portion. SEBI-regulated, no lock-in.</div>
          </div>
        </div>`
      ]
    };
  }

  /* ── DEBT CONTENT ──────────────────────────────────────────── */
  function buildDebtContent() {
    return {
      tabs: ['Good vs Bad', 'EMI Front-Loading', 'Pre-Pay Strategy'],
      panels: [
        /* TAB 0 */
        `<div class="ic-section">
          <div class="ic-section-label">Not all debt destroys wealth</div>
          <div class="ic-compare">
            <div class="ic-compare-col good">
              <div class="ic-compare-head">✅ Good Debt</div>
              <div class="ic-compare-item"><span class="dot"></span>Home Loan (asset creation + 80C tax save)</div>
              <div class="ic-compare-item"><span class="dot"></span>Education Loan (if ROI positive career)</div>
              <div class="ic-compare-item"><span class="dot"></span>Business Loan (revenue > cost of debt)</div>
              <div class="ic-compare-item"><span class="dot"></span>Low-interest car loan (if income justified)</div>
            </div>
            <div class="ic-compare-col bad">
              <div class="ic-compare-head">❌ Bad Debt</div>
              <div class="ic-compare-item"><span class="dot"></span>Credit card revolving (24–42% interest)</div>
              <div class="ic-compare-item"><span class="dot"></span>Personal loan for vacation/gadgets</div>
              <div class="ic-compare-item"><span class="dot"></span>Buy Now Pay Later for consumption</div>
              <div class="ic-compare-item"><span class="dot"></span>Gold loan for non-emergency spending</div>
            </div>
          </div>
          <div class="ic-stats-row">
            <div class="ic-stat-card" style="--sc-color:#ff4444">
              <div class="ic-stat-label">Credit card interest rate</div>
              <div class="ic-stat-value">36–42%</div>
              <div class="ic-stat-meta">Revolving debt — compounded monthly</div>
            </div>
            <div class="ic-stat-card" style="--sc-color:#ffb347">
              <div class="ic-stat-label">Personal loan rate</div>
              <div class="ic-stat-value">11–18%</div>
              <div class="ic-stat-meta">Unsecured — pure consumption debt</div>
            </div>
            <div class="ic-stat-card" style="--sc-color:#00ffa3">
              <div class="ic-stat-label">Home loan rate (2024)</div>
              <div class="ic-stat-value">8.5–9%</div>
              <div class="ic-stat-meta">Asset-backed + tax deduction u/s 24</div>
            </div>
          </div>
          <div class="ic-callout info">
            <div class="ic-callout-title">📐 The Debt-Income Rule</div>
            <div class="ic-callout-body">Total EMIs should not exceed 40% of gross monthly income. If all your EMIs together exceed this, you're in debt stress territory — any income shock will cause defaults. Aim for 30% or less.</div>
          </div>
        </div>`,

        /* TAB 1 */
        `<div class="ic-section">
          <div class="ic-section-label">How banks front-load interest</div>
          <div class="ic-callout warn">
            <div class="ic-callout-title">⚡ Year 1 of a 20-year Home Loan</div>
            <div class="ic-callout-body">On a ₹50 Lakh home loan @ 9% for 20 years, your EMI is ~₹45,000. In Year 1: ₹37,500 is interest. Only ₹7,500 is actual principal repayment. You pay the loan backward.</div>
          </div>
          <div class="ic-section-label" style="margin-top:16px">Drag slider to see interest vs principal split by year</div>
          <div class="ic-slider-section" style="--modal-accent:#00d4ff">
            <div class="ic-slider-label">
              <span>Loan Year</span>
              <span class="ic-slider-val" id="emi-yr-val">Year 1</span>
            </div>
            <input type="range" class="ic-slider" id="emi-yr" min="1" max="20" step="1" value="1">
          </div>
          <div class="ic-emi-bar-wrap">
            <div class="ic-emi-bar">
              <div class="ic-emi-interest" id="emi-int-bar" style="width:83%">Interest</div>
              <div class="ic-emi-principal" id="emi-pri-bar" style="width:17%">Principal</div>
            </div>
            <div class="ic-emi-labels">
              <span id="emi-int-label">Interest: ₹37,500 (83%)</span>
              <span id="emi-pri-label">Principal: ₹7,500 (17%)</span>
            </div>
          </div>
          <div class="ic-result-display" style="margin-top:16px">
            <div class="ic-result-item">
              <div class="ic-result-label">Monthly EMI (fixed)</div>
              <div class="ic-result-value">₹45,000</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Total Interest Paid</div>
              <div class="ic-result-value danger">₹58 L</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Loan Amount</div>
              <div class="ic-result-value">₹50 L</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">You Actually Pay</div>
              <div class="ic-result-value danger">₹1.08 Cr</div>
            </div>
          </div>
          <div class="ic-chart-wrap" style="margin-top:16px">
            <div class="ic-chart-title">Interest vs Principal breakdown over loan tenure</div>
            <canvas id="emi-chart"></canvas>
          </div>
        </div>`,

        /* TAB 2 */
        `<div class="ic-section">
          <div class="ic-section-label">The pre-payment hack</div>
          <div class="ic-callout success">
            <div class="ic-callout-title">💡 Pay 1 Extra EMI per Year</div>
            <div class="ic-callout-body">On a 20-year home loan, paying just 1 extra EMI each year (₹45K/yr additional) closes the loan in ~14 years instead of 20. You save 6 years of EMIs and ₹15–20 Lakhs in interest.</div>
          </div>
          <div class="ic-slider-section" style="--modal-accent:#00d4ff">
            <div class="ic-slider-label">
              <span>Loan Amount</span>
              <span class="ic-slider-val" id="pp-loan-val">₹50 L</span>
            </div>
            <input type="range" class="ic-slider" id="pp-loan" min="1000000" max="10000000" step="500000" value="5000000">
            <div class="ic-slider-label">
              <span>Extra Yearly Prepayment</span>
              <span class="ic-slider-val" id="pp-extra-val">₹45,000</span>
            </div>
            <input type="range" class="ic-slider" id="pp-extra" min="0" max="500000" step="5000" value="45000">
          </div>
          <div class="ic-result-display">
            <div class="ic-result-item">
              <div class="ic-result-label">Original Tenure</div>
              <div class="ic-result-value">20 years</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">New Tenure</div>
              <div class="ic-result-value accent" id="pp-tenure">~14.2 yrs</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Years Saved</div>
              <div class="ic-result-value accent" id="pp-saved">5.8 yrs</div>
            </div>
            <div class="ic-result-item">
              <div class="ic-result-label">Interest Saved</div>
              <div class="ic-result-value accent" id="pp-int-saved">₹17.4 L</div>
            </div>
          </div>
          <div class="ic-steps" style="margin-top:20px">
            <div class="ic-step">
              <div class="ic-step-num">1</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Pre-pay in early years — max impact</div>
                <div class="ic-step-desc">₹1 Lakh pre-paid in Year 1 saves more interest than ₹1 Lakh in Year 15, because interest is charged on outstanding principal.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">2</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Choose tenure reduction, not EMI reduction</div>
                <div class="ic-step-desc">When you pre-pay, ask the bank to reduce tenure, not EMI. Reducing tenure eliminates more future interest and closes the loan faster.</div>
              </div>
            </div>
            <div class="ic-step">
              <div class="ic-step-num">3</div>
              <div class="ic-step-content">
                <div class="ic-step-title">Compare pre-pay vs invest</div>
                <div class="ic-step-desc">Home loan @ 9% vs equity returns @ 12–15%. Math says invest the extra money. But peace of mind of debt-free is worth something too. Choose based on your risk tolerance.</div>
              </div>
            </div>
          </div>
        </div>`
      ]
    };
  }

  /* ══════════════════════════════════════════════════════════════
     MODAL CHART RENDERERS
     ══════════════════════════════════════════════════════════════ */
  let activeCharts = {};

  function destroyCharts() {
    Object.values(activeCharts).forEach(c => { try { c.destroy(); } catch(e){} });
    activeCharts = {};
  }

  function renderModalCharts(insightId) {
    destroyCharts();

    if (insightId === 'sip') {
      /* Main SIP growth curves */
      const c1 = document.getElementById('sip-main-chart');
      if (c1) {
        const years = Array.from({length:36},(_,i)=>i);
        const s25 = years.map(y => sipCorpus(5000, y) / 1e5);
        const s30 = years.map(y => y>=5 ? sipCorpus(5000, y-5)/1e5 : 0);
        const s35 = years.map(y => y>=10 ? sipCorpus(5000, y-10)/1e5 : 0);
        activeCharts['sip-main'] = new Chart(c1.getContext('2d'), {
          type:'line',
          data:{
            labels: years.map(y=>'Yr '+(y+25)),
            datasets:[
              { label:'Start at 25', data:s25, borderColor:'#00ffa3', borderWidth:2.5, tension:0.4, pointRadius:0, fill:true,
                backgroundColor:(c)=>{ const g=c.chart.ctx.createLinearGradient(0,0,0,260); g.addColorStop(0,'rgba(0,255,163,0.15)'); g.addColorStop(1,'rgba(0,255,163,0)'); return g; }},
              { label:'Start at 30', data:s30, borderColor:'#ffb347', borderWidth:2, tension:0.4, pointRadius:0, borderDash:[6,3], fill:false },
              { label:'Start at 35', data:s35, borderColor:'#ff4444', borderWidth:2, tension:0.4, pointRadius:0, borderDash:[3,3], fill:false },
            ]
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{
              legend:{ labels:{ color:'rgba(255,255,255,0.5)', font:{size:11}, boxWidth:16 } },
              tooltip:{ callbacks:{ label:(ctx)=>`${ctx.dataset.label}: ₹${ctx.raw.toFixed(1)}L` } }
            },
            scales:{
              x:{ ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},maxTicksLimit:8}, grid:{color:'rgba(255,255,255,0.04)'} },
              y:{ ticks:{color:'rgba(255,255,255,0.3)',font:{size:10}, callback:(v)=>`₹${v.toFixed(0)}L`}, grid:{color:'rgba(255,255,255,0.04)'} }
            }
          }
        });
      }
      initSIPCalc();

    } else if (insightId === 'fno') {
      const cf = document.getElementById('fno-chart');
      if (cf) {
        activeCharts['fno'] = new Chart(cf.getContext('2d'), {
          type:'bar',
          data:{
            labels:['< -5L', '-5L to -1L', '-1L to 0', '0 to +1L', '+1L to +5L', '> +5L'],
            datasets:[{
              label:'% of traders',
              data:[8, 35, 50, 4, 2, 1],
              backgroundColor:['#ff4444','#ff6b35','#ff6b35','#c7f000','#00ffa3','#00ffa3'],
              borderRadius:6
            }]
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(c)=>`${c.raw}% of traders`}} },
            scales:{
              x:{ ticks:{color:'rgba(255,255,255,0.4)',font:{size:10}}, grid:{display:false} },
              y:{ ticks:{color:'rgba(255,255,255,0.4)',font:{size:10},callback:(v)=>v+'%'}, grid:{color:'rgba(255,255,255,0.04)'} }
            }
          }
        });
      }
      const cc = document.getElementById('fno-compare-chart');
      if (cc) {
        const yrs = Array.from({length:11},(_,i)=>i);
        const sip  = yrs.map(y => 10 + sipCorpus(15000, y, 12)/1e5);
        const loss = yrs.map(y => Math.max(0, 10 * Math.pow(0.85, y)));
        const win  = yrs.map(y => 10 * Math.pow(1.22, y));
        activeCharts['fno-c'] = new Chart(cc.getContext('2d'), {
          type:'line',
          data:{
            labels:yrs.map(y=>'Yr '+y),
            datasets:[
              { label:'SIP investor', data:sip, borderColor:'#00ffa3', borderWidth:2.5, tension:0.4, pointRadius:0, fill:false },
              { label:'Avg F&O (losing 80%)', data:loss, borderColor:'#ff4444', borderWidth:2, tension:0.4, pointRadius:0, borderDash:[5,3], fill:false },
              { label:'Skilled F&O (top 5%)', data:win, borderColor:'#00d4ff', borderWidth:2, tension:0.4, pointRadius:0, fill:false },
            ]
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{ labels:{color:'rgba(255,255,255,0.5)',font:{size:11},boxWidth:16} },
              tooltip:{callbacks:{label:(c)=>`${c.dataset.label}: ₹${c.raw.toFixed(1)}L`}} },
            scales:{
              x:{ ticks:{color:'rgba(255,255,255,0.3)',font:{size:10}}, grid:{color:'rgba(255,255,255,0.04)'} },
              y:{ ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},callback:(v)=>`₹${v.toFixed(0)}L`}, grid:{color:'rgba(255,255,255,0.04)'} }
            }
          }
        });
      }
      /* Animate bars */
      setTimeout(()=>{
        document.querySelectorAll('#fno-bars .ic-progress-fill').forEach(b => {
          animateBar(b, parseFloat(b.dataset.width)||0, 100);
        });
      }, 300);

    } else if (insightId === 'mf') {
      initMFCalc();

    } else if (insightId === 'inflation') {
      initInflation();

    } else if (insightId === 'debt') {
      /* EMI chart */
      const ce = document.getElementById('emi-chart');
      if (ce) {
        const yrs = Array.from({length:20},(_,i)=>i+1);
        const P=5000000, r=0.09/12, n=240;
        const emi = P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
        let bal = P;
        const intArr=[], priArr=[];
        for(let y=1;y<=20;y++){
          let yInt=0,yPri=0;
          for(let m=0;m<12;m++){
            const intPmt=bal*r;
            const priPmt=emi-intPmt;
            yInt+=intPmt; yPri+=priPmt; bal-=priPmt;
          }
          intArr.push(yInt/1e5);
          priArr.push(yPri/1e5);
        }
        activeCharts['emi'] = new Chart(ce.getContext('2d'), {
          type:'bar',
          data:{
            labels:yrs.map(y=>'Yr '+y),
            datasets:[
              { label:'Interest', data:intArr, backgroundColor:'rgba(255,107,53,0.7)', borderRadius:3, stack:'s' },
              { label:'Principal', data:priArr, backgroundColor:'rgba(0,212,255,0.7)', borderRadius:3, stack:'s' },
            ]
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{ labels:{color:'rgba(255,255,255,0.5)',font:{size:11},boxWidth:14} },
              tooltip:{callbacks:{label:(c)=>`${c.dataset.label}: ₹${c.raw.toFixed(1)}L`}} },
            scales:{
              x:{ stacked:true, ticks:{color:'rgba(255,255,255,0.3)',font:{size:9},maxTicksLimit:10}, grid:{display:false} },
              y:{ stacked:true, ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},callback:(v)=>`₹${v.toFixed(0)}L`}, grid:{color:'rgba(255,255,255,0.04)'} }
            }
          }
        });
      }
      initEMISlider();
      initPrepay();
    }

    /* Animate progress bars globally */
    setTimeout(()=>{
      document.querySelectorAll('.ic-progress-fill[data-width]').forEach(b => {
        animateBar(b, parseFloat(b.dataset.width)||0, 200);
      });
    }, 400);
  }

  /* ── SIP Calculator Logic ────────────────────────────────── */
  let sipCalcChart = null;
  function initSIPCalc() {
    const amtEl   = document.getElementById('sip-amount');
    const ageEl   = document.getElementById('sip-age');
    const rateEl  = document.getElementById('sip-rate');
    if (!amtEl) return;

    function update() {
      const amt  = +amtEl.value;
      const age  = +ageEl.value;
      const rate = +rateEl.value;
      const yrs  = Math.max(0, 60 - age);

      document.getElementById('sip-amount-val').textContent = inr(amt, false).replace('₹','₹');
      document.getElementById('sip-age-val').textContent    = age + ' years';
      document.getElementById('sip-rate-val').textContent   = rate.toFixed(1) + '%';

      const corpus   = sipCorpus(amt, yrs, rate);
      const invested = amt * yrs * 12;
      const gain     = corpus - invested;

      document.getElementById('sip-corpus').textContent   = inr(corpus);
      document.getElementById('sip-invested').textContent = inr(invested);
      document.getElementById('sip-gain').textContent     = inr(gain);
      document.getElementById('sip-years').textContent    = yrs + ' yrs';

      /* Update chart */
      const cc = document.getElementById('sip-calc-chart');
      if (!cc) return;
      const labels = Array.from({length:yrs+1},(_,i)=>i);
      const dInvested = labels.map(y => amt*y*12/1e5);
      const dCorpus   = labels.map(y => sipCorpus(amt, y, rate)/1e5);
      if (sipCalcChart) {
        sipCalcChart.data.labels = labels;
        sipCalcChart.data.datasets[0].data = dCorpus;
        sipCalcChart.data.datasets[1].data = dInvested;
        sipCalcChart.update('none');
      } else {
        sipCalcChart = new Chart(cc.getContext('2d'), {
          type:'line',
          data:{
            labels,
            datasets:[
              { label:'Corpus', data:dCorpus, borderColor:'#00ffa3', borderWidth:2.5, tension:0.4, pointRadius:0, fill:true,
                backgroundColor:(c)=>{ const g=c.chart.ctx.createLinearGradient(0,0,0,200); g.addColorStop(0,'rgba(0,255,163,0.2)'); g.addColorStop(1,'rgba(0,255,163,0)'); return g; } },
              { label:'Invested', data:dInvested, borderColor:'rgba(255,255,255,0.3)', borderWidth:1.5, tension:0, pointRadius:0, fill:false, borderDash:[4,3] },
            ]
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{labels:{color:'rgba(255,255,255,0.5)',font:{size:11},boxWidth:14}},
              tooltip:{callbacks:{label:(c)=>`${c.dataset.label}: ₹${c.raw.toFixed(1)}L`}} },
            scales:{
              x:{ ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},maxTicksLimit:6,callback:(v,i)=>'Yr '+i}, grid:{color:'rgba(255,255,255,0.04)'} },
              y:{ ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},callback:(v)=>`₹${v.toFixed(0)}L`}, grid:{color:'rgba(255,255,255,0.04)'} }
            }
          }
        });
        activeCharts['sip-calc'] = sipCalcChart;
      }
    }

    // Remove then re-add to prevent duplicate listeners when modal re-opens
    [amtEl, ageEl, rateEl].forEach(el => { el.removeEventListener('input', update); el.addEventListener('input', update); });
    update();
  }

  /* ── MF Calculator Logic ─────────────────────────────────── */
  let mfChart = null;
  function initMFCalc() {
    const sipEl = document.getElementById('mf-sip');
    const yrEl  = document.getElementById('mf-yr');
    if (!sipEl) return;

    function update() {
      const sip = +sipEl.value;
      const yr  = +yrEl.value;
      document.getElementById('mf-sip-val').textContent = inr(sip, false);
      document.getElementById('mf-yr-val').textContent  = yr + ' years';

      const direct  = sipCorpus(sip, yr, 12);
      const regular = sipCorpus(sip, yr, 11);
      const loss    = direct - regular;
      const pct     = ((direct/regular - 1)*100).toFixed(1);

      document.getElementById('mf-direct').textContent  = inr(direct);
      document.getElementById('mf-regular').textContent = inr(regular);
      document.getElementById('mf-loss').textContent    = inr(loss);
      document.getElementById('mf-pct').textContent     = '+' + pct + '%';

      const cc = document.getElementById('mf-chart');
      if (!cc) return;
      const labels = Array.from({length:yr+1},(_,i)=>i);
      const dDir = labels.map(y => sipCorpus(sip,y,12)/1e5);
      const dReg = labels.map(y => sipCorpus(sip,y,11)/1e5);
      if (mfChart) {
        mfChart.data.labels = labels;
        mfChart.data.datasets[0].data = dDir;
        mfChart.data.datasets[1].data = dReg;
        mfChart.update('none');
      } else {
        mfChart = new Chart(cc.getContext('2d'), {
          type:'line',
          data:{
            labels,
            datasets:[
              { label:'Direct Plan', data:dDir, borderColor:'#c7f000', borderWidth:2.5, tension:0.4, pointRadius:0, fill:true,
                backgroundColor:(c)=>{ const g=c.chart.ctx.createLinearGradient(0,0,0,220); g.addColorStop(0,'rgba(199,240,0,0.15)'); g.addColorStop(1,'rgba(199,240,0,0)'); return g; } },
              { label:'Regular Plan', data:dReg, borderColor:'#ff6b35', borderWidth:2, tension:0.4, pointRadius:0, fill:false, borderDash:[5,3] },
            ]
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{labels:{color:'rgba(255,255,255,0.5)',font:{size:11},boxWidth:14}},
              tooltip:{callbacks:{label:(c)=>`${c.dataset.label}: ₹${c.raw.toFixed(1)}L`}} },
            scales:{
              x:{ ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},maxTicksLimit:8,callback:(v,i)=>'Yr '+i}, grid:{color:'rgba(255,255,255,0.04)'} },
              y:{ ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},callback:(v)=>`₹${v.toFixed(0)}L`}, grid:{color:'rgba(255,255,255,0.04)'} }
            }
          }
        });
        activeCharts['mf'] = mfChart;
      }
    }

    [sipEl, yrEl].forEach(el => el.addEventListener('input', update));
    update();
  }

  /* ── Inflation Calculator Logic ──────────────────────────── */
  let infChart = null;
  function initInflation() {
    const amtEl  = document.getElementById('inf-amt');
    const fdEl   = document.getElementById('fd-rate');
    const irEl   = document.getElementById('inf-rate');
    const taxEl  = document.getElementById('tax-rate');

    function updateBars() {
      if (!amtEl) return;
      const amt = +amtEl.value;
      document.getElementById('inf-amt-val').textContent = inr(amt, false);
      const now = amt, y5 = amt*Math.pow(1/1.07,5), y10 = amt*Math.pow(1/1.07,10), y20 = amt*Math.pow(1/1.07,20);
      document.querySelector('.ic-inf-now').textContent = inr(now, false);
      document.querySelector('.ic-inf-5').textContent   = inr(y5, false);
      document.querySelector('.ic-inf-10').textContent  = inr(y10, false);
      document.querySelector('.ic-inf-20').textContent  = inr(y20, false);
      document.querySelector('[data-width="100"]').style.width = '100%';
      document.querySelector('[data-width="71"]').style.width  = (y5/now*100).toFixed(1)+'%';
      document.querySelector('[data-width="51"]').style.width  = (y10/now*100).toFixed(1)+'%';
      document.querySelector('[data-width="26"]').style.width  = (y20/now*100).toFixed(1)+'%';
    }

    function updateFD() {
      if (!fdEl) return;
      const fd  = +fdEl.value;
      const ir  = +irEl.value;
      const tax = +taxEl.value/100;
      document.getElementById('fd-rate-val').textContent = fd.toFixed(1)+'%';
      document.getElementById('inf-rate-val').textContent= ir.toFixed(1)+'%';
      document.getElementById('tax-val').textContent     = (tax*100).toFixed(0)+'%';
      const posttax = fd*(1-tax);
      const real    = posttax - ir;
      document.getElementById('fd-nominal').textContent  = fd.toFixed(1)+'%';
      document.getElementById('fd-posttax').textContent  = posttax.toFixed(1)+'%';
      document.getElementById('fd-real').textContent     = real.toFixed(1)+'%';
      const vEl = document.getElementById('fd-verdict');
      if (real > 1)      { vEl.textContent='WINNING';  vEl.className='ic-result-value accent'; }
      else if (real > 0) { vEl.textContent='NEUTRAL';  vEl.className='ic-result-value'; }
      else               { vEl.textContent='LOSING';   vEl.className='ic-result-value danger'; }

      /* Chart */
      const cc = document.getElementById('inf-chart');
      if (!cc) return;
      const yrs = Array.from({length:21},(_,i)=>i);
      const nominal = yrs.map(y => (1000000 * Math.pow(1+fd/100, y))/1e5);
      const realArr = yrs.map(y => (1000000 * Math.pow(1+posttax/100-ir/100, y))/1e5);
      if (infChart) {
        infChart.data.datasets[0].data = nominal;
        infChart.data.datasets[1].data = realArr;
        infChart.update('none');
      } else {
        infChart = new Chart(cc.getContext('2d'), {
          type:'line',
          data:{
            labels:yrs.map(y=>'Yr '+y),
            datasets:[
              { label:'Nominal Value', data:nominal, borderColor:'#ffb347', borderWidth:2, tension:0.4, pointRadius:0, fill:false },
              { label:'Real Purchasing Power', data:realArr, borderColor:'#ff4444', borderWidth:2.5, tension:0.4, pointRadius:0, fill:true,
                backgroundColor:(c)=>{ const g=c.chart.ctx.createLinearGradient(0,0,0,220); g.addColorStop(0,'rgba(255,68,68,0.1)'); g.addColorStop(1,'rgba(255,68,68,0)'); return g; } },
            ]
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{labels:{color:'rgba(255,255,255,0.5)',font:{size:11},boxWidth:14}},
              tooltip:{callbacks:{label:(c)=>`${c.dataset.label}: ₹${c.raw.toFixed(1)}L`}} },
            scales:{
              x:{ ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},maxTicksLimit:8}, grid:{color:'rgba(255,255,255,0.04)'} },
              y:{ ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},callback:(v)=>`₹${v.toFixed(0)}L`}, grid:{color:'rgba(255,255,255,0.04)'} }
            }
          }
        });
        activeCharts['inf'] = infChart;
      }
    }

    if (amtEl) amtEl.addEventListener('input', updateBars);
    if (fdEl)  [fdEl, irEl, taxEl].forEach(el => el.addEventListener('input', updateFD));
    updateBars();
    updateFD();
    setTimeout(()=>{
      document.querySelectorAll('#inf-bars .ic-progress-fill').forEach(b => {
        animateBar(b, parseFloat(b.dataset.width)||0, 100);
      });
    }, 300);
  }

  /* ── EMI Slider Logic ────────────────────────────────────── */
  function initEMISlider() {
    const slEl = document.getElementById('emi-yr');
    if (!slEl) return;
    const P=5000000, r=0.09/12, n=240;
    const emi=P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);

    function getYearPayments(yearNum) {
      let bal=P;
      for(let y=1;y<yearNum;y++) for(let m=0;m<12;m++) { const i=bal*r; bal-=(emi-i); }
      let yInt=0,yPri=0;
      for(let m=0;m<12;m++) { const i=bal*r; yInt+=i; yPri+=(emi-i); bal-=(emi-i); }
      return { int:yInt, pri:yPri };
    }

    function update() {
      const yr = +slEl.value;
      document.getElementById('emi-yr-val').textContent = 'Year ' + yr;
      const {int,pri} = getYearPayments(yr);
      const total = int+pri;
      const intPct = (int/total*100).toFixed(0);
      const priPct = (pri/total*100).toFixed(0);
      document.getElementById('emi-int-bar').style.width = intPct + '%';
      document.getElementById('emi-pri-bar').style.width = priPct + '%';
      document.getElementById('emi-int-bar').textContent = intPct > 15 ? 'Interest' : '';
      document.getElementById('emi-pri-bar').textContent = priPct > 15 ? 'Principal' : '';
      document.getElementById('emi-int-label').textContent = `Interest: ₹${Math.round(int/12).toLocaleString('en-IN')}/mo (${intPct}%)`;
      document.getElementById('emi-pri-label').textContent = `Principal: ₹${Math.round(pri/12).toLocaleString('en-IN')}/mo (${priPct}%)`;
    }
    slEl.addEventListener('input', update);
    update();
  }

  /* ── Prepay Calculator ───────────────────────────────────── */
  function initPrepay() {
    const loanEl  = document.getElementById('pp-loan');
    const extraEl = document.getElementById('pp-extra');
    if (!loanEl) return;

    function calcTenure(principal, extraYearly, annualRate=9, originalYears=20) {
      const r = annualRate/100/12;
      const n = originalYears * 12;
      const emi = principal * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1);
      let bal = principal;
      let months = 0;
      const maxMonths = n + 120;
      while (bal > 0 && months < maxMonths) {
        const interest = bal * r;
        const principal_pmt = emi - interest;
        bal -= principal_pmt;
        months++;
        if (months % 12 === 0 && extraYearly > 0) bal = Math.max(0, bal - extraYearly);
      }
      return months;
    }

    function update() {
      const loan  = +loanEl.value;
      const extra = +extraEl.value;
      document.getElementById('pp-loan-val').textContent  = inr(loan);
      document.getElementById('pp-extra-val').textContent = extra === 0 ? 'No prepayment' : inr(extra, false);

      const r = 0.09/12, n = 240;
      const emi = loan * r * Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
      const totalNormal   = emi * 240;
      const newMonths     = calcTenure(loan, extra);
      const totalNew      = emi * newMonths + extra * Math.ceil(newMonths/12);
      const yrsSaved      = ((240 - newMonths)/12).toFixed(1);
      const intSaved      = totalNormal - totalNew;

      document.getElementById('pp-tenure').textContent   = '~' + (newMonths/12).toFixed(1) + ' yrs';
      document.getElementById('pp-saved').textContent    = yrsSaved + ' yrs';
      document.getElementById('pp-int-saved').textContent = inr(Math.max(0, intSaved));
    }

    [loanEl, extraEl].forEach(el => el.addEventListener('input', update));
    update();
  }

  /* ══════════════════════════════════════════════════════════════
     MODAL ENGINE
     ══════════════════════════════════════════════════════════════ */
  let currentInsight = null;

  function getContent(id) {
    switch(id) {
      case 'sip':       return buildSIPContent();
      case 'fno':       return buildFNOContent();
      case 'mf':        return buildMFContent();
      case 'inflation': return buildInflationContent();
      case 'debt':      return buildDebtContent();
      default:          return null;
    }
  }

  function openModal(insightId) {
    const ins = INSIGHTS.find(i => i.id === insightId);
    if (!ins) return;
    currentInsight = ins;
    const content = getContent(insightId);
    if (!content) return;

    const overlay = document.getElementById('ic-modal-overlay');
    const modal   = document.getElementById('ic-modal');
    if (!overlay || !modal) return;

    /* Set CSS vars */
    overlay.style.setProperty('--modal-accent', ins.accent);
    overlay.style.setProperty('--modal-accent-dim', ins.accentDim);
    overlay.style.setProperty('--modal-accent-dim2', ins.accentDim2);
    overlay.style.setProperty('--modal-shadow', ins.shadow);
    modal.style.setProperty('--modal-accent', ins.accent);
    modal.style.setProperty('--modal-accent-dim', ins.accentDim);
    modal.style.setProperty('--modal-accent-dim2', ins.accentDim2);
    modal.style.setProperty('--modal-gradient', ins.gradient);
    modal.style.setProperty('--modal-shadow', ins.shadow);

    /* Header */
    document.getElementById('ic-modal-tag').textContent  = ins.badge + ' · FIN-OS Insight';
    document.getElementById('ic-modal-title').textContent = ins.title;
    document.getElementById('ic-modal-sub').textContent  = ins.sub;

    /* Tabs */
    const tabsEl  = document.getElementById('ic-modal-tabs');
    const bodyEl  = document.getElementById('ic-modal-body');
    tabsEl.innerHTML = content.tabs.map((t,i) =>
      `<div class="ic-tab${i===0?' active':''}" data-tab="${i}">${t}</div>`
    ).join('');
    bodyEl.innerHTML = content.panels.map((p,i) =>
      `<div class="ic-tab-panel${i===0?' active':''}" data-panel="${i}">${p}</div>`
    ).join('');

    /* CTA */
    const ctaEl = document.getElementById('ic-modal-cta');
    if (ctaEl) {
      ctaEl.textContent = ins.ctaLabel;
      ctaEl.href = ins.ctaHref || '#';
    }

    /* Tab switching */
    tabsEl.querySelectorAll('.ic-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        tabsEl.querySelectorAll('.ic-tab').forEach(t => t.classList.remove('active'));
        bodyEl.querySelectorAll('.ic-tab-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        bodyEl.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
        /* Trigger charts/sliders that may now be visible */
        setTimeout(() => renderModalCharts(insightId), 50);
      });
    });

    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    /* Render charts after animation */
    setTimeout(() => renderModalCharts(insightId), 400);
  }

  function closeModal() {
    const overlay = document.getElementById('ic-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    destroyCharts();
    currentInsight = null;
  }

  /* ══════════════════════════════════════════════════════════════
     MAIN RENDER — replaces existing insight grid
     ══════════════════════════════════════════════════════════════ */
  function renderInsightCards(containerEl) {
    if (!containerEl) return;

    containerEl.className = 'insights-grid';
    containerEl.style.cssText = '';
    containerEl.innerHTML = INSIGHTS.map((ins, idx) => buildCard(ins, idx)).join('');

    /* Init mini charts after DOM is ready */
    setTimeout(() => {
      INSIGHTS.forEach(ins => {
        const canvas = document.getElementById('mini-chart-' + ins.id);
        if (canvas && typeof Chart !== 'undefined') renderMiniChart(canvas, ins);
      });
    }, 100);

    /* Card click handlers */
    containerEl.querySelectorAll('.ic-card').forEach(card => {
      card.addEventListener('click', () => openModal(card.dataset.insight));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') openModal(card.dataset.insight);
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
     MODAL DOM INJECTION
     ══════════════════════════════════════════════════════════════ */
  function injectModal() {
    if (document.getElementById('ic-modal-overlay')) return;
    const tpl = `
    <div id="ic-modal-overlay" class="ic-modal-overlay" role="dialog" aria-modal="true">
      <div id="ic-modal" class="ic-modal">
        <div class="ic-drag-handle"></div>
        <div class="ic-modal-border"></div>

        <div class="ic-modal-header">
          <div class="ic-modal-tag" id="ic-modal-tag">FIN-OS Insight</div>
          <h2 class="ic-modal-title" id="ic-modal-title"></h2>
          <p class="ic-modal-sub" id="ic-modal-sub"></p>
          <button class="ic-modal-close" id="ic-modal-close" aria-label="Close">✕</button>
        </div>

        <div class="ic-modal-tabs" id="ic-modal-tabs"></div>
        <div class="ic-modal-body" id="ic-modal-body"></div>

        <div class="ic-modal-footer">
          <a href="#" class="ic-modal-cta primary" id="ic-modal-cta">Open Calculator</a>
          <a href="dashboard.html" class="ic-modal-cta secondary">← Dashboard</a>
          <span class="ic-modal-progress" id="ic-modal-prog">FIN-OS · Today's Insights</span>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', tpl);

    document.getElementById('ic-modal-close').addEventListener('click', closeModal);
    document.getElementById('ic-modal-overlay').addEventListener('click', e => {
      if (e.target === document.getElementById('ic-modal-overlay')) closeModal();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  }

  /* ══════════════════════════════════════════════════════════════
     INIT
     ══════════════════════════════════════════════════════════════ */
  function init() {
    injectModal();

    const el = document.getElementById('dash-adaptive-insights');
    if (el) {
      renderInsightCards(el);
      return;
    }

    /* Wait for personalization to create the container */
    window.addEventListener('finos-context-ready', () => {
      const el2 = document.getElementById('dash-adaptive-insights');
      if (el2) renderInsightCards(el2);
    });

    /* Fallback poll — simplified condition: just check children exist */
    let tries = 0;
    const poll = setInterval(() => {
      const el3 = document.getElementById('dash-adaptive-insights');
      if (el3 && el3.children.length > 0) {
        clearInterval(poll);
        renderInsightCards(el3);
        return;
      }
      if (++tries > 20) clearInterval(poll);
    }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Expose for debugging */
  window.FinosInsightCards = { open: openModal, close: closeModal };
})();
