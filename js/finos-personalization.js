/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  FIN-OS PERSONALIZATION ENGINE  v1.0                                     ║
 * ║  Drop on any page to unlock deeply personal, user-data-driven UI.        ║
 * ║                                                                           ║
 * ║  Features:                                                                ║
 * ║  • Time-aware greeting with user's first name                             ║
 * ║  • Financial status strip (health score, savings rate, streak)            ║
 * ║  • Adaptive daily insights ordered by user's knowledge gaps               ║
 * ║  • Smart nudges from actual DB data (goals behind, high spend, low SIP)   ║
 * ║  • Session streak tracking (consecutive days active)                      ║
 * ║  • Navigation badge injection (alerts, pending actions)                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
(function FinosPersonalization() {
  'use strict';

  /* ── Supabase config — reads from supabase-config.js singleton ── */
  const SB_URL = (window.FINOS_SB && window.FINOS_SB.url)
    ? window.FINOS_SB.url
    : 'https://oeapcyucnduhwpgxfknb.supabase.co';
  const SB_KEY = (window.FINOS_SB && window.FINOS_SB.key)
    ? window.FINOS_SB.key
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lYXBjeXVjbmR1aHdwZ3hma25iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNjE1NjgsImV4cCI6MjA4MzgzNzU2OH0.kyuz385hM4X3j8CMBFfI83ZerorvlXrUDOipAHKDC7Q';

  /* ── Exports — pages can call window.FinosPersona.xxx() ── */
  window.FinosPersona = window.FinosPersona || {};

  /* ── Helpers ── */
  function safeJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }

  function INR(n) {
    const num = Number(n) || 0;
    if (num >= 1e7) return '₹' + (num / 1e7).toFixed(1) + ' Cr';
    if (num >= 1e5) return '₹' + (num / 1e5).toFixed(1) + ' L';
    if (num >= 1e3) return '₹' + (num / 1e3).toFixed(0) + 'K';
    return '₹' + num.toLocaleString('en-IN');
  }

  function greetByTime() {
    const h = new Date().getHours();
    if (h < 5)  return 'Good night';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  }

  function firstNameFrom(full) {
    if (!full) return null;
    return full.trim().split(/\s+/)[0];
  }

  /* ── Streak tracking ── */
  function updateStreak() {
    const key = 'finos_streak';
    const today = new Date().toDateString();
    let streak = safeJson(key, { count: 0, lastDate: null, longestStreak: 0 });
    if (streak.lastDate === today) return streak;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const wasYesterday = streak.lastDate === yesterday.toDateString();
    streak.count = wasYesterday ? streak.count + 1 : 1;
    streak.lastDate = today;
    streak.longestStreak = Math.max(streak.longestStreak || 0, streak.count);
    try { localStorage.setItem(key, JSON.stringify(streak)); } catch {}
    return streak;
  }

  /* ── Context resolution (memoized per event-loop tick to avoid redundant localStorage reads) ── */
  let _ctxCache = null;
  let _ctxCacheTimer = null;

  function resolveCtx() {
    if (_ctxCache) return _ctxCache;

    const ctx = window.FINOS_USER_CONTEXT;
    const id  = ctx?.identity || {};
    const prof = ctx?.profile || {};
    const budget = ctx?.budget_tracker || null;
    const journal = ctx?.trade_journal || null;
    const goals = ctx?.financial?.goals || [];
    const portfolio = ctx?.financial?.portfolio || null;
    const dna = ctx?.dna || safeJson('FINOS_CORE_DNA', null);

    const name = firstNameFrom(
      id.name || localStorage.getItem('finos_display_name') || ''
    ) || 'Investor';

    const dnaTag = id.financial_dna || dna?.archetype || localStorage.getItem('finos_financial_dna') || 'Explorer';
    const stage  = id.life_stage   || localStorage.getItem('finos_stage') || 'Beginner';
    const income = id.income_range  || localStorage.getItem('finos_income') || null;
    const city   = id.city || null;

    const healthScore = parseFloat(
      prof.health_score || localStorage.getItem('finos_health_score') || 0
    );
    const savingsRate = parseFloat(
      prof.savings_rate || budget?.savings_rate || localStorage.getItem('finos_savings_rate') || 0
    );
    const netWorth = parseFloat(
      prof.net_worth || localStorage.getItem('finos_net_worth') || 0
    );

    const learnedModules = safeJson('finos_learned_modules', {});
    const quizScores     = safeJson('finos_learn_quiz_scores', {});
    const ALL_MODULES = ['equity','mutual_funds','etf','debt','fno','fundamental','technical',
                         'insurance','tax','crypto','commodity','forex','indicators','money_market'];
    const knowledgeGaps = ALL_MODULES.filter(m =>
      !learnedModules[m] || (quizScores[m]?.score || 0) < 67
    );

    _ctxCache = { ctx, id, prof, budget, journal, goals, portfolio, dna, dnaTag, stage, income, city,
             name, healthScore, savingsRate, netWorth, learnedModules, knowledgeGaps };

    // Invalidate cache after 16ms (one event loop turn) so each render cycle is fresh
    clearTimeout(_ctxCacheTimer);
    _ctxCacheTimer = setTimeout(() => { _ctxCache = null; }, 16);

    return _ctxCache;
  }

  // Also invalidate cache when new context is published
  window.addEventListener('finos-context-ready', () => { _ctxCache = null; });


  /* ════════════════════════════════════════════════════════════════════════
     1. PERSONALISED HEADER GREETING
     Replaces the first <h1> in .header with "Good morning, Vikas 👋"
  ════════════════════════════════════════════════════════════════════════ */
  // XSS-safe text sanitiser for dynamic user values
  function _esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function injectGreeting(opts = {}) {
    const { selector = '.header h1', nameEl = null, subEl = null } = opts;

    function _render() {
      const r = resolveCtx();
      const greeting = greetByTime();
      const streak   = updateStreak();
      const streakStr = streak.count > 1 ? ` · 🔥 ${streak.count}-day streak` : '';

      /* -- main H1 -- */
      const h1 = nameEl || document.querySelector(selector);
      if (h1) {
        h1.innerHTML = `${_esc(greeting)}, <span style="color:var(--accent,#c7f000)">${_esc(r.name)}</span> 👋`;
      }

      /* -- sub-headline -- */
      const sub = subEl || document.querySelector('.header p, .header .sub, .header-sub');
      if (sub && !sub.dataset.greetingSet) {
        sub.dataset.greetingSet = '1';
        const dnaLine = r.dnaTag !== 'Explorer'
          ? `Financial DNA: <span style="color:var(--accent,#c7f000)">${_esc(r.dnaTag)}</span>`
          : `${_esc(r.stage)} Stage`;
        sub.innerHTML = dnaLine + streakStr;
      }
    }

    // Render now with whatever we have, then re-render when DB data arrives
    _render();
    window.addEventListener('finos-context-ready', _render);
  }

  /* ════════════════════════════════════════════════════════════════════════
     2. FINANCIAL STATUS STRIP
     Injects a slim horizontal bar showing key live metrics.
  ════════════════════════════════════════════════════════════════════════ */
  function injectStatusStrip(anchorSelector = '.header') {
    if (document.getElementById('finos-status-strip')) return;

    function _buildStrip() {
      const r = resolveCtx();
      const items = [];

      if (r.healthScore > 0) {
        const tier = r.healthScore >= 80 ? '🟢' : r.healthScore >= 55 ? '🟡' : '🔴';
        items.push({ label: 'Health', value: `${tier} ${Math.round(r.healthScore)}/100`, href: 'diagnostics.html' });
      }
      if (r.savingsRate > 0) {
        const ok = r.savingsRate >= 20 ? '✅' : '⚠️';
        items.push({ label: 'Savings rate', value: `${ok} ${r.savingsRate}%`, href: 'track-finances.html' });
      }
      if (r.netWorth > 0) {
        items.push({ label: 'Net worth', value: INR(r.netWorth), href: 'diagnostics.html' });
      }
      if (r.budget?.fire_number > 0) {
        const pct = r.netWorth > 0
          ? Math.min(100, Math.round(r.netWorth / r.budget.fire_number * 100)) : 0;
        items.push({ label: 'FIRE', value: `${pct}% of goal`, href: 'life-goals-planner.html' });
      }
      if (r.journal?.win_rate > 0) {
        items.push({ label: 'Win rate', value: `${r.journal.win_rate}%`, href: '../TradeJournal/index.html' });
      }
      if (!items.length) return;

      let strip = document.getElementById('finos-status-strip');
      if (!strip) {
        strip = document.createElement('div');
        strip.id = 'finos-status-strip';
        strip.style.cssText = `
          display:flex; gap:0; flex-wrap:wrap; overflow:hidden;
          border-radius:14px; border:1px solid rgba(199,240,0,.12);
          background:rgba(199,240,0,.03);
          margin-bottom:20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        `;
        const anchor = document.querySelector(anchorSelector);
        if (anchor) anchor.insertAdjacentElement('afterend', strip);
        else document.querySelector('.content-wrapper, main')?.prepend(strip);
      }

      strip.innerHTML = items.map(it => `
        <${it.href ? `a href="${it.href}"` : 'span'} style="
          display:flex; flex-direction:column; align-items:center; gap:2px;
          padding:10px 18px; flex:1; min-width:80px;
          border-right:1px solid rgba(255,255,255,.05);
          text-decoration:none; transition:background .2s;
          ${it.href ? 'cursor:pointer;' : ''}
        " ${it.href ? `onmouseover="this.style.background='rgba(199,240,0,.06)'" onmouseout="this.style.background=''"` : ''}>
          <span style="font-size:10px;color:rgba(255,255,255,.35);letter-spacing:.08em;text-transform:uppercase;font-weight:600;">${it.label}</span>
          <span style="font-size:13px;font-weight:700;color:rgba(255,255,255,.85);">${it.value}</span>
        </${it.href ? 'a' : 'span'}>
      `).join('');
    }

    _buildStrip();
    window.addEventListener('finos-context-ready', _buildStrip);
  }

  /* ════════════════════════════════════════════════════════════════════════
     3. ADAPTIVE DAILY INSIGHTS
     Replaces static insight cards with personalized ones ordered by gaps.
  ════════════════════════════════════════════════════════════════════════ */

  /* Full insight library — each insight maps to a module and user-state */
  const INSIGHT_LIBRARY = [
    /* ── Beginner / Rookie ─────────────────────────────────── */
    {
      id: 'sip_start', module: 'mutual_funds', stages: ['Beginner','Rookie','Student'],
      title: '₹500 SIP started today vs waiting for "more income"',
      sub: 'Time beats amount — always.', icon: '📈', href: 'insight-sip.html', urgency: 10,
    },
    {
      id: 'inflation_why', module: 'macro', stages: ['Beginner','Rookie'],
      title: 'Why inflation quietly destroys your savings every year',
      sub: '7% Indian inflation explained with real numbers.', icon: '🔥', href: 'insight-inflation.html', urgency: 9,
    },
    {
      id: 'emergency_fund', module: 'financial_health', stages: ['Beginner','Rookie','Student'],
      title: 'The Emergency Fund rule Indians keep getting wrong',
      sub: '6 months of expenses — not salary.', icon: '🛡️', href: null, urgency: 8,
    },
    {
      id: 'debt_types', module: 'debt', stages: ['Beginner','India 2'],
      title: 'Good debt vs bad debt — the India reality check',
      sub: 'EMIs are normalized without understanding cost.', icon: '🏦', href: 'insight-debt.html', urgency: 7,
    },

    /* ── Intermediate ──────────────────────────────────────── */
    {
      id: 'emi_trap', module: 'loans', stages: ['India 2','Intermediate'],
      title: 'Why EMI feels normal but is quietly destroying your wealth',
      sub: 'The invisible interest you\'re paying — calculated.', icon: '💳', href: 'insight-emi.html', urgency: 8,
    },
    {
      id: 'tax_harvest', module: 'tax', stages: ['Intermediate','Veteran'],
      title: 'Tax Loss Harvesting — the free ₹ move most Indians miss',
      sub: 'Book losses before March 31 to save tax legally.', icon: '📋', href: '../html/tax.html', urgency: 7,
    },
    {
      id: 'direct_mf', module: 'mutual_funds', stages: ['Intermediate'],
      title: 'Regular vs Direct MF plans — you\'re paying ₹3L+ more',
      sub: 'The 1% expense ratio difference that costs crores.', icon: '💡', href: null, urgency: 9,
    },
    {
      id: 'rbi_rates', module: 'macro', stages: ['Intermediate','Veteran'],
      title: 'What RBI\'s rate decisions actually mean for your money',
      sub: 'FD rates, EMIs, markets — decoded.', icon: '🏛️', href: 'insight-rbi.html', urgency: 6,
    },

    /* ── Advanced ──────────────────────────────────────────── */
    {
      id: 'asset_alloc', module: 'equity', stages: ['Veteran','Captain'],
      title: 'Asset allocation — the only real hedge against Indian volatility',
      sub: 'Equity:Debt:Gold ratio for your age.', icon: '⚖️', href: null, urgency: 7,
    },
    {
      id: 'fire_calc', module: 'retirement', stages: ['Intermediate','Veteran'],
      title: 'Your personal FIRE number — calculated with Indian context',
      sub: '25× rule adjusted for healthcare inflation at 14%.', icon: '🔥', href: 'life-goals-planner.html', urgency: 8,
    },
    {
      id: 'nps_80ccd', module: 'tax', stages: ['Intermediate','Veteran'],
      title: 'NPS 80CCD(1B) — extra ₹50K deduction most miss',
      sub: 'Beyond 80C: the ₹15K-25K annual saving.', icon: '🧾', href: '../html/tax.html', urgency: 7,
    },
    {
      id: 'elss_vs_ppf', module: 'mutual_funds', stages: ['Intermediate','Veteran'],
      title: 'ELSS vs PPF — which 80C instrument actually wins?',
      sub: 'ELSS vs PPF vs NPS comparison with real CAGR.', icon: '📊', href: null, urgency: 6,
    },

    /* ── Trader ────────────────────────────────────────────── */
    {
      id: 'position_size', module: 'trading', stages: ['Trader'],
      title: 'Why 2% risk per trade is the only rule that survives',
      sub: 'Kelly Criterion simplified for Indian traders.', icon: '🎯', href: null, urgency: 9,
    },
    {
      id: 'fno_trap', module: 'fno', stages: ['Intermediate','Trader'],
      title: '95% of F&O traders lose — are you the 5%?',
      sub: 'The data SEBI published that brokers won\'t show you.', icon: '⚠️', href: null, urgency: 10,
    },

    /* ── Behavioral ────────────────────────────────────────── */
    {
      id: 'recency_bias', module: 'psychology', stages: ['Beginner','Intermediate','Veteran'],
      title: 'Recency bias — why you buy high and sell low every time',
      sub: 'The brain glitch that costs Indian retail investors crores.', icon: '🧠', href: null, urgency: 7,
    },
    {
      id: 'sunk_cost', module: 'psychology', stages: ['Intermediate','Veteran'],
      title: 'Sunk cost fallacy — why you\'re still holding that loss',
      sub: 'Identify when you\'re averaging down vs holding a mistake.', icon: '🔐', href: null, urgency: 8,
    },
  ];

  /**
   * Returns top N insights personalized for the user.
   * Ranks by: knowledge gaps > urgency > stage match.
   */
  function rankInsights(r, count = 5) {
    const stage = r.stage || 'Beginner';
    const gaps  = new Set(r.knowledgeGaps);
    const dna   = r.dnaTag?.toLowerCase() || '';

    return INSIGHT_LIBRARY
      .map(ins => {
        let score = ins.urgency || 5;
        // Boost for knowledge gap match
        if (gaps.has(ins.module)) score += 5;
        // Boost for stage match
        if (ins.stages?.some(s => stage.toLowerCase().includes(s.toLowerCase()))) score += 3;
        // Boost for trading DNA on trader insights
        if (dna.includes('trader') && ins.module === 'trading') score += 3;
        // Boost for tax insights near March (month 2 = March in JS)
        if (ins.module === 'tax' && new Date().getMonth() === 2) score += 4;
        // Boost for F&O if user has losses in journal
        if (ins.id === 'fno_trap' && r.journal?.total_pnl < 0) score += 6;
        // Boost EMI if user has debt
        if (ins.id === 'emi_trap' && (r.budget?.total_debt > 0)) score += 4;
        // Boost FIRE if user has FIRE data
        if (ins.id === 'fire_calc' && r.budget?.fire_number > 0) score += 3;
        return { ...ins, _score: score };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, count);
  }

  /**
   * Renders personalized insight cards into `containerEl`.
   * Each card is a clickable anchor styled to match FIN-OS glassmorphism cards.
   */
  function renderAdaptiveInsights(containerEl, count = 5) {
    if (!containerEl) return;

    function _render() {
      const r = resolveCtx();
      const ranked = rankInsights(r, count);

      const learnedModules = r.learnedModules;
      containerEl.innerHTML = ranked.map(ins => {
        const done = learnedModules[ins.module];
        const tag  = done ? '✅ Revisit' : '→ Read';
        return `
        <${ins.href ? `a href="${ins.href}"` : 'div'} class="card insight"
          style="cursor:pointer;text-decoration:none;display:flex;flex-direction:column;gap:8px;padding:18px 20px;
                 border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);
                 transition:all .25s ease;"
          onmouseover="this.style.borderColor='rgba(199,240,0,.3)';this.style.background='rgba(199,240,0,.04)'"
          onmouseout="this.style.borderColor='rgba(255,255,255,.07)';this.style.background='rgba(255,255,255,.03)'">
          <div style="font-size:22px;">${ins.icon}</div>
          <div>
            <h4 style="margin:0 0 4px;font-size:13.5px;line-height:1.4;color:rgba(255,255,255,.9);">${ins.title}</h4>
            <p style="margin:0;font-size:11.5px;color:rgba(255,255,255,.45);line-height:1.5;">${ins.sub}</p>
          </div>
          <span style="font-size:11px;font-weight:700;color:${done ? '#22c55e' : '#c7f000'};margin-top:auto;">${tag}</span>
        </${ins.href ? 'a' : 'div'}>
        `;
      }).join('');
    }

    _render();
    window.addEventListener('finos-context-ready', _render);
  }

  /* ════════════════════════════════════════════════════════════════════════
     4. SMART NUDGE CARDS
     Renders goal-behind, high-spend, and low-SIP nudges based on live data.
  ════════════════════════════════════════════════════════════════════════ */

  /** Returns array of nudge objects from user's live data */
  function computeNudges() {
    const r = resolveCtx();
    const nudges = [];

    /* ── Budget nudges ─────────────────────────────────────── */
    if (r.budget) {
      const b = r.budget;
      if (b.savings_rate < 10 && b.income_monthly > 0) {
        nudges.push({
          type: 'warn',
          icon: '⚠️',
          title: 'Savings rate below 10%',
          body: `You're saving ${b.savings_rate}% of ₹${(b.income_monthly/1000).toFixed(0)}K/mo. Target: 20%+.`,
          action: 'Fix budget', href: 'track-finances.html',
        });
      }
      if (b.subscription_drain > 2000) {
        nudges.push({
          type: 'warn',
          icon: '📱',
          title: `₹${Math.round(b.subscription_drain).toLocaleString('en-IN')}/mo leaking in subscriptions`,
          body: `${b.subscription_count} active subscriptions. Ghost subscriptions compound into lakhs over years.`,
          action: 'Audit now', href: null,
        });
      }
      if (b.top_categories?.length) {
        const topCat = b.top_categories[0];
        const pct = b.income_monthly > 0
          ? Math.round(topCat.amt / b.income_monthly * 100) : 0;
        if (pct > 35) {
          nudges.push({
            type: 'alert',
            icon: '🚨',
            title: `${topCat.cat} eating ${pct}% of income`,
            body: `You're spending ${INR(topCat.amt)} on ${topCat.cat} — ${pct}% of your income.`,
            action: 'Review', href: 'track-finances.html',
          });
        }
      }
      // SIP absence check
      const hasSIP = b.top_categories?.some(c => /sip|invest|mutual|nifty|groww|kuvera/i.test(c.cat));
      if (!hasSIP && b.income_monthly > 20000) {
        nudges.push({
          type: 'warn',
          icon: '📈',
          title: 'No SIP detected in your transactions',
          body: 'You earn well but no systematic investment found. ₹500 today beats ₹5000 in 5 years.',
          action: 'Start SIP', href: null,
        });
      }
    }

    /* ── Goals nudges ─────────────────────────────────────── */
    if (r.goals?.length) {
      r.goals.filter(g => g.progress < 25 && g.deadline).forEach(g => {
        nudges.push({
          type: 'warn',
          icon: '🎯',
          title: `Goal "${g.name}" is only ${g.progress}% funded`,
          body: `Target: ${INR(g.target || g.target_amount)}. Increase SIP to stay on track.`,
          action: 'Review goals', href: 'life-goals-planner.html',
        });
      });
    }

    /* ── Portfolio nudges ─────────────────────────────────── */
    if (r.portfolio) {
      if (r.portfolio.pnl_pct < -15) {
        nudges.push({
          type: 'alert',
          icon: '📉',
          title: `Portfolio down ${Math.abs(r.portfolio.pnl_pct).toFixed(1)}%`,
          body: `Total loss: ${INR(Math.abs(r.portfolio.pnl))}. Consider rebalancing or tax-loss harvesting.`,
          action: 'Analyse', href: '../Porfolio Analyser/portfolio-analyser-v10.html',
        });
      }
    }

    /* ── Trade journal nudges ────────────────────────────── */
    if (r.journal?.total_trades > 10 && r.journal.win_rate < 40) {
      nudges.push({
        type: 'alert',
        icon: '📓',
        title: `Win rate ${r.journal.win_rate}% — below break-even threshold`,
        body: `${r.journal.total_trades} trades. Drawdown: ${INR(r.journal.max_drawdown)}. Review your strategy.`,
        action: 'Open journal', href: '../TradeJournal/index.html',
      });
    }

    /* ── General financial literacy nudge (if no other nudges) */
    if (!nudges.length) {
      const gapCount = r.knowledgeGaps.length;
      if (gapCount > 8) {
        nudges.push({
          type: 'good',
          icon: '📚',
          title: `${gapCount} learning modules ready for you`,
          body: 'Start with equity and mutual funds for the highest ROI on your time.',
          action: 'Start learning', href: 'foundations.html',
        });
      } else {
        nudges.push({
          type: 'good',
          icon: '✅',
          title: 'Your finances look healthy!',
          body: 'Keep your SIP automated and avoid lifestyle inflation. Small consistent wins compound quietly.',
          action: null, href: null,
        });
      }
    }

    return nudges.slice(0, 3);
  }

  const NUDGE_COLORS = {
    warn:  { bg: 'rgba(234,179,8,.08)',  border: 'rgba(234,179,8,.25)',  text: '#eab308' },
    alert: { bg: 'rgba(239,68,68,.08)',  border: 'rgba(239,68,68,.25)',  text: '#ef4444' },
    good:  { bg: 'rgba(34,197,94,.07)',  border: 'rgba(34,197,94,.2)',   text: '#22c55e' },
  };

  function renderNudges(containerEl) {
    if (!containerEl) return;

    function _render() {
      const nudges = computeNudges();
      if (!nudges.length) { containerEl.innerHTML = ''; return; }

      containerEl.innerHTML = `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.3);
               font-weight:700;margin-bottom:10px;">💡 Your Action Items</div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${nudges.map(n => {
              const c = NUDGE_COLORS[n.type] || NUDGE_COLORS.warn;
              return `
              <div style="padding:14px 18px;border-radius:14px;background:${c.bg};border:1px solid ${c.border};
                   display:flex;align-items:flex-start;gap:12px;">
                <span style="font-size:20px;flex-shrink:0;margin-top:1px;">${n.icon}</span>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:13px;font-weight:700;color:${c.text};margin-bottom:3px;">${n.title}</div>
                  <div style="font-size:12px;color:rgba(255,255,255,.55);line-height:1.5;">${n.body}</div>
                  ${n.href ? `<a href="${n.href}" style="font-size:11px;font-weight:700;color:${c.text};text-decoration:none;margin-top:6px;display:inline-block;">${n.action} →</a>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    _render();
    window.addEventListener('finos-context-ready', _render);
  }

  /* ════════════════════════════════════════════════════════════════════════
     5. NAVIGATION BADGE INJECTOR
     Adds alert counts next to sidebar nav links based on live data.
  ════════════════════════════════════════════════════════════════════════ */
  function injectNavBadges() {
    function _inject() {
      const nudges = computeNudges();
      const alertCount = nudges.filter(n => n.type === 'alert').length;
      const warnCount  = nudges.filter(n => n.type === 'warn').length;

      // Find sidebar nav links
      const navLinks = document.querySelectorAll('.sidebar nav a');
      navLinks.forEach(a => {
        const href = (a.getAttribute('href') || '').toLowerCase();

        // Remove any existing badge
        a.querySelectorAll('.finos-nav-badge').forEach(b => b.remove());

        let count = 0;
        let color = '#eab308';
        if (href.includes('track-finances') || href.includes('dashboard')) {
          count = alertCount + warnCount;
          color = alertCount > 0 ? '#ef4444' : '#eab308';
        } else if (href.includes('journal') || href.includes('tradebook')) {
          const r = resolveCtx();
          if (r.journal?.win_rate < 40 && r.journal?.total_trades > 5) { count = 1; color = '#ef4444'; }
        }

        if (count > 0) {
          const badge = document.createElement('span');
          badge.className = 'finos-nav-badge';
          badge.textContent = count;
          badge.style.cssText = `
            display:inline-flex;align-items:center;justify-content:center;
            width:16px;height:16px;border-radius:8px;
            background:${color};color:#000;font-size:9px;font-weight:800;
            margin-left:auto;flex-shrink:0;line-height:1;
          `;
          a.style.display = 'flex';
          a.style.alignItems = 'center';
          a.appendChild(badge);
        }
      });
    }

    _inject();
    window.addEventListener('finos-context-ready', _inject);
  }

  /* ════════════════════════════════════════════════════════════════════════
     6. PERSONALIZED WELCOME CARD (for home.html hero area)
     Shows: Name, DNA, Stage, quick summary of their financial health
  ════════════════════════════════════════════════════════════════════════ */
  function renderWelcomeCard(containerEl) {
    if (!containerEl) return;

    function _render() {
      const r = resolveCtx();
      const streak = safeJson('finos_streak', { count: 0 });

      // Don't render the card if we have no real user data
      if (!r.name || r.name === 'Investor') return;

      const healthBar = r.healthScore > 0
        ? `<div style="margin-top:12px;">
             <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
               <span style="font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.06em;">Financial Health</span>
               <span style="font-size:12px;font-weight:700;color:${r.healthScore >= 70 ? '#22c55e' : r.healthScore >= 45 ? '#eab308' : '#ef4444'};">${Math.round(r.healthScore)}/100</span>
             </div>
             <div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;">
               <div style="height:100%;width:${r.healthScore}%;background:${r.healthScore >= 70 ? '#22c55e' : r.healthScore >= 45 ? '#eab308' : '#ef4444'};border-radius:2px;transition:width .6s ease;"></div>
             </div>
           </div>` : '';

      const metaRow = [
        r.stage && `<span style="padding:3px 10px;border-radius:10px;background:rgba(199,240,0,.08);border:1px solid rgba(199,240,0,.2);color:#c7f000;font-size:11px;font-weight:600;">${r.stage}</span>`,
        r.city  && `<span style="padding:3px 10px;border-radius:10px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.5);font-size:11px;">📍 ${r.city}</span>`,
        streak.count > 1 && `<span style="padding:3px 10px;border-radius:10px;background:rgba(239,119,0,.08);border:1px solid rgba(239,119,0,.2);color:#fb923c;font-size:11px;font-weight:600;">🔥 ${streak.count}-day streak</span>`,
      ].filter(Boolean).join('');

      containerEl.innerHTML = `
        <div style="padding:22px 24px;border-radius:18px;
             background:linear-gradient(135deg,rgba(199,240,0,.05),rgba(0,212,255,.03));
             border:1px solid rgba(199,240,0,.15);
             font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
             margin-bottom:24px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div>
              <div style="font-size:22px;font-weight:800;color:#fff;margin-bottom:6px;">
                ${greetByTime()}, <span style="color:#c7f000;">${r.name}</span> 👋
              </div>
              ${r.dnaTag !== 'Explorer'
                ? `<div style="font-size:13px;color:rgba(255,255,255,.45);">DNA: <span style="color:rgba(255,255,255,.7);font-weight:600;">${r.dnaTag}</span></div>`
                : ''}
            </div>
            ${metaRow ? `<div style="display:flex;gap:6px;flex-wrap:wrap;">${metaRow}</div>` : ''}
          </div>
          ${healthBar}
        </div>
      `;
    }

    _render();
    window.addEventListener('finos-context-ready', _render);
  }

  /* ════════════════════════════════════════════════════════════════════════
     7. CONTEXT-RICH ARYA BRIEF BUILDER
     Returns a deeply personalised prompt string for dashboard brief.
  ════════════════════════════════════════════════════════════════════════ */
  function buildRichBriefPrompt(displayName) {
    const r = resolveCtx();
    const lines = [];
    const name = firstNameFrom(displayName) || r.name;

    lines.push(`User: ${name} | DNA: ${r.dnaTag} | Stage: ${r.stage}`);
    if (r.city)   lines.push(`City: ${r.city}`);
    if (r.income) lines.push(`Income bracket: ₹${r.income}/mo`);
    lines.push(`Financial health: ${Math.round(r.healthScore)}/100`);
    lines.push(`Savings rate: ${r.savingsRate}% | Net worth: ${INR(r.netWorth)}`);

    if (r.budget) {
      const b = r.budget;
      lines.push(`Budget this month: Income ${INR(b.income_monthly)}, Spent ${INR(b.spent_total)}, Saved ${INR(Math.max(0, b.income_monthly - b.spent_total))}`);
      if (b.top_categories?.length) {
        const topSpend = b.top_categories.slice(0, 3).map(c => `${c.cat} ${INR(c.amt)}`).join(', ');
        lines.push(`Top spending: ${topSpend}`);
      }
      if (b.total_debt > 0) lines.push(`Total outstanding debt: ${INR(b.total_debt)}`);
      if (b.fire_number > 0) {
        const firePct = r.netWorth > 0 ? Math.round(r.netWorth / b.fire_number * 100) : 0;
        lines.push(`FIRE goal: ${INR(b.fire_number)} — currently ${firePct}% funded`);
      }
    }

    if (r.goals?.length) {
      const goalStr = r.goals.slice(0, 3)
        .map(g => `${g.name} ${g.progress || 0}% (${INR(g.saved || g.current || 0)} / ${INR(g.target)})`)
        .join(' | ');
      lines.push(`Goals: ${goalStr}`);
    }

    if (r.portfolio) {
      lines.push(`Portfolio: ${INR(r.portfolio.total_value)} | P&L: ${INR(r.portfolio.pnl)} (${r.portfolio.pnl_pct > 0 ? '+' : ''}${r.portfolio.pnl_pct}%)`);
    }

    if (r.journal?.total_trades > 0) {
      lines.push(`Trade journal: ${r.journal.total_trades} trades, ${r.journal.win_rate}% win rate, P&L: ${INR(r.journal.total_pnl)}`);
      if (r.journal.current_streak) lines.push(`Trading streak: ${r.journal.current_streak}`);
    }

    const nudges = computeNudges();
    if (nudges.filter(n => n.type !== 'good').length) {
      lines.push(`Action items: ${nudges.filter(n => n.type !== 'good').map(n => n.title).join(' | ')}`);
    }

    const userProfile = lines.join('\n');
    return (
      `This is ${name}'s personalised morning brief context:\n${userProfile}\n\n` +
      `Write a 2-sentence morning brief in warm Hinglish — like a caring IIM friend over chai. ` +
      `Mention ONE specific real number or metric from the context above (use their actual data). ` +
      `If there's an action item, mention it gently. End with one short reflection question. ` +
      `No "Sure!", no "I see", no preamble — start directly with the brief.`
    );
  }

  /* ════════════════════════════════════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════════════════════════════════════ */
  Object.assign(window.FinosPersona, {
    injectGreeting,
    injectStatusStrip,
    renderAdaptiveInsights,
    renderNudges,
    injectNavBadges,
    renderWelcomeCard,
    buildRichBriefPrompt,
    computeNudges,
    rankInsights,
    resolveCtx,
    updateStreak,
  });

  /* ── Auto-init: run streak tracker immediately ── */
  updateStreak();

  console.debug('[FIN-OS Personalization] Engine ready');

})();
