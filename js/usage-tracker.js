/**
 * usage-tracker.js — FIN•OS Adaptive Behaviour Engine
 * =====================================================
 * Tracks user interactions to power the personalized dashboard layout.
 *
 * Tracks:
 *   - Page visits (page, timestamp, duration)
 *   - Calculator usage (which calculators, how often)
 *   - Portfolio check frequency (for stress detection)
 *   - Feature interactions (button clicks on key features)
 *   - Time-of-day patterns (morning/evening usage)
 *   - Day-of-week patterns (weekday vs weekend)
 *
 * Storage: localStorage (immediate) + Supabase user_behavior (30-day sync)
 * Window:  Rolling 30 days — older data pruned automatically
 *
 * Usage:
 *   FinosTracker.trackPage('portfolio')
 *   FinosTracker.trackCalc('sip-optimizer')
 *   FinosTracker.trackFeature('arya-ask')
 *   FinosTracker.getInsights()  → { topPages, stressLevel, timeContext, ... }
 */
(function (global) {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────────
  const STORAGE_KEY    = 'finos_usage_v1';
  const MAX_EVENTS     = 500;               // cap stored events
  const WINDOW_DAYS    = 30;               // rolling window
  const WINDOW_MS      = WINDOW_DAYS * 86_400_000;

  const SUPABASE_URL   = 'https://oeapcyucnduhwpgxfknb.supabase.co';
  const SUPABASE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

  // ── Page metadata (human labels + category) ──────────────────────────────
  const PAGE_META = {
    'dashboard':         { label: 'Dashboard',        cat: 'overview',    icon: '🏠' },
    'portfolio':         { label: 'Portfolio',         cat: 'investing',   icon: '📊', url: 'track-finances.html#portfolio-xray' },
    'track-finances':    { label: 'Track Finances',    cat: 'spending',    icon: '💸' },
    'budget-forecast':   { label: 'Budget Forecast',   cat: 'spending',    icon: '📅' },
    'diagnostics':       { label: 'Diagnostics',       cat: 'health',      icon: '🔬' },
    'benchmarking':      { label: 'Peer Benchmark',    cat: 'insights',    icon: '📊' },
    'timeline':          { label: 'My Timeline',       cat: 'insights',    icon: '📈' },
    'money-ai':          { label: 'Money AI',          cat: 'ai',          icon: '🤖' },
    'couple-finance':    { label: 'Couple Finance',    cat: 'social',      icon: '💑' },
    'financial-report':  { label: 'Report',            cat: 'insights',    icon: '📄' },
    'document-ai':       { label: 'Document AI',       cat: 'tools',       icon: '📄' },
    'markets':           { label: 'Markets',           cat: 'investing',   icon: '📉' },
    'tax':               { label: 'Tax',               cat: 'tax',         icon: '📋' },
    'life-goals-planner':{ label: 'Life Goals',        cat: 'planning',    icon: '🎯' },
    'foundations':       { label: 'Foundations',       cat: 'learn',       icon: '📚' },
    'settings':          { label: 'Settings',          cat: 'utility',     icon: '⚙️' },
  };

  // Portfolio-related pages — used for stress detection
  const PORTFOLIO_PAGES = new Set(['portfolio', 'markets', 'equitydetail',
    'mfdetail', 'derivativesdetail', 'stock-platform', 'quantedge']);

  // ── Storage helpers ────────────────────────────────────────────────────────
  function _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function _save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // localStorage quota exceeded — prune and retry
      if (data.events) data.events = data.events.slice(-200);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
    }
  }

  function _now() { return Date.now(); }
  function _cutoff() { return _now() - WINDOW_MS; }

  // ── Core event logger ─────────────────────────────────────────────────────
  function _logEvent(type, payload) {
    const data     = _load();
    data.events    = (data.events || []).filter(e => e.ts > _cutoff());
    data.events.push({ type, ts: _now(), ...payload });
    if (data.events.length > MAX_EVENTS) {
      data.events = data.events.slice(-MAX_EVENTS);
    }
    _save(data);
    // Emit so adaptive-layout.js can react in real time
    document.dispatchEvent(new CustomEvent('finos-usage-update', { detail: { type, payload } }));
  }

  // ── Session page timing ───────────────────────────────────────────────────
  let _pageId      = null;
  let _pageEnterTs = null;

  function _detectCurrentPage() {
    const path = window.location.pathname;
    const file = path.split('/').pop().replace('.html', '');
    return file || 'home';
  }

  function _startPageTimer(pageId) {
    _pageId      = pageId;
    _pageEnterTs = _now();
  }

  function _endPageTimer() {
    if (!_pageId || !_pageEnterTs) return;
    const duration = Math.min(_now() - _pageEnterTs, 30 * 60 * 1000); // cap 30 min
    if (duration > 3000) { // ignore bounces < 3s
      _logEvent('page_visit', { page: _pageId, duration });
    }
    _pageId = null; _pageEnterTs = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Call once per page on load. Tracks visit + starts duration timer.
   */
  function trackPage(pageId) {
    pageId = pageId || _detectCurrentPage();
    _startPageTimer(pageId);
    _logEvent('page_enter', { page: pageId, hour: new Date().getHours(), dow: new Date().getDay() });
  }

  /**
   * Track calculator usage. Call from calc pages.
   */
  function trackCalc(calcId) {
    _logEvent('calc_use', { calc: calcId });
  }

  /**
   * Track feature interaction (e.g. 'arya-ask', 'benchmark-refresh').
   */
  function trackFeature(featureId, metadata) {
    _logEvent('feature_use', { feature: featureId, ...(metadata || {}) });
  }

  /**
   * Explicitly track a portfolio check (call from portfolio/markets pages).
   */
  function trackPortfolioCheck() {
    _logEvent('portfolio_check', { ts: _now() });
  }

  // ── Analytics computation ─────────────────────────────────────────────────

  /**
   * Get page visit counts over the last N days.
   */
  function getPageCounts(days) {
    const cutoff   = _now() - (days || WINDOW_DAYS) * 86_400_000;
    const data     = _load();
    const counts   = {};
    for (const e of (data.events || [])) {
      if (e.type === 'page_enter' && e.ts > cutoff) {
        counts[e.page] = (counts[e.page] || 0) + 1;
      }
    }
    return counts;
  }

  /**
   * Get top N most-visited pages, sorted descending.
   */
  function getTopPages(n, days) {
    const counts = getPageCounts(days);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n || 5)
      .map(([page, count]) => ({
        page,
        count,
        meta: PAGE_META[page] || { label: page, cat: 'other', icon: '📄' },
      }));
  }

  /**
   * Get top N most-used calculators.
   */
  function getTopCalcs(n, days) {
    const cutoff = _now() - (days || WINDOW_DAYS) * 86_400_000;
    const data   = _load();
    const counts = {};
    for (const e of (data.events || [])) {
      if (e.type === 'calc_use' && e.ts > cutoff) {
        counts[e.calc] = (counts[e.calc] || 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n || 3)
      .map(([calc, count]) => ({ calc, count }));
  }

  /**
   * Detect portfolio stress: how many portfolio checks in last N hours.
   */
  function getPortfolioCheckCount(hours) {
    const cutoff = _now() - (hours || 1) * 3_600_000;
    const data   = _load();
    return (data.events || [])
      .filter(e => e.type === 'portfolio_check' && e.ts > cutoff)
      .length;
  }

  /**
   * Detect time-of-day context.
   */
  function getTimeContext() {
    const h   = new Date().getHours();
    const dow = new Date().getDay(); // 0=Sun, 6=Sat
    return {
      hour:       h,
      isWeekend:  dow === 0 || dow === 6,
      isMorning:  h >= 6  && h < 12,
      isAfternoon:h >= 12 && h < 17,
      isEvening:  h >= 17 && h < 22,
      isNight:    h >= 22 || h < 6,
      period:     h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night',
    };
  }

  /**
   * Detect if user checks portfolio on weekends (pattern over last 4 weeks).
   */
  function getWeekendPattern() {
    const data    = _load();
    const events  = (data.events || []);
    const weekendPortfolio = events.filter(
      e => e.type === 'page_enter' && PORTFOLIO_PAGES.has(e.page) && (e.dow === 0 || e.dow === 6)
    ).length;
    const weekdayPortfolio = events.filter(
      e => e.type === 'page_enter' && PORTFOLIO_PAGES.has(e.page) && e.dow > 0 && e.dow < 6
    ).length;
    return {
      isWeekendInvestor: weekendPortfolio > weekdayPortfolio,
      weekendChecks:     weekendPortfolio,
      weekdayChecks:     weekdayPortfolio,
    };
  }

  /**
   * Get full insights object used by adaptive-layout.js.
   */
  function getInsights() {
    return {
      topPages:           getTopPages(8),
      topCalcs:           getTopCalcs(3),
      portfolioChecks1h:  getPortfolioCheckCount(1),
      portfolioChecks3h:  getPortfolioCheckCount(3),
      timeContext:        getTimeContext(),
      weekendPattern:     getWeekendPattern(),
      pageCounts7d:       getPageCounts(7),
      pageCounts30d:      getPageCounts(30),
      totalEvents:        (_load().events || []).length,
      dataAge:            (() => {
        const events = (_load().events || []);
        if (!events.length) return 0;
        return Math.round((_now() - events[0].ts) / 86_400_000);
      })(),
    };
  }

  // ── Supabase sync (non-blocking, once per session) ─────────────────────────
  async function _syncToSupabase(userId) {
    if (!userId) return;
    const data = _load();
    const lastSync = data.lastSync || 0;
    if (_now() - lastSync < 3_600_000) return; // sync max once per hour

    try {
      const insights = getInsights();
      const payload  = {
        user_id:     userId,
        top_pages:   insights.topPages.map(p => p.page),
        top_calcs:   insights.topCalcs.map(c => c.calc),
        page_counts: insights.pageCounts30d,
        time_prefs:  { morning: 0, afternoon: 0, evening: 0 },
        updated_at:  new Date().toISOString(),
      };

      // Compute time-of-day preference from historical events
      for (const e of (data.events || [])) {
        if (e.type === 'page_enter' && e.hour !== undefined) {
          const period = e.hour < 12 ? 'morning' : e.hour < 17 ? 'afternoon' : 'evening';
          payload.time_prefs[period]++;
        }
      }

      await fetch(`${SUPABASE_URL}/rest/v1/user_behavior`, {
        method:  'POST',
        headers: {
          'apikey':        SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates',
        },
        body: JSON.stringify(payload),
      });

      data.lastSync = _now();
      _save(data);
    } catch { /* silent — offline sync fails gracefully */ }
  }

  // ── Auto-init ─────────────────────────────────────────────────────────────
  (function init() {
    // Auto-track current page
    const page = _detectCurrentPage();
    trackPage(page);

    // Auto-track portfolio checks on portfolio-type pages
    if (PORTFOLIO_PAGES.has(page)) {
      trackPortfolioCheck();
    }

    // End timer on page hide/close
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') _endPageTimer();
    });
    window.addEventListener('pagehide', _endPageTimer);
    window.addEventListener('beforeunload', _endPageTimer);

    // Sync to Supabase after 5s (non-blocking)
    setTimeout(async () => {
      try {
        if (typeof supabase !== 'undefined') {
          const { data: { session } } = await supabase
            .createClient(SUPABASE_URL, SUPABASE_KEY)
            .auth.getSession();
          if (session?.user?.id) {
            _syncToSupabase(session.user.id);
          }
        }
      } catch { /* graceful */ }
    }, 5000);
  })();

  // ── Export ────────────────────────────────────────────────────────────────
  global.FinosTracker = {
    trackPage,
    trackCalc,
    trackFeature,
    trackPortfolioCheck,
    getInsights,
    getTopPages,
    getTopCalcs,
    getPortfolioCheckCount,
    getTimeContext,
    getPageCounts,
    PAGE_META,
    PORTFOLIO_PAGES,
  };

})(window);
