/**
 * adaptive-layout.js — FIN•OS Personalized Dashboard Engine
 * ===========================================================
 * Reads FinosTracker insights and renders:
 *   1. Quick-access bar (top 5 pages pinned based on 30-day usage)
 *   2. Time-of-day layout context (morning market / evening budget)
 *   3. Stress detection + Arya proactive intervention
 *   4. Weekend pattern: show portfolio summary first on weekends
 *
 * Depends on: usage-tracker.js, finos-context.js
 *
 * Usage (add to dashboard.html):
 *   <div id="adaptive-quick-access"></div>
 *   <div id="adaptive-context-banner"></div>
 *   <script src="../js/usage-tracker.js"></script>
 *   <script src="../js/adaptive-layout.js"></script>
 */
(function (global) {
  'use strict';

  const ALERT_ENGINE = 'http://localhost:8001';

  // ── Layout config per time period ─────────────────────────────────────────
  const TIME_LAYOUTS = {
    morning: {
      headline:    'Good morning 🌅 — Markets open in',
      priority:    ['markets', 'portfolio', 'dashboard', 'track-finances'],
      arya_prompt: 'Give me a 2-sentence morning financial briefing. Include Nifty direction and one action item for today.',
      widgets:     ['market-snapshot', 'portfolio-pnl', 'today-alerts'],
      color:       '#f0a500',
    },
    afternoon: {
      headline:    'Afternoon check-in 🔆',
      priority:    ['dashboard', 'portfolio', 'track-finances', 'money-ai'],
      arya_prompt: 'Brief afternoon update — what should I focus on financially right now?',
      widgets:     ['portfolio-pnl', 'pending-actions', 'quick-calculator'],
      color:       '#00d4ff',
    },
    evening: {
      headline:    'Evening review 🌆 — How did today go?',
      priority:    ['track-finances', 'budget-forecast', 'diagnostics', 'dashboard'],
      arya_prompt: 'Give me a 2-sentence evening financial summary. Focus on today\'s spending and one thing to fix.',
      widgets:     ['today-spending', 'budget-status', 'tomorrow-sip'],
      color:       '#a855f7',
    },
    night: {
      headline:    'Late night 🌙 — Quick check?',
      priority:    ['portfolio', 'dashboard', 'money-ai', 'track-finances'],
      arya_prompt: null,
      widgets:     ['portfolio-pnl', 'dashboard'],
      color:       '#22d3a6',
    },
  };

  // ── Stress thresholds ──────────────────────────────────────────────────────
  const STRESS_LEVELS = {
    low:      { checks: 0, label: null },
    moderate: { checks: 3, label: 'Aaj kaafi bar portfolio dekha — sab theek hai bhai.' },
    high:     { checks: 5, label: null }, // triggers full Arya intervention
  };

  // ── Quick-access link renderer ─────────────────────────────────────────────
  function renderQuickAccess(containerId) {
    const container = document.getElementById(containerId);
    if (!container || typeof FinosTracker === 'undefined') return;

    const insights   = FinosTracker.getInsights();
    const timeCtx    = insights.timeContext;
    const layout     = TIME_LAYOUTS[timeCtx.period] || TIME_LAYOUTS.afternoon;
    const topPages   = insights.topPages;

    // Merge time-priority pages with usage-ranked pages
    const prioritySet = new Set(layout.priority);
    const ranked      = [
      ...layout.priority.map(p => ({
        page:  p,
        count: (insights.pageCounts30d[p] || 0),
        meta:  FinosTracker.PAGE_META[p] || { label: p, icon: '📄', cat: 'other' },
        isPriority: true,
      })),
      ...topPages
        .filter(p => !prioritySet.has(p.page))
        .map(p => ({ ...p, isPriority: false })),
    ].slice(0, 7);

    // Don't show quick-access if no usage data yet (fresh install)
    const hasSufficientData = insights.totalEvents > 5;

    const html = `
      <div class="qa-bar" role="navigation" aria-label="Quick Access">
        <div class="qa-label">
          ${hasSufficientData
            ? `<span class="qa-period-dot" style="background:${layout.color}"></span>
               <span class="qa-period-text">${layout.headline}</span>`
            : `<span class="qa-period-dot" style="background:#8892a4"></span>
               <span class="qa-period-text">Quick Access</span>`}
        </div>
        <div class="qa-links">
          ${ranked.map(item => `
            <a href="${item.page}.html" class="qa-chip ${item.isPriority ? 'qa-chip--time' : ''}"
               title="${item.count ? `Visited ${item.count}× this month` : 'Suggested for this time of day'}"
               onclick="FinosTracker.trackFeature('quick-access', { page: '${item.page}' })">
              <span class="qa-icon">${item.meta.icon}</span>
              <span class="qa-text">${item.meta.label}</span>
              ${item.count > 3 ? `<span class="qa-badge">${item.count}</span>` : ''}
            </a>`).join('')}
          <button class="qa-chip qa-chip--customize" onclick="FinosTracker.trackFeature('qa-customize')"
                  title="Layout adapts automatically based on your usage">
            ✨ Auto
          </button>
        </div>
      </div>`;

    container.innerHTML = html;
    _injectQuickAccessStyles();
  }

  // ── Context banner (time-of-day message) ──────────────────────────────────
  function renderContextBanner(containerId) {
    const container = document.getElementById(containerId);
    if (!container || typeof FinosTracker === 'undefined') return;

    const insights = FinosTracker.getInsights();
    const timeCtx  = insights.timeContext;

    let bannerHtml = '';

    if (timeCtx.isMorning && timeCtx.hour >= 9 && timeCtx.hour < 10) {
      // Market just opened
      bannerHtml = `
        <div class="context-banner context-banner--morning">
          <span class="cb-icon">🔔</span>
          <span class="cb-text">Markets just opened — Nifty live data loading...</span>
          <a href="markets.html" class="cb-action">Open Markets →</a>
        </div>`;
    } else if (timeCtx.isEvening && timeCtx.hour >= 18) {
      // Markets closed for the day
      bannerHtml = `
        <div class="context-banner context-banner--evening">
          <span class="cb-icon">🌆</span>
          <span class="cb-text">Markets closed. Good time to review today's spending.</span>
          <a href="track-finances.html" class="cb-action">Review Spending →</a>
        </div>`;
    } else if (timeCtx.isWeekend && insights.weekendPattern?.isWeekendInvestor) {
      bannerHtml = `
        <div class="context-banner context-banner--weekend">
          <span class="cb-icon">📅</span>
          <span class="cb-text">Weekend investor mode — tu usually Saturday morning portfolio check karta hai.</span>
          <a href="portfolio.html" class="cb-action">See Portfolio →</a>
        </div>`;
    }

    container.innerHTML = bannerHtml;
  }

  // ── Stress detector ───────────────────────────────────────────────────────
  async function checkStress() {
    if (typeof FinosTracker === 'undefined') return;

    const checks3h = FinosTracker.getPortfolioCheckCount(3);
    if (checks3h < STRESS_LEVELS.high.checks) return;

    // Fetch market data to confirm market is actually down
    let marketDown = false;
    try {
      const res = await fetch(`${ALERT_ENGINE}/market`);
      if (res.ok) {
        const mkt  = await res.json();
        marketDown = (mkt.nifty_change_pct || 0) < -1.5;
      }
    } catch { /* alert engine offline — skip stress check */ }

    if (!marketDown) return;

    // Show stress intervention
    _showStressCard(checks3h);
    FinosTracker.trackFeature('stress-intervention-shown', { checks: checks3h });
  }

  function _showStressCard(checkCount) {
    const existing = document.getElementById('finos-stress-card');
    if (existing) return; // already showing

    const card = document.createElement('div');
    card.id    = 'finos-stress-card';
    card.style.cssText = [
      'position:fixed;bottom:90px;right:20px;z-index:10000;',
      'max-width:340px;',
      'background:linear-gradient(135deg,#1a0f2e,#0d1117);',
      'border:1px solid rgba(168,85,247,.4);border-radius:16px;',
      'padding:20px;box-shadow:0 8px 32px rgba(0,0,0,.6);',
      'animation:slideInRight .4s cubic-bezier(.34,1.56,.64,1);',
    ].join('');

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInRight {
        from { opacity:0; transform:translateX(60px); }
        to   { opacity:1; transform:none; }
      }
    `;
    document.head.appendChild(style);

    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="font-size:1.6rem;flex-shrink:0;">🤖</div>
        <div>
          <div style="font-size:.7rem;font-weight:800;color:#a855f7;letter-spacing:.08em;margin-bottom:4px;">ARYA</div>
          <div style="font-size:.9rem;color:#F5F7FA;line-height:1.55;">
            Aaj market thoda neeche gaya hai. Tu <strong>${checkCount} baar</strong> portfolio dekh chuka hai —
            sab theek hai bhai. Long-term plan pe stick raho. ₹ SIP chal raha hai. 🙏
          </div>
          <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
            <a href="money-ai.html"
               style="background:rgba(168,85,247,.15);border:1px solid rgba(168,85,247,.4);
                      color:#a855f7;border-radius:8px;padding:6px 14px;font-size:.78rem;
                      font-weight:700;text-decoration:none;">
              Talk to Arya
            </a>
            <a href="portfolio.html"
               style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);
                      color:#8892a4;border-radius:8px;padding:6px 14px;font-size:.78rem;
                      text-decoration:none;">
              See Portfolio
            </a>
            <button onclick="document.getElementById('finos-stress-card').remove()"
                    style="background:transparent;border:none;color:#8892a4;
                           font-size:.78rem;cursor:pointer;padding:6px 0;margin-left:auto;">
              Dismiss ✕
            </button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(card);

    // Auto-dismiss after 15 seconds
    setTimeout(() => card.remove(), 15000);
  }

  // ── Weekend portfolio summary widget ──────────────────────────────────────
  function renderWeekendWidget(containerId) {
    if (typeof FinosTracker === 'undefined') return;
    const insights = FinosTracker.getInsights();
    const ctx      = insights.timeContext;
    if (!ctx.isWeekend) return;

    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="weekend-widget">
        <div class="ww-label">📅 Weekend Snapshot</div>
        <div class="ww-links">
          <a href="portfolio.html"   class="ww-btn">📊 Portfolio P&amp;L</a>
          <a href="diagnostics.html" class="ww-btn">🔬 Health Score</a>
          <a href="life-goals-planner.html" class="ww-btn">🎯 Goals Check</a>
          <a href="financial-report.html" class="ww-btn">📄 Full Report</a>
        </div>
      </div>`;
  }

  // ── CSS injection ─────────────────────────────────────────────────────────
  function _injectQuickAccessStyles() {
    if (document.getElementById('finos-qa-styles')) return;
    const s = document.createElement('style');
    s.id = 'finos-qa-styles';
    s.textContent = `
      .qa-bar {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 0 16px;
        border-bottom: 1px solid rgba(255,255,255,.06);
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .qa-label {
        display: flex;
        align-items: center;
        gap: 7px;
        flex-shrink: 0;
        font-size: .75rem;
        color: var(--text-muted, #8892a4);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: .07em;
      }
      .qa-period-dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        display: inline-block;
        flex-shrink: 0;
      }
      .qa-links {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        flex: 1;
      }
      .qa-chip {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 12px;
        border-radius: 20px;
        font-size: .8rem;
        font-weight: 600;
        text-decoration: none;
        color: var(--text-primary, #F5F7FA);
        background: rgba(255,255,255,.05);
        border: 1px solid rgba(255,255,255,.08);
        cursor: pointer;
        transition: background .15s, border-color .15s;
        white-space: nowrap;
      }
      .qa-chip:hover {
        background: rgba(255,255,255,.1);
        border-color: rgba(255,255,255,.18);
      }
      .qa-chip--time {
        border-color: rgba(0,212,255,.25);
        background: rgba(0,212,255,.06);
      }
      .qa-chip--time:hover { background: rgba(0,212,255,.12); }
      .qa-chip--customize {
        color: #8892a4;
        font-size: .72rem;
        border-style: dashed;
      }
      .qa-icon { font-size: .95rem; line-height: 1; }
      .qa-badge {
        background: rgba(0,212,255,.2);
        color: #00d4ff;
        border-radius: 10px;
        padding: 1px 6px;
        font-size: .65rem;
        font-weight: 800;
        margin-left: 2px;
      }

      /* Context banner */
      .context-banner {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 18px;
        border-radius: 10px;
        font-size: .85rem;
        margin-bottom: 16px;
      }
      .context-banner--morning  { background: rgba(240,165,0,.08); border: 1px solid rgba(240,165,0,.2); }
      .context-banner--evening  { background: rgba(168,85,247,.08); border: 1px solid rgba(168,85,247,.2); }
      .context-banner--weekend  { background: rgba(34,211,166,.08); border: 1px solid rgba(34,211,166,.2); }
      .cb-text   { flex: 1; color: var(--text-primary, #F5F7FA); }
      .cb-action {
        color: var(--accent, #00d4ff);
        font-weight: 700;
        text-decoration: none;
        white-space: nowrap;
        font-size: .8rem;
      }

      /* Weekend widget */
      .weekend-widget { margin-bottom: 20px; }
      .ww-label { font-size: .75rem; font-weight: 700; color: var(--text-muted, #8892a4);
                  text-transform: uppercase; letter-spacing: .08em; margin-bottom: 10px; }
      .ww-links { display: flex; gap: 8px; flex-wrap: wrap; }
      .ww-btn {
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 10px;
        padding: 8px 14px;
        font-size: .82rem;
        font-weight: 600;
        text-decoration: none;
        color: var(--text-primary, #F5F7FA);
        transition: background .15s;
      }
      .ww-btn:hover { background: rgba(255,255,255,.1); }
    `;
    document.head.appendChild(s);
  }

  // ── Auto-run on DOMContentLoaded ──────────────────────────────────────────
  function autoMount() {
    // Quick access bar
    if (document.getElementById('adaptive-quick-access')) {
      renderQuickAccess('adaptive-quick-access');
    }
    // Context banner
    if (document.getElementById('adaptive-context-banner')) {
      renderContextBanner('adaptive-context-banner');
    }
    // Weekend widget
    if (document.getElementById('adaptive-weekend-widget')) {
      renderWeekendWidget('adaptive-weekend-widget');
    }
    // Stress check (non-blocking, 3s delay to let page settle)
    setTimeout(checkStress, 3000);
    // Re-run quick access when usage data updates
    document.addEventListener('finos-usage-update', () => {
      if (document.getElementById('adaptive-quick-access')) {
        renderQuickAccess('adaptive-quick-access');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }

  // ── Export ────────────────────────────────────────────────────────────────
  global.FinosAdaptive = {
    renderQuickAccess,
    renderContextBanner,
    renderWeekendWidget,
    checkStress,
    TIME_LAYOUTS,
  };

})(window);
