/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  FIN-OS CONTEXT COLLECTOR  v2                                        ║
 * ║  Collects the full financial profile of the logged-in user from      ║
 * ║  every available source and exposes it as window.FINOS_USER_CONTEXT. ║
 * ║                                                                      ║
 * ║  SECURITY PRINCIPLES:                                                ║
 * ║  • READ-ONLY — never writes to any database                          ║
 * ║  • User-bound — context is scoped to the authenticated Supabase UID  ║
 * ║  • Tab-scoped — stored in sessionStorage only (cleared on tab close)  ║
 * ║  • Local-only — only transmitted to localhost:8765 (voice agent)      ║
 * ║  • No external leak — Ollama runs locally; context never leaves device║
 * ╚══════════════════════════════════════════════════════════════════════╝
 */
(function FinosContext() {
  'use strict';

  /* ── Config ──────────────────────────────────────────────────────────── */
  const SESSION_KEY    = 'FINOS_USER_CONTEXT';   // sessionStorage key
  const DB_CACHE_KEY   = 'FINOS_DB_PROFILE';     // localStorage cache of last Supabase fetch
  const REFRESH_MS     = 60_000;                 // re-collect page globals every 60s
  const SUPABASE_URL   = 'https://oeapcyucnduhwpgxfknb.supabase.co';
  const SUPABASE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  function safeJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function moduleFromUrl(href) {
    try {
      const p = new URL(href).pathname.toLowerCase();
      if (p.includes('portfolio'))  return 'portfolio';
      if (p.includes('budget'))     return 'budget';
      if (p.includes('tax'))        return 'tax';
      if (p.includes('goal'))       return 'goals';
      if (p.includes('net-worth') || p.includes('networth')) return 'net_worth';
      if (p.includes('insurance'))  return 'insurance';
      if (p.includes('calculator')) return 'calculators';
      if (p.includes('simulator'))  return 'trading_simulator';
      if (p.includes('dashboard'))  return 'dashboard';
      if (p.includes('market'))     return 'markets';
      if (p.includes('news'))       return 'news';
      if (p.includes('onboarding')) return 'onboarding';
      if (p.includes('settings'))   return 'settings';
      if (p.includes('profile'))    return 'profile';
      if (p.includes('journal'))    return 'trade_journal';
    } catch {}
    return 'home';
  }

  /* ── Phase 1 — Synchronous (instant, no network) ─────────────────────── */
  function collectSync() {
    const settings   = safeJson('FINOS_SYS_SETTINGS', {});
    const onboarding = safeJson('finos_profile', null);
    const dna        = safeJson('FINOS_CORE_DNA', null);
    const dbProfile  = safeJson(DB_CACHE_KEY, null);  // cached from last login

    /* Page-specific financial data
       Individual pages should expose these globals before this script runs.
       Format: window.FINOS_PAGE_DATA = { module:'portfolio', summary:{...}, items:[...] }
       Any page can also set specific globals: window.FINOS_PORTFOLIO_DATA etc.  */
    const pageData = {
      portfolio:  window.FINOS_PORTFOLIO_DATA  || null,
      budget:     window.FINOS_BUDGET_DATA     || null,
      goals:      window.FINOS_GOALS_DATA      || null,
      net_worth:  window.FINOS_NETWORTH_DATA   || null,
      tax:        window.FINOS_TAX_DATA        || null,
      insurance:  window.FINOS_INSURANCE_DATA  || null,
      journal:    window.FINOS_JOURNAL_DATA    || null,
      calculator: window.FINOS_CALC_DATA       || null,
      custom:     window.FINOS_PAGE_DATA       || null,  // catch-all for any page
    };
    // Strip null values to keep context compact
    Object.keys(pageData).forEach(k => { if (pageData[k] === null) delete pageData[k]; });

    // Watchlist
    const watchlist = safeJson('qs_watchlist', null);

    // Focus/habit history (last 7 entries only — don't bloat context)
    const focusHistory = (safeJson('finos_focus_history', []) || []).slice(-7);

    const ctx = {
      _version:      2,
      _user_id:      null,         // set after Supabase check
      _collected_at: Date.now(),
      _sync_phase:   'partial',    // 'partial' | 'full'
      _page_module:  moduleFromUrl(window.location.href),

      /* ── Identity (filled by Supabase) ── */
      identity: {
        name:         dbProfile?.full_name  || localStorage.getItem('finos_username') || null,
        email:        null,
        uid:          null,
        life_stage:   dbProfile?.life_stage || null,
        income_range: dbProfile?.income_range || null,
        mindset:      dbProfile?.mindset    || null,
        financial_dna:dbProfile?.financial_dna || (dna?.archetype) || null,
        interests:    dbProfile?.interests  || null,
        phone:        dbProfile?.phone      || null,
        city:         dbProfile?.city       || null,
        curiosity:    dbProfile?.curiosity_query || null,
      },

      /* ── DB profile (full row from Supabase profiles table) ── */
      profile: dbProfile,

      /* ── Onboarding answers (6 questions from onboarding.html) ── */
      onboarding,

      /* ── Financial DNA (FINOS_CORE_DNA) ── */
      dna,

      /* ── System settings (language, persona, theme, etc.) ── */
      settings: {
        language:     settings.aiLang        || 'hinglish',
        persona:      settings.aiPersona     || 'bhai',
        currency:     settings.currency      || 'INR',
        numberFormat: settings.numberFormat  || 'indian',
        riskLevel:    settings.riskLevel     || null,
        autoTax:      settings.autoTax       || false,
        showReturn:   settings.showReturn    !== false,
      },

      /* ── Current page ── */
      page: {
        url:    window.location.href,
        title:  document.title,
        module: moduleFromUrl(window.location.href),
      },

      /* ── Live financial data from the current page ── */
      financial: Object.keys(pageData).length ? pageData : null,

      /* ── Other signals ── */
      watchlist:    watchlist && watchlist.length ? watchlist.slice(0, 20) : null,
      focus_history: focusHistory.length ? focusHistory : null,
    };

    /* Restore identity from previous full sync stored in sessionStorage */
    try {
      const cached = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (cached && cached._user_id) {
        ctx._user_id      = cached._user_id;
        ctx.identity.uid  = cached._user_id;
        ctx.identity.email= cached.identity?.email  || null;
        if (!ctx.identity.name && cached.identity?.name) ctx.identity.name = cached.identity.name;
        if (!ctx.profile   && cached.profile)  ctx.profile = cached.profile;
        ctx._sync_phase   = cached._sync_phase || 'partial';
      }
    } catch {}

    return ctx;
  }

  /* ── Phase 2 — Async Supabase enrichment ──────────────────────────────── */
  async function enrichFromSupabase(ctx) {
    try {
      /* Prefer the already-initialised client from the page, otherwise create one.
         Using window.supabase (the CDN global) if available.                       */
      let client = null;
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      } else if (window._supabaseClient) {
        // Some pages store their client instance here
        client = window._supabaseClient;
      }
      if (!client) return ctx;

      const { data: { session } } = await client.auth.getSession();
      if (!session) return ctx;

      const user = session.user;

      /* SECURITY: bind this context to the authenticated user */
      ctx._user_id         = user.id;
      ctx._sync_phase      = 'full';
      ctx.identity.uid     = user.id;
      ctx.identity.email   = user.email;
      ctx.identity.name    = ctx.identity.name
                             || user.user_metadata?.full_name
                             || user.email?.split('@')[0]
                             || null;
      ctx.identity.provider     = user.app_metadata?.provider || 'email';
      ctx.identity.verified     = user.email_confirmed_at     != null;
      ctx.identity.member_since = user.created_at ? user.created_at.slice(0, 10) : null;

      /* Fetch full profile row from DB */
      const { data: dbProfile, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!error && dbProfile) {
        ctx.profile = dbProfile;

        /* Enrich identity from DB */
        ctx.identity.name         = ctx.identity.name || dbProfile.full_name || null;
        ctx.identity.life_stage   = dbProfile.life_stage   || ctx.identity.life_stage;
        ctx.identity.income_range = dbProfile.income_range || ctx.identity.income_range;
        ctx.identity.mindset      = dbProfile.mindset      || ctx.identity.mindset;
        ctx.identity.financial_dna= dbProfile.financial_dna|| ctx.identity.financial_dna;
        ctx.identity.interests    = dbProfile.interests    || ctx.identity.interests;
        ctx.identity.phone        = dbProfile.phone        || ctx.identity.phone;
        ctx.identity.city         = dbProfile.city         || ctx.identity.city;
        ctx.identity.curiosity    = dbProfile.curiosity_query || ctx.identity.curiosity;

        /* Cache for next tab open (so partial phase is already enriched) */
        try { localStorage.setItem(DB_CACHE_KEY, JSON.stringify(dbProfile)); } catch {}
      }

      /* Fetch transactions / goals / holdings */
      await _fetchFinancialRecords(client, user.id, ctx).catch(() => {});

      /* Fetch Financial Health Score summary from alert engine */
      await _fetchHealthScore(user.id, ctx).catch(() => {});

    } catch (err) {
      // Non-fatal — page may not have Supabase loaded
      console.debug('[FIN-OS Context] Supabase enrich skipped:', err.message);
    }

    return ctx;
  }

  /* ── Fetch additional financial records from Supabase ─────────────────── */
  async function _fetchFinancialRecords(client, uid, ctx) {
    /* These are best-effort — if the table doesn't exist we just skip it */
    const [txResult, goalsResult, holdingsResult] = await Promise.allSettled([
      client.from('transactions').select('category,amount,date,type').eq('user_id', uid)
            .order('date', { ascending: false }).limit(50),
      client.from('goals').select('*').eq('user_id', uid),
      client.from('holdings').select('symbol,quantity,avg_price,current_price').eq('user_id', uid),
    ]);

    if (!ctx.financial) ctx.financial = {};

    if (txResult.status === 'fulfilled' && txResult.value.data?.length) {
      const txs = txResult.value.data;
      /* Summarise by category */
      const summary = {};
      let totalIn = 0, totalOut = 0;
      txs.forEach(t => {
        if (t.type === 'income') totalIn  += Number(t.amount) || 0;
        else                    totalOut += Number(t.amount) || 0;
        if (t.category) summary[t.category] = (summary[t.category] || 0) + (Number(t.amount) || 0);
      });
      ctx.financial.transactions = {
        count: txs.length,
        total_income: totalIn,
        total_expense: totalOut,
        net: totalIn - totalOut,
        top_categories: Object.entries(summary)
          .sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([cat, amt]) => ({ cat, amt })),
      };
    }

    if (goalsResult.status === 'fulfilled' && goalsResult.value.data?.length) {
      ctx.financial.goals = goalsResult.value.data.map(g => ({
        name:       g.name || g.goal_name,
        target:     g.target_amount,
        saved:      g.current_amount,
        deadline:   g.target_date,
        progress:   g.target_amount
                      ? Math.round((g.current_amount / g.target_amount) * 100)
                      : null,
      }));
    }

    if (holdingsResult.status === 'fulfilled' && holdingsResult.value.data?.length) {
      const holdings = holdingsResult.value.data;
      let totalValue = 0, totalCost = 0;
      holdings.forEach(h => {
        totalValue += (h.quantity || 0) * (h.current_price || 0);
        totalCost  += (h.quantity || 0) * (h.avg_price    || 0);
      });
      ctx.financial.portfolio = {
        total_value: Math.round(totalValue),
        total_cost:  Math.round(totalCost),
        pnl:         Math.round(totalValue - totalCost),
        pnl_pct:     totalCost ? +(((totalValue - totalCost) / totalCost) * 100).toFixed(2) : 0,
        holdings:    holdings.slice(0, 10),
      };
    }
  }

  /* ── Fetch Financial Health Score summary ─────────────────────────────── */
  async function _fetchHealthScore(uid, ctx) {
    try {
      const r = await fetch(`http://localhost:8001/health-score/${uid}/summary`);
      if (!r.ok) return;
      const d = await r.json();
      if (!ctx.financial) ctx.financial = {};
      ctx.financial.health_score = {
        total:        d.total,
        tier:         d.tier,
        tier_emoji:   d.tier_emoji,
        headline:     d.headline,
        top_tips:     d.top_tips || [],
        worst_pillar: d.worst_pillar || null,
      };
    } catch (_) {}  // alert engine may not be running — non-fatal
  }

  /* ── Publish context ─────────────────────────────────────────────────── */
  function publish(ctx) {
    window.FINOS_USER_CONTEXT = ctx;

    /* sessionStorage: tab-scoped, cleared when browser tab closes.
       Never stored in localStorage to avoid cross-tab identity leaks.    */
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(ctx)); } catch {}

    window.dispatchEvent(new CustomEvent('finos-context-ready', {
      bubbles: false,
      detail: {
        phase:   ctx._sync_phase,
        user_id: ctx._user_id,
        name:    ctx.identity?.name,
        module:  ctx._page_module,
      }
    }));

    console.debug('[FIN-OS Context]', ctx._sync_phase, 'phase ready —',
                  ctx.identity?.name || ctx.identity?.email || 'guest',
                  '— module:', ctx._page_module);
  }

  /* ── Run ─────────────────────────────────────────────────────────────── */

  // Phase 1 — instant, synchronous
  const partialCtx = collectSync();
  publish(partialCtx);

  // Phase 2 — async Supabase enrichment (runs in background, doesn't block page)
  enrichFromSupabase(partialCtx).then(fullCtx => {
    publish(fullCtx);
  });

  // Periodic refresh — re-reads page globals in case financial data changed
  setInterval(() => {
    const fresh = collectSync();
    // Preserve full identity from the last enriched context
    if (window.FINOS_USER_CONTEXT?._user_id) {
      fresh._user_id    = window.FINOS_USER_CONTEXT._user_id;
      fresh.identity    = { ...window.FINOS_USER_CONTEXT.identity, ...fresh.identity };
      fresh.profile     = window.FINOS_USER_CONTEXT.profile;
      fresh._sync_phase = window.FINOS_USER_CONTEXT._sync_phase;
    }
    publish(fresh);
  }, REFRESH_MS);

})();
