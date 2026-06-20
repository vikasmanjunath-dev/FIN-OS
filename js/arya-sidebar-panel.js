/**
 * arya-sidebar-panel.js  — FIN·OS Arya Complete AI Agent v4.0
 * ─────────────────────────────────────────────────────────────────────────────
 * v2.0 — 10 core features: Session Nav, Persistent Chat, Smart Chips, Voice,
 *         AryaMemory, Follow-up Chips, Ratings, Snapshot, Bias, Greeting
 *
 * v3.0 — 10 power upgrades: Commands, Wealth Chart, Goal Cards, Tax Dashboard,
 *         Debt Planner, News Widget, Health Trend, Emotion Tone, News Injection,
 *         Inline Scenario Lab
 *
 * v3.1 — Inline streaming: ALL sub-domain tabs answer in-place (no tab-switch)
 *         handleAskBtn() routes to streamInlineFromBtn() for every non-chat btn
 *
 * v4.0 — COMPLETE AGENT SYSTEM (zero cloud dependency — 100% local Ollama):
 *  1. AryaMemoryDB    — IndexedDB persistent cross-session memory (deduplicated)
 *  2. AgentTools      — 12 executable financial tools (SIP, EMI, FIRE, tax, debt,
 *                        inflation, goals, health, news, remember, recall, profile)
 *  3. AryaAgentRunner — ReAct loop: Reason → TOOL_CALL → Observe → repeat (6 max)
 *  4. Agent Tab (🧩)  — dedicated UI: goal input, step-by-step trace, answer panel
 *  5. Memory Viewer   — add/delete/search persistent facts directly in panel
 *  6. Auto-Memory     — every chat exchange auto-extracted to IndexedDB silently
 *  7. Proactive Brief — daily morning brief on first panel open (once per day)
 *  8. "Expand in Chat"— every inline response has 1-click chat continuation
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function AryaSidebarPanel() {
  'use strict';

  /* ══ CONFIG ══════════════════════════════════════════════════════════════ */
  const OLLAMA_ENDPOINTS = [
    'http://127.0.0.1:11434/api/generate',
    'https://127.0.0.1:8767/api/generate',
  ];
  const OLLAMA_MODEL  = 'qwen3:14b';
  const TIMEOUT_MS    = 45_000;
  const ARYA_API_BASE = 'http://localhost:7475';   // arya-ai FastAPI backend
  let   _activeEndpoint = null;

  /* ── Arya AI backend call ──────────────────────────────────────────────── */
  async function aryaAPI(tool, args = {}) {
    try {
      const r = await fetch(`${ARYA_API_BASE}/api/tool`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: tool, args }),
        signal:  AbortSignal.timeout(12000),
      });
      if (!r.ok) return { error: `HTTP ${r.status}` };
      const data = await r.json();
      return data.result ?? data;
    } catch (e) {
      return { error: String(e) };
    }
  }

  async function aryaAPILive(path) {
    try {
      const r = await fetch(`${ARYA_API_BASE}${path}`, { signal: AbortSignal.timeout(10000) });
      return r.ok ? r.json() : { error: `HTTP ${r.status}` };
    } catch (e) {
      return { error: String(e) };
    }
  }

  /* ══ HELPERS ═════════════════════════════════════════════════════════════ */
  const get  = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const getJ = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const set  = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const INR  = n => {
    const num = Number(n || 0);
    if (num >= 1e7) return '₹' + (num / 1e7).toFixed(1) + ' Cr';
    if (num >= 1e5) return '₹' + (num / 1e5).toFixed(1) + ' L';
    if (num >= 1e3) return '₹' + Math.round(num / 1e3) + 'K';
    return '₹' + Math.round(num).toLocaleString('en-IN');
  };

  /* ══ 1. SESSION NAVIGATOR ════════════════════════════════════════════════ */
  // Track which pages the user visits in this session for cross-page context
  const SESSION_KEY = 'finos_session_pages_v2';

  function recordPageVisit(pageKey) {
    try {
      const pages = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
      const last  = pages[pages.length - 1];
      if (!last || last.page !== pageKey) {
        pages.push({ page: pageKey, ts: Date.now() });
        if (pages.length > 12) pages.shift();
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(pages));
      }
    } catch {}
  }

  function buildSessionContext(currentPage) {
    try {
      const pages = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]');
      const prev  = pages.filter(p => p.page !== currentPage).slice(-4);
      if (!prev.length) return '';
      const names = prev.map(p => PAGE_REGISTRY[p.page]?.name || p.page.replace(/-/g,' '));
      return `SESSION JOURNEY: ${names.join(' → ')} → now here.`;
    } catch { return ''; }
  }

  // Track page visit counts for bias detection
  function incPageVisitCount(pageKey) {
    const k   = `finos_pvc_${pageKey}`;
    const cnt = parseInt(get(k, '0')) + 1;
    set(k, String(cnt));
    return cnt;
  }
  function getPageVisitCount(pageKey) { return parseInt(get(`finos_pvc_${pageKey}`, '0')); }

  /* ══ 2. PERSISTENT CHAT HISTORY ══════════════════════════════════════════ */
  const CHAT_TTL_DAYS = 7;

  function chatStoreKey(pageKey) { return `finos_chat_${pageKey}_v2`; }

  function saveChatToDisk(pageKey, history) {
    try {
      set(chatStoreKey(pageKey), JSON.stringify({ ts: Date.now(), history: history.slice(-16) }));
    } catch {}
  }

  function loadChatFromDisk(pageKey) {
    try {
      const data = JSON.parse(localStorage.getItem(chatStoreKey(pageKey)));
      if (!data) return [];
      const ageDays = (Date.now() - data.ts) / 86400000;
      if (ageDays > CHAT_TTL_DAYS) { localStorage.removeItem(chatStoreKey(pageKey)); return []; }
      return data.history || [];
    } catch { return []; }
  }

  /* ══ 9. BEHAVIORAL BIAS DETECTION ════════════════════════════════════════ */
  function buildBiasContext() {
    const biases = [];
    const checks = [
      { page: 'cryptodetail',      threshold: 3, msg: 'Visited crypto pages 3+ times this month — watch for FOMO bias.' },
      { page: 'learn-fno',         threshold: 3, msg: 'Researching F&O heavily — check if experience matches interest.' },
      { page: 'news',              threshold: 6, msg: 'Heavy news consumption — guard against recency/headline bias.' },
      { page: 'hedgefund',         threshold: 2, msg: 'Exploring complex strategies — ensure basics are solid first.' },
      { page: 'stock-platform',    threshold: 5, msg: 'High trading platform usage — check if overtrading is a risk.' },
    ];
    for (const c of checks) {
      if (getPageVisitCount(c.page) >= c.threshold) biases.push(c.msg);
    }
    const beh = window.FINOS_USER_CONTEXT?.behavioral;
    if (beh?.primary_bias) biases.push(`Known behavioral bias: ${beh.primary_bias.replace(/_/g,' ')} (costs ~${INR(beh.annual_bias_cost)}/yr).`);
    return biases.length ? `BEHAVIORAL ALERTS:\n${biases.map(b => `• ${b}`).join('\n')}` : '';
  }

  /* ══ USER CONTEXT BUILDER — page-scoped for minimal tokens + max relevance ═ */
  // Instead of dumping all 800+ tokens of user data every time, we inject only
  // what's relevant to the current page. Cuts first-token latency by ~40%.
  function buildUserContext(pageKey) {
    const ctx    = window.FINOS_USER_CONTEXT || {};
    const id     = ctx.identity  || {};
    const prof   = ctx.profile   || {};
    const budget = ctx.budget_tracker || {};
    const fin    = ctx.financial || {};
    const beh    = ctx.behavioral || {};

    // ── Always-present identity block (every page needs this) ──────────────
    const name    = id.name          || get('finos_display_name', 'Investor');
    const dna     = id.financial_dna || get('finos_financial_dna', 'Explorer');
    const stage   = id.life_stage    || get('finos_stage', '');
    const city    = id.city          || get('finos_city', '');
    const health  = prof.health_score || get('finos_health_score', 0);
    const nw      = prof.net_worth    || get('finos_net_worth', 0);
    const savings = prof.savings_rate || get('finos_savings_rate', 0);
    const income  = budget.income_monthly || id.income_range || get('finos_income', 0);

    const core = [
      `USER: ${name} | DNA: ${dna}${stage ? ' | ' + stage : ''}${city ? ' | ' + city : ''}`,
      `Health: ${health}/100 | Net worth: ${INR(nw)} | Savings rate: ${savings}% | Income: ${INR(income)}/mo`,
    ];

    // ── Page-scoped sections — only inject what's relevant ─────────────────
    const PAGE_GROUPS = {
      // Portfolio & trading pages
      portfolio:      ['portfolio', 'holdings', 'journal', 'bias'],
      trading:        ['portfolio', 'journal', 'bias', 'dna'],
      'trade-journal':['portfolio', 'journal', 'bias'],
      options:        ['portfolio', 'journal', 'dna', 'bias'],
      'options-intelligence': ['portfolio', 'journal', 'dna'],

      // Budget & spending pages
      'track-finances': ['budget', 'transactions', 'goals'],
      tracker:          ['budget', 'transactions'],
      'budget-forecast':['budget', 'goals'],
      budget:           ['budget', 'goals'],
      'financial-hub':  ['budget', 'goals', 'portfolio', 'transactions'],
      'financial-report':['budget', 'goals', 'portfolio', 'transactions'],

      // Tax pages
      tax:        ['budget', 'transactions', 'tax_savings'],
      'ca-advisor':['budget', 'transactions', 'tax_savings'],

      // Goals pages
      goals:       ['goals', 'budget'],
      fire:        ['goals', 'budget'],
      retirement:  ['goals', 'budget'],
      'wealth-plan':['goals', 'budget', 'portfolio'],

      // Insurance
      'insurance-hub':      ['budget', 'household', 'goals'],
      'insurance-directory':['budget', 'household'],

      // DNA/behavior
      dna:       ['dna', 'bias'],
      decision:  ['dna', 'bias', 'goals'],
      benchmarking:['budget', 'portfolio', 'goals'],
      diagnostics: ['budget', 'portfolio', 'goals', 'transactions', 'bias'],

      // Market/learn pages — lightweight
      markets:        ['portfolio', 'dna'],
      'market-intel': ['portfolio', 'dna'],
      news:           ['portfolio'],
      'learn-equity': ['portfolio', 'dna'],
      'learn-mf':     ['goals', 'budget', 'dna'],
      'learn-fno':    ['portfolio', 'journal', 'dna'],

      // Home & dashboard
      home:      ['budget', 'goals', 'portfolio', 'transactions'],
      dashboard: ['budget', 'goals', 'portfolio', 'transactions'],

      // Detail pages — portfolio context
      equitydetail:     ['portfolio', 'dna'],
      mfdetail:         ['portfolio', 'goals', 'dna'],
      cryptodetail:     ['portfolio', 'dna', 'bias'],
      derivativesdetail:['portfolio', 'journal', 'dna'],
    };

    const sections = PAGE_GROUPS[pageKey] || ['budget', 'goals', 'portfolio'];

    const extras = [];

    if (sections.includes('portfolio')) {
      const port = fin.portfolio;
      if (port?.total_value) {
        extras.push(`Portfolio: ${INR(port.total_value)} | P&L: ${INR(port.pnl)} (${port.pnl_pct > 0 ? '+' : ''}${port.pnl_pct}%)`);
        if (port.holdings?.length) extras.push(`Holdings: ${port.holdings.slice(0,5).map(h => `${h.symbol}(${h.quantity})`).join(', ')}`);
      }
    }
    if (sections.includes('holdings') && fin.portfolio?.holdings?.length > 5) {
      extras.push(`All holdings: ${fin.portfolio.holdings.map(h => `${h.symbol}(${h.quantity}@${INR(h.avg_price||0)})`).join(', ')}`);
    }
    if (sections.includes('journal')) {
      const j = ctx.trade_journal;
      if (j?.total_trades) extras.push(`Trades: ${j.total_trades} | Win rate: ${j.win_rate}% | P&L: ${INR(j.total_pnl)}${j.current_streak ? ' | Streak: ' + j.current_streak : ''}`);
    }
    if (sections.includes('budget')) {
      if (budget.income_monthly) {
        extras.push(`Budget: ${INR(budget.income_monthly)}/mo income | Spent: ${INR(budget.spent_total)} | Savings: ${savings}%`);
        if (budget.total_debt) extras.push(`Total debt: ${INR(budget.total_debt)}`);
        if (budget.fire_number) extras.push(`FIRE target: ${INR(budget.fire_number)} (~${budget.fire_years_estimate || '?'} yrs)`);
      }
    }
    if (sections.includes('transactions')) {
      const tx = fin.transactions;
      if (tx?.count) {
        extras.push(`Transactions: ${tx.count} | Net cash: ${INR((tx.total_income||0)-(tx.total_expense||0))}`);
        if (tx.top_categories?.length) extras.push(`Top spend: ${tx.top_categories.slice(0,3).map(c => `${c.cat} ${INR(c.amt)}`).join(' · ')}`);
      }
    }
    if (sections.includes('goals')) {
      const goals = fin.goals;
      if (goals?.length) extras.push(`Goals: ${goals.slice(0,4).map(g => `${g.name} ${g.progress||0}% (${INR(g.saved||0)}/${INR(g.target)})`).join(' · ')}`);
    }
    if (sections.includes('dna')) {
      const dnaData = ctx.dna || getJ('FINOS_CORE_DNA', null);
      if (dnaData?.scores?.length >= 5) extras.push(`DNA scores → Risk:${dnaData.scores[0]} Security:${dnaData.scores[1]} Discipline:${dnaData.scores[3]} Growth:${dnaData.scores[4]} /100`);
      if (dnaData?.archetype) extras.push(`Archetype: ${dnaData.archetype}`);
    }
    if (sections.includes('bias')) {
      if (beh.primary_bias) extras.push(`Behavioral bias: ${beh.primary_bias.replace(/_/g,' ')} (cost ~${INR(beh.annual_bias_cost)}/yr)`);
    }
    if (sections.includes('tax_savings')) {
      if (beh.tax_savings_potential > 0) extras.push(`Tax savings potential this FY: ${INR(beh.tax_savings_potential)}`);
    }
    if (sections.includes('household')) {
      const hh = ctx.household;
      if (hh?.partner_name) extras.push(`Partner: ${hh.partner_name} | Combined NW: ${INR(hh.combined_net_worth)}`);
    }

    // Session journey (always — few tokens, big context value)
    const sessionCtx = buildSessionContext(pageKey);
    if (sessionCtx) extras.push(sessionCtx);

    // Behavioral bias alerts from page-visit patterns
    const biasCtx = buildBiasContext();
    if (biasCtx) extras.push(biasCtx);

    // AryaMemory episodic block for this topic
    if (window.AryaMemory?.loaded) {
      const memBlock = window.AryaMemory.buildBlock(pageKey.replace(/-/g, ' '));
      if (memBlock) extras.push(memBlock);
    }

    return [...core, ...extras].filter(Boolean).join('\n');
  }

  /* ══ PAGE REGISTRY — 94 pages with custom insight + chips ════════════════ */
  const PAGE_REGISTRY = {
    /* ── Core ─────────────────────────────────────────────────── */
    'home': {
      name: 'Home', icon: '🏠',
      prompt: 'Give me a personalized morning brief for today: my financial health snapshot, what needs immediate attention, and my single best action for this week based on my data.',
      chips: ['Today\'s priority', 'Biggest risk', 'Quick win', 'Weekly goal']
    },
    'dashboard': {
      name: 'Dashboard', icon: '📊',
      prompt: 'Analyze my financial dashboard: health score, net worth, savings rate, recent transactions. What\'s my biggest opportunity this week and what should I avoid?',
      chips: ['Health analysis', 'Biggest leak', 'Portfolio check', 'This week\'s action']
    },
    'profile': {
      name: 'Profile', icon: '👤',
      prompt: 'Review my financial DNA and profile. What does my DNA archetype say about my blind spots? What\'s one thing I should change about my financial behavior?',
      chips: ['DNA insights', 'Blind spots', 'Strengths', 'Next step']
    },
    'settings': {
      name: 'Settings', icon: '⚙️',
      prompt: 'What settings and features in FIN-OS are most important for someone with my financial DNA and goals? What should I configure to get maximum value?',
      chips: ['Key features', 'Setup checklist', 'Data sync', 'Privacy tips']
    },
    'onboarding': {
      name: 'Onboarding', icon: '🚀',
      prompt: 'I\'m setting up FIN-OS. Based on my profile, what are the 3 most important things to set up first? What data should I enter to get the most personalized experience?',
      chips: ['Setup order', 'Must-fill fields', 'Quick wins', 'First goal']
    },
    'start': {
      name: 'Get Started', icon: '▶️',
      prompt: 'Help me get started with FIN-OS. Based on what you know about me, which section should I go to first and why?',
      chips: ['Where to start', 'Best path', 'My priorities', 'First action']
    },

    /* ── Learn ────────────────────────────────────────────────── */
    'foundations': {
      name: 'Learning Hub', icon: '📚',
      prompt: 'Based on my financial DNA, interests, and current knowledge gaps, which learning modules should I prioritize? What\'s the #1 concept I need to master?',
      chips: ['My curriculum', 'Knowledge gaps', 'Best module', 'Learning path']
    },
    'finance101': {
      name: 'Finance 101', icon: '🎓',
      prompt: 'I\'m learning finance basics. Based on my income, goals, and DNA, which fundamentals are most critical for me to master right now?',
      chips: ['My basics', 'Priority concepts', 'Apply to my data', 'Next lesson']
    },
    'learn-equity': {
      name: 'Learn Equity', icon: '📈',
      prompt: 'Given my portfolio and DNA scores, what equity concepts do I need to understand most urgently? How should I approach equity given my risk score?',
      chips: ['My equity view', 'Risk for me', 'Stock selection', 'When to buy']
    },
    'learn-debt': {
      name: 'Learn Debt', icon: '🏦',
      prompt: 'Based on my total debt and savings rate, how should I think about debt instruments? What\'s my ideal debt-to-equity ratio given my DNA?',
      chips: ['My debt picture', 'Debt vs equity', 'Best instruments', 'Reduce debt']
    },
    'learn-mf': {
      name: 'Learn Mutual Funds', icon: '🏛️',
      prompt: 'Based on my DNA, income, and investment goals, what type of mutual funds suit me best? What SIP amount should I target?',
      chips: ['Best MF for me', 'SIP strategy', 'Fund selection', 'Direct vs regular']
    },
    'learn-fno': {
      name: 'Learn F&O', icon: '⚡',
      prompt: 'Based on my trading history and risk score, am I ready for F&O? What are the key risks I need to understand before trading derivatives?',
      chips: ['Am I ready?', 'Key risks', 'F&O basics', 'Paper trading first']
    },
    'learn-technical': {
      name: 'Technical Analysis', icon: '📉',
      prompt: 'Which technical analysis concepts are most useful for my trading style and DNA? What indicators should I learn first?',
      chips: ['My TA style', 'Key indicators', 'Chart reading', 'Entry/exit rules']
    },
    'learn-fundamental': {
      name: 'Fundamental Analysis', icon: '🔬',
      prompt: 'How do I evaluate a company fundamentally given my investment goals? Which metrics matter most for Indian markets?',
      chips: ['Key ratios', 'Indian context', 'PE vs PB', 'Quick checklist']
    },
    'learn-analysis': {
      name: 'Analysis Methods', icon: '🔭',
      prompt: 'Given my DNA and investment style, should I focus more on fundamental or technical analysis? How do I combine both?',
      chips: ['My analysis style', 'Combine TA+FA', 'Shortcut methods', 'Common mistakes']
    },
    'learn-indicators': {
      name: 'Market Indicators', icon: '🌡️',
      prompt: 'Which market indicators are most relevant for the Indian market and my investment style? How do I read macro signals?',
      chips: ['Top indicators', 'Indian macro', 'Bull/bear signals', 'My watchlist']
    },
    'learn-metrics': {
      name: 'Financial Metrics', icon: '📐',
      prompt: 'Which financial metrics should I track for my portfolio? What are the benchmarks I should compare myself against given my goals?',
      chips: ['Track these', 'My benchmarks', 'XIRR basics', 'Portfolio metrics']
    },
    'learn-insurance': {
      name: 'Learn Insurance', icon: '🛡️',
      prompt: 'Based on my life stage, income, and dependents, how much insurance do I actually need? Am I over or under-insured?',
      chips: ['My cover check', 'Term vs ULIP', 'Health cover', 'How much needed']
    },
    'learn-money-market': {
      name: 'Money Market', icon: '💵',
      prompt: 'How should I use money market instruments for my emergency fund and short-term needs? What returns can I expect?',
      chips: ['Emergency fund', 'Liquid funds', 'FD vs liquid', 'Short-term plan']
    },

    /* ── Markets ──────────────────────────────────────────────── */
    'markets': {
      name: 'Markets', icon: '🌐',
      prompt: 'Given my current portfolio and DNA, which market segments should I be watching today? What opportunities and risks exist based on my holdings?',
      chips: ['My exposure', 'Sector view', 'FII/DII flows', 'Today\'s focus']
    },
    'market-intel': {
      name: 'Market Intelligence', icon: '🧠',
      prompt: 'What market intelligence signals matter most for my portfolio today? Analyze macro trends relevant to my holdings and DNA.',
      chips: ['Macro signals', 'My sectors', 'Contrarian view', 'Key risks']
    },
    'market-visualizer': {
      name: 'Market Visualizer', icon: '🗺️',
      prompt: 'How should I read the current market heat map given my portfolio? Which sectors are hot and which should I avoid based on my holdings?',
      chips: ['Heat map read', 'My sectors', 'Rotation signals', 'Best opportunity']
    },
    'news': {
      name: 'News & Sentiment', icon: '📰',
      prompt: 'Filter today\'s financial news for what\'s actually relevant to my portfolio and goals. What events could impact my holdings this week?',
      chips: ['My news filter', 'Portfolio impact', 'Ignore this', 'Action needed']
    },
    'equitydetail': {
      name: 'Equity Deep-Dive', icon: '🔍',
      prompt: 'I\'m analyzing an equity instrument. Based on my risk score and portfolio, what should I look for before investing? What\'s my max single-stock allocation?',
      chips: ['Valuation check', 'Risk for me', 'Max position', 'Exit strategy']
    },
    'mfdetail': {
      name: 'Mutual Fund Detail', icon: '📋',
      prompt: 'I\'m evaluating a mutual fund. Based on my goals and DNA, what should I check? What overlap might it have with my existing funds?',
      chips: ['Key metrics', 'Overlap check', 'SIP amount', 'Exit load']
    },
    'etfdetail': {
      name: 'ETF Detail', icon: '📦',
      prompt: 'I\'m looking at an ETF. What should I check before buying? How does it fit my current allocation?',
      chips: ['Tracking error', 'Expense ratio', 'Liquidity check', 'My allocation']
    },
    'cryptodetail': {
      name: 'Crypto Detail', icon: '🔗',
      prompt: 'I\'m researching a crypto asset. Given my risk profile, what\'s the maximum I should put in? What are the India tax implications?',
      chips: ['Max allocation', 'Tax impact', 'Risk for me', 'Exit plan']
    },
    'commoditydetail': {
      name: 'Commodity Detail', icon: '⚖️',
      prompt: 'I\'m analyzing a commodity. How does it work as an inflation hedge? What\'s the right allocation given my portfolio?',
      chips: ['Inflation hedge', 'My allocation', 'Storage costs', 'Gold vs silver']
    },
    'forexdetail': {
      name: 'Forex Detail', icon: '💹',
      prompt: 'I\'m looking at forex. What currency risk exists in my current investments? How do I hedge if needed?',
      chips: ['My forex risk', 'LRS guidance', 'Hedging options', 'INR outlook']
    },
    'debtdetail': {
      name: 'Debt Instrument Detail', icon: '📜',
      prompt: 'I\'m evaluating a debt instrument. How does it compare to FD rates? Given my tax bracket, what\'s the post-tax yield?',
      chips: ['Post-tax yield', 'vs FD', 'Credit risk', 'Duration risk']
    },
    'derivativesdetail': {
      name: 'Derivatives Detail', icon: '⚡',
      prompt: 'I\'m looking at derivatives. Given my experience and risk DNA, should I be trading this? What\'s the maximum risk per trade?',
      chips: ['Risk check', 'Max loss', 'My experience', 'Paper trade first']
    },
    'moneydetail': {
      name: 'Money Market Detail', icon: '💰',
      prompt: 'How does this money market instrument compare to my current liquid fund or FD? What are the tax implications?',
      chips: ['Better than FD?', 'Tax efficiency', 'Liquidity', 'My emergency fund']
    },

    /* ── Portfolio & Tracking ─────────────────────────────────── */
    'portfolio': {
      name: 'Portfolio', icon: '💼',
      prompt: 'Deep analysis of my portfolio: current allocation vs ideal based on my DNA, P&L analysis, concentration risk, rebalancing needs, and top 3 actions to take.',
      chips: ['Rebalance needed?', 'Worst positions', 'Best performers', 'Add or exit?']
    },
    'track-finances': {
      name: 'Track Finances', icon: '💰',
      prompt: 'Analyze my spending patterns over the last month. What are my top 3 money leaks? How does my savings rate compare to my FIRE goals?',
      chips: ['Money leaks', 'Savings rate', 'vs Budget', 'Cut these']
    },
    'tracker': {
      name: 'Expense Tracker', icon: '📊',
      prompt: 'Looking at my expense data, what\'s my biggest overspend category? How can I reduce expenses by 10% without sacrificing quality of life?',
      chips: ['Biggest overspend', '10% reduction', 'Category split', 'This month goal']
    },
    'budget-forecast': {
      name: 'Budget Forecast', icon: '🎯',
      prompt: 'Based on my income and current spending, forecast my finances for the next 6 months. Am I on track for my savings goals?',
      chips: ['6-month outlook', 'On track?', 'Deficit risk', 'Scenario: income +10%']
    },
    'financial-hub': {
      name: 'Financial Hub', icon: '🏗️',
      prompt: 'Give me a complete financial health overview: assets, liabilities, income, expenses, goals, and where I stand against Indian benchmarks for my age and income.',
      chips: ['Complete snapshot', 'vs Benchmarks', 'Wealth gap', 'Priority fixes']
    },
    'know-your-finances': {
      name: 'Know Your Finances', icon: '💡',
      prompt: 'Explain my current financial picture in simple terms. What does someone in my situation need to know right now?',
      chips: ['My numbers', 'What it means', 'Biggest gap', 'First fix']
    },
    'financial-report': {
      name: 'Financial Report', icon: '📑',
      prompt: 'Generate a narrative summary of my financial state: strengths, weaknesses, opportunities, and threats. What would a CA say about my finances?',
      chips: ['SWOT analysis', 'CA\'s view', 'Tax review', 'Action plan']
    },
    'financial-being': {
      name: 'Financial Being', icon: '✨',
      prompt: 'How is my overall financial well-being? Rate me on all dimensions: security, freedom, growth, relationships, and purpose. Where am I weakest?',
      chips: ['Well-being score', 'Weakest pillar', 'Stress points', 'Improve this']
    },

    /* ── AI & Intelligence ────────────────────────────────────── */
    'money-ai': {
      name: 'Money AI', icon: '🤖',
      prompt: 'I want to use AI for my financial decisions. What are the most powerful AI-powered insights available for my specific situation right now?',
      chips: ['Best AI insights', 'Automate this', 'AI portfolio', 'Smart alerts']
    },
    'diagnostics': {
      name: 'Financial Diagnostics', icon: '🩺',
      prompt: 'Run a complete financial diagnostic on me. What are my 3 critical issues that need immediate attention and 3 biggest growth opportunities?',
      chips: ['Critical issues', 'Growth opps', 'Quick fixes', 'Deep dive']
    },
    'mf-intelligence': {
      name: 'MF Intelligence', icon: '🔮',
      prompt: 'Based on my investment goals and DNA, recommend the optimal mutual fund portfolio for me. What should I buy, sell, or switch right now?',
      chips: ['My MF portfolio', 'Buy / sell', 'SIP plan', 'Category allocation']
    },
    'ca-advisor': {
      name: 'CA Advisor', icon: '🏛️',
      prompt: 'What are the top 5 tax optimization strategies for my income level and investment profile for this financial year in India?',
      chips: ['Tax savings now', '80C status', 'HRA + home loan', 'New vs old regime']
    },
    'decision': {
      name: 'Decision Maker', icon: '🧭',
      prompt: 'I need to make a financial decision. Based on my profile, goals, and behavioral biases, what decision-making framework should I use to avoid mistakes?',
      chips: ['My biases', 'Decision rules', 'When to delay', 'Regret-proof']
    },
    'document-ai': {
      name: 'Document AI', icon: '📄',
      prompt: 'What financial documents should I analyze? Based on my situation, which documents (salary slips, ITR, Form 16, bank statements) are most important to review?',
      chips: ['Key documents', 'What to check', 'Red flags', 'File this now']
    },
    'clarity': {
      name: 'Clarity', icon: '🔭',
      prompt: 'Help me gain clarity on my financial situation. What\'s the single clearest picture of where I am and where I need to go?',
      chips: ['Clear picture', 'The truth', 'One focus', 'Next 90 days']
    },
    'benchmarking': {
      name: 'Benchmarking', icon: '📏',
      prompt: 'How do my finances compare to Indian benchmarks for my age, income level, and city? Am I ahead or behind on net worth, savings, and investments?',
      chips: ['vs Age peers', 'vs Income peers', 'Wealth gap', 'Catch-up plan']
    },
    'chat': {
      name: 'Chat with Arya', icon: '💬',
      prompt: 'I\'m opening the chat page. Greet me and ask what financial topic is on my mind today based on my recent activity and goals.',
      chips: ['What\'s on my mind', 'Continue goals', 'Quick question', 'Deep dive']
    },

    /* ── Tax ──────────────────────────────────────────────────── */
    'tax': {
      name: 'Tax Planner', icon: '📋',
      prompt: 'Complete tax analysis for this financial year: my estimated tax liability, potential savings under 80C/80D/HRA, and whether old or new regime benefits me.',
      chips: ['Tax liability', '80C remaining', 'Best deductions', 'New vs old']
    },

    /* ── Insurance ────────────────────────────────────────────── */
    'insurance-hub': {
      name: 'Insurance Hub', icon: '🛡️',
      prompt: 'Audit my insurance coverage: am I adequately covered for life, health, and assets? What gaps exist given my income and life stage?',
      chips: ['Coverage audit', 'Life cover', 'Health cover', 'Gaps to fill']
    },
    'insurance-directory': {
      name: 'Insurance Directory', icon: '📁',
      prompt: 'Help me choose the right insurance products for my profile. What premium vs cover ratio should I target? What to avoid?',
      chips: ['Term vs ULIP', 'Cover amount', 'Best plans', 'Avoid these']
    },

    /* ── Real Estate ──────────────────────────────────────────── */
    'real-estate': {
      name: 'Real Estate', icon: '🏠',
      prompt: 'Based on my income, savings, and city, should I buy or rent? If buying, how much can I afford? What\'s the total cost vs renting + investing?',
      chips: ['Buy vs rent', 'Can I afford?', 'Affordability calc', 'EMI impact']
    },
    'real-estate-calc': {
      name: 'RE Calculator', icon: '🏗️',
      prompt: 'Calculate the true cost of buying real estate given my income and current rates. What should my down payment and loan amount be?',
      chips: ['True cost', 'EMI calculation', 'Down payment', 'Break-even years']
    },

    /* ── Goals & Planning ─────────────────────────────────────── */
    'goals': {
      name: 'Goals', icon: '🎯',
      prompt: 'Review all my financial goals. Which ones are on track, at risk, or need to be revisited? What\'s the single most important goal adjustment I should make?',
      chips: ['Goal status', 'At-risk goals', 'Prioritize', 'New goal']
    },
    'wealth-plan': {
      name: 'Wealth Plan', icon: '📈',
      prompt: 'Create a personalized wealth plan for me based on my DNA, income, age, and goals. What\'s the 1-year, 5-year, and 10-year roadmap?',
      chips: ['1-year plan', '5-year path', 'FIRE roadmap', 'Starting now']
    },
    'retirement': {
      name: 'Retirement', icon: '🌅',
      prompt: 'Analyze my retirement readiness. At my current savings rate, when can I retire? What do I need to change to retire 5 years earlier?',
      chips: ['Retire when?', 'Monthly needed', '5 years earlier', 'NPS vs MF']
    },
    'fire': {
      name: 'FIRE Calculator', icon: '🔥',
      prompt: 'Calculate my FIRE number and timeline. Based on my income, savings rate, and expected returns, when can I achieve financial independence?',
      chips: ['My FIRE number', 'Timeline', 'Monthly target', 'Lean vs fat FIRE']
    },
    'dna': {
      name: 'Financial DNA', icon: '🧬',
      prompt: 'Deep analysis of my Financial DNA: what my archetype means, how it drives my financial decisions, and what behavioral shifts would accelerate my wealth.',
      chips: ['My archetype', 'Behavioral shifts', 'Strengths to use', 'Biases to fix']
    },

    /* ── Budget & Cash Flow ───────────────────────────────────── */
    'budget': {
      name: 'Budget Planner', icon: '📊',
      prompt: 'Analyze my budget vs actual spending. Where am I over-budget and what\'s the single biggest adjustment for this month to improve my savings rate?',
      chips: ['Over-budget areas', 'Savings boost', 'Cut vs earn more', 'Monthly target']
    },
    'sip-tracker': {
      name: 'SIP Tracker', icon: '🔄',
      prompt: 'Review my SIP portfolio. Which SIPs are performing vs underperforming? Should I increase, decrease, or switch any? What\'s my expected corpus in 10 years?',
      chips: ['SIP performance', 'Top up?', 'Switch these', '10-year corpus']
    },
    'emergency-fund': {
      name: 'Emergency Fund', icon: '🛟',
      prompt: 'Evaluate my emergency fund. Do I have enough months of coverage? Where should I park it for best liquidity and returns in India?',
      chips: ['Months coverage', 'Where to park', 'Top-up amount', 'Liquid fund pick']
    },

    /* ── Trading & Advanced ───────────────────────────────────── */
    'trading': {
      name: 'Trading', icon: '📱',
      prompt: 'Review my trading activity and performance. What patterns do I have? Am I profitable and what\'s my biggest trading mistake to fix?',
      chips: ['Win rate', 'Biggest mistake', 'Best setup', 'Risk per trade']
    },
    'trade-journal': {
      name: 'Trade Journal', icon: '📒',
      prompt: 'Analyze my trade journal. What are the common patterns in my winners vs losers? Which setup has the highest win rate for my style?',
      chips: ['Win patterns', 'Loss patterns', 'Best strategy', 'Fix this habit']
    },
    'options': {
      name: 'Options', icon: '🎰',
      prompt: 'Based on my experience and DNA, which options strategies are appropriate for me right now? What\'s my recommended risk limit per trade?',
      chips: ['Best strategies', 'Max risk', 'IV analysis', 'My edge']
    },
    'options-intelligence': {
      name: 'Options Intelligence', icon: '🎰',
      prompt: 'Am I ready for options trading based on my experience and DNA? What are the options strategies that match my risk profile and market view?',
      chips: ['Am I ready?', 'Best strategy', 'Max risk', 'First trade']
    },
    'hedgefund': {
      name: 'Hedge Fund Simulator', icon: '🏦',
      prompt: 'What hedge fund strategies are relevant to retail Indian investors? Which concepts can I apply to my own portfolio?',
      chips: ['Applicable strategies', 'Hedging my port', 'Market neutral', 'Risk parity']
    },
    'stock-platform': {
      name: 'Stock Platform', icon: '📱',
      prompt: 'Based on my trading style and portfolio, what broker platform features should I prioritize? How do I optimize my trade execution?',
      chips: ['Platform tips', 'Order types', 'Charts setup', 'My watchlist']
    },

    /* ── Insights ─────────────────────────────────────────────── */
    'insight-emi': {
      name: 'EMI Insights', icon: '🏠',
      prompt: 'Analyze my total EMI burden. What percentage of my income goes to EMIs? Is this healthy and what can I do to reduce it?',
      chips: ['EMI burden', 'Income %', 'Prepay analysis', 'Debt-free date']
    },
    'insight-sip': {
      name: 'SIP Insights', icon: '📈',
      prompt: 'Review my SIP investments. Am I investing enough? What return am I tracking and how does it compare to my goals?',
      chips: ['SIP check', 'Return rate', 'Top up needed', 'Goal alignment']
    },
    'insight-inflation': {
      name: 'Inflation Insights', icon: '📊',
      prompt: 'How is inflation impacting my real returns? Are my investments beating inflation? What should I hold to protect purchasing power?',
      chips: ['Real returns', 'Beat inflation', 'Safe inflation hedge', 'Adjust SIP']
    },
    'insight-rbi': {
      name: 'RBI Policy Insights', icon: '🏛️',
      prompt: 'How does the current RBI monetary policy affect my loans, FDs, and investments? What should I do when rates change?',
      chips: ['Rate impact on me', 'FD vs debt MF', 'Loan impact', 'Next action']
    },
    'insight-debt': {
      name: 'Debt Insights', icon: '📋',
      prompt: 'Complete analysis of my debt situation: total outstanding, monthly obligations, debt-to-income ratio, and fastest path to becoming debt-free.',
      chips: ['Debt snapshot', 'Debt-free date', 'Prepay order', 'Refinance?']
    },

    /* ── Impact & Special ─────────────────────────────────────── */
    'impact': {
      name: 'Impact Investing', icon: '🌍',
      prompt: 'How can I align my investments with my values? Based on my DNA and portfolio, what ESG or impact investments suit me and what\'s the return trade-off?',
      chips: ['ESG for me', 'Return trade-off', 'Green funds', 'Social impact']
    },
    'impact-detail': {
      name: 'Impact Detail', icon: '🌱',
      prompt: 'Deep dive on this impact investment. What\'s the actual social/environmental return alongside financial return for my goals?',
      chips: ['Impact metrics', 'Financial return', 'Portfolio fit', 'Green credentials']
    },
    'couple-finance': {
      name: 'Couple Finance', icon: '💑',
      prompt: 'Analyze our household financial situation. How should we split responsibilities, handle joint goals, and optimize our combined tax situation?',
      chips: ['Split strategy', 'Joint goals', 'Tax optimization', 'Emergency fund']
    },
    'system-leak': {
      name: 'System Leaks', icon: '🔍',
      prompt: 'Find all the invisible money leaks in my financial system. What subscriptions, fees, taxes, and inefficiencies are draining my wealth silently?',
      chips: ['All leaks', 'Subscription audit', 'Fee check', 'Fix priority']
    },
    'tools': {
      name: 'Tools Hub', icon: '🔧',
      prompt: 'Based on my current financial situation, which FIN-OS tools should I use most urgently? What problem should I solve with a tool today?',
      chips: ['Top tools for me', 'Urgent tool', 'Calculator pick', 'Data tool']
    },

    /* ── Calculators & Planning ──────────────────────────────── */
    'calculators': {
      name: 'Calculators', icon: '🧮',
      prompt: 'Based on my income, goals, and current savings, which calculations do I need most urgently? What numbers should I run today?',
      chips: ['SIP needed', 'Tax savings', 'EMI capacity', 'FIRE number']
    },

    /* ── Default fallback ─────────────────────────────────────── */
    '_default': {
      name: 'This Page', icon: '💡',
      prompt: 'I\'m on this page in FIN-OS. Based on my financial profile, DNA, and current goals, what insights are most relevant to me here? What should I do next?',
      chips: ['Key insights', 'My priorities', 'Action now', 'Learn more']
    }
  };

  /* ══ DETECT CURRENT PAGE ═════════════════════════════════════════════════ */
  function getPageKey() {
    const path = window.location.pathname;
    const file = path.split('/').pop().replace('.html', '').toLowerCase();
    return PAGE_REGISTRY[file] ? file : '_default';
  }

  /* ══ 3. DYNAMIC SMART CHIPS ══════════════════════════════════════════════ */
  // Chips that use the user's real numbers for instant relevance
  function buildDynamicChips(pageKey) {
    const ctx     = window.FINOS_USER_CONTEXT || {};
    const health  = Math.round(parseFloat(get('finos_health_score',  '0')));
    const savings = Math.round(parseFloat(get('finos_savings_rate',  '0')));
    const nw      = parseFloat(get('finos_net_worth', '0'));
    const dna     = get('finos_financial_dna', '');
    const port    = ctx.financial?.portfolio;
    const goals   = ctx.financial?.goals || [];
    const budget  = ctx.budget_tracker;
    const tx      = ctx.financial?.transactions;

    const dynamic = {
      'dashboard': [
        health > 0   ? `Why ${health}/100 health?`          : 'Boost health score',
        savings > 0  ? `Improve ${savings}% savings rate`   : 'Set savings target',
        port?.pnl_pct != null ? `${port.pnl_pct > 0 ? '+' : ''}${port.pnl_pct}% P&L — next?` : 'Portfolio check',
        goals[0]     ? `${goals[0].name}: ${goals[0].progress || 0}%` : 'Set first goal',
      ],
      'portfolio': [
        port?.total_value > 0 ? `${INR(port.total_value)} portfolio health` : 'Portfolio analysis',
        port?.pnl != null ? `${port.pnl >= 0 ? '+' : '-'}${INR(Math.abs(port.pnl))} P&L — advice?` : 'P&L breakdown',
        'Rebalance needed?',
        'Top concentration risk',
      ],
      'track-finances': [
        savings > 0 ? `${savings}% savings rate — ok?`    : 'Calculate savings rate',
        tx?.top_categories?.[0] ? `${tx.top_categories[0].cat}: ${INR(tx.top_categories[0].amt)}?` : 'Biggest expense',
        budget?.spent_total > 0 ? `Spent ${INR(budget.spent_total)} — on budget?` : 'Budget vs actual',
        'Cut 10% — where?',
      ],
      'home': [
        health > 0 ? `Health ${health}/100 — next move?`  : 'My priority today',
        nw > 0     ? `NW ${INR(nw)} — growing fast?`      : 'Check net worth',
        goals[0]   ? `${goals[0].name} at ${goals[0].progress || 0}%` : 'Set a goal',
        dna        ? `${dna} DNA blind spots?`             : 'My biggest risk',
      ],
      'goals': [
        goals[0]    ? `${goals[0].name}: ${goals[0].progress || 0}% done` : 'Add first goal',
        goals[1]    ? `${goals[1].name}: on track?`        : 'Add second goal',
        'Which goal first?',
        'Increase target?',
      ],
      'tax': [
        `My 80C status`,
        budget?.income_monthly ? `Tax on ${INR(budget.income_monthly * 12)}?` : 'My tax estimate',
        'Old vs new regime',
        'Save more before March',
      ],
    };

    return dynamic[pageKey] || PAGE_REGISTRY[pageKey]?.chips || PAGE_REGISTRY['_default'].chips;
  }

  /* ══ 10. SMART GREETING ══════════════════════════════════════════════════ */
  function buildSmartGreeting(pageKey) {
    const name    = get('finos_display_name', '').split(' ')[0] || 'hey';
    const hour    = new Date().getHours();
    const greet   = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const health  = Math.round(parseFloat(get('finos_health_score', '0')));
    const streak  = getJ('finos_streak', { count: 0 });
    const ctx     = window.FINOS_USER_CONTEXT || {};
    const goals   = ctx.financial?.goals || [];
    const port    = ctx.financial?.portfolio;

    // Time-aware, data-aware greeting
    let hook = '';
    if (health > 0 && health < 50)  hook = `Your financial health is ${health}/100 — let's fix the gaps.`;
    else if (port?.pnl_pct < -5)    hook = `Your portfolio is down ${Math.abs(port.pnl_pct)}% — let's talk strategy.`;
    else if (goals[0]?.progress > 80) hook = `${goals[0].name} is ${goals[0].progress}% complete — almost there!`;
    else if (streak.count >= 7)      hook = `${streak.count}-day streak — you're building a great habit!`;
    else if (health >= 70)           hook = `Financial health ${health}/100 — you're in great shape.`;
    else                             hook = `I've analysed your complete financial picture.`;

    return `${greet}, ${name}! ${hook} What can I help you with on this ${PAGE_REGISTRY[pageKey]?.name || 'page'}?`;
  }

  /* ══ AI TRANSPORT ════════════════════════════════════════════════════════ */
  function stripThinking(text) {
    let s = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    const openIdx = s.indexOf('<think>');
    if (openIdx !== -1) s = s.slice(0, openIdx);
    return s.trim();
  }

  /* ══ RICH TEXT RENDERER ═════════════════════════════════════════════════ */
  // Applied to FINAL responses only (not streaming) — safe HTML highlighting
  function richText(text) {
    let h = text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\n/g,'<br>');
    // ₹ amounts — accent gold + bold
    h = h.replace(/(₹[\d,.]+([\s]*(K|L|Cr|lakh|crore))?)/gi,
        '<strong class="asp-hl-inr">$1</strong>');
    // Percentages
    h = h.replace(/(\b\d+\.?\d*%\b)/g, '<span class="asp-hl-pct">$1</span>');
    // Critical warning words
    h = h.replace(/\b(critical|never|avoid|stop|dangerous|immediately|warning|urgent|risky)\b/gi,
        '<span class="asp-hl-warn">$1</span>');
    // Key Indian financial acronyms — bold
    h = h.replace(/\b(SIP|ELSS|NPS|PPF|EPF|FD|FIRE|CAGR|EMI|HRA|80C|80D|LIC|ULIP|ITR)\b/g,
        '<b>$1</b>');
    return h;
  }

  /* ══ INLINE CALCULATOR INTENT DETECTION ════════════════════════════════ */
  function detectCalcIntent(aiText, userText) {
    const t = (aiText + ' ' + (userText || '')).toLowerCase();
    if (/\b(sip|monthly.{0,25}invest|automat.{0,15}sip|\/mo.{0,15}sip)/i.test(t)) return 'sip';
    if (/\b(emi|home loan|car loan|personal loan|mortgage)\b/i.test(t))            return 'emi';
    if (/\b(fire number|fire corpus|years to (fire|retire)|retirement corpus|financial independence)\b/i.test(t)) return 'fire';
    return null;
  }

  function buildCalcCard(intent) {
    const income = parseFloat(window.FINOS_USER_CONTEXT?.budget_tracker?.income_monthly || get('finos_income','0'));
    const nw     = parseFloat(get('finos_net_worth','0'));
    const cfg = {
      sip: { title:'⚡ SIP Calculator', inputs:[
        { id:'sipm',  label:'Monthly SIP (₹)',  val: Math.max(5000, Math.round(income*0.25/500)*500)||10000, step:500 },
        { id:'sipyr', label:'Years',            val:20, min:1, max:40 },
        { id:'sipr',  label:'Expected CAGR %',  val:12, min:1, max:30, step:0.5 }
      ]},
      emi: { title:'🏠 EMI Calculator', inputs:[
        { id:'emip',  label:'Loan amount (₹)', val:3000000, step:100000 },
        { id:'emir',  label:'Interest % p.a.', val:8.5,     step:0.05 },
        { id:'emiyr', label:'Tenure (years)',   val:20, min:1, max:30 }
      ]},
      fire:{ title:'🔥 FIRE Calculator', inputs:[
        { id:'firee', label:'Annual expenses (₹)', val:Math.round(income*9)||600000, step:10000 },
        { id:'firec', label:'Current corpus (₹)',  val:Math.round(nw)||0,            step:100000 }
      ]}
    }[intent];
    if (!cfg) return null;
    return `<div class="asp-calc-card" data-intent="${intent}">
      <div class="asp-calc-title">${cfg.title}</div>
      ${cfg.inputs.map(f=>`<div class="asp-calc-row">
        <label class="asp-calc-label">${f.label}</label>
        <input type="number" class="asp-calc-input" id="aspc-${f.id}" value="${f.val||0}" min="${f.min||0}" max="${f.max||''}" step="${f.step||1}">
      </div>`).join('')}
      <div class="asp-calc-result" id="aspc-${intent}-res">← update values to calculate</div>
    </div>`;
  }

  function wireCalcCard(intent) {
    const g   = id => parseFloat(document.getElementById('aspc-'+id)?.value||0);
    const fmt = v  => INR(Math.round(v));
    const res = document.getElementById('aspc-'+intent+'-res');
    function calc() {
      if (!res) return;
      if (intent==='sip') {
        const [pmt,n,r] = [g('sipm'), g('sipyr'), g('sipr')/100];
        if (!pmt||!n||!r) return;
        const corpus = pmt*12*(Math.pow(1+r,n)-1)/r, inv = pmt*12*n;
        res.innerHTML = `Corpus: <strong>${fmt(corpus)}</strong> · Invested: ${fmt(inv)} · <span style="color:#00ffb3">Gain +${fmt(corpus-inv)}</span>`;
      } else if (intent==='emi') {
        const [P,r,n] = [g('emip'), g('emir')/1200, g('emiyr')*12];
        if (!P||!r||!n) return;
        const emi = P*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1);
        res.innerHTML = `EMI: <strong>${fmt(emi)}/mo</strong> · Total: ${fmt(emi*n)} · <span style="color:#ffb300">Interest: ${fmt(emi*n-P)}</span>`;
      } else if (intent==='fire') {
        const [exp,corpus] = [g('firee'), g('firec')];
        if (!exp) return;
        const fireNum = exp*25, gap = Math.max(0,fireNum-corpus);
        res.innerHTML = `FIRE number: <strong>${fmt(fireNum)}</strong> · Gap: <span style="color:${gap>0?'#ffb300':'#00ffb3'}">${fmt(gap)}</span>`;
      }
    }
    document.querySelectorAll('.asp-calc-input').forEach(inp=>inp.addEventListener('input',calc));
    calc();
  }

  async function _findEndpoint() {
    if (_activeEndpoint) return _activeEndpoint;
    for (const url of OLLAMA_ENDPOINTS) {
      try {
        const tagsUrl = url.replace('/api/generate', '/api/tags');
        // 1500ms timeout — fail fast, don't make user wait
        const r = await fetch(tagsUrl, { signal: AbortSignal.timeout(1500) });
        if (r.ok || r.type === 'opaque') { _activeEndpoint = url; return url; }
      } catch {}
    }
    throw new Error('Ollama offline');
  }

  // numPredict: 320 for auto-insights (fast, focused), 600 for user questions (detailed)
  async function streamFromOllama(systemPrompt, userPrompt, onToken, numPredict = 450) {
    const endpoint = await _findEndpoint();
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let   full = '';
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          model:   OLLAMA_MODEL,
          prompt:  userPrompt,
          system:  systemPrompt,
          stream:  true,
          think:   false,         // disable qwen3 chain-of-thought — biggest speedup
          options: {
            num_ctx:       2048,  // match our ~700-token prompts; default 8192+ is wasteful
            num_predict:   numPredict,
            temperature:   0.75,
            top_p:         0.9,
            repeat_penalty: 1.05,
          }
        }),
        signal:  ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.trim()) continue;
          try {
            const j = JSON.parse(line);
            if (j.response) {
              full += j.response;
              const stripped = stripThinking(full);
              onToken(stripped);
            }
            if (j.done) break;
          } catch {}
        }
      }
      return stripThinking(full) || '(no response)';
    } catch (err) {
      _activeEndpoint = null;
      throw err;
    } finally {
      clearTimeout(tid);
    }
  }

  /* ══ SYSTEM PROMPT ═══════════════════════════════════════════════════════ */
  // Kept tight intentionally — fewer system tokens = faster first token
  const BASE_SYSTEM = `You are Arya, FIN·OS's AI financial coach for Indian investors. IIM-educated desi friend — warm, direct, sharp.
Language: English with light Hinglish (yaar, bhai, dekh) when natural, never forced.
RULES (non-negotiable):
- Use the user's EXACT name and REAL numbers from the data below — never generic placeholders
- Indian context always: ₹, lakh/crore, SEBI/RBI/BSE/NSE, Indian tax laws
- End every auto-insight with ONE concrete action they can do TODAY
- For auto-insights: 5-7 rich sentences packed with their actual data
- For follow-up questions: go deep, no length limit, be thorough
- No markdown, no bullet lists — conversational prose like a WhatsApp message
- If MEMORY: block present, reference past conversations naturally
- If BEHAVIORAL ALERTS present, address tactfully`;

  /* ══ 8. FINANCIAL SNAPSHOT WIDGET ═══════════════════════════════════════ */
  function buildSnapshotHTML() {
    const health  = Math.round(parseFloat(get('finos_health_score', '0')));
    const ctx     = window.FINOS_USER_CONTEXT || {};
    const goals   = ctx.financial?.goals || [];
    const topGoal = goals[0];
    const nw      = parseFloat(get('finos_net_worth', '0'));
    const savings = Math.round(parseFloat(get('finos_savings_rate', '0')));

    if (!health && !topGoal && !nw) return '';

    const hColor  = health >= 70 ? '#00ffb3' : health >= 45 ? '#ffb300' : '#ff4444';
    const sColor  = savings >= 25 ? '#00ffb3' : savings >= 15 ? '#ffb300' : '#ff4444';
    const gpct    = topGoal ? Math.min(100, Math.round(topGoal.progress || 0)) : 0;

    const circumference = 2 * Math.PI * 18; // r=18
    const dashArr  = (health / 100) * circumference;

    return `
    <div id="arya-sp-snapshot">
      ${health > 0 ? `
        <div class="asp-snap-ring-wrap" title="Financial Health ${health}/100">
          <svg width="36" height="36" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="4"/>
            <circle cx="22" cy="22" r="18" fill="none" stroke="${hColor}" stroke-width="4"
              stroke-dasharray="${dashArr.toFixed(1)} ${circumference.toFixed(1)}"
              stroke-linecap="round" transform="rotate(-90 22 22)"
              style="transition:stroke-dasharray .8s ease"/>
            <text x="22" y="27" text-anchor="middle" fill="${hColor}" font-size="10" font-weight="800">${health}</text>
          </svg>
          <div class="asp-snap-ring-label">Health</div>
        </div>
      ` : ''}
      ${savings > 0 ? `
        <div class="asp-snap-ring-wrap" title="Savings Rate ${savings}%">
          <svg width="36" height="36" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="4"/>
            <circle cx="22" cy="22" r="18" fill="none" stroke="${sColor}" stroke-width="4"
              stroke-dasharray="${((savings / 50) * circumference).toFixed(1)} ${circumference.toFixed(1)}"
              stroke-linecap="round" transform="rotate(-90 22 22)"/>
            <text x="22" y="27" text-anchor="middle" fill="${sColor}" font-size="9" font-weight="800">${savings}%</text>
          </svg>
          <div class="asp-snap-ring-label">Savings</div>
        </div>
      ` : ''}
      ${topGoal ? `
        <div class="asp-snap-goal">
          <div class="asp-snap-goal-name">${topGoal.name}</div>
          <div class="asp-snap-goal-track">
            <div class="asp-snap-goal-fill" style="width:${gpct}%"></div>
          </div>
          <div class="asp-snap-goal-meta">${gpct}% · ${INR(topGoal.target)}</div>
        </div>
      ` : nw > 0 ? `
        <div class="asp-snap-goal">
          <div class="asp-snap-goal-name">Net Worth</div>
          <div class="asp-snap-goal-meta" style="font-size:13px;font-weight:800;color:#00ffb3;margin-top:4px">${INR(nw)}</div>
        </div>
      ` : ''}
    </div>`;
  }

  /* ══ PROACTIVE NUDGE ENGINE ═════════════════════════════════════════════ */
  function computeNudges() {
    const nudges = [];
    const inc  = parseFloat(get('finos_income','0'));
    const exp  = parseFloat(get('finos_expenses','0'));
    const nw   = parseFloat(get('finos_net_worth','0'));
    const debt = parseFloat(get('finos_debt','0'));
    const emer = parseFloat(get('finos_emergency_fund','0'));
    const sip  = parseFloat(get('finos_sip','0'));
    const age  = parseInt(get('finos_age','30'),10);
    const retireAge = parseInt(get('finos_retire_age','60'),10);
    const ins  = get('finos_insurance','');

    // Critical: expense ratio too high
    if (inc > 0 && exp > 0 && (exp / inc) > 0.85)
      nudges.push({ icon: '🚨', color: '#ff4d6d', text: `Expense ratio ${Math.round(exp/inc*100)}% — less than 15% left to invest. Trim top 2 expense categories urgently.` });

    // Critical: no emergency fund
    const emerMonths = (inc > 0 && emer > 0) ? (emer / (exp || inc)) : 0;
    if (emerMonths < 3)
      nudges.push({ icon: '⚠️', color: '#ffb300', text: `Emergency fund covers only ${emerMonths.toFixed(1)} months. Build to 6 months (${INR(Math.round((exp||inc)*6))} target) before investing.` });

    // Critical: debt-to-income > 50%
    if (inc > 0 && debt > 0 && (debt / (inc * 12)) > 2)
      nudges.push({ icon: '💸', color: '#ff7c43', text: `Debt ${INR(debt)} is ${(debt/(inc*12)).toFixed(1)}× annual income. Prioritize avalanche payoff before adding more investments.` });

    // Warning: no insurance
    if (!ins || ins === 'none' || ins === 'no')
      nudges.push({ icon: '🛡️', color: '#f4a261', text: 'No insurance detected. ₹1 crore term cover costs ~₹10-15K/yr in your 30s — protect income before building wealth.' });

    // Warning: SIP rate below 20% of income
    if (inc > 0 && sip > 0 && (sip * 12 / inc) < 0.2)
      nudges.push({ icon: '📉', color: '#e76f51', text: `SIP ${INR(sip)}/mo = ${Math.round(sip*12/inc*100)}% of income. Target ≥20% for FIRE by ${retireAge}. Add ${INR(Math.round(inc*0.2/12/500)*500 - sip)}/mo to reach that.` });

    // Info: age vs corpus projection
    if (inc > 0 && nw > 0) {
      const yrs = retireAge - age;
      if (yrs > 0) {
        const r = 0.12, corpus = nw * Math.pow(1+r,yrs) + (sip||0)*12*(Math.pow(1+r,yrs)-1)/r;
        nudges.push({ icon: '📊', color: '#00ffb3', text: `At 12% CAGR your corpus at ${retireAge} = ${INR(Math.round(corpus))}. FIRE needs ${INR(Math.round((exp||inc)*25))} (25× annual expenses).` });
      }
    }

    return nudges.slice(0, 3); // max 3 nudges to avoid overwhelming
  }

  /* ══ PULSE DASHBOARD VIEW ════════════════════════════════════════════════ */
  function buildPulseView() {
    const inc   = parseFloat(get('finos_income','0'));
    const exp   = parseFloat(get('finos_expenses','0'));
    const nw    = parseFloat(get('finos_net_worth','0'));
    const debt  = parseFloat(get('finos_debt','0'));
    const emer  = parseFloat(get('finos_emergency_fund','0'));
    const sip   = parseFloat(get('finos_sip','0'));
    const age   = parseInt(get('finos_age','30'),10);
    const retireAge = parseInt(get('finos_retire_age','60'),10);
    const dna   = get('finos_dna','Builder');

    // Savings rate
    const savRate = inc > 0 ? Math.max(0, Math.min(100, Math.round((inc - exp) / inc * 100))) : 0;
    // Emergency months
    const emerMo  = (inc > 0 && emer > 0) ? Math.min(12, (emer / (exp||inc))) : 0;
    // Debt ratio (debt vs 2× annual income — higher = worse)
    const debtScore = inc > 0 ? Math.max(0, 100 - Math.round((debt / (inc*12)) * 50)) : (debt===0?100:50);
    // Investment rate
    const invRate = inc > 0 && sip > 0 ? Math.min(100, Math.round(sip*12/inc*100)) : 0;
    // Years to FIRE
    const yrsLeft = Math.max(0, retireAge - age);
    const fireCorpus = nw > 0 ? Math.round(nw * Math.pow(1.12, yrsLeft) + (sip||0)*12*(Math.pow(1.12,yrsLeft)-1)/0.12) : 0;
    const fireNeed   = Math.round((exp||inc)*25);
    const fireScore  = fireNeed > 0 ? Math.min(100, Math.round(fireCorpus/fireNeed*100)) : 0;

    function pillar(icon, label, score, detail) {
      const r = score/100, c = score>=70?'#00ffb3':score>=40?'#ffb300':'#ff4d6d';
      const circ = 2*Math.PI*24;
      return `<div class="apl-pillar">
        <svg class="apl-ring" viewBox="0 0 60 60">
          <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="5"/>
          <circle cx="30" cy="30" r="24" fill="none" stroke="${c}" stroke-width="5"
            stroke-dasharray="0 ${circ.toFixed(1)}"
            stroke-dashoffset="${(circ*0.25).toFixed(1)}" stroke-linecap="round"
            data-circ="${circ.toFixed(1)}" data-score="${score}" class="apl-ring-fill"/>
          <text x="30" y="35" text-anchor="middle" font-size="13" font-weight="800" fill="${c}">${score}</text>
        </svg>
        <div class="apl-pillar-icon">${icon}</div>
        <div class="apl-pillar-label">${label}</div>
        <div class="apl-pillar-detail">${detail}</div>
      </div>`;
    }

    const nudges = computeNudges();
    const overallScore = Math.round((savRate + Math.round(emerMo/6*100) + debtScore + invRate + fireScore) / 5);
    const oc = overallScore>=70?'#00ffb3':overallScore>=40?'#ffb300':'#ff4d6d';

    const trend  = getHealthTrend();
    const trendHTML = trend !== null
      ? `<span style="font-size:10px;padding:2px 7px;border-radius:20px;margin-left:6px;background:rgba(${trend>0?'0,255,179':'255,77,109'},.1);color:${trend>0?'#00ffb3':'#ff4d6d'};border:1px solid rgba(${trend>0?'0,255,179':'255,77,109'},.25)">${trend>0?'↑':trend<0?'↓':'→'}${Math.abs(trend)} pts</span>`
      : '';

    return `<div id="arya-pulse-inner" class="asp-fade-in">
      <div class="apl-header">
        <div class="apl-score-wrap">
          <svg class="apl-big-ring" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="8"/>
            <circle cx="60" cy="60" r="50" fill="none" stroke="${oc}" stroke-width="8"
              stroke-dasharray="${(2*Math.PI*50*overallScore/100).toFixed(1)} ${(2*Math.PI*50).toFixed(1)}"
              stroke-dashoffset="${(2*Math.PI*50*0.25).toFixed(1)}" stroke-linecap="round"/>
            <text x="60" y="56" text-anchor="middle" font-size="26" font-weight="900" fill="${oc}">${overallScore}</text>
            <text x="60" y="74" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.5)">/100</text>
          </svg>
        </div>
        <div class="apl-header-info">
          <div class="apl-header-title">Financial Pulse${trendHTML}</div>
          <div class="apl-header-sub">${dna} · Age ${age} · Retire ${retireAge}</div>
          <div class="apl-corpus">Projected ${INR(fireCorpus)} by ${retireAge}</div>
        </div>
      </div>

      <div class="apl-pillars">
        ${pillar('💾', 'Savings', savRate, savRate>0?`${savRate}% rate`:'No data')}
        ${pillar('🛟', 'Safety', Math.round(emerMo/6*100), emerMo>0?`${emerMo.toFixed(1)} mo`:'No fund')}
        ${pillar('💳', 'Debt', debtScore, debt>0?INR(debt):'Debt-free')}
        ${pillar('📈', 'Invest', invRate, sip>0?`${INR(sip)}/mo`:'No SIP')}
        ${pillar('🔥', 'FIRE', fireScore, `${yrsLeft}yr left`)}
      </div>

      ${nudges.length ? `
      <div class="apl-nudges-title">Priority Alerts</div>
      <div class="apl-nudges">
        ${nudges.map(n=>`<div class="apl-nudge" style="border-left-color:${n.color}">
          <span class="apl-nudge-icon">${n.icon}</span>
          <span class="apl-nudge-text">${n.text}</span>
        </div>`).join('')}
      </div>` : '<div class="apl-all-good">✅ Financial health looks solid — keep the momentum!</div>'}

      <div class="apl-kpi-row" style="cursor:pointer">
        <div class="apl-kpi apl-kpi-card" onclick="this.querySelector('.apl-kpi-expand').style.display=this.querySelector('.apl-kpi-expand').style.display==='block'?'none':'block'">
          <div class="apl-kpi-val" style="color:#00ffb3">${inc>0?INR(inc)+'/mo':'—'}</div>
          <div class="apl-kpi-lbl">Income</div>
          <div class="apl-kpi-expand" style="display:none;margin-top:5px;text-align:left;font-size:9px;color:rgba(255,255,255,.45);line-height:1.6;border-top:1px solid rgba(255,255,255,.07);padding-top:5px">${inc>0?`${INR(inc)} gross<br>Saves: ${INR(Math.max(0,inc-exp))}/mo<br>Rate: ${savRate}%`:'Set on Profile page'}</div>
        </div>
        <div class="apl-kpi apl-kpi-card" onclick="this.querySelector('.apl-kpi-expand').style.display=this.querySelector('.apl-kpi-expand').style.display==='block'?'none':'block'">
          <div class="apl-kpi-val" style="color:#ffd93d">${nw>0?INR(nw):'—'}</div>
          <div class="apl-kpi-lbl">Net Worth</div>
          <div class="apl-kpi-expand" style="display:none;margin-top:5px;text-align:left;font-size:9px;color:rgba(255,255,255,.45);line-height:1.6;border-top:1px solid rgba(255,255,255,.07);padding-top:5px">${nw>0?`Total assets<br>vs FIRE target: ${INR(fireNeed)}<br>${Math.round(nw/fireNeed*100)}% of target`:'Set on Track page'}</div>
        </div>
        <div class="apl-kpi apl-kpi-card" onclick="this.querySelector('.apl-kpi-expand').style.display=this.querySelector('.apl-kpi-expand').style.display==='block'?'none':'block'">
          <div class="apl-kpi-val" style="color:#a78bfa">${yrsLeft}yr</div>
          <div class="apl-kpi-lbl">To Retire</div>
          <div class="apl-kpi-expand" style="display:none;margin-top:5px;text-align:left;font-size:9px;color:rgba(255,255,255,.45);line-height:1.6;border-top:1px solid rgba(255,255,255,.07);padding-top:5px">Age ${age} → ${retireAge}<br>FIRE @ ${fireNeed>0?INR(fireNeed):'?'}<br>Score: ${fireScore}/100</div>
        </div>
      </div>
      <button class="asp-view-ask-btn" style="margin:10px 14px 0;width:calc(100% - 28px)" data-msg="Based on my financial pulse — savings rate ${savRate}%, emergency fund ${emerMo.toFixed(1)} months, debt score ${debtScore}/100, investment rate ${invRate}%, FIRE score ${fireScore}/100 — give me a personalised 90-day action plan with specific ₹ targets for each pillar.">🤖 Get my 90-day action plan</button>
    </div>`;
  }

  /* ══ EMOTION-AWARE TONE SYSTEM ══════════════════════════════════════════ */
  const EMOTION_MODES = {
    calm:       { icon:'😌', color:'#00d4ff', label:'Calm',
      append:'\nTone adjustment: User is calm. Be structured, data-driven, confident.' },
    excited:    { icon:'🥳', color:'#00ffb3', label:'Excited',
      append:'\nTone adjustment: User is excited or celebratory. Match their energy briefly then ground advice in real numbers.' },
    worried:    { icon:'😟', color:'#ff9500', label:'Worried',
      append:'\nTone adjustment: User is anxious. Open with ONE sentence of emotional validation and reassurance, then give calm practical advice. Never dismiss the worry.' },
    curious:    { icon:'🤔', color:'#a855f7', label:'Curious',
      append:'\nTone adjustment: User is curious. Go deeper, use simple Indian examples, invite follow-up questions.' },
    frustrated: { icon:'😤', color:'#ff4d6d', label:'Frustrated',
      append:'\nTone adjustment: User is frustrated. Acknowledge their feeling in one sentence. Then give 2-3 ultra-specific actionable steps — no long lectures.' }
  };
  let _currentEmotion = 'calm';

  function detectEmotion(text) {
    const t = text.toLowerCase();
    const s = { calm:0, excited:0, worried:0, curious:0, frustrated:0 };
    if (/\b(scared|anxious|panic|crash|loss|lost|terrible|bad|falling|market down|dropped|worried|nightmare|help|emergency|urgent)\b/.test(t)) s.worried += 3;
    if (/\b(great|amazing|awesome|promoted|bonus|yay|excited|happy|finally|achieved|won|profit|gained|best|excellent)\b/.test(t)) s.excited += 3;
    if (/\b(why|how does|what is|when should|explain|understand|curious|learn|tell me|confused|what if|should i|is it|which is better)\b/.test(t)) s.curious += 2;
    if (/\b(frustrated|stupid|annoying|useless|hate|not working|sick of|fed up|ridiculous|unfair|why can't|failing|worst|terrible)\b/.test(t)) s.frustrated += 3;
    if (text.includes('?')) s.curious += 1;
    if (/[!]{2,}/.test(text) || (text === text.toUpperCase() && text.trim().length > 5)) s.excited += 1;
    const top = Object.entries(s).sort((a, b) => b[1] - a[1])[0];
    return top[1] > 0 ? top[0] : 'calm';
  }

  function updateEmotionIndicator(emotion) {
    _currentEmotion = emotion;
    const em = EMOTION_MODES[emotion];
    const el = document.getElementById('arya-emotion-badge');
    if (el) { el.textContent = em.icon; el.title = `Arya mood: ${em.label}`; el.style.filter = `drop-shadow(0 0 4px ${em.color})`; }
  }

  /* ══ MACRO NEWS INJECTION ════════════════════════════════════════════════ */
  let _newsCache   = null;
  let _newsCacheTs = 0;
  const _NEWS_TTL  = 30 * 60 * 1000;

  async function fetchMacroNews() {
    if (_newsCache && Date.now() - _newsCacheTs < _NEWS_TTL) return _newsCache;
    const parse = async url => {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (!r.ok) throw new Error('not ok');
      const d = await r.json();
      const items = (d.articles || d.news || d.headlines || d.results || []).slice(0, 5);
      const lines = items.map(a => '• ' + (a.title || a.headline || a.text || '')).filter(s => s.length > 5).join('\n');
      if (!lines) throw new Error('empty');
      return lines;
    };
    try {
      const result = await Promise.any([
        parse('http://127.0.0.1:5000/api/headlines?limit=5'),
        parse('http://127.0.0.1:5000/headlines?limit=5'),
        parse('http://127.0.0.1:5000/api/news?limit=5')
      ]);
      _newsCache = result; _newsCacheTs = Date.now();
      return result;
    } catch { return _newsCache || ''; }
  }

  /* ══ HEATMAP CALENDAR ════════════════════════════════════════════════════ */
  const FESTIVALS_MM = {
    '01-01':'🎆 New Year',    '01-14':'🪁 Makar Sankranti', '01-26':'🇮🇳 Republic Day',
    '03-17':'🎨 Holi',        '03-29':'✝️ Good Friday',     '04-14':'🌾 Baisakhi',
    '04-21':'🕌 Eid ul-Fitr', '06-17':'🎉 Eid al-Adha',    '08-15':'🇮🇳 Independence',
    '08-26':'🪈 Janmashtami', '09-15':'🐘 Ganesh Chaturthi','10-02':'🕊️ Gandhi Jayanti',
    '10-12':'💃 Navratri',    '10-24':'🏹 Dussehra',        '10-31':'✨ Dhanteras',
    '11-01':'🪔 Diwali',      '11-15':'💡 Dev Diwali',      '12-25':'🎄 Christmas'
  };

  function buildHeatmapView() {
    const dailyBudget = (parseFloat(get('finos_expenses', '0')) || 50000) / 30;
    const expData     = getJ('finos_daily_expenses', {});
    const today       = new Date();
    const todayISO    = today.toISOString().slice(0, 10);
    const CELL = 5, GAP = 1.5, STEP = CELL + GAP; // 6.5px per column

    const start = new Date(today);
    start.setDate(today.getDate() - 364);
    start.setDate(start.getDate() - start.getDay()); // align to Sunday

    const weeks = [];
    const cur   = new Date(start);
    for (let w = 0; w < 53; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const iso   = cur.toISOString().slice(0, 10);
        const mmdd  = iso.slice(5);
        const spend = expData[iso] || 0;
        const pct   = dailyBudget > 0 ? Math.min(200, (spend / dailyBudget) * 100) : 0;
        week.push({ iso, mmdd, spend, pct,
          isFut: cur > today, isNow: iso === todayISO, fest: FESTIVALS_MM[mmdd]
        });
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
    }

    function cellBg(c) {
      if (c.isFut)   return 'rgba(255,255,255,.03)';
      if (!c.spend)  return 'rgba(255,255,255,.07)';
      if (c.pct < 60)  return '#00ffb399';
      if (c.pct < 90)  return '#00d4ff99';
      if (c.pct < 120) return '#ffb30099';
      if (c.pct < 160) return '#ff754399';
      return '#ff4d6d99';
    }

    // Stats
    const allCells       = weeks.flat();
    const daysWithData   = allCells.filter(c => !c.isFut && c.spend > 0).length;
    const totalSpend     = allCells.reduce((a, c) => a + (c.spend || 0), 0);
    const avgDay         = daysWithData > 0 ? Math.round(totalSpend / daysWithData) : 0;
    const festDays       = allCells.filter(c => c.fest && !c.isFut).length;
    const overBudget     = allCells.filter(c => !c.isFut && c.pct > 120).length;

    // Month labels — absolutely positioned above columns
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    let prevM = -1;
    const monthLabelHTML = weeks.map((w, wi) => {
      const m = new Date(w[0].iso).getMonth();
      if (m === prevM) return '';
      prevM = m;
      return `<span style="position:absolute;left:${(wi*STEP).toFixed(1)}px;font-size:8px;color:rgba(255,255,255,.32);white-space:nowrap">${MONTHS[m]}</span>`;
    }).join('');

    // Day-of-week labels (show only Mon/Wed/Fri rows to save space)
    const dayLabels = ['','M','','W','','F',''].map((d, i) =>
      `<div style="height:${CELL}px;line-height:${CELL}px;${i > 0 ? `margin-top:${GAP}px;` : ''}font-size:7px;color:rgba(255,255,255,.28);text-align:right">${d}</div>`
    ).join('');

    // Cells — weeks[w][d] order is PERFECT for grid-auto-flow:column (fills column-by-column)
    const cells = weeks.map(week => week.map(c => {
      const bg   = cellBg(c);
      const ring = c.isNow  ? `;outline:2px solid #00d4ff;outline-offset:1px`
                 : c.fest   ? `;outline:1px solid rgba(255,200,0,.6);outline-offset:0`
                 : '';
      const glow = c.isNow  ? `;box-shadow:0 0 5px #00d4ff80` : '';
      const tip  = `${c.iso}${c.fest ? ' · ' + c.fest : ''}${c.spend ? ' — ₹' + c.spend.toLocaleString('en-IN') : (!c.isFut ? ' — no data' : ' — future')}`;
      return `<div class="cal-cell" data-tip="${tip}" style="width:${CELL}px;height:${CELL}px;border-radius:1.5px;background:${bg}${ring}${glow};cursor:default"></div>`;
    }).join('')).join('');

    const totalW = (53 * STEP - GAP).toFixed(1);

    return `<div class="asp-fade-in" style="padding:12px 14px 4px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <div style="font-size:14px;font-weight:800;color:var(--text-primary,#fff)">Spending Heatmap</div>
        <div style="font-size:10px;color:rgba(255,255,255,.35)">${daysWithData} days tracked</div>
      </div>

      <div style="display:flex;gap:6px;align-items:flex-start">
        <div style="padding-top:18px;flex-shrink:0">${dayLabels}</div>
        <div style="overflow-x:auto;scrollbar-width:none;min-width:0;flex:1">
          <div style="width:${totalW}px">
            <div style="position:relative;height:14px;margin-bottom:3px">${monthLabelHTML}</div>
            <div style="display:grid;grid-template-rows:repeat(7,${CELL}px);grid-auto-flow:column;grid-auto-columns:${CELL}px;gap:${GAP}px">${cells}</div>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:5px;align-items:center;margin-top:8px;font-size:10px;color:rgba(255,255,255,.3)">
        <span>Less</span>
        ${['#00ffb399','#00d4ff99','#ffb30099','#ff754399','#ff4d6d99'].map(c=>`<div style="width:10px;height:10px;border-radius:2px;background:${c}"></div>`).join('')}
        <span>More</span>
        <span style="margin-left:auto;font-size:9px;color:rgba(255,200,0,.7)">✦ festival</span>
      </div>

      ${daysWithData === 0
        ? `<div style="margin:12px 0;padding:12px;background:rgba(255,255,255,.04);border-radius:9px;text-align:center;font-size:11.5px;color:rgba(255,255,255,.4);line-height:1.7">No daily expense data yet.<br>Log spending in Budget Tracker to fill your calendar 📊</div>`
        : `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:10px">
            <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:7px;text-align:center"><div style="font-size:12px;font-weight:800;color:#00ffb3">${INR(avgDay)}</div><div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:1px">Avg/day</div></div>
            <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:7px;text-align:center"><div style="font-size:12px;font-weight:800;color:#ffd93d">${INR(Math.round(totalSpend))}</div><div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:1px">Total</div></div>
            <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:7px;text-align:center"><div style="font-size:12px;font-weight:800;color:#ff9500">${festDays}</div><div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:1px">Festivals</div></div>
            <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:7px;text-align:center"><div style="font-size:12px;font-weight:800;color:#ff4d6d">${overBudget}</div><div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:1px">Over budget</div></div>
          </div>`}
      <button class="asp-view-ask-btn" data-msg="Analyse my spending heatmap patterns. Which weeks or months do I consistently overspend? What's draining my budget most? Give me 3 concrete adjustments with ₹ impact." style="margin:10px 0 4px">🤖 Analyse my spending patterns</button>
    </div>`;
  }

  function wireHeatmap() {
    // Create / reuse a fixed tooltip that escapes any overflow container
    let tip = document.getElementById('arya-cal-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'arya-cal-tip';
      tip.style.cssText = 'position:fixed;display:none;background:#0d1117;border:1px solid rgba(255,255,255,.15);border-radius:7px;padding:6px 10px;font-size:11px;color:rgba(255,255,255,.82);pointer-events:none;z-index:9999999;white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,.6);transition:opacity .1s';
      document.body.appendChild(tip);
    }
    document.querySelectorAll('.cal-cell').forEach(cell => {
      cell.addEventListener('mouseenter', e => {
        const text = cell.dataset.tip;
        if (!text) return;
        tip.textContent = text;
        tip.style.display = 'block';
        const r = cell.getBoundingClientRect();
        tip.style.left = Math.min(r.left + 4, window.innerWidth - 230) + 'px';
        tip.style.top  = Math.max(r.top - 36, 6) + 'px';
      });
      cell.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
  }

  /* ══ INLINE STREAMING — answer directly inside any sub-domain tab ════════ */
  async function streamInlineFromBtn(btn, prompt) {
    const origLabel = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="asp-inline-dots"><span></span><span></span><span></span></span>';

    let box = btn.nextElementSibling;
    if (!box || !box.classList.contains('asp-inline-resp')) {
      box = document.createElement('div');
      box.className = 'asp-inline-resp';
      btn.insertAdjacentElement('afterend', box);
    }
    box.style.display = 'block';
    box.innerHTML = `
      <div class="asp-inline-resp-hd">
        <span class="asp-inline-resp-who">🤖 Arya</span>
        <button class="asp-inline-resp-x" title="Close">✕</button>
      </div>
      <div class="asp-inline-resp-body">
        <div class="asp-thinking"><span></span><span></span><span></span></div>
      </div>`;

    box.querySelector('.asp-inline-resp-x')?.addEventListener('click', () => {
      box.style.display = 'none';
      btn.innerHTML = origLabel;
      btn.disabled = false;
    });
    setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);

    const pageKey    = getPageKey();
    const userCtx    = buildUserContext(pageKey);
    const newsLines  = await fetchMacroNews().catch(() => '');
    const memBlock   = (window.AryaMemory?.loaded && window.AryaMemory.buildBlock)
      ? (window.AryaMemory.buildBlock('') || '') : '';
    const fullSystem = BASE_SYSTEM
      + '\n\nUSER FINANCIAL PROFILE:\n' + userCtx
      + (newsLines ? '\n\nLIVE MARKET CONTEXT (use if relevant):\n' + newsLines : '')
      + (memBlock  ? '\n\n' + memBlock : '');

    const bodyEl = box.querySelector('.asp-inline-resp-body');
    const safePmt = () => prompt.replace(/"/g, '&quot;').replace(/\n/g, ' ').slice(0, 400);

    try {
      await _findEndpoint();
      let final = '';
      await streamFromOllama(fullSystem, prompt, partial => {
        final = partial;
        if (bodyEl) bodyEl.innerHTML = `<div class="asp-inline-resp-text">${richText(partial)}<span class="asp-cursor"></span></div>`;
      }, 260);

      if (bodyEl && final) {
        bodyEl.innerHTML = `
          <div class="asp-inline-resp-text">${richText(final)}</div>
          <div class="asp-inline-resp-ft">
            <button class="asp-inline-resp-go" data-msg="${safePmt()}">💬 Expand in Chat</button>
          </div>`;
        bodyEl.querySelector('.asp-inline-resp-go')?.addEventListener('click', e => {
          const msg = e.currentTarget.dataset.msg;
          switchAryaTab('chat');
          if (!_aiRunning) setTimeout(() => sendMessage(msg), 150);
        });
      }
    } catch {
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div style="font-size:11px;color:rgba(255,255,255,.38);line-height:1.6">Arya is offline — start Ollama to get instant answers.</div>
          <div class="asp-inline-resp-ft">
            <button class="asp-inline-resp-go" data-msg="${safePmt()}">💬 Try in Chat</button>
          </div>`;
        bodyEl.querySelector('.asp-inline-resp-go')?.addEventListener('click', e => {
          const msg = e.currentTarget.dataset.msg;
          switchAryaTab('chat');
          if (!_aiRunning) setTimeout(() => sendMessage(msg), 150);
        });
      }
    }
    btn.innerHTML = origLabel;
    btn.disabled = false;
  }

  function handleAskBtn(btn) {
    const msg = btn.dataset.msg;
    if (!msg) return;
    if (btn.closest('#asp-view-chat')) {
      // Already in chat panel — continue there
      switchAryaTab('chat');
      if (!_aiRunning) setTimeout(() => sendMessage(msg), 150);
    } else {
      streamInlineFromBtn(btn, msg);
    }
  }

  function wireAskBtnInEl(el) {
    el.querySelectorAll('.asp-view-ask-btn').forEach(btn => {
      btn.addEventListener('click', () => handleAskBtn(btn));
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════
   * ARYA COMPLETE AGENT SYSTEM — v4.0
   * ─────────────────────────────────────────────────────────────────────────
   * Layer 1: AryaMemoryDB   — IndexedDB persistent cross-session memory
   * Layer 2: AgentTools     — 12 local executable tools (zero cloud calls)
   * Layer 3: AryaAgentRunner— ReAct loop: Reason → Tool Call → Observe → Repeat
   * Layer 4: buildAgentView — Agent tab UI (steps, memory viewer, history)
   * Layer 5: Proactive      — daily brief + auto-memory after each chat turn
   * ══════════════════════════════════════════════════════════════════════════ */

  /* ── LAYER 1: Persistent Memory (IndexedDB) ─────────────────────────────── */
  const AryaMemoryDB = (() => {
    let _db = null;
    const DB_NAME = 'finos_arya_memory';
    const STORE   = 'memories';

    async function open() {
      if (_db) return _db;
      return new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE)) {
            const s = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
            s.createIndex('ts',   'ts',   { unique: false });
            s.createIndex('type', 'type', { unique: false });
          }
        };
        req.onsuccess = e => { _db = e.target.result; res(_db); };
        req.onerror   = e => rej(e.target.error);
      });
    }

    async function _all() {
      const db = await open();
      return new Promise((res, rej) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        req.onsuccess = e => res(e.target.result || []);
        req.onerror   = e => rej(e.target.error);
      });
    }

    async function store(content, tags = [], type = 'fact') {
      const db  = await open();
      const all = await _all();
      // Deduplicate: skip if near-identical content already exists
      const dup = all.find(m => m.content.slice(0, 60) === content.slice(0, 60));
      if (dup) return dup.id;
      return new Promise((res, rej) => {
        const tx  = db.transaction(STORE, 'readwrite');
        const req = tx.objectStore(STORE).add({ content, tags, type, ts: Date.now() });
        req.onsuccess = e => res(e.target.result);
        req.onerror   = e => rej(e.target.error);
      });
    }

    async function search(query, limit = 6) {
      const all = await _all();
      const q   = query.toLowerCase().split(/\W+/).filter(w => w.length > 2);
      if (!q.length) return all.sort((a,b) => b.ts - a.ts).slice(0, limit);
      return all
        .map(m => ({ ...m, score: q.filter(w => m.content.toLowerCase().includes(w)).length }))
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score || b.ts - a.ts)
        .slice(0, limit);
    }

    async function getRecent(limit = 8) {
      const all = await _all();
      return all.sort((a, b) => b.ts - a.ts).slice(0, limit);
    }

    async function forget(id) {
      const db = await open();
      return new Promise((res, rej) => {
        const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id);
        req.onsuccess = () => res();
        req.onerror   = e => rej(e.target.error);
      });
    }

    async function count() {
      const all = await _all();
      return all.length;
    }

    async function buildBlock(query) {
      const mems = query ? await search(query) : await getRecent(6);
      if (!mems.length) return '';
      return 'ARYA PERSISTENT MEMORY (facts about this user, respect these):\n' +
        mems.map(m => `• [${m.type}] ${m.content}`).join('\n');
    }

    return { store, search, getRecent, forget, count, buildBlock, open };
  })();

  /* ── LAYER 2: Agent Tool Registry ────────────────────────────────────────── */
  /* ── AgentTools: 25 local financial tools — zero cloud ─────────────────── */
  const AgentTools = {
    schema: [
      /* Core profile & data */
      { name: 'get_profile',    desc: 'Full financial profile — income, NW, SIP, DNA, health, debts, goals, all key numbers', args: {} },
      { name: 'get_goals',      desc: 'All goals with ₹ saved, target, % complete, SIP needed to stay on track', args: {} },
      { name: 'get_health',     desc: 'Health score breakdown by pillar — emergency, savings, debt, insurance', args: {} },
      { name: 'get_news',       desc: 'Latest macro Indian finance headlines from news feed', args: {} },
      { name: 'recall',         desc: 'Search persistent memory for stored facts/preferences', args: { query: 'search term' } },
      /* Calculators */
      { name: 'calc_sip',       desc: 'SIP corpus projection', args: { amount: 'monthly ₹', years: 'period', rate: 'CAGR % (default 12)' } },
      { name: 'calc_emi',       desc: 'Loan EMI + total interest cost', args: { principal: '₹', annual_rate: '% (default 8.5)', years: 'tenure (default 20)' } },
      { name: 'calc_fire',      desc: 'FIRE corpus + exact years to retire at current SIP rate', args: { monthly_expense: '₹ (default 70% of income)' } },
      { name: 'calc_inflation', desc: 'Purchasing power erosion over time', args: { amount: '₹', years: 'N', rate: '% (default 6.5)' } },
      { name: 'calc_debt_free', desc: 'Months to become debt-free via avalanche method', args: { extra_monthly: '₹ extra above minimum (default 2000)' } },
      /* Advanced intelligence tools */
      { name: 'analyze_wealth', desc: 'Complete wealth X-Ray — liquid/growth/safety asset breakdown + ideal allocation', args: {} },
      { name: 'optimize_tax',   desc: 'Full 80C/80D/NPS/HRA optimization — exact savings remaining and priority order', args: { annual_income: '₹ (optional — uses profile income)' } },
      { name: 'calc_insurance', desc: 'Life/term/health insurance gap analysis — exactly how underinsured you are', args: {} },
      { name: 'optimize_sip',   desc: 'Optimal SIP fund category allocation for your age, DNA, risk profile', args: { total_sip: '₹ monthly (optional)' } },
      { name: 'calc_rebalance', desc: 'Portfolio rebalancing — current vs target allocation with exact buy/sell actions', args: {} },
      { name: 'detect_bias',    desc: 'Behavioral finance bias scan — finds cognitive biases sabotaging your returns', args: {} },
      { name: 'create_budget',  desc: 'Personalized monthly budget plan (50/30/20 or aggressive-saver style)', args: { style: '50-30-20 | 60-20-20 | aggressive-saver (default 50-30-20)' } },
      { name: 'calc_goal_gap',  desc: 'Goal deficit analysis — SIP needed per goal to hit deadlines', args: {} },
      { name: 'calc_nps',       desc: 'NPS benefit — 80CCD(1B) ₹50K extra deduction + retirement corpus projection', args: { contribution: '₹ annual (default 50000)' } },
      { name: 'assess_risk',    desc: 'Dynamic risk profile — score 0-90, recommended allocation and investment style', args: {} },
      { name: 'calc_advance_tax', desc: 'Advance tax installment schedule (15 Jun/Sept/Dec/Mar) for current FY', args: { annual_income: '₹ (optional)' } },
      { name: 'compare_funds',  desc: 'Compare two instruments (ELSS vs PPF, SIP vs FD, etc.)', args: { option1: 'e.g. ELSS', option2: 'e.g. PPF', amount: '₹ annual', years: 'N' } },
      { name: 'calc_rent_vs_buy', desc: 'Rent vs Buy analysis for Indian cities — which wins financially', args: { property_value: '₹', monthly_rent: '₹', city: 'city name' } },
      /* Memory */
      { name: 'remember',       desc: 'Store a key fact/preference/goal in persistent IndexedDB memory', args: { content: 'the fact', tags: 'comma-separated tags', type: 'fact|goal|preference|event|plan' } },
      /* ── LIVE MARKET TOOLS (requires arya-ai backend on port 7475) ─────── */
      { name: 'live_quote',     desc: 'Live NSE/BSE stock price, day H/L, 52W range, volume — REAL TIME', args: { symbol: 'e.g. RELIANCE', exchange: 'NSE or BSE (default NSE)' } },
      { name: 'live_market',    desc: 'Live Nifty 50, Sensex, Nifty Bank, Nifty IT indices with % change', args: {} },
      { name: 'live_commodities', desc: 'Live gold, silver, crude oil prices + INR/USD/EUR/GBP forex rates', args: {} },
      { name: 'live_crypto',    desc: 'Live crypto prices in INR: Bitcoin, Ethereum, XRP, etc.', args: { coins: 'comma-separated ids e.g. bitcoin,ethereum (default top 5)' } },
      { name: 'live_news',      desc: 'Latest financial news with AI sentiment (bullish/bearish/neutral) from ET/MC/BS/Mint', args: { limit: 'number of articles (default 8)' } },
      { name: 'search_web',     desc: 'Search the web (DuckDuckGo) for any financial topic, company, or news', args: { query: 'search query', max: 'results (default 5)' } },
      { name: 'read_url',       desc: 'Read and extract clean text from any URL — annual reports, news articles, SEBI filings', args: { url: 'full URL to read', max_chars: 'max chars (default 2500)' } },
      { name: 'analyze_stock',  desc: 'Full technical analysis: RSI, MACD, Bollinger Bands, EMA, SMA200, ADX, Volume signal + BUY/HOLD/SELL verdict', args: { symbol: 'NSE symbol e.g. INFY', exchange: 'NSE or BSE (default NSE)' } },
    ],

    async execute(name, args = {}) {
      const n = parseFloat;
      switch (name) {

        /* ── PROFILE + DATA ─────────────────────────────────────────────── */
        case 'get_profile': {
          const goals = getJ('finos_goals', []);
          const inc   = n(get('finos_income','0'));
          const nw    = n(get('finos_net_worth','0'));
          const sip   = n(get('finos_sip_amount','0'));
          const em    = n(get('finos_emergency_fund','0'));
          return JSON.stringify({
            name:          get('finos_display_name','—'),
            age:           get('finos_age','—'),
            city:          get('finos_city','—'),
            dna:           get('finos_financial_dna','—'),
            monthly_income: INR(inc),
            annual_income:  INR(inc * 12),
            net_worth:     INR(nw),
            sip_amount:    INR(sip),
            sip_pct_income: inc > 0 ? (sip/inc*100).toFixed(1) + '%' : '?',
            savings_rate:  get('finos_savings_rate','—') + '%',
            health_score:  get('finos_health_score','—') + '/100',
            emergency_fund: INR(em) + (inc > 0 ? ` (${(em/inc).toFixed(1)} months)` : ''),
            total_debt:    INR(n(get('finos_total_debt','0'))),
            fire_target:   INR(n(get('finos_fire_target','0'))),
            goals_count:   goals.length,
            advisor_mode:  ADVISOR_PERSONAS[_currentPersona]?.name || 'Balanced',
          }, null, 2);
        }

        case 'get_goals': {
          const goals = getJ('finos_goals', []);
          if (!goals.length) return 'No goals set — user should add goals in profile.';
          const now = Date.now();
          return goals.map(g => {
            const pct     = g.target > 0 ? Math.round(g.saved / g.target * 100) : 0;
            const months  = g.months || 120;
            const gap     = Math.max(0, (g.target || 0) - (g.saved || 0));
            const r       = 0.12 / 12;
            const sipNeed = gap > 0 && months > 0 ? Math.ceil(gap * r / (Math.pow(1+r, months) - 1) / (1+r)) : 0;
            const flag    = pct >= 100 ? '✅' : months < 12 && pct < 70 ? '🚨' : pct < 35 ? '⚠️' : '🟡';
            return `${flag} ${g.name}: ${INR(g.saved)}/${INR(g.target)} (${pct}%) | Time: ${months}mo | SIP needed: ${INR(sipNeed)}/mo`;
          }).join('\n');
        }

        case 'get_health': {
          const score = n(get('finos_health_score','0'));
          const inc   = n(get('finos_income','0'));
          const em    = n(get('finos_emergency_fund','0'));
          const sav   = n(get('finos_savings_rate','0'));
          const debt  = n(get('finos_total_debt','0'));
          const ins   = n(get('finos_health_insurance','0'));
          const emMo  = inc > 0 ? (em / inc).toFixed(1) : '?';
          return `HEALTH SCORE: ${Math.round(score)}/100
• Emergency Fund: ${emMo} months (target: 6 months) ${parseFloat(emMo) >= 6 ? '✅' : parseFloat(emMo) >= 3 ? '⚠️' : '🚨'}
• Savings Rate: ${sav}% (target: 20%+) ${sav >= 20 ? '✅' : sav >= 10 ? '⚠️' : '🚨'}
• Total Debt: ${INR(debt)} ${debt === 0 ? '✅ Debt free' : '⚠️ Has liabilities'}
• Health Insurance: ${ins > 0 ? INR(ins) + ' ✅' : '❌ NOT SET — urgent!'}
• Income: ${INR(inc)}/month`;
        }

        case 'get_news': {
          const news = await fetchMacroNews().catch(() => '');
          return news || 'News unavailable — start app.py backend.';
        }

        case 'recall': {
          const mems = await AryaMemoryDB.search(args.query || '', 6);
          if (!mems.length) return 'Nothing in memory matching that query.';
          return mems.map(m => `• [${m.type}] ${m.content}`).join('\n');
        }

        /* ── CORE CALCULATORS ──────────────────────────────────────────── */
        case 'calc_sip': {
          const amt  = n(args.amount || get('finos_sip_amount','8000'));
          const yrs  = n(args.years  || 10);
          const rate = n(args.rate   || 12) / 100 / 12;
          const mo   = yrs * 12;
          const c    = rate > 0 ? amt * ((Math.pow(1+rate,mo)-1)/rate)*(1+rate) : amt*mo;
          const inv  = amt * mo;
          return `SIP ${INR(amt)}/mo × ${yrs} yrs @ ${args.rate||12}% CAGR
→ Corpus: ${INR(Math.round(c))}
→ Invested: ${INR(inv)} | Gain: ${INR(Math.round(c-inv))} | Multiplier: ${(c/inv).toFixed(1)}x`;
        }

        case 'calc_emi': {
          const P  = n(args.principal   || 0);
          const r  = n(args.annual_rate || 8.5) / 100 / 12;
          const nm = n(args.years       || 20) * 12;
          if (!P) return 'Principal amount required.';
          const e   = P * r * Math.pow(1+r,nm) / (Math.pow(1+r,nm)-1);
          const tot = Math.round(e * nm);
          return `Loan: ${INR(P)} @ ${args.annual_rate||8.5}% for ${args.years||20} yrs
→ EMI: ${INR(Math.round(e))}/month
→ Total paid: ${INR(tot)} | Interest cost: ${INR(tot-P)} (${((tot-P)/P*100).toFixed(0)}% of principal)`;
        }

        case 'calc_fire': {
          const inc   = n(get('finos_income','50000'));
          const exp   = n(args.monthly_expense || inc * 0.70);
          const corpus= exp * 12 * 25;
          const nw    = n(get('finos_net_worth','0'));
          const sip   = n(get('finos_sip_amount','0'));
          const gap   = Math.max(0, corpus - nw);
          const r     = 0.12 / 12;
          const mos   = gap > 0 && sip > 0 ? Math.ceil(Math.log(1+gap*r/sip)/Math.log(1+r)) : 0;
          const sipToRetire45 = (() => {
            const age = parseInt(get('finos_age','30'));
            const yrsLeft = Math.max(1, 45 - age);
            const moLeft  = yrsLeft * 12;
            return gap > 0 && r > 0 ? Math.ceil(gap*r/(Math.pow(1+r,moLeft)-1)/(1+r)) : 0;
          })();
          return `FIRE ANALYSIS (25x annual expenses rule):
Monthly expenses: ${INR(Math.round(exp))} → FIRE corpus needed: ${INR(Math.round(corpus))}
Current NW: ${INR(nw)} | Gap to FIRE: ${INR(gap)}
At current SIP (${INR(sip)}/mo): FIRE in ${Math.ceil(mos/12)} years
To retire at 45: Need ${INR(sipToRetire45)}/mo SIP`;
        }

        case 'calc_inflation': {
          const amt  = n(args.amount || 100000);
          const yrs  = n(args.years  || 10);
          const rate = n(args.rate   || 6.5) / 100;
          const real = Math.round(amt / Math.pow(1+rate, yrs));
          const need = Math.round(amt * Math.pow(1+rate, yrs));
          return `${INR(amt)} today in ${yrs} years (at ${args.rate||6.5}% inflation):
→ Real value: ${INR(real)} (loses ${INR(amt-real)})
→ To maintain buying power: Need to grow to ${INR(need)}
→ Required CAGR to beat inflation: ${(rate*100+3).toFixed(1)}%+ (FD barely keeps up)`;
        }

        case 'calc_debt_free': {
          const debt  = n(get('finos_total_debt','0'));
          const rate  = n(get('finos_debt_interest','12')) / 100 / 12;
          const min   = n(get('finos_min_payment','0')) || Math.round(debt * 0.02);
          const extra = n(args.extra_monthly || 2000);
          const pay   = min + extra;
          if (!debt) return 'No debt found in profile — great, you are debt-free!';
          if (pay <= 0) return 'Payment must be greater than 0.';
          const mos   = rate > 0 ? Math.ceil(-Math.log(1-debt*rate/pay)/Math.log(1+rate)) : Math.ceil(debt/pay);
          const int   = Math.round(pay*mos - debt);
          return `Debt: ${INR(debt)} @ ${get('finos_debt_interest','12')}% | Paying: ${INR(pay)}/mo
→ Debt-free in: ${mos} months (${Math.ceil(mos/12)} yrs ${mos%12} mo)
→ Total interest paid: ${INR(int)}
Tip: Increase extra payment to ${INR(extra*2)} → saves ${INR(Math.round(int*0.35))} in interest`;
        }

        /* ── ADVANCED INTELLIGENCE ─────────────────────────────────────── */
        case 'analyze_wealth': {
          const liquid  = n(get('finos_savings_balance','0')) + n(get('finos_emergency_fund','0')) + n(get('finos_fd_amount','0'));
          const growth  = n(get('finos_equity_value','0')) + n(get('finos_mf_value','0')) + n(get('finos_stocks_value','0'));
          const safety  = n(get('finos_ppf_balance','0')) + n(get('finos_epf_balance','0')) + n(get('finos_gold_value','0')) + n(get('finos_nps_balance','0'));
          const liab    = n(get('finos_total_debt','0'));
          const nw      = n(get('finos_net_worth','0')) || (liquid + growth + safety - liab);
          const total   = liquid + growth + safety;
          const p = v => total > 0 ? (v/total*100).toFixed(0) : 0;
          const age = parseInt(get('finos_age','30'));
          const idealEq = Math.max(40, Math.min(80, 100-age));
          const actEq   = total > 0 ? Math.round(growth/total*100) : 0;
          return `WEALTH X-RAY:
━━━━━━━━━━━━━━━━━━━━━━━━━━
Liquid Assets  (${p(liquid)}%): ${INR(liquid)}
  → Savings, emergency fund, FDs
Growth Assets  (${p(growth)}%): ${INR(growth)}
  → Equity MF, stocks, market-linked
Safety Assets  (${p(safety)}%): ${INR(safety)}
  → PPF, EPF, NPS, gold
━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Assets: ${INR(total)}
Liabilities:  ${INR(liab)}
NET WORTH:    ${INR(nw)}
━━━━━━━━━━━━━━━━━━━━━━━━━━
ALLOCATION CHECK (Age ${age}):
  Equity: ${actEq}% | Ideal: ${idealEq}% ${Math.abs(actEq-idealEq) > 10 ? '⚠️ Rebalance needed' : '✅'}
  Tip: Rule of thumb = equity% ≈ ${100-age}% for your age`;
        }

        case 'optimize_tax': {
          const inc    = n(args.annual_income || get('finos_income','0')) * (args.annual_income ? 1 : 12);
          const c80    = n(get('finos_investments_80c','0'));
          const hi     = n(get('finos_health_insurance','0'));
          const nps    = n(get('finos_nps_amount','0'));
          const hra    = n(get('finos_hra_received','0'));
          const taxable = Math.max(0, inc - 50000); // standard deduction
          let rate = taxable > 1500000 ? 0.30 : taxable > 1200000 ? 0.20 : taxable > 1000000 ? 0.15 : taxable > 700000 ? 0.10 : taxable > 300000 ? 0.05 : 0;
          const rem80c   = Math.max(0, 150000 - c80);
          const rem80d   = Math.max(0, 25000  - hi);
          const rem80ccd = Math.max(0, 50000  - nps);
          const totalRem = rem80c + rem80d + rem80ccd;
          const extraSave = Math.round(totalRem * rate);
          const priority = rem80c > 0 ? `Fill 80C first — ${INR(rem80c)} room → invest in ELSS or PPF` : rem80ccd > 0 ? `Add NPS 80CCD(1B) — ${INR(rem80ccd)} room → save ₹${Math.round(rem80ccd*rate).toLocaleString('en-IN')}` : '🎉 You are fully tax-optimized!';
          return `TAX OPTIMIZATION (FY 2025-26):
Annual income: ${INR(inc)} | Marginal rate: ${(rate*100).toFixed(0)}% | Std deduction: ₹50,000

DEDUCTIONS STATUS (Old Regime):
  80C  (ELSS/PPF/LIC): ${INR(c80)} used / ₹1.5L limit | Room: ${INR(rem80c)} → saves ${INR(Math.round(rem80c*rate))}
  80D  (Health insur): ${INR(hi)} used / ₹25K limit    | Room: ${INR(rem80d)} → saves ${INR(Math.round(rem80d*rate))}
  80CCD(1B) NPS extra: ${INR(nps)} used / ₹50K limit   | Room: ${INR(rem80ccd)} → saves ${INR(Math.round(rem80ccd*rate))}
${hra > 0 ? `  HRA exempt: ${INR(hra)} (check 10(13A) exemption)` : ''}

TOTAL ADDITIONAL TAX SAVINGS POSSIBLE: ${INR(extraSave)}
PRIORITY ACTION: ${priority}`;
        }

        case 'calc_insurance': {
          const inc    = n(get('finos_income','0')) * 12;
          const debt   = n(get('finos_total_debt','0'));
          const term   = n(get('finos_term_insurance','0'));
          const hcover = n(get('finos_health_insurance_cover','0'));
          const age    = parseInt(get('finos_age','30'));
          const deps   = parseInt(get('finos_dependents','1')) || 1;
          const lifeNeed = Math.round(inc * 12 + debt); // 12x income + all debts
          const termGap  = Math.max(0, lifeNeed - term);
          const hNeed    = deps > 2 ? 1500000 : 1000000;
          const hGap     = Math.max(0, hNeed - hcover);
          const premEst  = age < 35 ? Math.round(termGap * 0.00075) : Math.round(termGap * 0.0012);
          const termStatus = term === 0 ? '🚨 NO TERM POLICY — BUY IMMEDIATELY' : termGap > 0 ? `⚠️ Underinsured by ${INR(termGap)}` : '✅ Adequately covered';
          return `INSURANCE GAP ANALYSIS:
━━━━━━━━━━━━━━━━━━━━━━━━━━
TERM LIFE INSURANCE:
  Formula: 12× annual income (${INR(inc)}) + all debts (${INR(debt)})
  Needed:  ${INR(lifeNeed)}
  Current: ${INR(term)}
  Status:  ${termStatus}
  ${termGap > 0 ? `Buy additional: ${INR(termGap)} | Est. premium: ~${INR(premEst)}/year` : ''}

HEALTH INSURANCE:
  Needed: ${INR(hNeed)} (${deps > 2 ? 'family floater ₹15L' : 'family floater ₹10L'})
  Current: ${INR(hcover)}
  Status: ${hGap > 0 ? `⚠️ Top-up needed: ${INR(hGap)}` : '✅ Adequate'}
  Top-up plans cost ~₹5-8K/year for ₹10L extra cover

${term === 0 ? '🚨 NO TERM INSURANCE IS THE BIGGEST FINANCIAL RISK. Buy today — age 30 costs ~₹8-12K/year for ₹1Cr cover.' : ''}`;
        }

        case 'optimize_sip': {
          const sip  = n(args.total_sip || get('finos_sip_amount','5000'));
          const age  = parseInt(get('finos_age','30'));
          const dna  = get('finos_financial_dna','Explorer');
          let eqPct  = Math.max(40, Math.min(90, 100 - age));
          if (dna === 'Guardian') eqPct = Math.max(30, eqPct - 15);
          else if (dna === 'Explorer') eqPct = Math.min(90, eqPct + 10);
          const debtPct = 100 - eqPct;
          const lc  = Math.round(sip * eqPct/100 * 0.45);
          const mc  = Math.round(sip * eqPct/100 * 0.25);
          const sc  = Math.round(sip * eqPct/100 * 0.15);
          const intl= Math.round(sip * eqPct/100 * 0.10);
          const fc  = Math.round(sip * eqPct/100 * 0.05);
          const dbt = Math.round(sip * debtPct/100 * 0.65);
          const gld = Math.round(sip * debtPct/100 * 0.35);
          return `OPTIMAL SIP ALLOCATION — ${INR(sip)}/month:
Age ${age} | DNA: ${dna} | Profile: Equity ${eqPct}% / Debt+Gold ${debtPct}%

EQUITY (${INR(Math.round(sip*eqPct/100))} = ${eqPct}%):
  Large Cap Index   : ${INR(lc)}/mo → Nifty50 (UTI/Nippon/HDFC Index)
  Mid Cap Fund      : ${INR(mc)}/mo → HDFC Mid-Cap Opp / Kotak Mid-Cap
  Small Cap Fund    : ${INR(sc)}/mo → Quant Small Cap / Nippon Small Cap
  International ETF : ${INR(intl)}/mo → Motilal S&P500 / Mirae US
  Flexi Cap         : ${INR(fc)}/mo → Parag Parikh / PPFAS Flexi

DEBT + GOLD (${INR(Math.round(sip*debtPct/100))} = ${debtPct}%):
  Short Debt Fund   : ${INR(dbt)}/mo → HDFC/ICICI Short Duration
  Gold ETF/SGB      : ${INR(gld)}/mo → Nippon Gold ETF / SGB bonds

Step-up: Increase SIP by 10% every year → additional ${INR(Math.round(sip*0.10*12))} annually`;
        }

        case 'calc_rebalance': {
          const age    = parseInt(get('finos_age','30'));
          const equity = n(get('finos_equity_value','0')) + n(get('finos_mf_value','0')) + n(get('finos_stocks_value','0'));
          const debt   = n(get('finos_ppf_balance','0')) + n(get('finos_epf_balance','0')) + n(get('finos_fd_amount','0'));
          const gold   = n(get('finos_gold_value','0'));
          const total  = equity + debt + gold;
          if (!total) return 'No portfolio values found. Add equity, PPF, gold values to profile.';
          const cEq = Math.round(equity/total*100);
          const cDbt = Math.round(debt/total*100);
          const cGld = Math.round(gold/total*100);
          const tEq  = Math.max(30, Math.min(80, 100-age));
          const tDbt = Math.max(10, 90-tEq);
          const tGld = 10;
          const actions = [];
          if (cEq - tEq > 7) actions.push(`Reduce equity by ~${INR(Math.round((cEq-tEq)/100*total))} — book profits, move to debt or gold`);
          else if (tEq - cEq > 7) actions.push(`Increase equity by ~${INR(Math.round((tEq-cEq)/100*total))} — deploy in Nifty50 index or lump sum in equity MF`);
          if (cGld < 5) actions.push(`Gold under 5% — add ${INR(Math.round((tGld-cGld)/100*total))} via Gold ETF or SGBs`);
          if (!actions.length) actions.push('Portfolio is well-balanced. Review again in 6 months.');
          return `PORTFOLIO REBALANCE:
Total: ${INR(total)}
         Current → Target → Action needed
Equity:   ${cEq}%   →  ${tEq}%  ${Math.abs(cEq-tEq)>7?'⚠️ Rebalance':'✅'}
Debt:     ${cDbt}%   →  ${tDbt}%  ${Math.abs(cDbt-tDbt)>7?'⚠️ Rebalance':'✅'}
Gold:     ${cGld}%    →  ${tGld}%  ${cGld<5?'⚠️ Low':'✅'}

ACTIONS:
${actions.map(a=>'• '+a).join('\n')}`;
        }

        case 'detect_bias': {
          const inc   = n(get('finos_income','0'));
          const sip   = n(get('finos_sip_amount','0'));
          const em    = n(get('finos_emergency_fund','0'));
          const nw    = n(get('finos_net_worth','0'));
          const eq    = n(get('finos_equity_value','0')) + n(get('finos_mf_value','0'));
          const age   = parseInt(get('finos_age','30'));
          const score = n(get('finos_health_score','0'));
          const biases = [];
          if (age < 40 && eq / Math.max(nw,1) < 0.15) biases.push({ b:'Loss Aversion','sev':'HIGH', d:'Equity under 15% of NW at young age — fear of market losses keeps you underweight in the only inflation-beating asset class' });
          if (inc > 0 && sip < inc * 0.05) biases.push({ b:'Status Quo Bias','sev':'HIGH', d:'SIP is under 5% of income — behavioural inertia preventing optimal automation. Automate 20% immediately' });
          if (em > inc * 10) biases.push({ b:'Anchoring / Safety Bias','sev':'MED', d:'Emergency fund over 10x monthly income — excess cash drag. Park surplus in liquid MF or short-duration debt' });
          if (inc > 80000 && score < 50) biases.push({ b:'Overconfidence','sev':'MED', d:'High income but low health score — overconfidence that income = security. Optimize systematically' });
          if (inc > 0 && em < inc * 2) biases.push({ b:'Present Bias','sev':'HIGH', d:'Emergency fund under 2 months — over-weighting today\'s spending vs future security' });
          if (!biases.length) return '✅ BEHAVIORAL SCAN: No significant biases detected. Financial behaviors look disciplined and rational.';
          return `BEHAVIORAL BIAS SCAN — ${biases.length} bias(es) found:
${biases.map(b=>`⚠️ ${b.b} [${b.sev}]\n   ${b.d}`).join('\n\n')}

Cognitive biases cost Indian investors avg ₹2-5L in returns annually. Automate every rupee to override them.`;
        }

        case 'create_budget': {
          const income = n(get('finos_income','0'));
          const sip    = n(get('finos_sip_amount','0'));
          const style  = (args.style || '50-30-20').toLowerCase();
          if (!income) return 'Monthly income not set in profile.';
          const [ns, ws, ss] = style === 'aggressive-saver' ? [40,20,40] : style === '60-20-20' ? [60,20,20] : [50,30,20];
          const NA = Math.round(income*ns/100), WA = Math.round(income*ws/100), SA = Math.round(income*ss/100);
          const sipGap = Math.max(0, SA - sip);
          return `${style.toUpperCase()} BUDGET — ${INR(income)}/month:
━━━━━━━━━━━━━━━━━━━━━━━━━━
NEEDS (${ns}% = ${INR(NA)}):
  Rent/Housing: ${INR(Math.round(NA*0.50))} | Food: ${INR(Math.round(NA*0.18))}
  Transport: ${INR(Math.round(NA*0.15))} | Bills/Utilities: ${INR(Math.round(NA*0.17))}

WANTS (${ws}% = ${INR(WA)}):
  Dining/Entertainment: ${INR(Math.round(WA*0.40))}
  Shopping/Lifestyle: ${INR(Math.round(WA*0.35))}
  Travel/Leisure: ${INR(Math.round(WA*0.15))} | Subscriptions: ${INR(Math.round(WA*0.10))}

SAVINGS+INVEST (${ss}% = ${INR(SA)}):
  Current SIP: ${INR(sip)} ${sip>=SA?'✅ On target':'⚠️ Need to add '+INR(sipGap)+'/mo'}
  Emergency buffer: ${INR(Math.round(SA*0.15))}
  Debt prepayment: ${INR(Math.round(SA*0.20))}`;
        }

        case 'calc_goal_gap': {
          const goals = getJ('finos_goals', []);
          if (!goals.length) return 'No goals found. Add goals in profile.';
          return goals.map(g => {
            const gap    = Math.max(0, (g.target||0) - (g.saved||0));
            const months = Math.max(1, g.months || 120);
            const r      = 0.12/12;
            const sip    = gap > 0 ? Math.ceil(gap*r/(Math.pow(1+r,months)-1)/(1+r)) : 0;
            const pct    = g.target > 0 ? Math.round(g.saved/g.target*100) : 0;
            const flag   = pct>=100?'✅':months<6&&pct<80?'🚨':pct<35?'⚠️':'🟡';
            return `${flag} ${g.name}: ${pct}% done
   Saved: ${INR(g.saved||0)} | Target: ${INR(g.target||0)} | Gap: ${INR(gap)}
   Months left: ${months} | Monthly SIP needed: ${INR(sip)}`;
          }).join('\n\n');
        }

        case 'calc_nps': {
          const contrib  = Math.min(n(args.contribution || 50000), 50000);
          const inc      = n(get('finos_income','0')) * 12;
          const age      = parseInt(get('finos_age','30'));
          const rate     = inc > 1500000 ? 0.30 : inc > 1000000 ? 0.20 : inc > 700000 ? 0.10 : 0.05;
          const taxSaved = Math.round(contrib * rate);
          const yrs      = Math.max(1, 60 - age);
          const rMo      = 0.10/12;
          const mo       = yrs*12;
          const mnthly   = contrib/12;
          const corpus   = mnthly * (Math.pow(1+rMo,mo)-1)/rMo*(1+rMo);
          return `NPS 80CCD(1B) ANALYSIS:
Annual contribution: ${INR(contrib)} (max ₹50,000 for this deduction)
Marginal tax rate: ${(rate*100).toFixed(0)}%
Annual tax saving: ${INR(taxSaved)} (instant ${(rate*100).toFixed(0)}% return!)

RETIREMENT CORPUS (${yrs} years at 10% NPS return):
Monthly NPS: ${INR(Math.round(mnthly))}/mo → Corpus at 60: ${INR(Math.round(corpus))}
60% lump sum: ${INR(Math.round(corpus*0.60))} (tax-free)
40% annuity: ~${INR(Math.round(corpus*0.40/12/15))}/month pension

${rate >= 0.20 ? '⭐ HIGHLY RECOMMENDED for your tax bracket — effectively a risk-free 20-30% return.' : 'Good option if you are close to 30% bracket.'}`;
        }

        case 'assess_risk': {
          const age   = parseInt(get('finos_age','30'));
          const inc   = n(get('finos_income','0'));
          const nw    = n(get('finos_net_worth','0'));
          const em    = n(get('finos_emergency_fund','0'));
          const debt  = n(get('finos_total_debt','0'));
          const dna   = get('finos_financial_dna','Explorer');
          let score   = 50;
          if (age < 28) score += 22; else if (age < 35) score += 14; else if (age < 45) score += 5; else score -= 15;
          if (inc > 150000) score += 12; else if (inc > 60000) score += 5; else if (inc < 25000) score -= 10;
          if (em >= inc*6) score += 12; else if (em >= inc*3) score += 5; else score -= 10;
          if (debt === 0) score += 10; else if (inc > 0 && debt > inc*18) score -= 18;
          if (dna === 'Guardian') score -= 15; else if (dna === 'Explorer') score += 10; else if (dna === 'Achiever') score += 6;
          score = Math.max(10, Math.min(90, score));
          const [profile, alloc, style] = score < 30
            ? ['Conservative', 'Equity 30% | Debt 55% | Gold 15%', 'Focus on capital preservation. FD, PPF, liquid funds, balanced hybrid.']
            : score < 52
            ? ['Moderate', 'Equity 55% | Debt 35% | Gold 10%', 'Balanced growth. Nifty50 index + mid-cap + hybrid + PPF.']
            : score < 70
            ? ['Moderately Aggressive', 'Equity 72% | Debt 18% | Gold 10%', 'Growth-first. Large+mid+flexi-cap SIP + international diversification.']
            : ['Aggressive', 'Equity 85% | Debt 5% | Gold 10%', 'Maximum growth. Small+mid+flexi heavy, international, minimal debt allocation.'];
          return `RISK PROFILE: ${profile} (Score: ${score}/90)
Recommended Allocation: ${alloc}
Investment Style: ${style}

KEY FACTORS:
  Age ${age}: ${age<35?'Long horizon — exploit compounding aggressively':'Gradually shift toward safety'}
  Emergency: ${inc>0?(em/inc).toFixed(1):0} months ${em>=inc*4?'✅':'⚠️ Build first before investing aggressively'}
  Debt: ${debt>0?`Has ₹${debt.toLocaleString('en-IN')} — prioritize clearing high-interest debt`:'Debt-free ✅'}
  DNA: ${dna}`;
        }

        case 'calc_advance_tax': {
          const annInc = n(args.annual_income || get('finos_income','0')) * (args.annual_income ? 1 : 12);
          const taxable = Math.max(0, annInc - 50000 - 150000); // std + 80C estimate
          let tax = 0;
          if (taxable > 1000000)      tax = 112500 + (taxable-1000000)*0.30;
          else if (taxable > 500000)  tax = 12500  + (taxable-500000)*0.20;
          else if (taxable > 250000)  tax = (taxable-250000)*0.05;
          tax = Math.round(tax * 1.04); // 4% cess
          const q = [0.15, 0.30, 0.30, 0.25].map(r => Math.round(tax*r));
          return `ADVANCE TAX — FY 2025-26:
Estimated taxable income: ${INR(taxable)} | Tax + cess: ${INR(tax)}

INSTALLMENT SCHEDULE:
  15 June 2025:  ${INR(q[0])} (15%)
  15 Sept 2025:  ${INR(q[1])} (30%)
  15 Dec 2025:   ${INR(q[2])} (30%)
  15 March 2026: ${INR(q[3])} (25% — final)

${tax < 10000 ? '✅ Tax < ₹10,000 — advance tax not mandatory.' : '⚠️ Pay on or before each date to avoid Section 234B/C interest (1%/month).'}
File via: incometax.gov.in → e-Pay Tax → Advance Tax`;
        }

        case 'compare_funds': {
          const amt = n(args.amount || 100000);
          const yrs = n(args.years  || 10);
          const KEY = {
            'ELSS':    {rate:0.14,tax:true, lock:3,   risk:'High',  type:'equity'},
            'PPF':     {rate:0.071,tax:true, lock:15,  risk:'Nil',   type:'debt'},
            'FD':      {rate:0.070,tax:false,lock:1,   risk:'Nil',   type:'debt'},
            'SIP':     {rate:0.12, tax:false,lock:0,   risk:'Med',   type:'equity'},
            'NPS':     {rate:0.10, tax:true, lock:'60',risk:'Low',   type:'hybrid'},
            'GOLD':    {rate:0.085,tax:false,lock:0,   risk:'Med',   type:'commodity'},
            'RD':      {rate:0.065,tax:false,lock:1,   risk:'Nil',   type:'debt'},
            'SSY':     {rate:0.082,tax:true, lock:21,  risk:'Nil',   type:'debt'},
            'SUKANYA': {rate:0.082,tax:true, lock:21,  risk:'Nil',   type:'debt'},
            'NIFTY50': {rate:0.13, tax:false,lock:0,   risk:'Med',   type:'equity'},
            'REALTY':  {rate:0.07, tax:false,lock:5,   risk:'Med',   type:'real-estate'},
          };
          const k1 = (args.option1||'ELSS').toUpperCase();
          const k2 = (args.option2||'PPF').toUpperCase();
          const d1 = KEY[k1] || {rate:0.12,tax:false,lock:0,risk:'Med',type:'equity'};
          const d2 = KEY[k2] || {rate:0.071,tax:true,lock:15,risk:'Nil',type:'debt'};
          const mnth = amt/12;
          const calc = (r) => { const rm=r/12; return rm>0 ? mnth*(Math.pow(1+rm,yrs*12)-1)/rm*(1+rm) : mnth*yrs*12; };
          const c1 = Math.round(calc(d1.rate)), c2 = Math.round(calc(d2.rate));
          const win = c1>c2 ? k1 : k2;
          return `COMPARISON: ${k1} vs ${k2} | ${INR(amt)}/yr for ${yrs} yrs

${k1}: ${(d1.rate*100).toFixed(1)}% return | Lock-in: ${d1.lock}yr | Risk: ${d1.risk} | 80C: ${d1.tax?'Yes':'No'}
  → Corpus: ${INR(c1)}

${k2}: ${(d2.rate*100).toFixed(1)}% return | Lock-in: ${d2.lock}yr | Risk: ${d2.risk} | 80C: ${d2.tax?'Yes':'No'}
  → Corpus: ${INR(c2)}

WINNER: ${win} by ${INR(Math.abs(c1-c2))} over ${yrs} years
${d1.tax&&d2.tax?'Both qualify 80C — choose based on liquidity and risk tolerance.':d1.rate>d2.rate?`${k1} gives higher returns but with higher risk.`:`${k2} is safer but ${k1} compounds significantly faster.`}`;
        }

        case 'calc_rent_vs_buy': {
          const prop  = n(args.property_value || 5000000);
          const rent  = n(args.monthly_rent   || 20000);
          const city  = (args.city || get('finos_city','Mumbai')).toLowerCase();
          const down  = Math.round(prop*0.20);
          const loan  = prop*0.80;
          const r     = 0.085/12;
          const nm    = 240;
          const emi   = Math.round(loan*r*Math.pow(1+r,nm)/(Math.pow(1+r,nm)-1));
          const appR  = city.includes('mumbai')||city.includes('delhi')||city.includes('bangalore')?0.07:0.055;
          const p20   = Math.round(prop*Math.pow(1+appR,20));
          const buyOut = emi*nm + down;
          const monthSurp = Math.max(0, emi - rent);
          const r12   = 0.12/12;
          const altC  = Math.round(down*Math.pow(1.12,20) + monthSurp*(Math.pow(1+r12,240)-1)/r12*(1+r12));
          const buyNet = p20 - buyOut;
          const rentNet = altC - rent*240;
          return `RENT vs BUY — ${city} | Property: ${INR(prop)}
━━━━━━━━━━━━━━━━━━━━━━━━━━
BUY OPTION:
  Down payment: ${INR(down)} | Loan: ${INR(loan)} @ 8.5%
  EMI: ${INR(emi)}/mo for 20 yrs | Total outflow: ${INR(buyOut)}
  Property in 20 yrs (${(appR*100).toFixed(0)}% pa): ${INR(p20)}
  Net equity gain: ${INR(buyNet)}

RENT + INVEST OPTION:
  Monthly rent: ${INR(rent)} | Invest ${INR(down)} lump sum + ${INR(monthSurp)} surplus
  Investment corpus (20 yrs @ 12%): ${INR(altC)}
  Total rent paid: ${INR(rent*240)} | Net gain: ${INR(rentNet)}

VERDICT: ${buyNet > rentNet ? `Buying wins by ${INR(buyNet-rentNet)} in ${city} — strong appreciation market.` : `Rent+invest wins by ${INR(rentNet-buyNet)} — market returns beat property here.`}
Note: Excludes maintenance, stamp duty, society charges (~3-4% hidden costs of buying).`;
        }

        /* ── MEMORY ──────────────────────────────────────────────────────── */
        case 'remember': {
          const tags = (args.tags||'').split(',').map(t=>t.trim()).filter(Boolean);
          const id   = await AryaMemoryDB.store(args.content||'', tags, args.type||'fact');
          return `Stored in persistent memory (id:${id}): "${(args.content||'').slice(0,60)}"`;
        }

        /* ── LIVE MARKET TOOLS (arya-ai backend: port 7475) ─────────────── */
        case 'live_quote': {
          const sym = (args.symbol || 'NIFTY 50').toUpperCase();
          const exc = (args.exchange || 'NSE').toUpperCase();
          const d   = await aryaAPI('get_quote', { symbol: sym, exchange: exc });
          if (d.error) return `Could not fetch quote for ${sym}: ${d.error}`;
          const chg = (d.change_pct || 0).toFixed(2);
          const dir = d.change_pct >= 0 ? '▲' : '▼';
          return `${sym} (${exc}): ₹${d.price?.toFixed(2) || 'N/A'} ${dir}${Math.abs(chg)}%
Open: ₹${d.open?.toFixed(2) || '—'} | High: ₹${d.high?.toFixed(2) || '—'} | Low: ₹${d.low?.toFixed(2) || '—'}
Prev Close: ₹${d.prev_close?.toFixed(2) || '—'} | Volume: ${(d.volume||0).toLocaleString('en-IN')}
52W High: ₹${d.week52_high?.toFixed(2) || '—'} | 52W Low: ₹${d.week52_low?.toFixed(2) || '—'}
Market Cap: ${d.market_cap ? INR(d.market_cap) : '—'}`;
        }

        case 'live_market': {
          const d = await aryaAPI('get_market', {});
          if (d.error) return `Market overview unavailable: ${d.error}`;
          const indices = d.indices || {};
          const lines   = Object.entries(indices).map(([name, idx]) => {
            const chg  = (idx.change_pct || 0).toFixed(2);
            const dir  = idx.change_pct >= 0 ? '▲' : '▼';
            return `• ${name}: ${idx.price?.toLocaleString('en-IN') || '—'} ${dir}${Math.abs(chg)}%`;
          });
          return lines.length ? `Indian Market Indices:\n${lines.join('\n')}` : 'Index data unavailable — market may be closed.';
        }

        case 'live_commodities': {
          const d = await aryaAPI('get_commodities', {});
          if (d.error) return `Commodity data unavailable: ${d.error}`;
          const fx   = await aryaAPI('get_fx', {});
          const comm = d.commodities || {};
          const lines = Object.entries(comm).map(([name, c]) => {
            const chg = (c.change_pct || 0).toFixed(2);
            const dir = c.change_pct >= 0 ? '▲' : '▼';
            return `• ${name}: ${c.price?.toLocaleString('en-IN') || '—'} ${c.unit || ''} ${dir}${Math.abs(chg)}%`;
          });
          const fxLines = Object.entries(fx).filter(([k]) => k !== 'error').map(
            ([pair, rate]) => `• ${pair.replace('_','/')}: ${rate}`
          );
          return `Commodities:\n${lines.join('\n')}\n\nForex (RBI reference):\n${fxLines.join('\n')}`;
        }

        case 'live_crypto': {
          const coins = (args.coins || 'bitcoin,ethereum,ripple').split(',').map(c => c.trim());
          const d     = await aryaAPI('get_crypto', { coins });
          if (d.error) return `Crypto data unavailable: ${d.error}`;
          const crypto = d.crypto || {};
          const lines  = Object.entries(crypto).map(([id, c]) => {
            const chg = (c.change_24h || 0).toFixed(2);
            const dir = c.change_24h >= 0 ? '▲' : '▼';
            return `• ${c.name}: ₹${c.price_inr?.toLocaleString('en-IN') || '—'} ($${c.price_usd || '—'}) ${dir}${Math.abs(chg)}% 24h`;
          });
          return lines.length ? `Crypto Prices (INR):\n${lines.join('\n')}` : 'Crypto data unavailable.';
        }

        case 'live_news': {
          const limit = args.limit || 8;
          const d     = await aryaAPI('get_news', { limit });
          if (d.error) return `News unavailable: ${d.error}`;
          const articles = d.articles || [];
          const sent     = d.sentiment || {};
          if (!articles.length) return 'No fresh news found. RSS feeds may be slow.';
          const header = `Market Sentiment: ${(sent.label||'neutral').toUpperCase()} (score: ${sent.score || 0}, 🟢${sent.bullish||0} 🔴${sent.bearish||0} ⚪${sent.neutral||0})\n\n`;
          const lines  = articles.slice(0, limit).map((a, i) =>
            `${i+1}. [${(a.sentiment||'neutral').toUpperCase()}] ${a.title}\n   Source: ${a.source} | Tags: ${(a.tags||[]).join(', ') || '—'}`
          );
          return header + lines.join('\n\n');
        }

        case 'search_web': {
          const query = args.query || '';
          if (!query) return 'Please provide a search query.';
          const d = await aryaAPI('search_web', { query, max: args.max || 5 });
          if (d.error) return `Search failed: ${d.error}`;
          const results = d.results || [];
          if (!results.length) return `No results found for: "${query}"`;
          return `Web search results for "${query}":\n` +
            results.map((r, i) => `${i+1}. ${r.title}\n   ${r.url}\n   ${r.snippet || ''}`).join('\n\n');
        }

        case 'read_url': {
          const url = args.url || '';
          if (!url) return 'Please provide a URL.';
          const d = await aryaAPI('read_url', { url, max_chars: args.max_chars || 2500 });
          if (d.error) return `Could not read URL: ${d.error}`;
          return `Content from ${url}:\n\n${d.content || 'No content extracted.'}`;
        }

        case 'analyze_stock': {
          const sym = (args.symbol || '').toUpperCase();
          const exc = (args.exchange || 'NSE').toUpperCase();
          if (!sym) return 'Please provide a stock symbol.';
          const d = await aryaAPI('analyze_stock', { symbol: sym, exchange: exc });
          if (d.error) return `Technical analysis failed for ${sym}: ${d.error}`;
          const signals = d.signals || {};
          const sigLines = Object.entries(signals).map(([ind, s]) =>
            `• ${ind}: ${s.signal || JSON.stringify(s)}`
          );
          return `Technical Analysis — ${sym} (${exc}):
Verdict: ${d.verdict || '—'} | Bullish Score: ${d.score || 0}/100

${sigLines.join('\n')}`;
        }

        default:
          return `Unknown tool: "${name}". Available tools: ${AgentTools.schema.map(t=>t.name).join(', ')}`;
      }
    },

    schemaPrompt() {
      return 'AVAILABLE TOOLS (33 tools — call ONE at a time with exact JSON format):\n' +
        this.schema.map(t => {
          const argsStr = Object.keys(t.args).length
            ? '(' + Object.entries(t.args).map(([k,v])=>`${k}: "${v}"`).join(', ') + ')'
            : '()';
          return `  ${t.name}${argsStr}\n     → ${t.desc}`;
        }).join('\n');
    }
  };

  /* ── LAYER 3: ReAct Agent Runner v6.0 ───────────────────────────────────── */
  const AryaRunHistory = (() => {
    const KEY = 'arya_run_history_v2';
    function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
    function save(runs) { try { localStorage.setItem(KEY, JSON.stringify(runs.slice(-20))); } catch {} }
    return {
      push(goal, answer, steps, toolsUsed) {
        const runs = load();
        runs.push({ id: Date.now(), ts: new Date().toLocaleString('en-IN'), goal: goal.slice(0,100), answer: answer.slice(0,400), steps, toolsUsed });
        save(runs);
      },
      getAll()  { return load().reverse(); },
      clear()   { localStorage.removeItem(KEY); },
    };
  })();

  const AryaAgentRunner = (() => {
    let _running = false;

    function buildAgentSystem() {
      const ctx     = buildUserContext(getPageKey());
      const persona = ADVISOR_PERSONAS[_currentPersona];
      return `${BASE_SYSTEM}

${persona ? '════ ACTIVE ADVISOR MODE: ' + persona.name + ' — ' + persona.prompt + ' ════' : ''}

════════════════════════════════════════════════════════════
YOU ARE ARYA AGENT — INDIA'S SMARTEST LOCAL FINANCIAL AI
Operating 100% offline. Zero cloud. Zero Claude. Pure local intelligence.
You have access to 25 specialized Indian finance tools.
════════════════════════════════════════════════════════════

EXECUTION PROTOCOL (ReAct: Reason → Act → Observe → Repeat):

STEP 1 — ANALYZE the user's goal. What data do you need?
STEP 2 — USE TOOLS to get real data. Never assume ₹ numbers.
STEP 3 — REASON over tool results. Chain insights together.
STEP 4 — GIVE COMPLETE ANSWER with specific ₹ amounts and action steps.

═══ TOOL CALL FORMAT (mandatory — use EXACTLY this format):
TOOL_CALL: {"tool":"tool_name","args":{"key":"value"}}

═══ FINAL ANSWER FORMAT (when done):
FINAL_ANSWER: [complete answer here]

═══ CRITICAL RULES:
• Call get_profile FIRST for any personal finance question
• NEVER invent ₹ numbers — use tool results only
• For any stock/market question → use live_quote, live_market, or analyze_stock (REAL data, not guesses)
• For news/current events → use live_news or search_web (NEVER hallucinate current events)
• For unknown company info → use search_web or read_url to look it up
• Keep tool calls efficient — max 3-4 per goal
• In FINAL_ANSWER: use bullet points, ₹ amounts from tools, and ALWAYS end with 3 specific actions
• Be brutally honest — tell the user what they're doing wrong
• Personalize EVERYTHING to their age, income, DNA, city, health score
• LIVE TOOLS NOTE: live_quote/live_market/live_news/search_web/analyze_stock require the arya-ai backend (port 7475). If they return an error, fall back to general advice but say data is unavailable.

${AgentTools.schemaPrompt()}

USER CONTEXT:
${ctx}`;
    }

    async function callOllamaAgent(system, prompt) {
      const endpoint = await _findEndpoint();
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 90000);
      let full   = '';
      try {
        const res = await fetch(endpoint, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model:   OLLAMA_MODEL,
            prompt,
            system,
            stream:  true,
            think:   false,
            options: { num_ctx: 6144, num_predict: 600, temperature: 0.35, top_p: 0.92, repeat_penalty: 1.1 }
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec    = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of dec.decode(value, { stream: true }).split('\n')) {
            if (!line.trim()) continue;
            try { const j = JSON.parse(line); if (j.response) full += j.response; } catch {}
          }
        }
      } finally { clearTimeout(tid); }
      return stripThinking(full).trim();
    }

    function parseToolCall(raw) {
      // Try strict match first
      const m = raw.match(/TOOL_CALL:\s*(\{[\s\S]*?\})/);
      if (!m) return null;
      try { return JSON.parse(m[1]); } catch {}
      // Try to repair common JSON issues (unquoted keys, trailing commas)
      try {
        const repaired = m[1]
          .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')  // quote keys
          .replace(/,\s*([}\]])/g, '$1');               // remove trailing commas
        return JSON.parse(repaired);
      } catch {}
      return null;
    }

    async function run(goal, onStep) {
      if (_running) return;
      _running = true;
      const sys      = buildAgentSystem();
      let   history  = `User goal: "${goal}"\n\nBegin by reasoning about what data you need, then call the first tool.`;
      let   steps    = 0;
      const MAX      = 8;
      const toolsUsed = [];
      let   lastAnswer = '';

      onStep({ type: 'start', goal });

      try { await _findEndpoint(); }
      catch {
        onStep({ type: 'error', msg: 'Ollama is offline. Run: ollama serve — then try again.' });
        _running = false; return;
      }

      while (steps < MAX) {
        steps++;
        onStep({ type: 'thinking', step: steps });

        let raw;
        try { raw = await callOllamaAgent(sys, history); }
        catch (e) {
          onStep({ type: 'error', msg: `Step ${steps} failed: ${e.message}` });
          _running = false; return;
        }

        if (!raw.trim()) { onStep({ type: 'error', msg: 'Empty response from Ollama — model may still be loading.' }); break; }

        // Show any reasoning/thinking text before tool call or final answer
        const reasoningMatch = raw.match(/^([\s\S]*?)(?:TOOL_CALL:|FINAL_ANSWER:)/);
        if (reasoningMatch && reasoningMatch[1].trim().length > 20) {
          onStep({ type: 'reasoning', step: steps, text: reasoningMatch[1].trim().slice(0, 200) });
        }

        // Detect TOOL_CALL
        const call = parseToolCall(raw);
        if (call && call.tool) {
          onStep({ type: 'tool_call', step: steps, tool: call.tool, args: call.args || {} });
          const result = await AgentTools.execute(call.tool, call.args || {}).catch(e => `Tool error: ${e.message}`);
          toolsUsed.push(call.tool);
          onStep({ type: 'tool_result', step: steps, tool: call.tool, result });
          history += `\n\nArya step ${steps}:\n${raw}\n\n[${call.tool} result]:\n${result}\n\nContinue reasoning (use FINAL_ANSWER when ready):`;
          continue;
        }

        // Detect FINAL_ANSWER
        const faMatch = raw.match(/FINAL_ANSWER:\s*([\s\S]+)/);
        lastAnswer = faMatch ? faMatch[1].trim() : raw.trim();
        onStep({ type: 'done', answer: lastAnswer, steps, toolsUsed });

        // Persist run to history
        AryaRunHistory.push(goal, lastAnswer, steps, toolsUsed);

        // Auto-save to persistent memory
        AryaMemoryDB.store(
          `[Agent] "${goal.slice(0,70)}" → ${lastAnswer.slice(0,100)}`,
          ['agent', 'completed'], 'event'
        ).catch(() => {});
        break;
      }

      if (steps >= MAX && !lastAnswer) {
        onStep({ type: 'done', answer: `I used ${MAX} steps but couldn't fully complete this. Here's what I found:\n${history.slice(-400)}`, steps, toolsUsed });
      }
      _running = false;
    }

    return { run, get running() { return _running; } };
  })();

  /* ── LAYER 4: Agent Tab UI ────────────────────────────────────────────────── */
  function buildAgentView() {
    return `
    <div id="agt-wrap">
      <!-- Persona Switcher -->
      <div id="agt-persona-bar" style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.07)">
        <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.3);letter-spacing:.5px;width:100%;margin-bottom:4px">AI ADVISOR MODE</div>
        ${Object.entries(ADVISOR_PERSONAS).map(([key, p]) => `
          <button class="agt-persona-btn" data-persona="${key}"
            style="flex:1;padding:6px 4px;border-radius:7px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);cursor:pointer;font-size:10px;color:rgba(255,255,255,.6);transition:all .15s;min-width:0">
            <div style="font-size:16px;margin-bottom:2px">${p.icon}</div>
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
          </button>`).join('')}
      </div>

      <div class="agt-intro">
        <div class="agt-intro-title">🧩 Arya Agent</div>
        <div class="agt-intro-sub">Give Arya a complex goal — she'll plan, use her financial tools, and give you a complete answer. 100% local. Zero cloud.</div>
      </div>

      <div class="agt-input-area">
        <div style="position:relative">
          <textarea id="agt-goal" class="agt-goal-input" rows="2"
            placeholder="e.g. Build my complete tax saving plan · Should I prepay home loan or invest? · Analyse my debt and suggest fastest payoff · Am I on track to retire at 50?"></textarea>
          <button id="agt-voice-btn" title="Voice input — speak your goal" style="position:absolute;bottom:7px;right:8px;background:rgba(185,125,255,.15);border:1px solid rgba(185,125,255,.3);border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px;line-height:1">🎙️</button>
        </div>
        <div style="display:flex;gap:6px">
          <button id="agt-run" class="agt-run-btn" style="flex:1">▶ Run Agent</button>
          <button id="agt-quick-fire" title="Quick FIRE check" style="padding:8px 10px;background:rgba(255,107,53,.1);border:1px solid rgba(255,107,53,.25);border-radius:8px;color:#ff6b35;font-size:11px;font-weight:700;cursor:pointer">🔥 FIRE</button>
          <button id="agt-quick-tax"  title="Quick tax check"  style="padding:8px 10px;background:rgba(77,255,180,.08);border:1px solid rgba(77,255,180,.2);border-radius:8px;color:#4dffb4;font-size:11px;font-weight:700;cursor:pointer">🧾 Tax</button>
        </div>
      </div>

      <div id="agt-steps" style="display:none">
        <div class="agt-steps-hd">Agent Steps</div>
        <div id="agt-steps-list"></div>
      </div>

      <div id="agt-final" style="display:none">
        <div class="agt-final-hd">✅ Arya's Answer</div>
        <div id="agt-final-text" class="agt-final-text"></div>
        <div class="agt-final-ft">
          <button id="agt-save-mem" class="agt-mem-btn">💾 Save to Memory</button>
          <button id="agt-to-chat" class="agt-chat-btn">💬 Continue in Chat</button>
          <button id="agt-report-btn" class="agt-chat-btn" style="background:rgba(185,125,255,.12);border-color:rgba(185,125,255,.3);color:#b97dff">📄 Full Report</button>
        </div>
      </div>

      <div id="agt-memory-section">
        <div class="agt-mem-hd">
          <span>🧠 Memory <span id="agt-mem-count" class="agt-mem-badge">0</span></span>
          <div style="display:flex;gap:6px">
            <button id="agt-report-hdr-btn" title="Generate financial report" style="background:rgba(185,125,255,.1);border:1px solid rgba(185,125,255,.2);border-radius:6px;padding:3px 8px;color:#b97dff;font-size:10px;font-weight:700;cursor:pointer">📄 Report</button>
            <button id="agt-add-mem-btn" class="agt-mem-add-btn" title="Add a fact">＋ Add fact</button>
          </div>
        </div>
        <div id="agt-mem-add-row" style="display:none">
          <input id="agt-mem-input" class="agt-mem-input" type="text" placeholder="e.g. I prefer index funds over active funds…" maxlength="200">
          <button id="agt-mem-save-btn" class="agt-mem-save">Save</button>
        </div>
        <div id="agt-mem-list" class="agt-mem-list"></div>
      </div>

      <!-- Run History -->
      <div id="agt-run-history" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div class="agt-section-label">📜 AGENT RUN HISTORY</div>
          <button id="agt-history-clear" style="background:none;border:none;color:rgba(255,80,80,.4);font-size:9.5px;cursor:pointer">Clear</button>
        </div>
        <div id="agt-history-list" style="display:flex;flex-direction:column;gap:5px">
          <div style="font-size:10px;color:rgba(255,255,255,.2);text-align:center;padding:6px">Run a goal to see history here</div>
        </div>
      </div>

      ${buildLifeEventsSection()}
      ${buildDebateSection()}
    </div>`;
  }

  function wireAgentView() {
    const runBtn  = document.getElementById('agt-run');
    const goalEl  = document.getElementById('agt-goal');
    const stepsEl = document.getElementById('agt-steps');
    const listEl  = document.getElementById('agt-steps-list');
    const finalEl = document.getElementById('agt-final');
    const finalTx = document.getElementById('agt-final-text');

    function appendStep(html) {
      const d = document.createElement('div');
      d.className = 'agt-step-item';
      d.innerHTML = html;
      listEl.appendChild(d);
      d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return d;
    }

    let _lastGoal = '';
    let _lastAnswer = '';

    runBtn?.addEventListener('click', async () => {
      const goal = goalEl?.value?.trim();
      if (!goal) return;
      _lastGoal = goal;
      _lastAnswer = '';

      // Reset UI
      listEl.innerHTML = '';
      stepsEl.style.display = 'block';
      finalEl.style.display  = 'none';
      runBtn.disabled = true;
      runBtn.textContent = '⏳ Running…';

      await AryaAgentRunner.run(goal, (evt) => {
        switch (evt.type) {
          case 'start':
            appendStep(`<div class="agt-step-goal">🎯 Goal: <em>${goal}</em></div>`);
            break;
          case 'thinking': {
            const thinkEl = appendStep(`<div class="agt-step-think" id="agt-think-${evt.step}"><span class="asp-thinking" style="display:inline-flex;gap:4px"><span></span><span></span><span></span></span> Step ${evt.step} — reasoning…</div>`);
            break;
          }
          case 'reasoning': {
            // Show condensed reasoning before tool call
            const prev = document.getElementById(`agt-think-${evt.step}`);
            if (prev) prev.innerHTML = `<span style="font-size:9.5px;color:rgba(255,255,255,.3);font-style:italic;line-height:1.4">💭 ${evt.text.slice(0,160)}…</span>`;
            break;
          }
          case 'tool_call': {
            const argsStr = Object.entries(evt.args||{}).map(([k,v]) => `<span style="color:rgba(185,125,255,.8)">${k}</span>=<span style="color:#ffd93d">${String(v).slice(0,30)}</span>`).join(' ');
            appendStep(`<div class="agt-step-tool">🔧 <b style="color:#b97dff">${evt.tool}</b>(${argsStr})</div>`);
            break;
          }
          case 'tool_result':
            appendStep(`<div class="agt-step-result"><pre class="agt-result-pre">${evt.result.slice(0,600)}${evt.result.length>600?'\n…(truncated)':''}</pre></div>`);
            break;
          case 'error':
            appendStep(`<div class="agt-step-error">❌ ${evt.msg}</div>`);
            runBtn.disabled = false;
            runBtn.textContent = '▶ Run Agent';
            _running = false;
            break;
          case 'done':
            _lastAnswer = evt.answer;
            listEl.querySelector('.agt-step-think:last-child')?.remove();
            const toolsStr = evt.toolsUsed?.length ? ` · Used: ${evt.toolsUsed.join(', ')}` : '';
            appendStep(`<div class="agt-step-done">✅ Done in ${evt.steps} step${evt.steps>1?'s':''}${toolsStr}</div>`);
            finalEl.style.display = 'block';
            finalTx.innerHTML = richText(evt.answer);
            runBtn.disabled = false;
            runBtn.textContent = '▶ Run Again';
            finalEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            refreshMemory();
            refreshHistory();
            break;
        }
      });
    });

    // Save answer to memory
    document.getElementById('agt-save-mem')?.addEventListener('click', async () => {
      if (!_lastAnswer) return;
      const snippet = `Goal "${_lastGoal.slice(0,50)}": ${_lastAnswer.slice(0,140)}`;
      await AryaMemoryDB.store(snippet, ['agent','answer'], 'fact').catch(() => {});
      const btn = document.getElementById('agt-save-mem');
      if (btn) { btn.textContent = '✅ Saved'; setTimeout(() => { btn.textContent = '💾 Save to Memory'; }, 2000); }
      refreshMemory();
    });

    // Continue in chat
    document.getElementById('agt-to-chat')?.addEventListener('click', () => {
      if (!_lastAnswer) return;
      switchAryaTab('chat');
      const msg = `I completed an agent task: "${_lastGoal}". Here's the summary: ${_lastAnswer.slice(0,300)}. Can we dive deeper?`;
      if (!_aiRunning) setTimeout(() => sendMessage(msg), 200);
    });

    // Memory section
    document.getElementById('agt-add-mem-btn')?.addEventListener('click', () => {
      const row = document.getElementById('agt-mem-add-row');
      if (row) row.style.display = row.style.display === 'none' ? 'flex' : 'none';
    });

    document.getElementById('agt-mem-save-btn')?.addEventListener('click', async () => {
      const inp = document.getElementById('agt-mem-input');
      const val = inp?.value?.trim();
      if (!val) return;
      await AryaMemoryDB.store(val, ['manual'], 'fact').catch(() => {});
      if (inp) inp.value = '';
      document.getElementById('agt-mem-add-row').style.display = 'none';
      refreshMemory();
    });

    async function refreshMemory() {
      const mems   = await AryaMemoryDB.getRecent(20).catch(() => []);
      const cnt    = document.getElementById('agt-mem-count');
      const ml     = document.getElementById('agt-mem-list');
      if (cnt) cnt.textContent = mems.length;
      if (!ml) return;
      if (!mems.length) {
        ml.innerHTML = '<div style="font-size:11px;color:rgba(255,255,255,.3);padding:6px 0">No memories yet. Agent runs and manual facts will appear here.</div>';
        return;
      }
      ml.innerHTML = mems.map(m => `
        <div class="agt-mem-item" data-id="${m.id}">
          <span class="agt-mem-type ${m.type}">${m.type}</span>
          <span class="agt-mem-text">${m.content.slice(0,120)}${m.content.length>120?'…':''}</span>
          <button class="agt-mem-del" data-id="${m.id}" title="Forget">✕</button>
        </div>`).join('');
      ml.querySelectorAll('.agt-mem-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          await AryaMemoryDB.forget(Number(btn.dataset.id)).catch(() => {});
          refreshMemory();
        });
      });
    }

    // Report generator buttons (in final footer + header)
    document.getElementById('agt-report-btn')?.addEventListener('click', generateFinancialReport);
    document.getElementById('agt-report-hdr-btn')?.addEventListener('click', generateFinancialReport);

    // Persona switcher buttons
    document.querySelectorAll('.agt-persona-btn').forEach(btn => {
      btn.addEventListener('click', () => setPersona(btn.dataset.persona));
    });
    setPersona(_currentPersona); // apply initial highlight

    // Quick goal buttons
    document.getElementById('agt-quick-fire')?.addEventListener('click', () => {
      const g = document.getElementById('agt-goal');
      if (g) { g.value = 'Do a complete FIRE analysis for me — how many years until I can retire, what SIP do I need, and what are my top 3 actions to retire earlier?'; document.getElementById('agt-run')?.click(); }
    });
    document.getElementById('agt-quick-tax')?.addEventListener('click', () => {
      const g = document.getElementById('agt-goal');
      if (g) { g.value = 'Optimize my complete tax plan for this financial year — check all deductions, find what I am missing, and tell me exactly how much more I can save in tax this year.'; document.getElementById('agt-run')?.click(); }
    });

    // Voice-to-Agent via Web Speech API
    (() => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const btn = document.getElementById('agt-voice-btn');
      if (!SR || !btn) { if (btn) btn.style.opacity = '.3'; return; }
      const rec = new SR();
      rec.lang = 'en-IN';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (e) => {
        const txt = e.results[0][0].transcript;
        const g   = document.getElementById('agt-goal');
        if (g) { g.value = txt; g.dispatchEvent(new Event('input')); }
        btn.textContent = '🎙️';
        btn.style.background = 'rgba(185,125,255,.15)';
        // Auto-run after 600ms
        setTimeout(() => document.getElementById('agt-run')?.click(), 600);
      };
      rec.onstart  = () => { btn.textContent = '🔴'; btn.style.background = 'rgba(255,80,80,.25)'; };
      rec.onerror  = () => { btn.textContent = '🎙️'; btn.style.background = 'rgba(185,125,255,.15)'; };
      rec.onend    = () => { if (btn.textContent === '🔴') { btn.textContent = '🎙️'; btn.style.background = 'rgba(185,125,255,.15)'; } };
      btn.addEventListener('click', () => {
        try { rec.start(); } catch {}
      });
    })();

    // Run History
    function refreshHistory() {
      const runs = AryaRunHistory.getAll();
      const hl   = document.getElementById('agt-history-list');
      if (!hl) return;
      if (!runs.length) {
        hl.innerHTML = '<div style="font-size:10px;color:rgba(255,255,255,.2);text-align:center;padding:6px">Run a goal to see history here</div>';
        return;
      }
      hl.innerHTML = runs.slice(0, 8).map(r => `
        <div class="agt-hist-item" data-id="${r.id}" style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:7px;padding:7px 9px;cursor:pointer">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
            <span style="font-size:10px;color:rgba(255,255,255,.65);flex:1;line-height:1.3">${r.goal.slice(0,70)}${r.goal.length>70?'…':''}</span>
            <span style="font-size:8.5px;color:rgba(255,255,255,.25);white-space:nowrap">${r.ts.split(',')[0]}</span>
          </div>
          <div id="agt-hist-ans-${r.id}" style="display:none;font-size:9.5px;color:rgba(255,255,255,.55);margin-top:6px;line-height:1.5;border-top:1px solid rgba(255,255,255,.06);padding-top:6px">${r.answer.slice(0,300)}…</div>
        </div>`).join('');
      hl.querySelectorAll('.agt-hist-item').forEach(item => {
        item.addEventListener('click', () => {
          const ans = document.getElementById('agt-hist-ans-' + item.dataset.id);
          if (ans) ans.style.display = ans.style.display === 'none' ? 'block' : 'none';
        });
      });
    }
    document.getElementById('agt-history-clear')?.addEventListener('click', () => {
      AryaRunHistory.clear(); refreshHistory();
    });

    // Wire life events and debate
    wireLifeEventsSection();
    wireDebateSection();

    // Initial load
    refreshMemory();
    refreshHistory();
  }

  /* ── LAYER 5: Auto-Memory (extract key facts from chat turns) ─────────────── */
  async function autoExtractMemory(userMsg, aryaResponse) {
    // Store a condensed record of this conversation exchange
    const key    = userMsg.trim().slice(0, 60);
    const answer = aryaResponse.replace(/<[^>]+>/g, '').trim().slice(0, 100);
    const snippet = `Q: "${key}" → ${answer}`;
    await AryaMemoryDB.store(snippet, ['chat', 'auto'], 'fact').catch(() => {});
  }

  /* ── LAYER 5b: Proactive Daily Brief ─────────────────────────────────────── */
  async function triggerProactiveBrief(pageKey) {
    const todayKey = 'arya_brief_' + new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(todayKey)) return; // Already shown today
    localStorage.setItem(todayKey, '1');

    // Gather quick data snapshot from tools
    const health  = parseFloat(get('finos_health_score','0'));
    const income  = parseFloat(get('finos_income','0'));
    const nw      = parseFloat(get('finos_net_worth','0'));
    const sip     = parseFloat(get('finos_sip_amount','0'));
    const goals   = getJ('finos_goals', []);
    const goalStr = goals.length ? goals.map(g => `${g.name}: ${Math.round(g.saved/g.target*100)}%`).join(', ') : 'No goals set';
    const trend   = getHealthTrend();
    const trendStr = trend !== null ? (trend > 0 ? `↑${trend} pts from last week` : trend < 0 ? `↓${Math.abs(trend)} pts from last week` : 'stable') : '';

    const briefPrompt = `Good morning brief for ${get('finos_display_name','Investor')}:
Health score: ${health}/100 ${trendStr}
Income: ${INR(income)}/mo | NW: ${INR(nw)} | SIP: ${INR(sip)}/mo
Goals: ${goalStr}

Give a crisp 3-bullet morning financial brief. What's the ONE thing they should do today? Use ₹ numbers. Be specific. Under 80 words total.`;

    // Display brief as a special bubble
    const briefBubble = appendMessage('arya', '');
    if (briefBubble) {
      briefBubble.innerHTML = '<div class="agt-brief-hd">📋 Good morning brief</div><div class="asp-thinking"><span></span><span></span><span></span></div>';
    }

    try {
      await streamFromOllama(
        BASE_SYSTEM + '\nBe extremely concise. Use bullet points. No filler.',
        briefPrompt,
        partial => { if (briefBubble) briefBubble.innerHTML = `<div class="agt-brief-hd">📋 Morning brief</div>${richText(partial)}`; },
        160
      );
      if (briefBubble) {
        const final = briefBubble.innerHTML;
        briefBubble.innerHTML = final.replace(/<span class="asp-cursor"><\/span>/, '');
      }
    } catch {
      if (briefBubble) briefBubble.innerHTML = '<div class="agt-brief-hd">📋 Morning brief</div><div style="font-size:11px;color:rgba(255,255,255,.35)">Start Ollama for your daily brief.</div>';
    }
  }

  /* ══ HEALTH SCORE TREND TRACKING ════════════════════════════════════════ */
  function saveHealthSnapshot() {
    const score = Math.round(parseFloat(get('finos_health_score', '0')));
    if (!score) return;
    const history = getJ('finos_health_history', []);
    const last = history[history.length - 1];
    if (!last || Date.now() - last.ts > 6 * 86400000) {
      history.push({ ts: Date.now(), score });
      set('finos_health_history', JSON.stringify(history.slice(-12)));
    }
  }
  function getHealthTrend() {
    const h = getJ('finos_health_history', []);
    if (h.length < 2) return null;
    const delta = h[h.length - 1].score - h[h.length - 2].score;
    return delta;
  }

  /* ══ WEALTH TRAJECTORY CHART ════════════════════════════════════════════ */
  function buildCrossPageHUD() {
  // Read from ALL cross-page data points
  const income  = parseFloat(get('finos_monthly_income','0')) || parseFloat(get('finos_income','0')) || 0;
  const expense = parseFloat(get('finos_monthly_expenses','0')) || parseFloat(get('finos_expense_total','0')) || 0;
  const nw      = parseFloat(get('finos_net_worth','0')) || 0;
  const sip     = parseFloat(get('finos_sip_monthly','0')) || parseFloat(get('finos_sip','0')) || 0;
  const emFund  = parseFloat(get('finos_emergency_fund','0')) || 0;
  const tax     = parseFloat(get('finos_tax_savings','0')) || 0;
  const hs      = parseInt(get('finos_health_score','0'),10);
  const xp      = parseInt(get('finos_xp','0'),10);
  const risk    = parseInt(get('finos_risk_score','50'),10);
  const goals   = getJ('finos_goals',[]);
  const txns    = getJ('finos_transactions',[]);
  const sips    = getJ('finos_sips',[]);
  const mf      = getJ('finos_mf_holdings',[]);
  const dna     = get('finos_financial_dna','Explorer');
  const name_   = get('finos_display_name','Investor');
  const fireNum = parseFloat(get('finos_fire_number','0')) || 0;
  const nwChange = parseFloat(get('finos_nw_change_monthly','0')) || 0;
  const mfVal   = parseFloat(get('finos_mf_portfolio_value','0')) || 0;
  const stage   = get('finos_stage','Beginner');

  // Data completeness  
  const cFields = [income>0,expense>0,nw>0,sip>0,emFund>0,goals.length>0];
  const filled  = cFields.filter(Boolean).length;
  const compPct = Math.round(filled/cFields.length*100);

  // Surplus / deficit
  const surplus = income > 0 ? income - expense : 0;
  const savRate = income > 0 ? Math.round(surplus/income*100) : 0;

  // Emergency cover in months
  const emMo = (expense > 0 && emFund > 0) ? Math.min(12, emFund/expense).toFixed(1) : '0';

  // Goals progress
  const totalGoalTarget = goals.reduce((s,g) => s + (parseFloat(g.target||g.targetAmount||0)), 0);
  const totalGoalSaved  = goals.reduce((s,g) => s + (parseFloat(g.saved||g.currentAmount||0)), 0);
  const goalPct = totalGoalTarget > 0 ? Math.round(totalGoalSaved/totalGoalTarget*100) : 0;

  // 80C utilisation (from tax page)
  const inv80C = parseFloat(get('finos_80c_invested','0')) || 0;
  const taxPct = Math.round(Math.min(100, inv80C/150000*100));

  // Activity counts
  const txnCount  = parseInt(get('finos_txn_count','0'),10) || txns.length;
  const sipCount  = sips.length;
  const mfCount   = mf.length;
  const sessions_ = getJ('finos_sessions',[]).length;

  // Net worth trend indicator
  const nwTrendColor = nwChange > 0 ? '#00ffb3' : nwChange < 0 ? '#ff4d6d' : 'rgba(255,255,255,.4)';
  const nwTrendIcon  = nwChange > 0 ? '▲' : nwChange < 0 ? '▼' : '→';

  function metricRow(icon, label, val, pct, color, detail, fillPath) {
    const w = Math.max(2, Math.min(100, pct));
    const isEmpty = pct === 0 || val === 'Not set' || val === 'No SIP';
    const fillLink = isEmpty && fillPath
      ? `<a href="${fillPath}" onclick="window.location.href='${fillPath}'" style="margin-left:auto;font-size:9px;color:#00d4ff;text-decoration:none;border:1px solid rgba(0,212,255,.3);border-radius:5px;padding:1px 6px;white-space:nowrap;flex-shrink:0">→ Fill</a>`
      : '';
    return `<div class="apl-hud-row">
      <div class="apl-hud-icon">${icon}</div>
      <div class="apl-hud-body" style="flex:1;min-width:0">
        <div class="apl-hud-top" style="display:flex;align-items:center;gap:4px">
          <span class="apl-hud-label">${label}</span>
          <span class="apl-hud-val" style="color:${color};margin-left:auto">${val}</span>
          ${fillLink}
        </div>
        <div class="apl-hud-bar"><div class="apl-hud-fill" style="width:${w}%;background:${color}"></div></div>
        <div class="apl-hud-detail">${detail}</div>
      </div>
    </div>`;
  }

  const activityBits = [];
  if (txnCount > 0) activityBits.push(`${txnCount} transactions`);
  if (sipCount > 0) activityBits.push(`${sipCount} SIPs`);
  if (mfCount > 0)  activityBits.push(`${mfCount} MF holdings`);
  if (goals.length > 0) activityBits.push(`${goals.length} goals`);

  return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px 0 6px">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:10px">
      <div class="apl-section-title" style="margin:0">🧬 360° Financial Intelligence</div>
      <div style="font-size:9px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.25);border-radius:20px;padding:2px 8px;color:#00d4ff">${compPct}% data complete</div>
    </div>
    <div style="padding:0 14px;display:flex;flex-direction:column;gap:6px">
      ${metricRow('💰','Income vs Expenses', income>0?`${INR(surplus>0?surplus:0)}/mo surplus`:'Not set', savRate, surplus>=0?'#00ffb3':'#ff4d6d', income>0?`${INR(income)}/mo in · ${INR(expense)}/mo out · ${savRate}% savings rate`:'Set your income & expenses', '/html/track-finances.html')}
      ${metricRow('🛟','Emergency Fund', emFund>0?`${emMo} months covered`:'Not set', emFund>0?parseFloat(emMo)/6*100:0, parseFloat(emMo)>=6?'#00ffb3':parseFloat(emMo)>=3?'#ffb300':'#ff4d6d', emFund>0?`${INR(emFund)} saved · Target: 6 months (${INR((expense||income)*6)})`:'Build 6-month emergency cover', '/html/track-finances.html')}
      ${metricRow('📈','Investment Rate', sip>0?`${INR(sip)}/mo SIP`:'No SIP', sip>0&&income>0?Math.round(sip/income*100):0, '#7b2ff7', sip>0?`${mfVal>0?INR(mfVal)+' portfolio · ':''} ${sipCount>0?sipCount+' active SIPs':INR(sip)+'/mo active'}`:'Start your first SIP', '/html/track-finances.html')}
      ${goals.length>0?metricRow('🎯','Goals Progress', `${goalPct}% funded`, goalPct, '#ffd93d', `${goals.length} goals · ${INR(totalGoalSaved)} of ${INR(totalGoalTarget)} saved`, '/html/life-goals-planner.html'):metricRow('🎯','Goals Progress','Not set',0,'#ffd93d','Define your financial goals', '/html/life-goals-planner.html')}
      ${tax>0?metricRow('🏛️','Tax Efficiency', `${INR(tax)} saved`, taxPct, '#00d4ff', `80C: ${taxPct}% utilised · ${INR(Math.max(0,150000-inv80C))} more room`, '/html/tax.html'):metricRow('🏛️','Tax Efficiency','Not set',0,'#00d4ff','Log your 80C investments', '/html/tax.html')}
    </div>
    ${activityBits.length > 0 ? `
    <div style="margin:10px 14px 0;padding:8px 10px;background:rgba(255,255,255,.03);border-radius:10px;border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:8px">
      <span style="font-size:14px">📊</span>
      <div>
        <div style="font-size:10.5px;font-weight:700;color:rgba(255,255,255,.7)">Cross-page data tracked</div>
        <div style="font-size:9.5px;color:rgba(255,255,255,.35);margin-top:1px">${activityBits.join(' · ')}</div>
      </div>
    </div>` : `
    <div style="margin:10px 14px 0;padding:8px 10px;background:rgba(0,212,255,.04);border-radius:10px;border:1px dashed rgba(0,212,255,.15);text-align:center;font-size:10.5px;color:rgba(0,212,255,.5)">
      💡 Fill in your data across FIN-OS pages to unlock full intelligence
    </div>`}
    <button class="asp-view-ask-btn" data-msg="360° financial analysis: Income ${INR(income)}/mo, expenses ${INR(expense)}/mo (${savRate}% savings), emergency fund ${emMo} months, SIP ${INR(sip)}/mo, ${goals.length} goals, net worth ${INR(nw)}${nwChange?', monthly NW change '+INR(nwChange):''}. Give me my top 3 cross-cutting financial priorities with exact ₹ actions." style="margin:10px 14px 4px;width:calc(100% - 28px)">🧬 Get my 360° action plan</button>
  </div>`;
}

  /* ══ SMART INSIGHT CARDS ════════════════════════════════════════════ */
  function buildSmartInsightCards() {
    const income  = parseFloat(get('finos_monthly_income','0')) || parseFloat(get('finos_income','0')) || 0;
    const expense = parseFloat(get('finos_monthly_expenses','0')) || parseFloat(get('finos_expense_total','0')) || 0;
    const nw      = parseFloat(get('finos_net_worth','0')) || 0;
    const sip     = parseFloat(get('finos_sip_monthly','0')) || parseFloat(get('finos_sip','0')) || 0;
    const emFund  = parseFloat(get('finos_emergency_fund','0')) || 0;
    const inv80C  = parseFloat(get('finos_80c_invested','0')) || 0;
    const fireNum = parseFloat(get('finos_fire_number','0')) || 0;
    const goals   = getJ('finos_goals',[]);
    const surplus = income > 0 ? income - expense : 0;
    const savRate = income > 0 ? Math.round(surplus/income*100) : 0;
    const emMo    = expense > 0 && emFund > 0 ? (emFund/expense).toFixed(1) : '0';
    const ins     = localStorage.getItem('finos_insurance');
    const mfVal   = parseFloat(get('finos_mf_portfolio_value','0')) || 0;

    const insights = [];

    // SIP gap — target 20% of income
    if (income > 0) {
      const sipRate = sip / income * 100;
      const gap     = Math.max(0, income * 0.20 - sip);
      if (sipRate < 20 && gap > 0) {
        const impact = Math.round(gap * 12 * ((Math.pow(1 + 0.12/12, 180) - 1) / (0.12/12)) / 100000);
        insights.push({ type:'opportunity', icon:'📈', color:'#7b2ff7',
          title:`SIP Gap — ${Math.round(sipRate)}% of income`,
          body:`Increase by ${INR(gap)}/mo to hit 20% rule. Over 15 yr at 12% CAGR that gap compounds to ~₹${impact}L of missed wealth.`,
          cta:'Boost SIP', href:'/html/track-finances.html' });
      }
    }

    // Emergency fund gap
    if ((income > 0 || expense > 0) && parseFloat(emMo) < 6) {
      const base   = expense || income;
      const target = base * 6;
      const gap    = Math.max(0, target - emFund);
      const mos    = sip > 0 ? Math.ceil(gap / (sip * 0.5)) : null;
      insights.push({ type:'warning', icon:'🛟', color:'#ff9f43',
        title:`Emergency Buffer: ${emMo} months`,
        body:`Target is 6 months. Gap: ${INR(gap)}. ${mos ? `At 50% of your SIP, filled in ~${mos} months.` : 'Build this before investing further.'}`,
        cta:'Build fund', href:'/html/track-finances.html' });
    }

    // 80C unused headroom
    const room80C = Math.max(0, 150000 - inv80C);
    if (room80C > 10000 && income > 0) {
      const taxSaved = Math.round(room80C * 0.30);
      insights.push({ type:'opportunity', icon:'🏛️', color:'#00d4ff',
        title:`₹${INR(room80C)} 80C headroom unused`,
        body:`Investing the remaining limit saves ~₹${INR(taxSaved)} in tax (30% bracket). ELSS locks in for just 3 years and beats FD returns.`,
        cta:'Optimise tax', href:'/html/tax.html' });
    }

    // FIRE progress
    if (fireNum > 0 && nw > 0) {
      const pct  = Math.min(100, Math.round(nw / fireNum * 100));
      const yrs  = sip > 0 ? Math.ceil(Math.log(fireNum / nw) / Math.log(1 + 0.12)) : null;
      insights.push({ type: pct > 50 ? 'success' : 'info', icon:'🔥', color: pct > 50 ? '#00ffb3' : '#ffd93d',
        title:`FIRE: ${pct}% funded`,
        body:`NW ${INR(nw)} vs FIRE target ${INR(fireNum)}. Gap: ${INR(fireNum - nw)}.${yrs ? ` At 12% CAGR, ~${yrs} years away.` : ' Start SIPs to project your FIRE date.'}`,
        cta:'Run FIRE sim', href:null });
    }

    // Elite saver badge
    if (savRate >= 30 && income > 0) {
      const idle = Math.max(0, surplus - sip);
      insights.push({ type:'success', icon:'🏆', color:'#00ffb3',
        title:`Elite Saver — ${savRate}% rate`,
        body:`Top-tier savings rate. ${idle > 0 ? `${INR(idle)}/mo of surplus is idle — deploy into index funds or NPS to maximise compounding.` : 'All surplus is invested. Outstanding discipline.'}`,
        cta:'Deploy surplus', href:'/html/portfolio.html' });
    } else if (savRate > 0 && savRate < 10 && income > 0) {
      insights.push({ type:'warning', icon:'⚠️', color:'#ff4d6d',
        title:`Low Savings Rate — ${savRate}%`,
        body:`Saving less than 10% leaves little for wealth building. Cutting expenses by ${INR(Math.round(income * 0.20 - surplus))}/mo would hit the 20% benchmark.`,
        cta:'Track expenses', href:'/html/tracker.html' });
    }

    // No insurance
    if (!ins || ins === '[]' || ins === 'null' || ins === '{}') {
      insights.push({ type:'warning', icon:'🛡️', color:'#ff9f43',
        title:'No insurance on record',
        body:'One medical emergency can wipe years of savings. ₹1 Cr term cover costs ~₹10-15K/yr in your 30s. Log it to track your coverage gap.',
        cta:'Log insurance', href:'/html/insurance-hub.html' });
    }

    // Portfolio too cash-heavy
    if (income > 0 && mfVal === 0 && sip === 0 && nw > income * 3) {
      insights.push({ type:'opportunity', icon:'💡', color:'#a78bfa',
        title:'High NW — no investments tracked',
        body:`You have ${INR(nw)} in net worth but no MF/SIP data. Add your investments to see allocation, returns, and rebalancing needs.`,
        cta:'Add portfolio', href:'/html/portfolio.html' });
    }

    if (insights.length === 0) return '';

    return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px 0 10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:10px">
        <div class="apl-section-title" style="margin:0">💡 Smart Insights</div>
        <div style="font-size:9px;background:rgba(255,217,61,.1);border:1px solid rgba(255,217,61,.25);border-radius:20px;padding:2px 8px;color:#ffd93d">${insights.length} personalised</div>
      </div>
      <div style="padding:0 14px;display:flex;flex-direction:column;gap:7px">
        ${insights.map(ins => `<div style="background:rgba(255,255,255,.025);border:1px solid ${ins.color}20;border-left:3px solid ${ins.color};border-radius:0 9px 9px 0;padding:9px 11px;display:flex;align-items:flex-start;gap:9px">
          <div style="font-size:19px;flex-shrink:0;line-height:1.1">${ins.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:10.5px;font-weight:800;color:rgba(255,255,255,.85);margin-bottom:3px">${ins.title}</div>
            <div style="font-size:9.5px;color:rgba(255,255,255,.42);line-height:1.5">${ins.body}</div>
            ${ins.href ? `<a href="${ins.href}" onclick="window.location.href='${ins.href}'" style="display:inline-block;margin-top:5px;font-size:9px;color:${ins.color};text-decoration:none;border:1px solid ${ins.color}40;border-radius:5px;padding:2px 8px;cursor:pointer">${ins.cta} →</a>` : ''}
          </div>
        </div>`).join('')}
      </div>
    </div>`;
  }

  /* ══ NET WORTH TIMELINE ══════════════════════════════════════════════ */
  function buildNetWorthTimeline() {
    const nw = parseFloat(get('finos_net_worth','0')) || 0;
    const today = new Date().toISOString().slice(0,10);

    // Auto-save today's snapshot
    if (nw > 0) {
      const hist = getJ('finos_nw_history', {});
      hist[today] = nw;
      const keys = Object.keys(hist).sort();
      if (keys.length > 90) keys.slice(0, keys.length - 90).forEach(k => delete hist[k]);
      try { localStorage.setItem('finos_nw_history', JSON.stringify(hist)); } catch(e) {}
    }

    const hist   = getJ('finos_nw_history', {});
    const points = Object.entries(hist).sort((a,b) => a[0].localeCompare(b[0]));

    if (points.length < 2) {
      return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <div class="apl-section-title" style="margin:0">📊 Net Worth Timeline</div>
        </div>
        <div style="text-align:center;padding:14px 0 6px;font-size:9.5px;color:rgba(255,255,255,.28)">
          Open Arya on multiple days to see your NW trend sparkline here
        </div>
      </div>`;
    }

    const vals   = points.map(([, v]) => parseFloat(v));
    const minV   = Math.min(...vals), maxV = Math.max(...vals);
    const range  = maxV - minV || 1;
    const W = 320, H = 56;
    const ptStr  = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = H - ((v - minV) / range * (H - 8)) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const pathD  = 'M' + ptStr.split(' ').join(' L');
    const areaD  = pathD + ` L${W},${H} L0,${H} Z`;
    const lastX  = W, lastY = (H - ((vals[vals.length-1] - minV) / range * (H - 8)) - 4).toFixed(1);
    const chgPct = Math.round((vals[vals.length-1] - vals[0]) / Math.max(1,vals[0]) * 100);
    const clr    = chgPct >= 0 ? '#00ffb3' : '#ff4d6d';

    return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px 0 10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:10px">
        <div class="apl-section-title" style="margin:0">📊 Net Worth Timeline</div>
        <div style="font-size:9px;color:${clr};font-weight:800">${chgPct>=0?'+':''}${chgPct}% since day 1</div>
      </div>
      <div style="padding:0 14px">
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:56px;overflow:visible">
          <defs>
            <linearGradient id="nw-tl-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${clr}" stop-opacity=".25"/>
              <stop offset="100%" stop-color="${clr}" stop-opacity=".02"/>
            </linearGradient>
          </defs>
          <path d="${areaD}" fill="url(#nw-tl-g)"/>
          <polyline points="${ptStr}" fill="none" stroke="${clr}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="${lastX}" cy="${lastY}" r="3.5" fill="${clr}" stroke="#0d1117" stroke-width="1.5"/>
        </svg>
        <div style="display:flex;justify-content:space-between;font-size:9px;margin-top:3px">
          <span style="color:rgba(255,255,255,.28)">${points[0][0]}</span>
          <span style="color:rgba(255,255,255,.28)">${points[points.length-1][0]}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9.5px;margin-top:1px">
          <span style="color:rgba(255,255,255,.4)">${INR(vals[0])}</span>
          <span style="color:${clr};font-weight:800">${INR(vals[vals.length-1])}</span>
        </div>
        <div style="font-size:8.5px;color:rgba(255,255,255,.22);margin-top:4px;text-align:center">${points.length} data points · updates each time you open Arya</div>
      </div>
    </div>`;
  }

  /* ══ WEALTH FINGERPRINT RADAR ════════════════════════════════════════ */
  function buildWealthFingerprint() {
    const income  = parseFloat(get('finos_monthly_income','0')) || parseFloat(get('finos_income','0')) || 0;
    const expense = parseFloat(get('finos_monthly_expenses','0')) || parseFloat(get('finos_expense_total','0')) || 0;
    const nw      = parseFloat(get('finos_net_worth','0')) || 0;
    const sip     = parseFloat(get('finos_sip_monthly','0')) || parseFloat(get('finos_sip','0')) || 0;
    const emFund  = parseFloat(get('finos_emergency_fund','0')) || 0;
    const hs      = Math.min(100, parseInt(get('finos_health_score','0'),10));
    const risk    = Math.min(100, parseInt(get('finos_risk_score','50'),10));
    const goals   = getJ('finos_goals',[]);
    const tax     = parseFloat(get('finos_tax_savings','0')) || 0;
    const dna     = getJ('FINOS_CORE_DNA', null);
    const disc    = get('finos_disc_type','') || get('finos_disc','');
    const mfVal   = parseFloat(get('finos_mf_portfolio_value','0')) || 0;
    const txns    = getJ('finos_transactions',[]);
    const age     = parseInt(get('finos_age','30'),10);

    // 8 financial dimensions, 0–100
    const surplus = income > 0 ? Math.max(0, income - expense) : 0;
    const dims = [
      { label:'Savings',    score: income>0 ? Math.min(100,Math.round(surplus/income*100)*3) : 0,   color:'#00ffb3' },
      { label:'Investment', score: sip>0&&income>0 ? Math.min(100,Math.round(sip/income*200)) : mfVal>0?40:0, color:'#7b2ff7' },
      { label:'Protection', score: emFund>0&&expense>0 ? Math.min(100,Math.round(emFund/expense/6*100)) : 0, color:'#00d4ff' },
      { label:'Goals',      score: goals.length>0 ? Math.min(100,Math.round(goals.length*20 + (goals.reduce((s,g)=>s+(parseFloat(g.progress||0)),0)/Math.max(1,goals.length)))) : 0, color:'#ffd93d' },
      { label:'Tax IQ',     score: tax>0 ? Math.min(100,Math.round(tax/10000)) : 0,  color:'#ff9f43' },
      { label:'Knowledge',  score: hs > 0 ? Math.min(100,hs) : 0,  color:'#ff6b9d' },
      { label:'Behaviour',  score: disc ? (disc.includes('C')||disc.includes('S') ? 75 : disc.includes('D') ? 60 : 65) : (dna?.scores?.[3]||0), color:'#a78bfa' },
      { label:'Net Worth',  score: nw>0 ? Math.min(100, Math.round(nw / (income*12 || 600000) * 10)) : 0, color:'#4ade80' },
    ];

    const N = dims.length;
    const CX = 90, CY = 90, R = 68;
    const angleStep = (2 * Math.PI) / N;
    const pt = (i, r) => {
      const a = i * angleStep - Math.PI / 2;
      return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
    };

    // Grid rings
    const gridRings = [0.25, 0.5, 0.75, 1].map(f => {
      const pts = dims.map((_,i) => pt(i, R*f).join(',')).join(' ');
      return `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="1"/>`;
    }).join('');

    // Axis lines
    const axes = dims.map((_,i) => {
      const [x,y] = pt(i, R);
      return `<line x1="${CX}" y1="${CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.08)" stroke-width="1"/>`;
    }).join('');

    // Data polygon
    const dataPts = dims.map((d,i) => pt(i, R * d.score/100).join(',')).join(' ');
    const outerPts = dims.map((_,i) => pt(i, R).join(',')).join(' ');

    // Labels
    const labels = dims.map((d,i) => {
      const [x,y] = pt(i, R + 14);
      const anchor = x < CX - 5 ? 'end' : x > CX + 5 ? 'start' : 'middle';
      return `<text x="${x.toFixed(1)}" y="${(y+3).toFixed(1)}" text-anchor="${anchor}" font-size="7.5" font-weight="700" fill="${d.score>50?d.color:'rgba(255,255,255,.4)'}">${d.label}</text>`;
    }).join('');

    // Score dots
    const dots = dims.map((d,i) => {
      const [x,y] = pt(i, R * d.score/100);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${d.color}" stroke="#0d1117" stroke-width="1.5"/>`;
    }).join('');

    const avgScore = Math.round(dims.reduce((s,d)=>s+d.score,0)/N);
    const weakest  = dims.reduce((a,d)=>d.score<a.score?d:a, dims[0]);
    const strongest = dims.reduce((a,d)=>d.score>a.score?d:a, dims[0]);

    return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px 0 10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:10px">
        <div class="apl-section-title" style="margin:0">🕸️ Wealth Fingerprint</div>
        <div style="font-size:9px;background:rgba(123,47,247,.12);border:1px solid rgba(123,47,247,.3);border-radius:20px;padding:2px 8px;color:#a78bfa">${avgScore}/100 avg</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;padding:0 14px">
        <svg viewBox="0 0 180 180" style="width:180px;flex-shrink:0;overflow:visible">
          ${gridRings}${axes}
          <polygon points="${dataPts}" fill="rgba(0,212,255,.12)" stroke="#00d4ff" stroke-width="1.5" stroke-linejoin="round"/>
          ${dots}${labels}
        </svg>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px">
          ${dims.map(d=>`<div style="display:flex;align-items:center;gap:5px">
            <div style="width:6px;height:6px;border-radius:50%;background:${d.color};flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:1px">
                <span style="color:rgba(255,255,255,.55)">${d.label}</span>
                <span style="color:${d.color};font-weight:800">${d.score}</span>
              </div>
              <div style="height:2.5px;background:rgba(255,255,255,.06);border-radius:2px">
                <div style="height:100%;width:${d.score}%;background:${d.color};border-radius:2px;transition:width 1.1s ease"></div>
              </div>
            </div>
          </div>`).join('')}
        </div>
      </div>
      <div style="margin:10px 14px 0;display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div style="background:rgba(0,255,179,.06);border:1px solid rgba(0,255,179,.15);border-radius:9px;padding:7px 9px">
          <div style="font-size:8.5px;color:rgba(255,255,255,.35);margin-bottom:2px">💪 Strongest</div>
          <div style="font-size:11px;font-weight:800;color:#00ffb3">${strongest.label} · ${strongest.score}</div>
        </div>
        <div style="background:rgba(255,77,109,.06);border:1px solid rgba(255,77,109,.15);border-radius:9px;padding:7px 9px">
          <div style="font-size:8.5px;color:rgba(255,255,255,.35);margin-bottom:2px">⚡ Focus area</div>
          <div style="font-size:11px;font-weight:800;color:#ff4d6d">${weakest.label} · ${weakest.score}</div>
        </div>
      </div>
      <button class="asp-view-ask-btn" data-msg="My wealth fingerprint: ${dims.map(d=>d.label+' '+d.score+'/100').join(', ')}. Overall average ${avgScore}/100. Strongest: ${strongest.label} (${strongest.score}). Focus needed: ${weakest.label} (${weakest.score}). Give me a targeted 60-day improvement plan for my weakest dimension with exact ₹ actions." style="margin:10px 14px 4px;width:calc(100% - 28px)">🕸️ Improve my weakest dimension</button>
    </div>`;
  }

  /* ══ PAGE ACTIVITY MATRIX ════════════════════════════════════════════ */
  function buildPageActivityMatrix() {
    // Key pages and their primary data key + fill page link
    const pages = [
      { key:'profile',        label:'Profile',       icon:'👤', dataKey:'finos_display_name',    path:'/html/profile.html' },
      { key:'dna',            label:'DNA',           icon:'🧬', dataKey:'FINOS_CORE_DNA',        path:'/html/dna.html' },
      { key:'track-finances', label:'Track',         icon:'📊', dataKey:'finos_income',          path:'/html/track-finances.html' },
      { key:'tracker',        label:'Tracker',       icon:'📝', dataKey:'finos_transactions',    path:'/html/tracker.html' },
      { key:'life-goals',     label:'Goals',         icon:'🎯', dataKey:'finos_goals',           path:'/html/life-goals-planner.html' },
      { key:'portfolio',      label:'Portfolio',     icon:'📈', dataKey:'finos_mf_holdings',     path:'/html/portfolio.html' },
      { key:'tax',            label:'Tax',           icon:'🏛️', dataKey:'finos_tax_savings',     path:'/html/tax.html' },
      { key:'insurance-hub',  label:'Insurance',     icon:'🛡️', dataKey:'finos_insurance',       path:'/html/insurance-hub.html' },
      { key:'financial-report',label:'Report',      icon:'📋', dataKey:'finos_health_score',    path:'/html/financial-report.html' },
      { key:'know-your-finances',label:'Know NW',   icon:'💎', dataKey:'finos_net_worth',       path:'/html/know-your-finances.html' },
      { key:'roadmap',        label:'Roadmap',       icon:'🗺️', dataKey:'finos_goal_rank',       path:'/html/roadmap.html' },
      { key:'simulator',      label:'Simulator',     icon:'⚡', dataKey:'finos_sim_sessions',    path:'/html/simulator.html' },
    ];

    const filled = pages.map(p => {
      const raw = localStorage.getItem(p.dataKey);
      const visited = getPageVisitCount(p.key) > 0;
      let hasDat = false;
      if (raw && raw !== 'null' && raw !== '0' && raw !== '[]' && raw !== '{}') {
        try { const v = JSON.parse(raw); hasDat = Array.isArray(v) ? v.length>0 : (typeof v==='object'?Object.keys(v).length>0:!!v); }
        catch { hasDat = raw.length > 0; }
      }
      return { ...p, visited, hasDat };
    });

    const doneCount = filled.filter(p=>p.hasDat).length;
    const visitCount = filled.filter(p=>p.visited).length;

    return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px 0 10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:10px">
        <div class="apl-section-title" style="margin:0">🗺️ Page Activity Matrix</div>
        <div style="font-size:9px;color:rgba(255,255,255,.35)">${doneCount}/${pages.length} pages with data</div>
      </div>
      <div style="padding:0 14px;display:grid;grid-template-columns:repeat(4,1fr);gap:5px">
        ${filled.map(p=>`
          <a href="${p.path}" style="text-decoration:none" onclick="window.location.href='${p.path}';return false">
            <div style="background:${p.hasDat?'rgba(0,212,255,.08)':p.visited?'rgba(255,255,255,.04)':'rgba(255,255,255,.02)'};
              border:1px solid ${p.hasDat?'rgba(0,212,255,.25)':p.visited?'rgba(255,255,255,.08)':'rgba(255,255,255,.04)'};
              border-radius:9px;padding:7px 5px;text-align:center;cursor:pointer;transition:all .18s"
              title="${p.label} — click to open">
              <div style="font-size:16px">${p.icon}</div>
              <div style="font-size:8.5px;font-weight:700;color:${p.hasDat?'#00d4ff':p.visited?'rgba(255,255,255,.5)':'rgba(255,255,255,.2)'};margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.label}</div>
              <div style="font-size:7.5px;margin-top:2px;color:${p.hasDat?'#00ffb3':p.visited?'rgba(255,179,0,.6)':'rgba(255,255,255,.18)'}">
                ${p.hasDat?'✓ Data':p.visited?'Visited':'Not set'}
              </div>
            </div>
          </a>`).join('')}
      </div>
      <div style="margin:8px 14px 0;height:4px;background:rgba(255,255,255,.05);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${Math.round(doneCount/pages.length*100)}%;background:linear-gradient(90deg,#00d4ff,#7b2ff7);border-radius:4px;transition:width 1.2s ease"></div>
      </div>
      <div style="padding:4px 14px 0;font-size:9px;color:rgba(255,255,255,.3)">${Math.round(doneCount/pages.length*100)}% of key pages filled — tap any card to go there</div>
    </div>`;
  }

  /* ══ BEHAVIORAL DNA ══════════════════════════════════════════════════ */
  function buildBehavioralDNA() {
    const disc = (get('finos_disc_type','') || get('finos_disc','')).toUpperCase().trim();
    const dna  = getJ('FINOS_CORE_DNA', null);
    const risk = Math.min(100, Math.max(0, parseInt(get('finos_risk_score','50'), 10) || 50));
    const investorType = get('finos_investor_type','') || get('finos_investor_archetype','') || get('finos_financial_dna','') || '';

    const PROFILES = {
      'D':  { label:'Driver',        desc:'Decisive, direct, results-focused',        traits:[85,40,55,95], color:'#ff4d6d', x:70, y:25 },
      'I':  { label:'Influencer',    desc:'Optimistic, enthusiastic, collaborative',  traits:[60,80,45,85], color:'#ffd93d', x:30, y:25 },
      'S':  { label:'Steady',        desc:'Patient, reliable, risk-averse by nature', traits:[35,65,90,50], color:'#00ffb3', x:30, y:72 },
      'C':  { label:'Conscientious', desc:'Analytical, precise, detail-oriented',     traits:[50,35,85,60], color:'#00d4ff', x:70, y:72 },
      'DC': { label:'Architect',     desc:'Strategic, systematic, result-driven',     traits:[80,35,75,88], color:'#a78bfa', x:70, y:38 },
      'DI': { label:'Initiator',     desc:'Bold, persuasive, action-oriented',        traits:[88,70,50,90], color:'#ff9f43', x:55, y:22 },
      'SC': { label:'Analyst',       desc:'Methodical, patient, quality-focused',     traits:[40,45,88,60], color:'#4ade80', x:52, y:72 },
      'SI': { label:'Collaborator',  desc:'Empathetic, supportive, steady hands',     traits:[38,75,85,52], color:'#fb7185', x:28, y:55 },
      'CD': { label:'Architect',     desc:'Strategic, systematic, result-driven',     traits:[80,35,75,88], color:'#a78bfa', x:70, y:38 },
      'ID': { label:'Initiator',     desc:'Bold, persuasive, action-oriented',        traits:[88,70,50,90], color:'#ff9f43', x:55, y:22 },
      'CS': { label:'Analyst',       desc:'Methodical, patient, quality-focused',     traits:[40,45,88,60], color:'#4ade80', x:52, y:72 },
      'IS': { label:'Collaborator',  desc:'Empathetic, supportive, steady hands',     traits:[38,75,85,52], color:'#fb7185', x:28, y:55 },
    };

    // Find profile — exact then single-letter fallback
    let profile = PROFILES[disc] || PROFILES[disc.slice(0,2)] || PROFILES[disc[0]] || null;
    const discKey = profile ? (PROFILES[disc] ? disc : (PROFILES[disc.slice(0,2)] ? disc.slice(0,2) : disc[0])) : '';

    if (!profile) {
      return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px">
        <div class="apl-section-title">🧬 Behavioral DNA</div>
        <div style="text-align:center;padding:18px 0 10px">
          <div style="font-size:26px;margin-bottom:7px">🔬</div>
          <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:12px">Take your Financial DNA assessment<br>to unlock your behavioral investing profile</div>
          <a href="/html/dna.html" onclick="window.location.href='/html/dna.html'" style="display:inline-block;padding:7px 18px;background:rgba(0,212,255,.1);border:1px solid rgba(0,212,255,.3);border-radius:8px;color:#00d4ff;font-size:11px;font-weight:700;text-decoration:none">Take DNA Assessment →</a>
        </div>
      </div>`;
    }

    const traitNames  = ['Risk Appetite','Social Proof','Patience','Ambition'];
    const traitColors = ['#ff4d6d','#ffd93d','#00ffb3','#7b2ff7'];
    const traitScores = [risk, profile.traits[1], profile.traits[2], profile.traits[3]];

    const dotX = 4 + profile.x * 0.92;
    const dotY = 4 + profile.y * 0.92;

    const biasLabel = discKey.includes('D') ? 'Impulsive trades'
                    : discKey.includes('I') ? 'FOMO chasing'
                    : discKey.includes('S') ? 'Inaction / delay'
                    : 'Analysis paralysis';
    const styleLabel = risk > 70 ? 'Aggressive growth'
                     : risk > 50 ? 'Balanced growth'
                     : risk > 30 ? 'Conservative growth' : 'Capital preservation';

    return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px 0 10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:10px">
        <div class="apl-section-title" style="margin:0">🧬 Behavioral DNA</div>
        <div style="font-size:9px;background:rgba(255,255,255,.05);border:1px solid ${profile.color}55;border-radius:20px;padding:2px 9px;color:${profile.color};font-weight:800">${discKey} · ${profile.label}</div>
      </div>
      <div style="display:flex;align-items:flex-start;gap:12px;padding:0 14px">
        <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:4px">
          <svg viewBox="0 0 100 100" style="width:108px;height:108px;border-radius:10px;overflow:visible">
            <rect x="0" y="0" width="50" height="50" fill="rgba(255,77,109,.07)" stroke="rgba(255,255,255,.06)" stroke-width=".5"/>
            <rect x="50" y="0" width="50" height="50" fill="rgba(255,217,61,.07)" stroke="rgba(255,255,255,.06)" stroke-width=".5"/>
            <rect x="0" y="50" width="50" height="50" fill="rgba(0,255,179,.07)" stroke="rgba(255,255,255,.06)" stroke-width=".5"/>
            <rect x="50" y="50" width="50" height="50" fill="rgba(0,212,255,.07)" stroke="rgba(255,255,255,.06)" stroke-width=".5"/>
            <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,.1)" stroke-width=".5"/>
            <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,.1)" stroke-width=".5"/>
            <text x="25" y="9" text-anchor="middle" font-size="6" fill="rgba(255,77,109,.7)" font-weight="800">D</text>
            <text x="75" y="9" text-anchor="middle" font-size="6" fill="rgba(255,217,61,.7)" font-weight="800">I</text>
            <text x="25" y="98" text-anchor="middle" font-size="6" fill="rgba(0,255,179,.7)" font-weight="800">S</text>
            <text x="75" y="98" text-anchor="middle" font-size="6" fill="rgba(0,212,255,.7)" font-weight="800">C</text>
            <circle cx="${dotX.toFixed(1)}" cy="${dotY.toFixed(1)}" r="9" fill="${profile.color}" opacity=".15"/>
            <circle cx="${dotX.toFixed(1)}" cy="${dotY.toFixed(1)}" r="5" fill="${profile.color}"/>
            <circle cx="${dotX.toFixed(1)}" cy="${dotY.toFixed(1)}" r="2.5" fill="white" opacity=".9"/>
          </svg>
          <div style="font-size:7.5px;color:rgba(255,255,255,.25);text-align:center">DISC Quadrant</div>
        </div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px">
          <div style="font-size:10.5px;font-weight:700;color:rgba(255,255,255,.75);line-height:1.35">${profile.desc}</div>
          ${traitNames.map((nm, i) => `<div>
            <div style="display:flex;justify-content:space-between;font-size:8.5px;margin-bottom:2px">
              <span style="color:rgba(255,255,255,.38)">${nm}</span>
              <span style="color:${traitColors[i]};font-weight:800">${traitScores[i]}</span>
            </div>
            <div style="height:3px;background:rgba(255,255,255,.06);border-radius:2px">
              <div style="height:100%;width:${traitScores[i]}%;background:${traitColors[i]};border-radius:2px;transition:width 1.1s ease"></div>
            </div>
          </div>`).join('')}
        </div>
      </div>
      <div style="margin:10px 14px 0;display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:7px 10px">
          <div style="font-size:8px;color:rgba(255,255,255,.28);margin-bottom:2px">🎯 Investing style</div>
          <div style="font-size:10.5px;font-weight:800;color:rgba(255,255,255,.72)">${styleLabel}</div>
        </div>
        <div style="background:rgba(255,77,109,.05);border:1px solid rgba(255,77,109,.15);border-radius:9px;padding:7px 10px">
          <div style="font-size:8px;color:rgba(255,255,255,.28);margin-bottom:2px">⚠️ Watch for</div>
          <div style="font-size:10.5px;font-weight:800;color:#ff4d6d">${biasLabel}</div>
        </div>
      </div>
      ${investorType ? `<div style="margin:8px 14px 0;padding:7px 10px;background:rgba(123,47,247,.06);border:1px solid rgba(123,47,247,.2);border-radius:8px;display:flex;align-items:center;gap:6px">
        <span style="font-size:8.5px;color:rgba(255,255,255,.35)">Financial archetype:</span>
        <span style="font-size:10px;font-weight:800;color:#a78bfa">${investorType}</span>
      </div>` : ''}
      <button class="asp-view-ask-btn" data-msg="My DISC type is ${discKey} (${profile.label || ''}). Risk score: ${risk}/100. Investing style: ${styleLabel}. Key bias: ${biasLabel}. Give me a personalised behavioral investing plan: my top 3 blind spots, how each has cost Indians like me money, and one specific ₹ habit to fix each bias." style="margin:10px 14px 4px;width:calc(100% - 28px)">🧬 Get my behavioral investing plan</button>
    </div>`;
  }

  function buildWealthChart() {
  const nw     = parseFloat(get('finos_net_worth', '0')) || 0;
  const sip    = parseFloat(get('finos_sip', '0')) || parseFloat(get('finos_sip_monthly','0')) || 0;
  const inc    = parseFloat(get('finos_income', '0')) || parseFloat(get('finos_monthly_income','0')) || 50000;
  const exp    = parseFloat(get('finos_expenses', '0')) || parseFloat(get('finos_monthly_expenses','0')) || 40000;
  const age    = parseInt(get('finos_age', '30'), 10);
  const retAge = parseInt(get('finos_retire_age', '60'), 10);

  if (!nw && !sip) return `<div class="apl-lab-section" style="padding:12px 14px 4px;border-top:1px solid rgba(255,255,255,.07)">
    <div class="apl-section-title">📈 Wealth Trajectory</div>
    <div style="text-align:center;padding:16px 0 8px;font-size:11.5px;color:rgba(255,255,255,.3);line-height:1.7">Enter net worth &amp; SIP in profile<br>to see your 3-scenario FIRE curve.</div>
  </div>`;

  const yrs = Math.max(5, retAge - age);
  const fireNeed = Math.round((exp || inc) * 25);

  function project(r) {
    const pts = [];
    for (let y = 0; y <= yrs; y++) {
      const c = nw * Math.pow(1+r,y) + (sip>0 ? sip*12*(Math.pow(1+r,y)-1)/r : 0);
      pts.push(c);
    }
    return pts;
  }

  const conserv = project(0.08);  // 8% CAGR
  const base    = project(0.12);  // 12% CAGR
  const aggr    = project(0.16);  // 16% CAGR

  const maxV = Math.max(fireNeed*1.15, aggr[yrs]*1.05);
  const W=370, H=130, PL=44, PR=8, PT=10, PB=24;
  const cW=W-PL-PR, cH=H-PT-PB;
  const xS = i => PL + (i/yrs)*cW;
  const yS = v => PT + cH - Math.min(cH, (v/maxV)*cH);

  function pathD(pts) {
    return pts.map((v,i)=>`${i?'L':'M'}${xS(i).toFixed(1)},${yS(v).toFixed(1)}`).join('');
  }
  function fillD(pts) {
    return pathD(pts)+` L${xS(yrs).toFixed(1)},${(PT+cH).toFixed(1)} L${xS(0).toFixed(1)},${(PT+cH).toFixed(1)} Z`;
  }

  const fireY = yS(fireNeed).toFixed(1);
  const yLabels = [0,0.5,1].map(p=>({v:yS(maxV*p),l:INR(maxV*p)}));
  const onTrack = base[yrs] >= fireNeed;
  const baseFireAge = base.findIndex(c => c >= fireNeed);

  return `<div class="apl-lab-section asp-fade-in" style="padding:14px 0 4px;border-top:1px solid rgba(255,255,255,.07)">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:8px">
      <div class="apl-section-title" style="margin:0">📈 Wealth Trajectory — 3 Scenarios</div>
      <span style="font-size:10px;padding:2px 8px;border-radius:20px;background:${onTrack?'rgba(0,255,179,.1)':'rgba(255,150,0,.1)'};border:1px solid ${onTrack?'rgba(0,255,179,.3)':'rgba(255,150,0,.3)'};color:${onTrack?'#00ffb3':'#ffb300'}">${onTrack?'✅ On track':'⚠️ Gap exists'}</span>
    </div>
    <div style="padding:0 8px">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;overflow:visible">
        <defs>
          <linearGradient id="wt-aggr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#7b2ff7" stop-opacity=".22"/>
            <stop offset="100%" stop-color="#7b2ff7" stop-opacity=".02"/>
          </linearGradient>
          <linearGradient id="wt-base" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#00ffb3" stop-opacity=".18"/>
            <stop offset="100%" stop-color="#00ffb3" stop-opacity=".02"/>
          </linearGradient>
        </defs>
        <path d="${fillD(aggr)}" fill="url(#wt-aggr)"/>
        <path d="${fillD(base)}" fill="url(#wt-base)"/>
        <line x1="${PL}" y1="${fireY}" x2="${W-PR}" y2="${fireY}" stroke="rgba(255,217,61,.6)" stroke-width="1" stroke-dasharray="4 3"/>
        <text x="${PL+2}" y="${(parseFloat(fireY)-4).toFixed(0)}" font-size="8" fill="rgba(255,217,61,.8)">FIRE ${INR(fireNeed)}</text>
        <path d="${pathD(conserv)}" fill="none" stroke="rgba(255,107,107,.6)" stroke-width="1.4" stroke-dasharray="5 3"/>
        <path d="${pathD(base)}" fill="none" stroke="#00ffb3" stroke-width="2"/>
        <path d="${pathD(aggr)}" fill="none" stroke="#a78bfa" stroke-width="1.4" stroke-dasharray="5 3"/>
        ${yLabels.map(l=>`<text x="${PL-3}" y="${(l.v+3).toFixed(0)}" text-anchor="end" font-size="7" fill="rgba(255,255,255,.25)">${l.l}</text>`).join('')}
        ${[0,Math.round(yrs/2),yrs].map(y=>`<text x="${xS(y).toFixed(0)}" y="${H-2}" text-anchor="middle" font-size="7" fill="rgba(255,255,255,.25)">${age+y}</text>`).join('')}
        <circle cx="${xS(0)}" cy="${yS(nw)}" r="3.5" fill="#00ffb3" stroke="#0d1117" stroke-width="1.5"/>
        <circle cx="${xS(yrs)}" cy="${yS(base[yrs])}" r="3.5" fill="#ffd93d" stroke="#0d1117" stroke-width="1.5"/>
      </svg>
    </div>
    <div style="display:flex;gap:8px;padding:0 14px 6px;font-size:9px;color:rgba(255,255,255,.4)">
      <span style="display:flex;align-items:center;gap:3px"><span style="width:16px;height:2px;background:#ff6b6b;display:inline-block;border-radius:2px"></span>Conservative 8%</span>
      <span style="display:flex;align-items:center;gap:3px"><span style="width:16px;height:2px;background:#00ffb3;display:inline-block;border-radius:2px"></span>Base 12%</span>
      <span style="display:flex;align-items:center;gap:3px"><span style="width:16px;height:2px;background:#a78bfa;display:inline-block;border-radius:2px"></span>Aggressive 16%</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:0 14px 6px">
      ${[
        {l:'At '+retAge+' (12%)',v:INR(Math.round(base[yrs])),c:'#00ffb3'},
        {l:'FIRE Target',v:INR(fireNeed),c:'#ffd93d'},
        {l:'FIRE Age',v:baseFireAge>0?String(age+baseFireAge):'>'+retAge,c:onTrack?'#00ffb3':'#ff4d6d'},
        {l:'Conservative',v:INR(Math.round(conserv[yrs])),c:'#ff6b6b'}
      ].map(k=>`<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:6px;text-align:center">
        <div style="font-size:10.5px;font-weight:800;color:${k.c}">${k.v}</div>
        <div style="font-size:8.5px;color:rgba(255,255,255,.35);margin-top:1px">${k.l}</div>
      </div>`).join('')}
    </div>
    <button class="asp-view-ask-btn" data-msg="My 3-scenario wealth projection: conservative (8%) corpus ${INR(Math.round(conserv[yrs]))}, base (12%) ${INR(Math.round(base[yrs]))}, aggressive (16%) ${INR(Math.round(aggr[yrs]))} at age ${retAge}. FIRE target ${INR(fireNeed)}, current net worth ${INR(nw)}, SIP ${INR(sip)}/mo. ${onTrack?'I\'m on track — how do I reach the aggressive scenario?':'I have a gap — what SIP increase and expense cuts close it fastest?'}" style="margin:2px 14px 4px;width:calc(100% - 28px)">🤖 Optimise across all scenarios</button>
  </div>`;
}
  /* ══ GOAL CARDS ══════════════════════════════════════════════════════════ */
  function buildGoalCards() {
    const ctx   = window.FINOS_USER_CONTEXT || {};
    const goals = ctx.financial?.goals || getJ('finos_goals', []);
    if (!goals.length) return '';

    const ICONS = { house:'🏠', flat:'🏠', retirement:'🔥', fire:'🔥', car:'🚗', education:'📚',
                    wedding:'💍', emergency:'🛟', travel:'✈️', business:'💼', child:'👶', gold:'🥇', default:'🎯' };
    function icon(g) {
      const n = (g.name || g.type || '').toLowerCase();
      return ICONS[Object.keys(ICONS).find(k => n.includes(k))] || ICONS.default;
    }

    const cards = goals.slice(0, 4).map(g => {
      const saved    = parseFloat(g.saved || g.current || g.progress_amount || 0);
      const target   = parseFloat(g.target || 1);
      const pct      = Math.min(100, Math.round(saved / target * 100)) || parseFloat(g.progress || 0);
      const gap      = Math.max(0, target - saved);
      const months   = parseInt(g.months_left || 36, 10);
      const sipNeed  = months > 0 && gap > 0 ? Math.max(500, Math.round(gap / months / 500) * 500) : 0;
      const pColor   = pct >= 75 ? '#00ffb3' : pct >= 40 ? '#ffb300' : '#ff4d6d';
      const circ = 2 * Math.PI * 16; const dash = (pct / 100) * circ;

      return `<div class="apl-goal-card">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
          <svg width="36" height="36" viewBox="0 0 36 36" style="flex-shrink:0">
            <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="3"/>
            <circle cx="18" cy="18" r="14" fill="none" stroke="${pColor}" stroke-width="3"
              stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-dashoffset="${(circ*.25).toFixed(1)}" stroke-linecap="round"/>
            <text x="18" y="22" text-anchor="middle" font-size="8.5" font-weight="900" fill="${pColor}">${pct}%</text>
          </svg>
          <div style="min-width:0;flex:1">
            <div style="font-size:11.5px;font-weight:800;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${icon(g)} ${g.name || 'Goal'}</div>
            <div style="font-size:9.5px;color:rgba(255,255,255,.38)">${INR(saved)} / ${INR(target)}</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;font-size:10px">
          <div><span style="color:rgba(255,255,255,.32)">Gap </span><span style="color:${gap?'#ffb300':'#00ffb3'};font-weight:700">${gap ? INR(gap) : '✅'}</span></div>
          <div><span style="color:rgba(255,255,255,.32)">Need </span><span style="color:#00d4ff;font-weight:700">${sipNeed ? INR(sipNeed)+'/mo' : '—'}</span></div>
        </div>
        <button class="asp-view-ask-btn" style="margin-top:7px;padding:5px 8px;font-size:10px;width:100%" data-msg="Goal '${g.name}': target ${INR(target)}, saved ${INR(saved)} (${pct}%), ${months} months left, need ${INR(sipNeed)}/mo. Give me a step-by-step plan to hit this goal on time.">🤖 Plan this goal</button>
      </div>`;
    }).join('');

    return `<div class="apl-lab-section asp-fade-in" style="padding:14px 0 4px;border-top:1px solid rgba(255,255,255,.07)">
      <div class="apl-section-title" style="padding:0 14px;margin-bottom:10px">🎯 Active Goals</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 14px">${cards}</div>
    </div>`;
  }

  /* ══ INDIA FINANCIAL CALENDAR ═══════════════════════════════════════ */
  function buildIndiaFinCalendar() {
    const today   = new Date();
    const yr      = today.getFullYear();
    const mo      = today.getMonth(); // 0-indexed
    const fyStart = mo >= 3 ? yr : yr - 1;   // FY starts April
    const fyEnd   = fyStart + 1;

    const d = (y, m, day) => new Date(y, m, day); // m is 0-indexed
    const events = [
      { label:'Advance Tax Q1',     date:d(fyStart,5,15),  icon:'🏛️', type:'tax',    desc:'15% of estimated annual tax due' },
      { label:'Advance Tax Q2',     date:d(fyStart,8,15),  icon:'🏛️', type:'tax',    desc:'45% cumulative — pay the gap' },
      { label:'Advance Tax Q3',     date:d(fyStart,11,15), icon:'🏛️', type:'tax',    desc:'75% cumulative by Dec 15' },
      { label:'ITR Filing',         date:d(fyEnd,6,31),    icon:'📋', type:'filing',  desc:`AY ${fyEnd}-${fyEnd+1} — no-penalty deadline` },
      { label:'Advance Tax Q4',     date:d(fyEnd,2,15),    icon:'🏛️', type:'tax',    desc:'100% tax paid by Mar 15' },
      { label:'80C / ELSS Deadline',date:d(fyEnd,2,31),    icon:'💰', type:'invest',  desc:'Last day for 80C, 80D, NPS deductions' },
      { label:'PPF Annual Deposit', date:d(fyEnd,3,4),     icon:'🏦', type:'invest',  desc:'Deposit before Apr 5 for max interest' },
      { label:'Form 15G / 15H',     date:d(fyStart,3,15),  icon:'📄', type:'filing',  desc:'Submit to bank to avoid TDS deduction' },
    ];

    const upcoming = events
      .filter(e => e.date >= today)
      .sort((a,b) => a.date - b.date)
      .slice(0, 6);

    if (upcoming.length === 0) return '';

    const diffDays = e => Math.ceil((e.date - today) / 86400000);
    const urgColor = d => d <= 14 ? '#ff4d6d' : d <= 30 ? '#ff9f43' : d <= 90 ? '#ffd93d' : '#00ffb3';
    const urgBg    = d => d <= 14 ? 'rgba(255,77,109,.08)' : d <= 30 ? 'rgba(255,159,67,.06)' : d <= 90 ? 'rgba(255,217,61,.05)' : 'rgba(0,255,179,.05)';
    const fmtDate  = d => d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
    const income   = parseFloat(get('finos_monthly_income','0')) || 0;
    const inv80C   = parseFloat(get('finos_80c_invested','0')) || 0;

    // Which events are "action needed" for this user
    const actionNeeded = (ev) => {
      if (ev.type === 'invest' && inv80C < 150000 && income > 0) return true;
      if (ev.type === 'tax' && income > 800000) return true; // likely needs advance tax
      return false;
    };

    return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px 0 10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:10px">
        <div class="apl-section-title" style="margin:0">🗓️ India Finance Calendar</div>
        <div style="font-size:9px;background:rgba(255,217,61,.1);border:1px solid rgba(255,217,61,.25);border-radius:20px;padding:2px 8px;color:#ffd93d">FY ${fyStart}-${String(fyEnd).slice(-2)}</div>
      </div>
      <div style="padding:0 14px;display:flex;flex-direction:column;gap:6px">
        ${upcoming.map(ev => {
          const days = diffDays(ev);
          const clr  = urgColor(days);
          const bg   = urgBg(days);
          const act  = actionNeeded(ev);
          return `<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;background:${bg};border:1px solid ${clr}22;border-radius:9px;${act?'border-left:3px solid '+clr+';border-radius:0 9px 9px 0':''}">
            <div style="font-size:18px;flex-shrink:0">${ev.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:10px;font-weight:800;color:rgba(255,255,255,.82)">${ev.label}</span>
                <span style="font-size:9px;font-weight:800;color:${clr};flex-shrink:0;margin-left:6px">${days === 0 ? 'TODAY' : days === 1 ? 'Tomorrow' : days + 'd'}</span>
              </div>
              <div style="font-size:8.5px;color:rgba(255,255,255,.35);margin-top:1px">${fmtDate(ev.date)} · ${ev.desc}</div>
            </div>
            ${act ? `<div style="font-size:8px;color:${clr};background:${clr}18;border-radius:4px;padding:2px 5px;flex-shrink:0;white-space:nowrap">Action needed</div>` : ''}
          </div>`;
        }).join('')}
      </div>
      <button class="asp-view-ask-btn" data-msg="Today is ${today.toLocaleDateString('en-IN')}. FY ${fyStart}-${String(fyEnd).slice(-2)}. My income is ₹${(income*12/100000).toFixed(1)}L/yr, 80C invested: ₹${Math.round(inv80C/1000)}K. Give me a month-by-month financial action plan for the rest of the year covering advance tax, 80C investments, ITR filing, and SIP top-ups." style="margin:10px 14px 4px;width:calc(100% - 28px)">🗓️ Build my FY action plan</button>
    </div>`;
  }

  /* ══ PORTFOLIO STRESS TEST ═══════════════════════════════════════════ */
  function buildPortfolioStressTest() {
    const nw    = parseFloat(get('finos_net_worth','0')) || 0;
    if (!nw) return '';
    const mfVal = parseFloat(get('finos_mf_portfolio_value','0')) || 0;
    const sip   = parseFloat(get('finos_sip_monthly','0')) || parseFloat(get('finos_sip','0')) || 0;
    // Estimate equity % — if MF data exists use that ratio, else assume age-based
    const age   = parseInt(get('finos_age','30'),10) || 30;
    const eqPct = mfVal > 0 ? Math.min(0.85, mfVal/nw) : Math.max(0.30, Math.min(0.80, 1 - age/100));
    const eqAmt = nw * eqPct;
    const debtAmt = nw - eqAmt;

    const scenarios = [
      { label:'2008 GFC',       drop:-0.52, recovery:'3 yr',      icon:'💥', color:'#ff4d6d', note:'Nifty fell 65% peak-to-trough' },
      { label:'2020 COVID',     drop:-0.38, recovery:'8 mo',      icon:'🦠', color:'#ff9f43', note:'Fastest crash in history, fastest recovery' },
      { label:'2022 Correction',drop:-0.18, recovery:'5 mo',      icon:'📉', color:'#ffd93d', note:'Rate hike cycle pressure' },
      { label:'Mild Pullback',  drop:-0.10, recovery:'2-3 mo',    icon:'🌊', color:'#a78bfa', note:'Typical intra-year correction' },
    ];

    const minNW = Math.min(...scenarios.map(s => nw + eqAmt * s.drop));

    return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px 0 10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:6px">
        <div class="apl-section-title" style="margin:0">🔥 Portfolio Stress Test</div>
        <div style="font-size:9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:2px 8px;color:rgba(255,255,255,.5)">${Math.round(eqPct*100)}% equity</div>
      </div>
      <div style="padding:4px 14px 0;font-size:9px;color:rgba(255,255,255,.3);margin-bottom:10px">How would ₹${(nw/100000).toFixed(1)}L NW hold up in historical crashes?</div>
      <div style="padding:0 14px;display:flex;flex-direction:column;gap:8px">
        ${scenarios.map(s => {
          const impact  = eqAmt * s.drop;
          const after   = nw + impact;
          const barW    = Math.round(after / nw * 100);
          const bgBarW  = 100;
          return `<div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:14px">${s.icon}</span>
                <div>
                  <div style="font-size:10px;font-weight:800;color:rgba(255,255,255,.82)">${s.label}</div>
                  <div style="font-size:8px;color:rgba(255,255,255,.3)">${s.note}</div>
                </div>
              </div>
              <div style="text-align:right;flex-shrink:0;margin-left:8px">
                <div style="font-size:11px;font-weight:800;color:${s.color}">${INR(Math.round(after))}</div>
                <div style="font-size:8.5px;color:rgba(255,255,255,.3)">↓${Math.round(-s.drop*eqPct*100)}% NW · recovers ${s.recovery}</div>
              </div>
            </div>
            <div style="height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${barW}%;background:linear-gradient(90deg,${s.color},${s.color}99);border-radius:3px;transition:width 1.1s ease"></div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div style="margin:12px 14px 0;padding:8px 10px;background:rgba(0,212,255,.05);border:1px solid rgba(0,212,255,.15);border-radius:9px;font-size:9.5px;color:rgba(255,255,255,.45)">
        💡 Your SIP of ${sip > 0 ? INR(sip)+'/mo' : '₹0/mo'} would ${sip > 0 ? 'automatically buy more units during a crash — market dips are SIP opportunities' : 'miss the opportunity to buy at crash prices — consider starting a SIP'}.
      </div>
      <button class="asp-view-ask-btn" data-msg="My net worth is ₹${(nw/100000).toFixed(1)}L with ~${Math.round(eqPct*100)}% in equity. If a 2008-style crash hit, my equity would drop ~${Math.round(eqPct*52)}%. How should I position my portfolio to survive AND thrive in a market crash? What % should be in gold, debt, and equity for my risk profile?" style="margin:10px 14px 4px;width:calc(100% - 28px)">🔥 How do I crash-proof my portfolio?</button>
    </div>`;
  }

  /* ══ COST OF DELAY RACE ═════════════════════════════════════════════ */
  function buildCompoundRace() {
    const sip    = parseFloat(get('finos_sip_monthly','0')) || parseFloat(get('finos_sip','0')) || 0;
    const nw     = parseFloat(get('finos_net_worth','0')) || 0;
    const age    = parseInt(get('finos_age','30'),10) || 30;
    const income = parseFloat(get('finos_monthly_income','0')) || 0;
    const retAge = 60;
    const yrs    = Math.max(5, retAge - age);
    const r      = 0.12 / 12; // 12% CAGR monthly

    // Use actual SIP or estimate 10% of income
    const monthlySIP = sip > 0 ? sip : (income > 0 ? Math.round(income * 0.10) : 5000);

    // Corpus formula: SIP * [(1+r)^n - 1] / r * (1+r)  +  NW * (1+0.12)^years
    const corpus = (n) => {
      const months = n * 12;
      const sipCorpus = monthlySIP * (Math.pow(1+r, months) - 1) / r * (1 + r);
      const nwGrowth  = nw * Math.pow(1.12, n);
      return Math.round(sipCorpus + nwGrowth);
    };

    const base   = corpus(yrs);
    const delay1 = corpus(yrs - 1);
    const delay3 = corpus(yrs - 3);
    const delay5 = corpus(Math.max(2, yrs - 5));

    const cost1  = base - delay1;
    const cost3  = base - delay3;
    const cost5  = base - delay5;

    const pct = (v) => Math.round(v / base * 100);

    const scenarios = [
      { label:`Start TODAY`,        corpus:base,   bar:100,      color:'#00ffb3', cost:0,     delay:'Now' },
      { label:`Wait 1 year`,        corpus:delay1, bar:pct(delay1), color:'#ffd93d', cost:cost1, delay:'+1 yr' },
      { label:`Wait 3 years`,       corpus:delay3, bar:pct(delay3), color:'#ff9f43', cost:cost3, delay:'+3 yr' },
      { label:`Wait 5 years`,       corpus:delay5, bar:pct(delay5), color:'#ff4d6d', cost:cost5, delay:'+5 yr' },
    ];

    const INRcr = (v) => v >= 10000000 ? `₹${(v/10000000).toFixed(2)} Cr` : v >= 100000 ? `₹${(v/100000).toFixed(1)}L` : `₹${Math.round(v/1000)}K`;

    return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px 0 10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:6px">
        <div class="apl-section-title" style="margin:0">⏱️ Cost of Delay</div>
        <div style="font-size:9px;background:rgba(0,255,179,.1);border:1px solid rgba(0,255,179,.25);border-radius:20px;padding:2px 8px;color:#00ffb3">${INR(monthlySIP)}/mo · ${yrs}yr horizon</div>
      </div>
      <div style="padding:4px 14px 0;font-size:9px;color:rgba(255,255,255,.3);margin-bottom:12px">Retirement corpus at ${retAge} — what each year of delay costs you</div>
      <div style="padding:0 14px;display:flex;flex-direction:column;gap:10px">
        ${scenarios.map(s => `<div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:10.5px;font-weight:800;color:${s.color}">${s.label}</span>
              ${s.cost > 0 ? `<span style="font-size:9px;color:rgba(255,77,109,.8);background:rgba(255,77,109,.08);border-radius:4px;padding:1px 5px">−${INRcr(s.cost)}</span>` : `<span style="font-size:9px;color:#00ffb3;background:rgba(0,255,179,.08);border-radius:4px;padding:1px 5px">✓ Best</span>`}
            </div>
            <span style="font-size:12px;font-weight:900;color:${s.color}">${INRcr(s.corpus)}</span>
          </div>
          <div style="height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${s.bar}%;background:linear-gradient(90deg,${s.color},${s.color}88);border-radius:3px;transition:width 1.2s ease"></div>
          </div>
        </div>`).join('')}
      </div>
      <div style="margin:12px 14px 0;padding:9px 11px;background:rgba(255,77,109,.06);border:1px solid rgba(255,77,109,.18);border-radius:9px;font-size:9.5px;color:rgba(255,255,255,.5);line-height:1.5">
        ⚡ Waiting <strong style="color:#ff4d6d">5 years</strong> costs you <strong style="color:#ff4d6d">${INRcr(cost5)}</strong> — more than ${Math.round(cost5/monthlySIP/12)} years of your current SIP, lost forever.
      </div>
      <button class="asp-view-ask-btn" data-msg="I am ${age} years old, SIP ₹${INR(monthlySIP)}/mo, net worth ₹${INR(nw)}, targeting retirement at ${retAge}. Starting today gives ₹${INRcr(base)} corpus. Waiting 5 years costs ₹${INRcr(cost5)}. How can I accelerate to reach a higher corpus — what are 3 specific investment moves I can make this month?" style="margin:10px 14px 4px;width:calc(100% - 28px)">⏱️ Accelerate my corpus growth</button>
    </div>`;
  }

  /* ══ SAVINGS RATE METER ══════════════════════════════════════════════ */
  function buildSavingsRateMeter() {
    const income  = parseFloat(get('finos_monthly_income','0')) || parseFloat(get('finos_income','0')) || 0;
    const expense = parseFloat(get('finos_monthly_expenses','0')) || parseFloat(get('finos_expense_total','0')) || 0;
    if (!income) return '';

    const surplus  = Math.max(0, income - expense);
    const rate     = Math.round(surplus / income * 100);
    const sip      = parseFloat(get('finos_sip_monthly','0')) || parseFloat(get('finos_sip','0')) || 0;
    const sipRate  = income > 0 ? Math.round(sip / income * 100) : 0;

    const tiers = [
      { label:'Surviving',    range:'0–5%',   max:5,  color:'#ff4d6d', desc:'Month-to-month, no buffer' },
      { label:'Stabilising',  range:'5–15%',  max:15, color:'#ff9f43', desc:'Some breathing room' },
      { label:'Building',     range:'15–25%', max:25, color:'#ffd93d', desc:'Solid wealth-building pace' },
      { label:'Accelerating', range:'25–40%', max:40, color:'#00ffb3', desc:'Ahead of 95% of earners' },
      { label:'FIRE Track',   range:'40%+',   max:100,color:'#00d4ff', desc:'Financial independence path' },
    ];

    const currentTier = tiers.find((t,i) => rate < t.max || i === tiers.length-1) || tiers[4];
    const tierIdx     = tiers.indexOf(currentTier);

    // SVG horizontal meter — 5 colored segments
    const SEG_W = 60, GAP = 2, H = 18;
    const totalW = tiers.length * SEG_W + (tiers.length - 1) * GAP;
    const segs = tiers.map((t,i) => {
      const x = i * (SEG_W + GAP);
      const isActive = i === tierIdx;
      return `<rect x="${x}" y="${isActive?1:3}" width="${SEG_W}" height="${isActive?H-2:H-6}" rx="3" fill="${t.color}" opacity="${isActive?1:0.25}"/>
        <text x="${x+SEG_W/2}" y="${H-3}" text-anchor="middle" font-size="7" font-weight="800" fill="${isActive?'#0d1117':'rgba(255,255,255,.4)'}">${t.label}</text>`;
    }).join('');

    // Needle position
    const cappedRate = Math.min(rate, 60);
    const needleX = Math.round(cappedRate / 60 * totalW);

    // Peer comparison data (Indian context)
    const peers = [
      { group:'Urban avg',     rate:9,  color:'rgba(255,255,255,.3)' },
      { group:'50/30/20 rule', rate:20, color:'rgba(0,212,255,.6)' },
      { group:'FIRE target',   rate:40, color:'rgba(0,255,179,.6)' },
    ];

    return `<div class="apl-lab-section asp-fade-in" style="border-top:1px solid rgba(255,255,255,.07);padding:14px 0 10px">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:10px">
        <div class="apl-section-title" style="margin:0">💹 Savings Rate Meter</div>
        <div style="font-size:9px;background:rgba(255,255,255,.05);border:1px solid ${currentTier.color}55;border-radius:20px;padding:2px 9px;color:${currentTier.color};font-weight:800">${rate}% · ${currentTier.label}</div>
      </div>
      <div style="padding:0 14px">
        <svg viewBox="0 0 ${totalW} ${H+8}" style="width:100%;height:32px;overflow:visible">
          ${segs}
          <!-- Needle / current position -->
          <line x1="${needleX}" y1="-2" x2="${needleX}" y2="${H+2}" stroke="white" stroke-width="2" stroke-linecap="round"/>
          <circle cx="${needleX}" cy="-4" r="4" fill="${currentTier.color}" stroke="#0d1117" stroke-width="1.5"/>
          <text x="${needleX}" y="${H+9}" text-anchor="middle" font-size="8" font-weight="900" fill="${currentTier.color}">${rate}%</text>
        </svg>
      </div>
      <div style="padding:10px 14px 0;font-size:9.5px;color:rgba(255,255,255,.45);line-height:1.5">${currentTier.desc}</div>
      <div style="margin:10px 14px 0;display:grid;grid-template-columns:repeat(3,1fr);gap:6px">
        ${peers.map(p => {
          const ahead = rate > p.rate;
          return `<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:6px 8px;text-align:center">
            <div style="font-size:10px;font-weight:800;color:${ahead?'#00ffb3':'rgba(255,255,255,.4)'}">You ${ahead?'beat':'trail'}</div>
            <div style="font-size:8.5px;color:rgba(255,255,255,.3);margin-top:1px">${p.group} (${p.rate}%)</div>
          </div>`;
        }).join('')}
      </div>
      ${sip > 0 ? `<div style="margin:8px 14px 0;padding:7px 10px;background:rgba(123,47,247,.06);border:1px solid rgba(123,47,247,.15);border-radius:8px;font-size:9.5px;color:rgba(255,255,255,.45)">
        📈 Of your ${rate}% savings, ${sipRate}% is actively invested via SIP (${INR(sip)}/mo). The remaining ${Math.max(0,rate-sipRate)}% is in cash/savings account.
      </div>` : ''}
      <button class="asp-view-ask-btn" data-msg="My monthly savings rate is ${rate}% (₹${INR(surplus)}/mo surplus out of ₹${INR(income)} income). SIP: ₹${INR(sip)}/mo. I am in the '${currentTier.label}' tier. Give me 3 specific, actionable ways to push my savings rate to the next tier (${tiers[Math.min(tierIdx+1,4)].label}) without drastically cutting lifestyle." style="margin:10px 14px 4px;width:calc(100% - 28px)">💹 Level up my savings rate</button>
    </div>`;
  }

  /* ══ TAX DASHBOARD ═══════════════════════════════════════════════════════ */
  function buildTaxDashboard() {
    const inc   = parseFloat(get('finos_income', '0')) || 0;
    if (!inc) return '';
    const sip   = parseFloat(get('finos_sip', '0')) || 0;
    const ctx   = window.FINOS_USER_CONTEXT || {};
    const tax   = ctx.financial?.tax || {};

    const inv80C  = Math.min(parseFloat(tax.invested_80c || 0) || Math.min(sip * 12 * 0.5, 100000), 150000);
    const nps80C  = Math.min(parseFloat(tax.nps || 0) || 0, 50000);
    const hi80D   = Math.min(parseFloat(tax.health_ins || 0) || 0, 25000);

    const rem80C  = Math.max(0, 150000 - inv80C);
    const remNPS  = Math.max(0, 50000  - nps80C);
    const remHI   = Math.max(0, 25000  - hi80D);

    const saved   = Math.round((inv80C + nps80C + hi80D) * 0.3);
    const potential = Math.round((rem80C + remNPS + remHI) * 0.3);

    const now = new Date();
    const mar31 = new Date(now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear(), 2, 31);
    const daysLeft = Math.max(0, Math.round((mar31 - now) / 86400000));
    const urgency  = daysLeft < 30 ? '#ff4d6d' : daysLeft < 90 ? '#ffb300' : '#00d4ff';

    function bar(label, used, limit, color) {
      const pct = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : 0;
      return `<div style="margin-bottom:9px">
        <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px">
          <span style="color:rgba(255,255,255,.55)">${label}</span>
          <span style="color:${color};font-weight:700">${INR(used)} <span style="color:rgba(255,255,255,.28)">/ ${INR(limit)}</span></span>
        </div>
        <div style="height:4px;background:rgba(255,255,255,.07);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:2px;transition:width .7s ease"></div>
        </div>
      </div>`;
    }

    return `<div class="apl-lab-section asp-fade-in" style="padding:14px 0 4px;border-top:1px solid rgba(255,255,255,.07)">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0 14px;margin-bottom:12px">
        <div class="apl-section-title" style="margin:0">🏛️ Tax Dashboard</div>
        <div style="font-size:10px;padding:3px 8px;background:rgba(${daysLeft<30?'255,77,109':'255,179,0'},.08);border:1px solid rgba(${daysLeft<30?'255,77,109':'255,179,0'},.3);border-radius:20px;color:${urgency}">${daysLeft}d to Mar 31</div>
      </div>
      <div style="padding:0 14px">
        ${bar('80C — ELSS / PPF / Life premium', inv80C, 150000, '#00ffb3')}
        ${bar('80CCD(1B) — NPS additional', nps80C, 50000, '#00d4ff')}
        ${bar('80D — Health insurance', hi80D, 25000, '#a855f7')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:0 14px;margin-top:6px">
        <div style="background:rgba(0,255,179,.06);border:1px solid rgba(0,255,179,.15);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:13px;font-weight:800;color:#00ffb3">${INR(saved)}</div>
          <div style="font-size:9px;color:rgba(255,255,255,.38);margin-top:2px">Tax saved this FY</div>
        </div>
        <div style="background:rgba(255,179,0,.06);border:1px solid rgba(255,179,0,.15);border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:13px;font-weight:800;color:#ffb300">${INR(potential)}</div>
          <div style="font-size:9px;color:rgba(255,255,255,.38);margin-top:2px">Still saveable</div>
        </div>
      </div>
      ${rem80C > 0 ? `<div style="margin:8px 14px 0;padding:7px 10px;background:rgba(255,179,0,.05);border-radius:7px;border-left:3px solid #ffb300;font-size:11px;color:rgba(255,255,255,.62)">💡 Invest ${INR(rem80C)} more in ELSS before Mar 31 → save ${INR(Math.round(rem80C * .3))} in taxes.</div>` : ''}
      <button class="asp-view-ask-btn" data-msg="My tax snapshot: 80C ${INR(inv80C)}/${INR(150000)}, NPS ${INR(nps80C)}/₹50K, health insurance ${INR(hi80D)}/₹25K. Tax saved: ${INR(saved)}. Still can save: ${INR(potential)}. ${daysLeft} days to March 31. Maximise my deductions — what should I invest/buy in the remaining time?" style="margin:10px 14px 4px;width:calc(100% - 28px)">🤖 Maximise my tax savings</button>
    </div>`;
  }

  /* ══ DEBT FREEDOM PLANNER ════════════════════════════════════════════════ */
  function buildDebtFreedomPlanner() {
    const debt = parseFloat(get('finos_debt', '0')) || 0;
    const inc  = parseFloat(get('finos_income', '0')) || 0;
    const exp  = parseFloat(get('finos_expenses', '0')) || 0;
    if (debt <= 0 || !inc) return '';

    const monthRate = 0.14 / 12;
    const minPay    = Math.max(5000, Math.round(debt * 0.02 / 500) * 500);
    const surplus   = Math.max(0, inc - exp);
    const extraPay  = Math.max(0, Math.min(surplus * 0.3, debt * 0.05));

    function moToFree(P, r, pmt) {
      if (pmt <= P * r) return Infinity;
      return Math.ceil(-Math.log(1 - P * r / pmt) / Math.log(1 + r));
    }
    const moMin  = moToFree(debt, monthRate, minPay);
    const moAccel = extraPay > 0 ? moToFree(debt, monthRate, minPay + extraPay) : moMin;
    const fmtMo = m => m === Infinity ? '∞' : m < 12 ? `${m}mo` : `${(m/12).toFixed(1)}yr`;
    const intMin  = moMin   === Infinity ? 0 : minPay * moMin - debt;
    const intAccel = moAccel === Infinity ? 0 : (minPay + extraPay) * moAccel - debt;
    const saved   = Math.max(0, intMin - intAccel);
    const moSaved = Math.max(0, moMin - moAccel);

    return `<div class="apl-lab-section asp-fade-in" style="padding:14px 0 4px;border-top:1px solid rgba(255,255,255,.07)">
      <div class="apl-section-title" style="padding:0 14px;margin-bottom:10px">⛓️ Debt Freedom Planner</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 14px">
        <div style="background:rgba(255,255,255,.04);border-radius:9px;padding:10px;text-align:center">
          <div style="font-size:10px;color:rgba(255,255,255,.38);margin-bottom:4px">Min payments only</div>
          <div style="font-size:14px;font-weight:800;color:#ff7c43">${fmtMo(moMin)}</div>
          <div style="font-size:9px;color:rgba(255,255,255,.3);margin-top:3px">Interest: ${INR(Math.round(intMin))}</div>
        </div>
        <div style="background:rgba(0,255,179,.05);border:1px solid rgba(0,255,179,.18);border-radius:9px;padding:10px;text-align:center">
          <div style="font-size:10px;color:rgba(255,255,255,.38);margin-bottom:4px">+${INR(extraPay)}/mo extra</div>
          <div style="font-size:14px;font-weight:800;color:#00ffb3">${fmtMo(moAccel)}</div>
          <div style="font-size:9px;color:rgba(255,255,255,.3);margin-top:3px">Save ${INR(Math.round(saved))}</div>
        </div>
      </div>
      ${moSaved > 0 ? `<div style="margin:8px 14px 0;padding:8px 10px;background:rgba(0,255,179,.04);border-radius:8px;border-left:3px solid #00ffb3;font-size:11px;color:rgba(255,255,255,.62)">🚀 ${moSaved} months faster + ${INR(Math.round(saved))} interest saved — money redirected to investments!</div>` : ''}
      <button class="asp-view-ask-btn" data-msg="I have ${INR(debt)} in total debt. Min payment ${INR(minPay)}/mo takes ${fmtMo(moMin)} and costs ${INR(Math.round(intMin))} interest. I can add ${INR(extraPay)}/mo extra. My income is ${INR(inc)}/mo. Build me an avalanche payoff strategy — which debt to clear first, timeline, and when I start investing more." style="margin:10px 14px 4px;width:calc(100% - 28px)">🤖 Build my payoff strategy</button>
    </div>`;
  }

  /* ══ WEALTH VELOCITY SPEEDOMETER ════════════════════════════════════════ */
  function buildWealthVelocity() {
    const nwHistory = getJ('finos_nw_history', {});
    const nw = parseFloat(get('finos_net_worth', '0')) || 0;
    const sip = parseFloat(get('finos_sip_monthly', '0')) || 0;

    let dailyRate = 0, trend = 'stable';
    const entries = Object.entries(nwHistory).sort((a, b) => a[0].localeCompare(b[0]));
    if (entries.length >= 2) {
      const first = entries[0], last = entries[entries.length - 1];
      const days = Math.max(1, (new Date(last[0]) - new Date(first[0])) / 86400000);
      dailyRate = (parseFloat(last[1]) - parseFloat(first[1])) / days;
      if (entries.length >= 4) {
        const mid = Math.floor(entries.length / 2);
        const d1 = Math.max(1, (new Date(entries[mid][0]) - new Date(entries[0][0])) / 86400000);
        const d2 = Math.max(1, (new Date(entries[entries.length-1][0]) - new Date(entries[mid][0])) / 86400000);
        const firstHalf = (parseFloat(entries[mid][1]) - parseFloat(entries[0][1])) / d1;
        const secondHalf = (parseFloat(entries[entries.length-1][1]) - parseFloat(entries[mid][1])) / d2;
        trend = secondHalf > firstHalf + 200 ? 'accelerating' : secondHalf < firstHalf - 200 ? 'slowing' : 'stable';
      }
    } else {
      dailyRate = Math.max(0, (sip + nw * 0.01) / 30);
      trend = 'estimated';
    }

    const monthlyRate = Math.round(dailyRate * 30);
    const annualRate = Math.round(dailyRate * 365);

    let zone, zoneColor, percentile;
    if (monthlyRate >= 500000)      { zone = 'Ultra HNI';     zoneColor = '#00ffd0'; percentile = 'Top 0.1%'; }
    else if (monthlyRate >= 100000) { zone = 'Hypergrowth';   zoneColor = '#4ade80'; percentile = 'Top 1%'; }
    else if (monthlyRate >= 30000)  { zone = 'High Velocity'; zoneColor = '#86efac'; percentile = 'Top 10%'; }
    else if (monthlyRate >= 10000)  { zone = 'Good Velocity'; zoneColor = '#fcd34d'; percentile = 'Top 25%'; }
    else if (monthlyRate >= 3000)   { zone = 'Steady Build';  zoneColor = '#fb923c'; percentile = 'Top 50%'; }
    else                            { zone = 'Building Up';   zoneColor = '#f87171'; percentile = ''; }

    const cx = 100, cy = 88, r = 66;
    const pct = Math.min(1, Math.max(0, monthlyRate / 200000));
    const needleAngle = (1 - pct) * 180;
    const rad = needleAngle * Math.PI / 180;
    const nx = (cx + (r - 12) * Math.cos(rad)).toFixed(1);
    const ny = (cy - (r - 12) * Math.sin(rad)).toFixed(1);
    const arcLen = Math.PI * r;
    const seg = arcLen / 4;
    const arcPath = `M ${cx-r},${cy} A ${r},${r} 0 0,0 ${cx+r},${cy}`;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map(p => {
      const a = (1 - p) * 180 * Math.PI / 180;
      const x1 = (cx + (r + 3) * Math.cos(a)).toFixed(1);
      const y1 = (cy - (r + 3) * Math.sin(a)).toFixed(1);
      const x2 = (cx + (r + 10) * Math.cos(a)).toFixed(1);
      const y2 = (cy - (r + 10) * Math.sin(a)).toFixed(1);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,.18)" stroke-width="1.5"/>`;
    }).join('');

    const trendLabel = trend === 'accelerating' ? '↑ Accelerating' : trend === 'slowing' ? '↓ Slowing' : trend === 'estimated' ? '~ Estimated' : '→ Stable';
    const trendColor = trend === 'accelerating' ? '#4ade80' : trend === 'slowing' ? '#f87171' : '#fcd34d';

    return `<div class="apl-lab-section">
      <div class="apl-section-title">⚡ Wealth Velocity</div>
      <div style="display:flex;align-items:flex-start;gap:8px">
        <div style="flex:0 0 200px">
          <svg viewBox="0 0 200 102" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">
            <path d="${arcPath}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="14"/>
            <path d="${arcPath}" fill="none" stroke="#ef4444" stroke-width="13"
              stroke-dasharray="${seg.toFixed(1)} ${(arcLen-seg).toFixed(1)}" stroke-dashoffset="0"/>
            <path d="${arcPath}" fill="none" stroke="#f97316" stroke-width="13"
              stroke-dasharray="${seg.toFixed(1)} ${(arcLen-seg).toFixed(1)}" stroke-dashoffset="${(-seg).toFixed(1)}"/>
            <path d="${arcPath}" fill="none" stroke="#eab308" stroke-width="13"
              stroke-dasharray="${seg.toFixed(1)} ${(arcLen-seg).toFixed(1)}" stroke-dashoffset="${(-seg*2).toFixed(1)}"/>
            <path d="${arcPath}" fill="none" stroke="#22c55e" stroke-width="13"
              stroke-dasharray="${seg.toFixed(1)} ${(arcLen-seg).toFixed(1)}" stroke-dashoffset="${(-seg*3).toFixed(1)}"/>
            ${ticks}
            <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${zoneColor}" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="${cx}" cy="${cy}" r="4.5" fill="${zoneColor}" stroke="rgba(0,0,0,.6)" stroke-width="1"/>
            <text x="${cx-r+6}" y="${cy+16}" font-size="8" fill="rgba(255,255,255,.3)">Slow</text>
            <text x="${cx+r-6}" y="${cy+16}" text-anchor="end" font-size="8" fill="rgba(255,255,255,.3)">Fast</text>
          </svg>
        </div>
        <div style="flex:1;padding-top:6px;display:flex;flex-direction:column;gap:5px">
          <div>
            <div style="font-size:21px;font-weight:700;color:${zoneColor}">${INR(monthlyRate)}</div>
            <div style="font-size:10px;color:rgba(255,255,255,.35)">net worth / month</div>
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,.45)">Daily: <b style="color:rgba(255,255,255,.8)">${INR(dailyRate)}</b></div>
          <div style="font-size:11px;color:rgba(255,255,255,.45)">Yearly: <b style="color:rgba(255,255,255,.8)">${INR(annualRate)}</b></div>
          <div style="background:${zoneColor}22;border:1px solid ${zoneColor}44;border-radius:5px;padding:3px 7px;font-size:10px;color:${zoneColor};font-weight:600">${zone}</div>
          ${percentile ? `<div style="font-size:10px;color:rgba(255,255,255,.35)">${percentile} of India</div>` : ''}
          <div style="font-size:10px;color:${trendColor}">${trendLabel}</div>
        </div>
      </div>
    </div>`;
  }

  /* ══ GOAL PROBABILITY MATRIX ═════════════════════════════════════════════ */
  function buildGoalProbabilityMatrix() {
    const goals = getJ('finos_goals', []);
    if (!goals.length) {
      return `<div class="apl-lab-section">
        <div class="apl-section-title">🎯 Goal Probability Matrix</div>
        <div style="text-align:center;padding:18px 0;color:rgba(255,255,255,.35);font-size:12px">
          No goals set — <a href="../html/goals.html" style="color:#38bdf8;text-decoration:none">add goals →</a>
        </div>
      </div>`;
    }

    const sip = parseFloat(get('finos_sip_monthly', '0')) || 0;
    const totalTarget = goals.reduce((s, g) => s + parseFloat(g.target || g.amount || g.targetAmount || 0), 0);
    const r12 = 0.01;

    const goalData = goals.slice(0, 6).map(g => {
      const target = parseFloat(g.target || g.amount || g.targetAmount || 0);
      const saved  = parseFloat(g.saved || g.current || g.invested || g.currentAmount || 0);
      const name   = (g.name || g.title || 'Goal').substring(0, 18);
      const emoji  = g.emoji || '🎯';

      let monthsLeft = 60;
      const dlStr = g.deadline || g.date || g.targetDate || g.by;
      if (dlStr) {
        monthsLeft = Math.max(1, (new Date(dlStr) - new Date()) / (30 * 24 * 3600 * 1000));
      } else if (g.years) {
        monthsLeft = parseFloat(g.years) * 12;
      }

      const sipAlloc = totalTarget > 0 ? sip * (target / totalTarget) : sip / goals.length;
      const projected = saved * Math.pow(1 + r12, monthsLeft)
                      + (sipAlloc > 0 ? sipAlloc * (Math.pow(1 + r12, monthsLeft) - 1) / r12 : 0);

      const prob = target <= 0 ? 100 : saved >= target ? 100 : Math.min(95, Math.round((projected / target) * 100));
      const color = prob >= 80 ? '#22c55e' : prob >= 60 ? '#86efac' : prob >= 40 ? '#eab308' : prob >= 20 ? '#f97316' : '#ef4444';
      const label = prob >= 80 ? 'On Track' : prob >= 60 ? 'Likely' : prob >= 40 ? 'At Risk' : 'Critical';

      const circ = 2 * Math.PI * 22;
      const filled = (prob / 100) * circ;
      const gap = circ - filled;

      const ring = `<svg width="58" height="58" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
        <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="5"/>
        <circle cx="30" cy="30" r="22" fill="none" stroke="${color}" stroke-width="5"
          stroke-dasharray="${filled.toFixed(1)} ${gap.toFixed(1)}" stroke-linecap="round"
          transform="rotate(-90 30 30)"/>
        <text x="30" y="34" text-anchor="middle" font-size="11" font-weight="700" fill="${color}">${prob}%</text>
      </svg>`;

      return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:72px;max-width:80px">
        ${ring}
        <div style="font-size:10px;color:rgba(255,255,255,.7);text-align:center;width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${emoji} ${name}</div>
        <div style="font-size:9px;color:${color};font-weight:600">${label}</div>
      </div>`;
    });

    const onTrack = goalData.length;
    const onTrackCount = goals.slice(0, 6).filter((g, i) => {
      const target = parseFloat(g.target || g.amount || g.targetAmount || 0);
      const saved  = parseFloat(g.saved || g.current || g.invested || g.currentAmount || 0);
      if (saved >= target) return true;
      const dlStr = g.deadline || g.date || g.targetDate || g.by;
      let monthsLeft = 60;
      if (dlStr) monthsLeft = Math.max(1, (new Date(dlStr) - new Date()) / (30 * 24 * 3600 * 1000));
      const sipAlloc = totalTarget > 0 ? sip * (target / totalTarget) : sip / goals.length;
      const projected = saved * Math.pow(1.01, monthsLeft) + (sipAlloc > 0 ? sipAlloc * (Math.pow(1.01, monthsLeft) - 1) / 0.01 : 0);
      return target <= 0 || (projected / target) >= 0.8;
    }).length;

    const trackColor = onTrackCount >= Math.ceil(onTrack * 0.7) ? '#22c55e' : '#f97316';

    return `<div class="apl-lab-section">
      <div class="apl-section-title">🎯 Goal Probability Matrix</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="font-size:11px;color:rgba(255,255,255,.4)">Likelihood of hitting each goal at 12% pa</div>
        <div style="font-size:12px;font-weight:700;color:${trackColor}">${onTrackCount}/${Math.min(goals.length, 6)} on track</div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">${goalData.join('')}</div>
    </div>`;
  }

  /* ══ MARKET NEWS WIDGET ══════════════════════════════════════════════════ */
  function buildNewsWidget() {
    return `<div class="apl-lab-section asp-fade-in" style="padding:14px 0 4px;border-top:1px solid rgba(255,255,255,.07)">
      <div class="apl-section-title" style="padding:0 14px;margin-bottom:8px">📰 Market Pulse</div>
      <div id="arya-news-container" style="padding:0 14px">
        <div class="asp-rm-loading" style="min-height:60px;padding:16px 0"><div class="asp-rm-spinner" style="width:22px;height:22px;border-width:2px"></div></div>
      </div>
    </div>`;
  }

  async function wireNewsWidget() {
    const box = document.getElementById('arya-news-container');
    if (!box) return;
    const lines = await fetchMacroNews();
    if (!lines) {
      box.innerHTML = `<div style="text-align:center;padding:10px;font-size:11px;color:rgba(255,255,255,.25)">News unavailable — start app.py to enable</div>`;
      return;
    }
    const items = lines.split('\n').filter(l => l.startsWith('•')).slice(0, 4);
    if (!items.length) { box.innerHTML = ''; return; }
    box.innerHTML = items.map(item => {
      const text = item.slice(2).trim();
      return `<div class="apl-news-card">
        <div class="apl-news-text">${text}</div>
        <button class="asp-view-ask-btn" style="margin-top:5px;padding:4px 8px;font-size:10px;width:auto" data-msg="Explain this news and how it affects my Indian investments: ${text}">Ask Arya →</button>
      </div>`;
    }).join('');
    wireAskBtnInEl(box);
  }

  /* ══ COMMAND SHORTCUT SYSTEM ═════════════════════════════════════════════ */
  function processCommand(text) {
    const parts  = text.trim().split(/\s+/);
    const cmd    = parts[0].toLowerCase();

    function cmdMsg(html) {
      appendMessage('user', text);
      const bub = appendMessage('arya', '');
      if (bub) bub.innerHTML = html;
      const el = document.getElementById('arya-sp-messages');
      if (el) el.scrollTop = el.scrollHeight;
    }

    if (cmd === '/help') {
      const cmds = [
        ['/sip [amt] [yrs] [rate%]', 'SIP calculator — e.g. /sip 10000 20 12'],
        ['/emi [amt] [rate%] [yrs]', 'EMI calculator — e.g. /emi 5000000 8.5 20'],
        ['/fire',                    'FIRE number from your profile data'],
        ['/compare [amt] [yrs]',     'SIP vs FD vs PPF vs Gold comparison'],
        ['/goals',                   'Open Goals view in Pulse tab'],
        ['/tax',                     'Open Tax Dashboard in Pulse tab'],
        ['/debt',                    'Open Debt Freedom Planner in Pulse tab'],
        ['/news',                    'Fetch latest market headlines'],
        ['/clear',                   'Clear this conversation'],
        ['/help',                    'Show this help'],
      ];
      cmdMsg(`<div style="font-size:12px;font-weight:800;color:#00d4ff;margin-bottom:8px">⚡ Arya Commands</div>
        <div style="display:flex;flex-direction:column;gap:5px">
          ${cmds.map(([c,d])=>`<div style="display:flex;gap:8px;align-items:baseline"><code style="font-size:10.5px;color:#00ffb3;background:rgba(0,255,179,.08);padding:1px 6px;border-radius:4px;white-space:nowrap;flex-shrink:0">${c}</code><span style="font-size:11px;color:rgba(255,255,255,.5)">${d}</span></div>`).join('')}
        </div>`);
      return true;
    }

    if (cmd === '/clear') {
      appendMessage('user', text);
      const pageKey = getPageKey();
      localStorage.removeItem(chatStoreKey(pageKey));
      _chatHistory = [];
      const msgs = document.getElementById('arya-sp-messages');
      if (msgs) msgs.innerHTML = '';
      appendMessage('arya', 'Conversation cleared. Fresh start — what\'s on your mind?');
      return true;
    }

    if (cmd === '/goals')  { switchAryaTab('pulse'); return true; }
    if (cmd === '/tax')    { switchAryaTab('pulse'); return true; }
    if (cmd === '/debt')   { switchAryaTab('pulse'); return true; }

    if (cmd === '/sip') {
      const amt  = parseFloat(parts[1]) || parseFloat(get('finos_sip','0')) || 10000;
      const yrs  = parseFloat(parts[2]) || 20;
      const rate = parseFloat(parts[3]) || 12;
      const r = rate / 100;
      const corpus = amt * 12 * (Math.pow(1+r, yrs) - 1) / r;
      const inv    = amt * 12 * yrs;
      const gain   = corpus - inv;
      const pct    = ((gain / inv) * 100).toFixed(0);
      cmdMsg(`<div style="font-size:12.5px;font-weight:800;color:#00d4ff;margin-bottom:10px">⚡ SIP Result</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${[['Monthly SIP',INR(amt),'#fff'],['Duration',yrs+' yrs','#fff'],['CAGR',rate+'%','#00d4ff'],['Invested',INR(inv),'#ffb300'],['Corpus',INR(Math.round(corpus)),'#00ffb3'],['Gain','+'+INR(Math.round(gain))+' ('+pct+'%)','#00ffb3']].map(([l,v,c])=>`<div style="background:rgba(255,255,255,.04);border-radius:7px;padding:7px"><div style="font-size:9.5px;color:rgba(255,255,255,.38)">${l}</div><div style="font-size:12px;font-weight:800;color:${c};margin-top:2px">${v}</div></div>`).join('')}
        </div>
        <button class="asp-view-ask-btn" style="margin-top:8px;width:100%" data-msg="I'm planning a SIP of ${INR(amt)}/mo for ${yrs} years at ${rate}% CAGR — corpus ${INR(Math.round(corpus))}. Is this enough for my FIRE target? What fund categories should I use?">🤖 Optimise this SIP</button>`);
      wireAskBtnInEl(document.getElementById('arya-sp-messages').lastElementChild?.querySelector('.asp-msg-bubble') || document.body);
      return true;
    }

    if (cmd === '/emi') {
      const P   = parseFloat(parts[1]) || 3000000;
      const ann = parseFloat(parts[2]) || 8.5;
      const yrs = parseFloat(parts[3]) || 20;
      const r   = ann / 1200, n = yrs * 12;
      const emi = P * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1);
      const tot = emi * n;
      cmdMsg(`<div style="font-size:12.5px;font-weight:800;color:#00d4ff;margin-bottom:10px">🏠 EMI Result</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${[['Loan',INR(P),'#fff'],['Rate',ann+'% p.a.','#fff'],['Tenure',yrs+' yrs','#fff'],['Monthly EMI',INR(Math.round(emi)),'#ffd93d'],['Total paid',INR(Math.round(tot)),'#ffb300'],['Total interest',INR(Math.round(tot-P)),'#ff7c43']].map(([l,v,c])=>`<div style="background:rgba(255,255,255,.04);border-radius:7px;padding:7px"><div style="font-size:9.5px;color:rgba(255,255,255,.38)">${l}</div><div style="font-size:12px;font-weight:800;color:${c};margin-top:2px">${v}</div></div>`).join('')}
        </div>
        <button class="asp-view-ask-btn" style="margin-top:8px;width:100%" data-msg="EMI of ${INR(Math.round(emi))}/mo on ${INR(P)} loan at ${ann}% for ${yrs} yrs. Is this within my budget? What's the rent vs buy comparison? My income is ${INR(parseFloat(get('finos_income','0')))}/mo.">🤖 Rent vs buy analysis</button>`);
      wireAskBtnInEl(document.getElementById('arya-sp-messages').lastElementChild?.querySelector('.asp-msg-bubble') || document.body);
      return true;
    }

    if (cmd === '/fire') {
      const inc  = parseFloat(get('finos_income','0')) || 50000;
      const exp  = parseFloat(get('finos_expenses','0')) || 40000;
      const nw   = parseFloat(get('finos_net_worth','0')) || 0;
      const sip  = parseFloat(get('finos_sip','0')) || 0;
      const age  = parseInt(get('finos_age','30'), 10);
      const ret  = parseInt(get('finos_retire_age','60'), 10);
      const fire = Math.round(exp * 25);
      const gap  = Math.max(0, fire - nw);
      const swp  = Math.round(fire * 0.04 / 12);
      const yrs  = ret - age;
      const corpus = yrs > 0 ? nw * Math.pow(1.12, yrs) + sip*12*(Math.pow(1.12,yrs)-1)/.12 : nw;
      const onTrack = corpus >= fire;
      cmdMsg(`<div style="font-size:12.5px;font-weight:800;color:${onTrack?'#00ffb3':'#ffb300'};margin-bottom:10px">🔥 FIRE Calculator</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          ${[['FIRE number',INR(fire),'#ffd93d'],['Current NW',INR(nw),'#fff'],['SIP/mo',INR(sip),'#fff'],['Projected corpus',INR(Math.round(corpus)),onTrack?'#00ffb3':'#ff7c43'],['Monthly SWP',INR(swp)+'/mo','#00d4ff'],['Gap',gap>0?INR(gap):'✅ Covered',gap>0?'#ffb300':'#00ffb3']].map(([l,v,c])=>`<div style="background:rgba(255,255,255,.04);border-radius:7px;padding:7px"><div style="font-size:9.5px;color:rgba(255,255,255,.38)">${l}</div><div style="font-size:12px;font-weight:800;color:${c};margin-top:2px">${v}</div></div>`).join('')}
        </div>
        <button class="asp-view-ask-btn" style="margin-top:8px;width:100%" data-msg="My FIRE number is ${INR(fire)} (25× expenses). Net worth ${INR(nw)}, SIP ${INR(sip)}/mo, target retire at ${ret}. Projected corpus ${INR(Math.round(corpus))}. ${onTrack?'I\'m on track. How do I retire earlier?':'I\'m behind. What specific changes to SIP and lifestyle will close the gap fastest?'}">🤖 Build my FIRE plan</button>`);
      wireAskBtnInEl(document.getElementById('arya-sp-messages').lastElementChild?.querySelector('.asp-msg-bubble') || document.body);
      return true;
    }

    if (cmd === '/compare') {
      const amt = parseFloat(parts[1]) || 100000;
      const yrs = parseFloat(parts[2]) || 10;
      const INSTRUMENTS = [
        { name: 'ELSS SIP',   rate: 12,  tax: false, emoji: '📈', color: '#00ffb3' },
        { name: 'Nifty 50 Index', rate: 11.5, tax: false, emoji: '📊', color: '#00d4ff' },
        { name: 'PPF',        rate: 7.1, tax: true,  emoji: '🏛️', color: '#a855f7' },
        { name: 'FD',         rate: 7.0, tax: false, emoji: '🏦', color: '#ffb300' },
        { name: 'Gold',       rate: 8.5, tax: false, emoji: '🥇', color: '#ffd93d' },
      ];
      const results = INSTRUMENTS.map(inst => {
        const r = inst.rate / 100;
        const monthly = amt / 12;
        const corpus = monthly * 12 * (Math.pow(1+r, yrs) - 1) / r;
        return { ...inst, corpus };
      }).sort((a, b) => b.corpus - a.corpus);
      const maxC = results[0].corpus;
      cmdMsg(`<div style="font-size:12.5px;font-weight:800;color:#00d4ff;margin-bottom:10px">⚡ ${INR(amt)}/yr SIP — ${yrs} Year Comparison</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${results.map(r => {
            const barW = Math.round(r.corpus / maxC * 100);
            return `<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px 10px">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:11px;color:rgba(255,255,255,.7)">${r.emoji} ${r.name}</span>
                <span style="font-size:11.5px;font-weight:800;color:${r.color}">${INR(Math.round(r.corpus))}</span>
              </div>
              <div style="height:3px;background:rgba(255,255,255,.06);border-radius:2px">
                <div style="height:100%;width:${barW}%;background:${r.color};border-radius:2px"></div>
              </div>
            </div>`;
          }).join('')}
        </div>
        <button class="asp-view-ask-btn" style="margin-top:8px;width:100%" data-msg="Comparing ${INR(amt)}/yr investment over ${yrs} years: ELSS gives ${INR(Math.round(results.find(r=>r.name==='ELSS SIP').corpus))}, FD gives ${INR(Math.round(results.find(r=>r.name==='FD').corpus))}. What allocation across these would suit my Financial DNA of ${get('finos_financial_dna','Builder')}?">🤖 Best allocation for my DNA</button>`);
      wireAskBtnInEl(document.getElementById('arya-sp-messages').lastElementChild?.querySelector('.asp-msg-bubble') || document.body);
      return true;
    }

    if (cmd === '/news') {
      appendMessage('user', text);
      const bub = appendMessage('arya', '<div style="font-size:11px;color:rgba(255,255,255,.4)">Fetching latest headlines…</div>');
      fetchMacroNews().then(lines => {
        if (!bub) return;
        if (!lines) { bub.textContent = 'News server unavailable — run app.py to enable market headlines.'; return; }
        const items = lines.split('\n').filter(l => l.startsWith('•'));
        bub.innerHTML = `<div style="font-size:12px;font-weight:800;color:#00d4ff;margin-bottom:8px">📰 Market Pulse</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${items.map(i => `<div style="font-size:11.5px;line-height:1.55;color:rgba(255,255,255,.72);padding:7px 9px;background:rgba(255,255,255,.04);border-radius:7px;border-left:2px solid rgba(0,212,255,.35)">${richText(i.slice(2))}</div>`).join('')}
          </div>
          <button class="asp-view-ask-btn" style="margin-top:8px;width:100%" data-msg="Based on today's market headlines, what's the impact on my portfolio and what action should I take today?">🤖 Impact on my portfolio</button>`;
        wireAskBtnInEl(bub.closest('.asp-msg') || document.body);
      });
      return true;
    }

    return false; // unknown command — let AI handle it
  }

  /* ══ WHAT-IF SCENARIO LAB ════════════════════════════════════════════════ */
  let _labDebounce = null;

  function buildScenarioLab() {
    const inc       = parseFloat(get('finos_income', '0'))     || 50000;
    const sip       = parseFloat(get('finos_sip', '0'))        || 5000;
    const retireAge = parseInt(get('finos_retire_age', '60'), 10);
    const age       = parseInt(get('finos_age', '30'), 10);

    return `<div class="apl-lab-section">
      <div class="apl-section-title">⚗️ What-If Scenario Lab</div>
      <div class="apl-lab-grid">
        <div class="apl-lab-row">
          <div class="apl-lab-label">Monthly Income<span id="lab-inc-val" class="apl-lab-num">${INR(inc)}/mo</span></div>
          <input type="range" class="apl-slider" id="lab-income"
            min="${Math.round(inc*0.4/1000)*1000}" max="${Math.round(inc*3/1000)*1000}" step="${Math.max(500,Math.round(inc*0.02/500)*500)}" value="${inc}">
        </div>
        <div class="apl-lab-row">
          <div class="apl-lab-label">Monthly SIP<span id="lab-sip-val" class="apl-lab-num">${INR(sip)}/mo</span></div>
          <input type="range" class="apl-slider" id="lab-sip"
            min="0" max="${Math.round(inc*0.65/500)*500}" step="500" value="${sip}">
        </div>
        <div class="apl-lab-row">
          <div class="apl-lab-label">Retire At<span id="lab-ret-val" class="apl-lab-num">${retireAge} yrs</span></div>
          <input type="range" class="apl-slider" id="lab-retire" min="${Math.max(age+5,40)}" max="75" step="1" value="${retireAge}">
        </div>
      </div>
      <div id="lab-result" class="apl-lab-result">
        <div class="apl-lab-res-corpus" id="lab-corpus">Adjust sliders →</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-top:8px">
          <div style="font-size:10px;color:rgba(255,255,255,.38)">FIRE score</div><div id="lab-fire-score" class="apl-lab-accent">—</div>
          <div style="font-size:10px;color:rgba(255,255,255,.38)">SWP @4%/mo</div><div id="lab-swp" class="apl-lab-accent">—</div>
          <div style="font-size:10px;color:rgba(255,255,255,.38)">Years to retire</div><div id="lab-yrs" class="apl-lab-accent">—</div>
          <div style="font-size:10px;color:rgba(255,255,255,.38)">Corpus gap</div><div id="lab-gap" class="apl-lab-accent">—</div>
        </div>
      </div>
      <div id="lab-ai-comment" class="apl-lab-ai-comment" style="display:none">
        <span class="apl-lab-ai-thinking">🤖 Arya is thinking about your scenario…</span>
      </div>
    </div>`;
  }

  function wireScenarioLab() {
    const expRaw = parseFloat(get('finos_expenses', '0')) || 40000;
    const nw     = parseFloat(get('finos_net_worth', '0'));
    const ageNow = parseInt(get('finos_age', '30'), 10);

    function recompute() {
      const inc  = parseFloat(document.getElementById('lab-income')?.value  || 0);
      const sip  = parseFloat(document.getElementById('lab-sip')?.value     || 0);
      const ret  = parseInt(document.getElementById('lab-retire')?.value    || 60, 10);
      const yrs  = Math.max(0, ret - ageNow);
      const r    = 0.12;
      const corpus  = nw * Math.pow(1+r, yrs) + sip * 12 * (Math.pow(1+r, yrs) - 1) / r;
      const fireNum = expRaw * 25;
      const gap     = Math.max(0, fireNum - corpus);
      const fireScore = fireNum > 0 ? Math.min(100, Math.round(corpus / fireNum * 100)) : 0;
      const swp     = corpus * 0.04 / 12;
      const fc = fireScore >= 70 ? '#00ffb3' : fireScore >= 40 ? '#ffb300' : '#ff4d6d';

      const set = (id, val, color) => {
        const el = document.getElementById(id);
        if (el) { el.textContent = val; if (color) el.style.color = color; }
      };
      set('lab-corpus',     INR(Math.round(corpus)), fc);
      set('lab-fire-score', `${fireScore}/100`, fc);
      set('lab-swp',        INR(Math.round(swp)) + '/mo');
      set('lab-yrs',        yrs + ' yr');
      set('lab-gap',        gap > 0 ? INR(Math.round(gap)) : '✅ Covered', gap > 0 ? '#ff9500' : '#00ffb3');
      set('lab-inc-val',    INR(inc) + '/mo');
      set('lab-sip-val',    INR(sip) + '/mo');
      set('lab-ret-val',    ret + ' yrs');

      // Debounced Arya commentary — streams inline, never hijacks the active tab
      clearTimeout(_labDebounce);
      const aiEl = document.getElementById('lab-ai-comment');
      if (aiEl) { aiEl.style.display = 'block'; aiEl.innerHTML = '<span class="apl-lab-ai-thinking">🤖 Arya is thinking…</span>'; }
      _labDebounce = setTimeout(async () => {
        const aiBox = document.getElementById('lab-ai-comment');
        if (!aiBox) return;
        try {
          const endpoint = await _findEndpoint();
          if (!endpoint) throw new Error('offline');
          let finalText = '';
          await streamFromOllama(
            BASE_SYSTEM + '\nBe ULTRA concise: 2 sentences max. No preamble.',
            `Scenario: income ${INR(inc)}/mo, SIP ${INR(sip)}/mo, retire ${ret}. Corpus ${INR(Math.round(corpus))}, FIRE ${fireScore}/100, gap ${gap > 0 ? INR(Math.round(gap)) : 'fully covered'}. ONE sharp insight + ONE ₹ action.`,
            partial => {
              finalText = partial;
              aiBox.innerHTML = `<div style="font-size:11.5px;color:rgba(255,255,255,.72);line-height:1.6">${partial}</div>`;
            },
            100
          );
          if (finalText) {
            aiBox.innerHTML = `<div style="font-size:11.5px;line-height:1.6">${richText(finalText)}</div>
              <button class="asp-view-ask-btn" style="margin-top:6px;width:100%" data-msg="Deep dive on my scenario: income ${INR(inc)}/mo, SIP ${INR(sip)}/mo, retire at ${ret}. Corpus ${INR(Math.round(corpus))}, FIRE ${fireScore}/100. What should I change first?">🤖 Deep dive →</button>`;
            wireAskBtnInEl(aiBox);
          }
        } catch {
          if (aiBox) {
            aiBox.innerHTML = `<button class="asp-view-ask-btn" style="width:100%;margin:0" data-msg="Deep dive on my scenario: income ${INR(inc)}/mo, SIP ${INR(sip)}/mo, retire at ${ret}. Corpus ${INR(Math.round(corpus))}, FIRE ${fireScore}/100. What should I change first?">🤖 Ask Arya about this scenario →</button>`;
            wireAskBtnInEl(aiBox);
          }
        }
      }, 2500);
    }

    ['lab-income', 'lab-sip', 'lab-retire'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', recompute);
    });
    recompute();
  }

  /* ══ INDIA FINANCIAL MAP ══════════════════════════════════════════════════ */
  const INDIA_STATES = [
    { id:'JK',name:'J & K',          x:122,y:32,  col:15000 },
    { id:'LA',name:'Ladakh',          x:192,y:22,  col:13000 },
    { id:'HP',name:'Himachal Pradesh',x:155,y:74,  col:16000 },
    { id:'PB',name:'Punjab',          x:110,y:82,  col:19000 },
    { id:'HR',name:'Haryana',         x:130,y:118, col:19000 },
    { id:'DL',name:'Delhi',           x:148,y:132, col:33000 },
    { id:'UK',name:'Uttarakhand',     x:178,y:95,  col:17000 },
    { id:'UP',name:'Uttar Pradesh',   x:210,y:148, col:15000 },
    { id:'RJ',name:'Rajasthan',       x:102,y:162, col:16000 },
    { id:'GJ',name:'Gujarat',         x:82, y:218, col:21000 },
    { id:'MP',name:'Madhya Pradesh',  x:180,y:205, col:15000 },
    { id:'BR',name:'Bihar',           x:252,y:162, col:13000 },
    { id:'JH',name:'Jharkhand',       x:258,y:212, col:14000 },
    { id:'WB',name:'West Bengal',     x:282,y:180, col:23000 },
    { id:'SK',name:'Sikkim',          x:298,y:148, col:16000 },
    { id:'AR',name:'Arunachal',       x:340,y:128, col:13000 },
    { id:'AS',name:'Assam',           x:318,y:153, col:15000 },
    { id:'NL',name:'Nagaland',        x:345,y:168, col:12000 },
    { id:'MN',name:'Manipur',         x:350,y:188, col:12000 },
    { id:'TR',name:'Tripura',         x:323,y:198, col:12000 },
    { id:'MZ',name:'Mizoram',         x:337,y:210, col:12000 },
    { id:'ML',name:'Meghalaya',       x:318,y:177, col:13000 },
    { id:'OD',name:'Odisha',          x:262,y:255, col:15000 },
    { id:'CG',name:'Chhattisgarh',    x:225,y:252, col:14000 },
    { id:'MH',name:'Maharashtra',     x:168,y:278, col:30000 },
    { id:'GA',name:'Goa',             x:128,y:320, col:26000 },
    { id:'TS',name:'Telangana',       x:205,y:308, col:24000 },
    { id:'AP',name:'Andhra Pradesh',  x:232,y:355, col:20000 },
    { id:'KA',name:'Karnataka',       x:172,y:350, col:28000 },
    { id:'TN',name:'Tamil Nadu',      x:218,y:398, col:22000 },
    { id:'KL',name:'Kerala',          x:170,y:395, col:22000 },
  ];

  function buildIndiaMap() {
    const income = parseFloat(get('finos_income', '0')) || 50000;
    const maxCol = Math.max(...INDIA_STATES.map(s => s.col));
    const minCol = Math.min(...INDIA_STATES.map(s => s.col));

    function aColor(col) {
      const r = income / col;
      return r >= 3 ? '#00ffb3' : r >= 2 ? '#00d4ff' : r >= 1.5 ? '#a8e86c' : r >= 1 ? '#ffb300' : '#ff4d6d';
    }
    function aLabel(col) {
      const r = income / col;
      return r >= 3 ? 'Very affordable' : r >= 2 ? 'Affordable' : r >= 1.5 ? 'Moderate' : r >= 1 ? 'Tight budget' : 'Expensive';
    }
    function bR(col) { return (5 + ((col - minCol) / (maxCol - minCol)) * 9).toFixed(1); }

    const outline = `M78,25 L118,15 L175,15 L210,22 L235,28 L355,122 L365,148 L358,188 L348,214 L330,233 L292,262 L278,293 L262,320 L255,358 L248,383 L238,415 L228,438 L215,462 L200,473 L185,470 L168,460 L150,440 L134,418 L118,400 L108,372 L100,348 L105,323 L120,313 L122,295 L108,272 L92,248 L75,228 L60,208 L54,188 L58,165 L65,148 L60,122 L65,98 L70,68 L76,45 Z`;

    const nodes = INDIA_STATES.map(s => {
      const c = aColor(s.col), r = bR(s.col);
      return `<g class="imap-node" data-id="${s.id}" data-name="${s.name}" data-col="${s.col}" data-afford="${aLabel(s.col)}" data-color="${c}" style="cursor:pointer">
        <circle cx="${s.x}" cy="${s.y}" r="${r}" fill="${c}" fill-opacity=".8" stroke="${c}" stroke-width="1.5" stroke-opacity=".4"/>
        <text x="${s.x}" y="${s.y+3.5}" text-anchor="middle" font-size="5" fill="#000" font-weight="900" opacity=".75">${s.id}</text>
      </g>`;
    }).join('');

    const legend = [
      ['#00ffb3','≥3× income (very affordable)'],
      ['#00d4ff','2–3× (affordable)'],
      ['#a8e86c','1.5–2× (moderate)'],
      ['#ffb300','1–1.5× (tight)'],
      ['#ff4d6d','<1× (expensive)']
    ].map(([c,l])=>`<span style="display:flex;align-items:center;gap:4px;color:rgba(255,255,255,.4);font-size:9.5px"><span style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0;display:inline-block"></span>${l}</span>`).join('');

    return `<div class="asp-fade-in" style="padding:12px 14px 0">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
        <div style="font-size:14px;font-weight:800;color:var(--text-primary,#fff)">India Affordability Map</div>
        <div style="font-size:10px;color:rgba(255,255,255,.35)">${INR(income)}/mo</div>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,.4);margin-bottom:6px">Bubble size = cost of life · colour = how affordable on your salary · tap to compare</div>
      <svg id="india-svg" viewBox="0 0 420 490" style="width:100%;max-height:340px">
        <path d="${outline}" fill="rgba(255,255,255,.025)" stroke="rgba(255,255,255,.1)" stroke-width="0.8"/>
        ${nodes}
      </svg>
      <div id="imap-tooltip" style="display:none;padding:10px 12px;background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.2);border-radius:10px;font-size:12px;margin-bottom:4px">
        <div id="imt-name" style="font-weight:800;color:#fff;font-size:13px;margin-bottom:6px"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px">
          <span style="font-size:10.5px;color:rgba(255,255,255,.4)">Monthly COL</span><span id="imt-col" style="font-weight:700;color:#00d4ff;font-size:10.5px"></span>
          <span style="font-size:10.5px;color:rgba(255,255,255,.4)">Affordability</span><span id="imt-afford" style="font-weight:700;font-size:10.5px"></span>
          <span style="font-size:10.5px;color:rgba(255,255,255,.4)">Monthly surplus</span><span id="imt-surplus" style="font-weight:700;font-size:10.5px"></span>
          <span style="font-size:10.5px;color:rgba(255,255,255,.4)">FIRE corpus</span><span id="imt-fire" style="font-weight:700;font-size:10.5px"></span>
        </div>
        <button id="imt-ask-btn" class="asp-view-ask-btn" style="margin-top:8px;width:100%">🤖 Ask Arya about retiring here</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;padding:4px 0 12px">${legend}</div>
    </div>`;
  }

  function wireIndiaMap() {
    const income  = parseFloat(get('finos_income', '0')) || 50000;
    document.querySelectorAll('#india-svg .imap-node').forEach(node => {
      node.addEventListener('click', () => {
        const col     = parseInt(node.dataset.col, 10);
        const name    = node.dataset.name;
        const afford  = node.dataset.afford;
        const color   = node.dataset.color;
        const surplus = income - col;
        const fire    = col * 12 * 25;
        const set     = (id, v, c) => { const el = document.getElementById(id); if (el) { el.textContent = v; if (c) el.style.color = c; } };
        set('imt-name',    name);
        set('imt-col',     INR(col) + '/mo');
        set('imt-afford',  afford, color);
        set('imt-surplus', (surplus >= 0 ? '+' : '') + INR(surplus) + '/mo', surplus >= 0 ? '#00ffb3' : '#ff4d6d');
        set('imt-fire',    INR(fire));
        const askBtn = document.getElementById('imt-ask-btn');
        if (askBtn) {
          askBtn.dataset.msg = `My income is ${INR(income)}/mo. Tell me about retiring or living in ${name}: typical cost of life ${INR(col)}/mo, best areas, quality of life, FIRE corpus needed ${INR(fire)}, healthcare, and whether it suits a ${get('finos_financial_dna','Builder')} DNA investor.`;
        }
        document.getElementById('imap-tooltip').style.display = 'block';
        document.getElementById('imap-tooltip').scrollIntoView({ behavior:'smooth', block:'nearest' });
      });
      const circle = node.querySelector('circle');
      const origR  = parseFloat(circle.getAttribute('r'));
      node.addEventListener('mouseenter', () => { circle.setAttribute('fill-opacity','1'); circle.setAttribute('r', String(origR + 2)); });
      node.addEventListener('mouseleave', () => { if (!node.dataset.selected) circle.setAttribute('fill-opacity','.8'); circle.setAttribute('r', String(origR)); });
    });
    document.getElementById('imt-ask-btn')?.addEventListener('click', e => {
      const msg = e.currentTarget.dataset.msg;
      if (msg) streamInlineFromBtn(e.currentTarget, msg);
    });
  }

  /* ══ INFLATION ERODER ════════════════════════════════════════════════════ */
  const GROCERY_ITEMS = [
    { name:'1L Milk',         price:65,    emoji:'🥛', ir:0.07 },
    { name:'1kg Onion',       price:40,    emoji:'🧅', ir:0.12 },
    { name:'1L Petrol',       price:106,   emoji:'⛽', ir:0.06 },
    { name:'1kg Atta',        price:38,    emoji:'🌾', ir:0.07 },
    { name:'School/mo',       price:4500,  emoji:'📚', ir:0.10 },
    { name:'1BHK Rent/mo',    price:15000, emoji:'🏠', ir:0.07 },
    { name:'Doctor visit',    price:600,   emoji:'🏥', ir:0.08 },
    { name:'Auto 5km',        price:80,    emoji:'🛺', ir:0.05 },
  ];

  function buildInflationEroder() {
    return `<div class="apl-lab-section" style="margin-top:10px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07)">
      <div class="apl-section-title">💧 Inflation Eroder</div>
      <div style="font-size:11.5px;color:rgba(255,255,255,.45);margin-bottom:10px">Watch your money's purchasing power shrink in real time</div>
      <div class="apl-lab-grid">
        <div class="apl-lab-row">
          <div class="apl-lab-label">Amount today<span id="infl-amt-val" class="apl-lab-num">₹1,00,000</span></div>
          <input type="range" class="apl-slider" id="infl-amount" min="10000" max="10000000" step="10000" value="100000">
        </div>
        <div class="apl-lab-row">
          <div class="apl-lab-label">Years ahead<span id="infl-yr-val" class="apl-lab-num">10 yrs</span></div>
          <input type="range" class="apl-slider" id="infl-years" min="1" max="30" step="1" value="10">
        </div>
        <div class="apl-lab-row">
          <div class="apl-lab-label">Inflation rate<span id="infl-rate-val" class="apl-lab-num">6%</span></div>
          <input type="range" class="apl-slider" id="infl-rate" min="3" max="14" step="0.5" value="6">
        </div>
      </div>
      <div class="apl-lab-result" style="margin-top:10px">
        <div class="apl-lab-res-corpus" id="infl-future-val" style="color:#ff7c43">₹76,743 real value</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;margin-top:8px">
          <div style="font-size:10px;color:rgba(255,255,255,.38)">Purchasing power lost</div><div id="infl-loss" class="apl-lab-accent" style="color:#ff4d6d">—</div>
          <div style="font-size:10px;color:rgba(255,255,255,.38)">To match inflation</div><div id="infl-needed" class="apl-lab-accent" style="color:#00ffb3">—</div>
        </div>
      </div>
      <div style="display:flex;gap:20px;justify-content:center;align-items:flex-end;padding:14px 0 6px">
        <div style="text-align:center">
          <div id="infl-bar-now" style="width:44px;height:90px;background:linear-gradient(180deg,#ffd93d,#ffb300);border-radius:6px 6px 0 0;margin:0 auto;transition:height .4s ease"></div>
          <div style="font-size:9px;color:rgba(255,255,255,.4);margin-top:4px">Today</div>
          <div id="infl-bar-now-lbl" style="font-size:10px;font-weight:800;color:#ffd93d"></div>
        </div>
        <div style="text-align:center">
          <div id="infl-bar-fut" style="width:44px;height:90px;background:linear-gradient(180deg,#ff7c43,#ff4d6d);border-radius:6px 6px 0 0;margin:0 auto;transition:height .4s ease"></div>
          <div style="font-size:9px;color:rgba(255,255,255,.4);margin-top:4px" id="infl-bar-label">In 10 yrs</div>
          <div id="infl-bar-fut-lbl" style="font-size:10px;font-weight:800;color:#ff7c43"></div>
        </div>
      </div>
      <div style="font-size:10.5px;font-weight:700;color:rgba(255,255,255,.35);letter-spacing:.06em;text-transform:uppercase;margin:10px 0 6px">Grocery Basket — What things cost</div>
      <div id="infl-basket" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px"></div>
      <button class="asp-view-ask-btn" data-msg="Inflation is eroding my purchasing power. What investments beat 6-7% Indian inflation consistently? Rank them: equity MF, gold, FD, PPF, real estate — with real CAGR data." style="margin:12px 0 4px">🤖 What beats inflation?</button>
    </div>`;
  }

  function wireInflationEroder() {
    function recalc() {
      const amt  = parseFloat(document.getElementById('infl-amount')?.value || 100000);
      const yrs  = parseInt(document.getElementById('infl-years')?.value    || 10, 10);
      const rate = parseFloat(document.getElementById('infl-rate')?.value   || 6) / 100;

      const futVal  = amt / Math.pow(1 + rate, yrs);
      const loss    = amt - futVal;
      const needed  = amt * Math.pow(1 + rate, yrs); // what you need to match inflation
      const lossPct = (loss / amt * 100).toFixed(1);

      const set = (id, v, c) => { const el = document.getElementById(id); if (el) { el.textContent = v; if (c) el.style.color = c; } };
      set('infl-amt-val',    INR(Math.round(amt)));
      set('infl-yr-val',     yrs + ' yrs');
      set('infl-rate-val',   (rate * 100).toFixed(1) + '%');
      set('infl-future-val', INR(Math.round(futVal)) + ' real value');
      set('infl-loss',       `${lossPct}% · ${INR(Math.round(loss))} gone`);
      set('infl-needed',     INR(Math.round(needed)) + ' investment needed');
      set('infl-bar-label',  `In ${yrs} yr`);
      set('infl-bar-now-lbl', INR(Math.round(amt)));
      set('infl-bar-fut-lbl', INR(Math.round(futVal)));

      // Animate coin bars (max height 90px)
      const maxH = 90, futH = Math.max(4, Math.round((futVal / amt) * maxH));
      const nb = document.getElementById('infl-bar-now'); if (nb) { nb.style.height = maxH + 'px'; nb.style.width = '44px'; }
      const fb = document.getElementById('infl-bar-fut'); if (fb) { fb.style.height = futH + 'px'; fb.style.width = '44px'; }

      // Grocery basket
      const basket = document.getElementById('infl-basket');
      if (basket) basket.innerHTML = GROCERY_ITEMS.map(item => {
        const futP = Math.round(item.price * Math.pow(1 + item.ir, yrs));
        const rise = Math.round((futP - item.price) / item.price * 100);
        return `<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:7px 5px;text-align:center">
          <div style="font-size:18px">${item.emoji}</div>
          <div style="font-size:8.5px;color:rgba(255,255,255,.4);margin:2px 0;line-height:1.3">${item.name}</div>
          <div style="font-size:10px;font-weight:700;color:#ffd93d">${INR(item.price)}</div>
          <div style="font-size:9px;color:#ff4d6d">→${INR(futP)}</div>
          <div style="font-size:8px;color:rgba(255,100,100,.6)">+${rise}%</div>
        </div>`;
      }).join('');
    }
    ['infl-amount', 'infl-years', 'infl-rate'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', recalc);
    });
    recalc();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   *  ARYA v5.0 — WORLD-CLASS INTELLIGENCE UPGRADES
   * ═══════════════════════════════════════════════════════════════════════ */

  /* ── 0. WEALTH X-RAY ENGINE ─────────────────────────────────────────────── */
  function buildWealthXRaySection() {
    const liquid = (parseFloat(get('finos_savings_balance','0'))||0) + (parseFloat(get('finos_emergency_fund','0'))||0) + (parseFloat(get('finos_fd_amount','0'))||0);
    const growth = (parseFloat(get('finos_equity_value','0'))||0) + (parseFloat(get('finos_mf_value','0'))||0) + (parseFloat(get('finos_stocks_value','0'))||0);
    const safety = (parseFloat(get('finos_ppf_balance','0'))||0) + (parseFloat(get('finos_epf_balance','0'))||0) + (parseFloat(get('finos_gold_value','0'))||0) + (parseFloat(get('finos_nps_balance','0'))||0);
    const liab   = parseFloat(get('finos_total_debt','0')) || 0;
    const nw     = parseFloat(get('finos_net_worth','0')) || (liquid + growth + safety - liab);
    const total  = liquid + growth + safety || 1;
    const age    = parseInt(get('finos_age','30')) || 30;
    const idealEq = Math.max(30, Math.min(80, 100 - age));

    const pct = v => Math.round(v / total * 100);
    const segments = [
      { label: 'Liquid',   val: liquid, color: '#00d4ff', pct: pct(liquid), icon: '💧' },
      { label: 'Growth',   val: growth, color: '#4dffb4', pct: pct(growth), icon: '📈' },
      { label: 'Safety',   val: safety, color: '#ffd93d', pct: pct(safety), icon: '🛡️' },
    ];

    // SVG pie chart (simple arcs)
    let svgPie = '';
    let cum = 0;
    segments.forEach(s => {
      if (!s.pct) return;
      const startAngle = cum / 100 * 360 - 90;
      const endAngle   = (cum + s.pct) / 100 * 360 - 90;
      const r = 40, cx = 50, cy = 50;
      const x1 = cx + r * Math.cos(startAngle * Math.PI / 180);
      const y1 = cy + r * Math.sin(startAngle * Math.PI / 180);
      const x2 = cx + r * Math.cos(endAngle * Math.PI / 180);
      const y2 = cy + r * Math.sin(endAngle * Math.PI / 180);
      const large = s.pct > 50 ? 1 : 0;
      svgPie += `<path d="M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${s.color}" opacity=".85"/>`;
      cum += s.pct;
    });

    const actEqPct = pct(growth);
    const eqStatus = Math.abs(actEqPct - idealEq) <= 8 ? '✅' : actEqPct < idealEq ? '⚠️ Under-invested' : '⚠️ Overweight';

    return `
    <div class="apl-lab-section asp-fade-in" style="padding:14px 0 10px;border-top:1px solid rgba(255,255,255,.07)">
      <div class="apl-section-title" style="padding:0 14px 10px">🔬 Wealth X-Ray</div>
      <div style="padding:0 14px">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">
          <svg viewBox="0 0 100 100" style="width:90px;height:90px;flex-shrink:0">
            ${svgPie || '<circle cx="50" cy="50" r="40" fill="rgba(255,255,255,.06)"/>'}
            <circle cx="50" cy="50" r="22" fill="#0a0d15"/>
            <text x="50" y="53" text-anchor="middle" font-size="9" fill="rgba(255,255,255,.5)" font-family="-apple-system,sans-serif">NW</text>
          </svg>
          <div style="flex:1">
            ${segments.map(s => `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
              <span style="width:8px;height:8px;border-radius:2px;background:${s.color};flex-shrink:0"></span>
              <span style="font-size:10px;color:rgba(255,255,255,.6);flex:1">${s.icon} ${s.label}</span>
              <span style="font-size:11px;font-weight:700;color:${s.color}">${INR(s.val)}</span>
              <span style="font-size:9px;color:rgba(255,255,255,.3)">${s.pct}%</span>
            </div>`).join('')}
            <div style="border-top:1px solid rgba(255,255,255,.06);margin-top:5px;padding-top:5px;display:flex;justify-content:space-between">
              <span style="font-size:10px;color:rgba(255,255,255,.4)">Liabilities</span>
              <span style="font-size:10px;font-weight:700;color:#ff4d6d">${INR(liab)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:3px">
              <span style="font-size:10px;color:rgba(255,255,255,.6);font-weight:700">Net Worth</span>
              <span style="font-size:13px;font-weight:900;color:#00d4ff">${INR(nw)}</span>
            </div>
          </div>
        </div>
        <div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px 10px;font-size:10px">
          <div style="color:rgba(255,255,255,.5);margin-bottom:3px">Equity Allocation Check (Age ${age})</div>
          <div style="color:${Math.abs(actEqPct-idealEq)<=8?'#4dffb4':'#ffd93d'}">Growth assets: ${actEqPct}% | Ideal: ${idealEq}% ${eqStatus}</div>
        </div>
        <button class="asp-view-ask-btn" style="margin-top:8px" data-msg="My wealth X-Ray shows: Liquid ${INR(liquid)}, Growth ${INR(growth)}, Safety ${INR(safety)}, Liabilities ${INR(liab)}. Am I optimally allocated for my age? What should I rebalance?">
          🤖 Am I optimally allocated?
        </button>
      </div>
    </div>`;
  }

  /* ── 0b. TAX OPTIMIZER LIVE DASHBOARD ───────────────────────────────────── */
  function buildTaxOptimizerSection() {
    const c80  = parseFloat(get('finos_investments_80c','0'))  || 0;
    const hi   = parseFloat(get('finos_health_insurance','0')) || 0;
    const nps  = parseFloat(get('finos_nps_amount','0'))       || 0;
    const inc  = (parseFloat(get('finos_income','0')) || 0) * 12;
    const taxable = Math.max(0, inc - 50000);
    const rate = taxable > 1500000 ? 30 : taxable > 1200000 ? 20 : taxable > 1000000 ? 15 : taxable > 700000 ? 10 : taxable > 300000 ? 5 : 0;

    const bars = [
      { label:'80C  (ELSS/PPF/LIC)', used:c80, limit:150000, color:'#00d4ff' },
      { label:'80D  (Health Insur)', used:hi,  limit:25000,  color:'#4dffb4' },
      { label:'80CCD(NPS ₹50K)', used:nps, limit:50000,  color:'#b97dff' },
    ];
    const totalRoom = bars.reduce((s,b) => s + Math.max(0, b.limit - b.used), 0);
    const totalSave  = Math.round(totalRoom * rate / 100);

    return `
    <div class="apl-lab-section asp-fade-in" style="padding:14px 0 10px;border-top:1px solid rgba(255,255,255,.07)">
      <div class="apl-section-title" style="padding:0 14px 8px">🧾 Tax Optimizer</div>
      <div style="padding:0 14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-size:10px;color:rgba(255,255,255,.4)">Marginal rate: <span style="color:#ffd93d;font-weight:700">${rate}%</span></div>
          <div style="font-size:10px;color:rgba(255,255,255,.4)">Potential saving: <span style="color:#4dffb4;font-weight:700">${INR(totalSave)}</span></div>
        </div>
        ${bars.map(b => {
          const used = Math.min(b.used, b.limit);
          const pct  = Math.round(used / b.limit * 100);
          const room = Math.max(0, b.limit - b.used);
          const saving = Math.round(room * rate / 100);
          return `<div style="margin-bottom:9px">
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="font-size:10px;color:rgba(255,255,255,.6)">${b.label}</span>
              <span style="font-size:10px;font-weight:700;color:${room<1000?'#4dffb4':'#ffd93d'}">${room>0?`Room: ${INR(room)}`:'Maxed ✅'}</span>
            </div>
            <div style="position:relative;height:14px;background:rgba(255,255,255,.07);border-radius:7px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${b.color};border-radius:7px;opacity:.8"></div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-top:2px">
              <span style="font-size:9px;color:rgba(255,255,255,.3)">${INR(used)} used</span>
              <span style="font-size:9px;color:rgba(255,255,255,.3)">/${INR(b.limit)} limit</span>
              ${saving > 0 ? `<span style="font-size:9px;color:#4dffb4">save ${INR(saving)}</span>` : ''}
            </div>
          </div>`;
        }).join('')}
        ${totalRoom > 0 ? `<div style="background:rgba(77,255,180,.06);border:1px solid rgba(77,255,180,.15);border-radius:8px;padding:7px 10px;font-size:10px;color:rgba(77,255,180,.8);margin-top:4px">
          💡 Fill remaining ${INR(totalRoom)} in deductions to save ${INR(totalSave)} in taxes this year
        </div>` : `<div style="background:rgba(77,255,180,.04);border-radius:8px;padding:7px 10px;font-size:10px;color:rgba(77,255,180,.6);margin-top:4px">
          🎉 All major deductions maxed! You're fully tax-optimized.
        </div>`}
        <button class="asp-view-ask-btn" style="margin-top:8px" data-msg="My tax dashboard shows: 80C used ${INR(c80)}, 80D used ${INR(hi)}, NPS used ${INR(nps)}. I am in ${rate}% tax bracket. What are my top 3 moves to save maximum tax this year? Give me specific products and amounts.">
          🤖 What's my best tax move?
        </button>
      </div>
    </div>`;
  }

  /* ── 0c. INSURANCE GAP ANALYZER ─────────────────────────────────────────── */
  function buildInsuranceGapSection() {
    const inc    = parseFloat(get('finos_income','0')) || 0;
    const debt   = parseFloat(get('finos_total_debt','0')) || 0;
    const term   = parseFloat(get('finos_term_insurance','0')) || 0;
    const hcover = parseFloat(get('finos_health_insurance_cover','0')) || 0;
    const hi     = parseFloat(get('finos_health_insurance','0')) || 0;
    const age    = parseInt(get('finos_age','30')) || 30;

    const annualInc  = inc * 12;
    const lifeNeeded = Math.round(annualInc * 12 + debt);
    const termGap    = Math.max(0, lifeNeeded - term);
    const hNeed      = 1000000;
    const hGap       = Math.max(0, hNeed - hcover);

    const termPct    = lifeNeeded > 0 ? Math.min(100, Math.round(term / lifeNeeded * 100)) : 0;
    const hPct       = Math.round(Math.min(100, hcover / hNeed * 100));

    const gaugeRing = (pct, color, r=28) => {
      const circ = 2 * Math.PI * r;
      const dash = (pct / 100) * circ;
      return `<circle cx="32" cy="32" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="5"/>
              <circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="5"
                stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}" stroke-dashoffset="${(circ * 0.25).toFixed(1)}"
                stroke-linecap="round" style="transition:stroke-dasharray .8s ease"/>`;
    };

    return `
    <div class="apl-lab-section asp-fade-in" style="padding:14px 0 10px;border-top:1px solid rgba(255,255,255,.07)">
      <div class="apl-section-title" style="padding:0 14px 8px">🛡️ Insurance Gap Analyzer</div>
      <div style="padding:0 14px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
          <!-- Term Insurance -->
          <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;text-align:center">
            <svg viewBox="0 0 64 64" style="width:60px;height:60px">
              ${gaugeRing(termPct, term >= lifeNeeded ? '#4dffb4' : '#ff4d6d')}
              <text x="32" y="35" text-anchor="middle" font-size="11" font-weight="bold" fill="white" font-family="-apple-system,sans-serif">${termPct}%</text>
            </svg>
            <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.7);margin-top:3px">Term Life</div>
            <div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:2px">Need: ${INR(lifeNeeded)}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.35)">Have: ${INR(term)}</div>
            ${termGap > 0 ? `<div style="font-size:9px;color:#ff4d6d;font-weight:700;margin-top:3px">Gap: ${INR(termGap)}</div>` : `<div style="font-size:9px;color:#4dffb4;margin-top:3px">✅ Adequate</div>`}
          </div>
          <!-- Health Insurance -->
          <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;text-align:center">
            <svg viewBox="0 0 64 64" style="width:60px;height:60px">
              ${gaugeRing(hPct, hcover >= hNeed ? '#4dffb4' : '#ffd93d')}
              <text x="32" y="35" text-anchor="middle" font-size="11" font-weight="bold" fill="white" font-family="-apple-system,sans-serif">${hPct}%</text>
            </svg>
            <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.7);margin-top:3px">Health Cover</div>
            <div style="font-size:9px;color:rgba(255,255,255,.35);margin-top:2px">Need: ${INR(hNeed)}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.35)">Have: ${INR(hcover)}</div>
            ${hGap > 0 ? `<div style="font-size:9px;color:#ffd93d;font-weight:700;margin-top:3px">Top up: ${INR(hGap)}</div>` : `<div style="font-size:9px;color:#4dffb4;margin-top:3px">✅ Adequate</div>`}
          </div>
        </div>
        ${term === 0 ? `<div style="background:rgba(255,80,80,.08);border:1px solid rgba(255,80,80,.2);border-radius:8px;padding:8px 10px;font-size:10px;color:#ff6b6b;margin-bottom:8px">
          🚨 No term insurance found! At age ${age}, a ₹1Cr term policy costs ~₹8-12K/year. Buy this first — it's the most important financial step.
        </div>` : hi === 0 ? `<div style="background:rgba(255,211,0,.06);border:1px solid rgba(255,211,0,.15);border-radius:8px;padding:8px 10px;font-size:10px;color:#ffd93d;margin-bottom:8px">
          ⚠️ No health insurance premium in 80D. Add family floater to get tax benefit and medical coverage.
        </div>` : ''}
        <button class="asp-view-ask-btn" data-msg="My insurance gap analysis: Term life needed ${INR(lifeNeeded)}, have ${INR(term)}, gap ${INR(termGap)}. Health needed ${INR(hNeed)}, have ${INR(hcover)}. What insurance should I buy first and from which companies?">
          🤖 What should I buy first?
        </button>
      </div>
    </div>`;
  }

  /* ── 1. AI ADVISOR PERSONA SYSTEM ────────────────────────────────────────── */
  const ADVISOR_PERSONAS = {
    balanced:     { icon:'🎯', name:'Balanced',     color:'#00d4ff', prompt:'Give well-rounded, holistic financial advice balancing growth and safety. Always provide clear, actionable next steps.' },
    fire:         { icon:'🔥', name:'FIRE Mode',    color:'#ff6b35', prompt:'You are in FIRE (Financial Independence, Retire Early) mode. Aggressively optimize every answer toward financial independence. Push savings rate, maximize SIP, minimize lifestyle inflation, question every expense. Treat every rupee as a unit of freedom.' },
    conservative: { icon:'🛡️', name:'Guardian',     color:'#4dffb4', prompt:'You are a conservative guardian advisor. Prioritize capital safety above all. Recommend FD, PPF, Sukanya, SGB gold bonds, liquid funds, balanced hybrid funds. Minimize equity volatility. Every suggestion must first protect the downside.' },
    growth:       { icon:'⚡', name:'Growth Max',   color:'#b97dff', prompt:'You are an aggressive growth maximizer. Push high-equity portfolios, small-cap exposure, international ETFs, momentum strategies. Accept higher volatility for superior long-term returns. Built for investors with 10+ year horizons who can stay calm in crashes.' },
  };
  let _currentPersona = 'balanced';

  function setPersona(key) {
    _currentPersona = key;
    // Update badge in header
    const badge = document.getElementById('arya-persona-badge');
    if (badge) {
      const p = ADVISOR_PERSONAS[key];
      badge.textContent = p.icon + ' ' + p.name;
      badge.style.color = p.color;
      badge.style.borderColor = p.color + '44';
    }
    // Highlight the active persona button
    document.querySelectorAll('.agt-persona-btn').forEach(b => {
      const active = b.dataset.persona === key;
      const p = ADVISOR_PERSONAS[key];
      b.style.background  = active ? (p.color + '22') : 'rgba(255,255,255,.04)';
      b.style.borderColor = active ? p.color : 'rgba(255,255,255,.08)';
      b.style.color       = active ? p.color : 'rgba(255,255,255,.6)';
    });
  }

  function getPersonaAppend() {
    const p = ADVISOR_PERSONAS[_currentPersona];
    return p ? '\n\nADVISOR PERSONA: ' + p.prompt : '';
  }

  /* ── 2. MONTE CARLO FIRE SIMULATOR ──────────────────────────────────────── */
  function _runMonteCarlo(sipMo, nw, fireTarget, yearsLeft) {
    const RUNS = 1000;
    const yrs  = Math.min(Math.max(yearsLeft, 10), 40);
    const hits = new Int32Array(yrs + 1); // hits[yr] = runs that first crossed FIRE at year yr

    for (let r = 0; r < RUNS; r++) {
      let corpus = nw;
      let hit = false;
      for (let yr = 1; yr <= yrs; yr++) {
        // Box-Muller for normal dist: μ=12%, σ=6%
        const u1 = Math.random(), u2 = Math.random();
        const z  = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
        const cagr = Math.max(0.01, 0.12 + z * 0.06);
        const r_mo = cagr / 12;
        const mo   = yr * 12;
        // Grow existing corpus
        corpus = nw * Math.pow(1 + cagr, yr);
        // Add SIP accumulation
        corpus += sipMo * (r_mo > 0 ? (Math.pow(1 + r_mo, mo) - 1) / r_mo * (1 + r_mo) : mo);
        if (!hit && corpus >= fireTarget) { hits[yr]++; hit = true; }
      }
    }
    return hits;
  }

  function buildMonteCarloSection() {
    const sip  = parseFloat(get('finos_sip_amount', '5000'))     || 5000;
    const fire = parseFloat(get('finos_fire_target', '30000000'))|| 30000000;
    return `
    <div class="apl-lab-section asp-fade-in" style="padding:14px 0 10px;border-top:1px solid rgba(255,255,255,.07)">
      <div class="apl-section-title" style="padding:0 14px 10px">🎲 Monte Carlo FIRE Simulator</div>
      <div style="padding:0 14px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <div>
            <div class="apl-lab-label" style="margin-bottom:3px">MONTHLY SIP (₹)</div>
            <input id="mc-sip" type="number" value="${sip}" step="1000" class="agt-mc-inp">
          </div>
          <div>
            <div class="apl-lab-label" style="margin-bottom:3px">FIRE TARGET (₹)</div>
            <input id="mc-target" type="number" value="${fire}" step="1000000" class="agt-mc-inp">
          </div>
        </div>
        <button id="mc-run-btn" class="agt-run-btn" style="margin-bottom:10px">🎲 Run 1,000 Simulations</button>
        <div id="mc-results" style="display:none">
          <div id="mc-prob-cards" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px"></div>
          <svg id="mc-chart" viewBox="0 0 360 100" xmlns="http://www.w3.org/2000/svg"
               style="width:100%;height:100px;display:block"></svg>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:rgba(255,255,255,.25);margin-top:2px">
            <span>Year 1</span><span>Year 15</span><span>Year 30</span>
          </div>
          <div style="font-size:9px;color:rgba(255,255,255,.2);margin-top:6px;text-align:center">
            1,000 Monte Carlo runs · CAGR ≈ N(12%, 6%) · results are probabilistic
          </div>
          <button class="asp-view-ask-btn" id="mc-ask-arya-btn" style="margin-top:8px"
            data-msg="My Monte Carlo FIRE simulation is complete. What are the top 3 changes I can make to my SIP and corpus strategy to increase my FIRE probability to above 80%?">
            🤖 How do I improve my FIRE odds?
          </button>
        </div>
      </div>
    </div>`;
  }

  function wireMonteCarloSection() {
    document.getElementById('mc-run-btn')?.addEventListener('click', () => {
      const sip    = parseFloat(document.getElementById('mc-sip')?.value)    || 5000;
      const fire   = parseFloat(document.getElementById('mc-target')?.value) || 30000000;
      const nw     = parseFloat(get('finos_net_worth', '0')) || 0;
      const age    = parseInt(get('finos_age', '30'), 10) || 30;
      const yrsLeft = Math.max(10, 65 - age);
      const btn    = document.getElementById('mc-run-btn');
      btn.textContent = '⏳ Simulating 1,000 paths…';
      btn.disabled = true;

      // Run off the main thread tick so spinner updates
      setTimeout(() => {
        const hits = _runMonteCarlo(sip, nw, fire, yrsLeft);
        const TOTAL = 1000;

        // Cumulative probabilities
        const milestones = [10, 20, 30].map(dy => {
          let cum = 0;
          for (let i = 1; i <= Math.min(dy, yrsLeft); i++) cum += hits[i];
          return { dy, age: age + dy, pct: (cum / TOTAL * 100).toFixed(1) };
        });

        const cols = ['#ffd93d', '#00d4ff', '#4dffb4'];
        document.getElementById('mc-prob-cards').innerHTML = milestones.map((m, i) => `
          <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;text-align:center">
            <div style="font-size:9px;color:rgba(255,255,255,.35);margin-bottom:3px">By Age ${m.age}</div>
            <div style="font-size:22px;font-weight:900;color:${cols[i]}">${m.pct}%</div>
            <div style="font-size:8px;color:rgba(255,255,255,.3)">probability</div>
          </div>`).join('');

        // SVG histogram
        const barCount = Math.min(yrsLeft, 30);
        const maxH = Math.max(...Array.from({length: barCount}, (_, i) => hits[i+1])) || 1;
        const bw = 360 / barCount;
        let svgInner = '';
        for (let i = 0; i < barCount; i++) {
          const h   = Math.max(2, (hits[i + 1] / maxH) * 96);
          const x   = i * bw + 0.5;
          const col = i < 10 ? '#ffd93d' : i < 20 ? '#00d4ff' : '#4dffb4';
          svgInner += `<rect x="${x.toFixed(1)}" y="${(100-h).toFixed(1)}" width="${(bw-1).toFixed(1)}" height="${h.toFixed(1)}" fill="${col}" rx="1" opacity=".8"/>`;
        }
        document.getElementById('mc-chart').innerHTML = svgInner;
        document.getElementById('mc-results').style.display = 'block';

        btn.textContent = '🔄 Re-run';
        btn.disabled = false;

        const askBtn = document.getElementById('mc-ask-arya-btn');
        if (askBtn) askBtn.addEventListener('click', () => handleAskBtn(askBtn));
      }, 30);
    });
  }

  /* ── 3. FINANCIAL TIME MACHINE ───────────────────────────────────────────── */
  const _TM_HIST_CAGR = {
    2010:0.131, 2011:0.148, 2012:0.138, 2013:0.146, 2014:0.155,
    2015:0.121, 2016:0.129, 2017:0.122, 2018:0.115, 2019:0.128,
    2020:0.163, 2021:0.148, 2022:0.112, 2023:0.132, 2024:0.118,
  };

  function buildTimeMachineSection() {
    const sip = parseFloat(get('finos_sip_amount', '5000')) || 5000;
    return `
    <div class="apl-lab-section asp-fade-in" style="padding:14px 0 10px;border-top:1px solid rgba(255,255,255,.07)">
      <div class="apl-section-title" style="padding:0 14px 8px">⏳ Financial Time Machine</div>
      <div style="padding:0 14px">
        <div style="font-size:10px;color:rgba(255,255,255,.4);margin-bottom:8px">If you'd started a monthly SIP earlier, here's what you'd have today:</div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
          <span style="font-size:10px;color:rgba(255,255,255,.4);white-space:nowrap">₹/mo SIP</span>
          <input id="tm-sip" type="number" value="${sip}" step="500" class="agt-mc-inp" style="flex:1">
          <button id="tm-calc-btn" style="padding:5px 10px;background:rgba(0,212,255,.12);border:1px solid rgba(0,212,255,.3);border-radius:6px;color:#00d4ff;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">Calculate</button>
        </div>
        <div id="tm-results"></div>
      </div>
    </div>`;
  }

  function wireTimeMachineSection() {
    const YEARS = [2015, 2017, 2019, 2021, 2023];
    const CUR   = 2026;

    function calcCorpus(sipMo, startYr) {
      const mo   = (CUR - startYr) * 12;
      const cagr = _TM_HIST_CAGR[startYr] || 0.12;
      const rMo  = cagr / 12;
      if (rMo < 1e-8) return sipMo * mo;
      return sipMo * (Math.pow(1 + rMo, mo) - 1) / rMo * (1 + rMo);
    }

    function render() {
      const sip = parseFloat(document.getElementById('tm-sip')?.value) || 5000;
      const rows = YEARS.map(yr => {
        const corpus = calcCorpus(sip, yr);
        const invested = sip * (CUR - yr) * 12;
        return { yr, corpus, invested, gain: corpus - invested };
      });
      const maxC = Math.max(...rows.map(r => r.corpus)) || 1;

      document.getElementById('tm-results').innerHTML = `
        <div style="display:flex;flex-direction:column;gap:5px">
          ${rows.map(row => {
            const pct = (row.corpus / maxC * 100).toFixed(0);
            const yrsAgo = CUR - row.yr;
            const mult = (row.corpus / row.invested).toFixed(1);
            return `<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:8px 10px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <span style="font-size:10px;color:rgba(255,255,255,.5)">Started ${row.yr} <span style="color:rgba(255,255,255,.25);font-size:9px">(${yrsAgo} yrs ago)</span></span>
                <span style="font-size:13px;font-weight:800;color:#00d4ff">${INR(Math.round(row.corpus))}</span>
              </div>
              <div style="height:5px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden;margin-bottom:3px">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#7b2ff7,#00d4ff);border-radius:3px"></div>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="font-size:9px;color:rgba(255,255,255,.3)">Invested: ${INR(Math.round(row.invested))}</span>
                <span style="font-size:9px;color:#4dffb4">+${INR(Math.round(row.gain))} · ${mult}x</span>
              </div>
            </div>`;
          }).join('')}
        </div>
        <button class="asp-view-ask-btn" style="margin-top:8px;width:100%"
          data-msg="The financial time machine shows the true cost of delay. What SIP should I start RIGHT NOW to make up for lost years, and what's the optimal growth strategy given I'm starting later?">
          🤖 What does every year of delay cost?
        </button>`;
      document.getElementById('tm-results').querySelectorAll('.asp-view-ask-btn').forEach(b => {
        b.addEventListener('click', () => handleAskBtn(b));
      });
    }

    document.getElementById('tm-calc-btn')?.addEventListener('click', render);
    document.getElementById('tm-sip')?.addEventListener('change', () => {
      if (document.getElementById('tm-results')?.children?.length) render();
    });
    render();
  }

  /* ── 4. INDIA PEER BENCHMARK ─────────────────────────────────────────────── */
  const _INDIA_PEER = {
    netWorth: {
      '25-30': [40000,   140000,   380000,   950000],
      '30-35': [180000,  550000,  1400000,  3200000],
      '35-40': [450000, 1400000,  3800000,  8500000],
      '40-45': [900000, 2800000,  7500000, 17000000],
      '45-50': [1800000,5500000, 14000000, 32000000],
      '50-55': [3200000,9500000, 24000000, 52000000],
    },
    income: {
      '25-30': [18000,  38000,  75000, 140000],
      '30-35': [28000,  58000, 115000, 240000],
      '35-40': [38000,  78000, 155000, 330000],
      '40-45': [48000,  95000, 190000, 420000],
      '45-50': [55000, 115000, 240000, 520000],
      '50-55': [60000, 125000, 270000, 580000],
    },
    sipRate: [0.05, 0.10, 0.18, 0.28],
  };

  function _ageBracket(age) {
    if (age < 30) return '25-30';
    if (age < 35) return '30-35';
    if (age < 40) return '35-40';
    if (age < 45) return '40-45';
    if (age < 50) return '45-50';
    return '50-55';
  }

  function _pctRank(val, p) {
    if (val <= p[0]) return { pct: Math.round(val / Math.max(p[0],1) * 25),      label:'Bottom 25%',  color:'#ff4d6d' };
    if (val <= p[1]) return { pct: Math.round(25 + (val-p[0])/(p[1]-p[0]) * 25), label:'Below Median', color:'#ffd93d' };
    if (val <= p[2]) return { pct: Math.round(50 + (val-p[1])/(p[2]-p[1]) * 25), label:'Above Median', color:'#4dffb4' };
    if (val <= p[3]) return { pct: Math.round(75 + (val-p[2])/(p[3]-p[2]) * 15), label:'Top 25%',      color:'#00d4ff' };
    return { pct: 93, label:'Top 10%', color:'#b97dff' };
  }

  function buildPeerBenchmarkSection() {
    return `
    <div class="apl-lab-section asp-fade-in" style="padding:14px 0 10px;border-top:1px solid rgba(255,255,255,.07)">
      <div class="apl-section-title" style="padding:0 14px 8px">🏆 India Peer Benchmark</div>
      <div id="peer-bm-body" style="padding:0 14px">
        <div style="text-align:center;padding:10px;font-size:11px;color:rgba(255,255,255,.3)">Calculating your percentile…</div>
      </div>
    </div>`;
  }

  function wirePeerBenchmarkSection() {
    const age    = parseInt(get('finos_age',            '30'), 10) || 30;
    const nw     = parseFloat(get('finos_net_worth',    '0'))      || 0;
    const income = parseFloat(get('finos_income',       '0'))      || 0;
    const sip    = parseFloat(get('finos_sip_amount',   '0'))      || 0;
    const bkt    = _ageBracket(age);
    const nwB    = _INDIA_PEER.netWorth[bkt] || _INDIA_PEER.netWorth['30-35'];
    const incB   = _INDIA_PEER.income[bkt]   || _INDIA_PEER.income['30-35'];
    const sipR   = income > 0 ? sip / income : 0;

    const metrics = [
      { label:'Net Worth',     val: nw,     bench: nwB,               fmt: v => INR(Math.round(v)) },
      { label:'Monthly Income',val: income, bench: incB,              fmt: v => INR(Math.round(v)) },
      { label:'SIP Rate',      val: sipR,   bench: _INDIA_PEER.sipRate, fmt: v => (v*100).toFixed(1)+'%' },
    ];

    const box = document.getElementById('peer-bm-body');
    if (!box) return;
    box.innerHTML = `
      <div style="font-size:9px;color:rgba(255,255,255,.25);margin-bottom:10px">Age bracket: ${bkt} · Estimated from SEBI, RBI & NCAER surveys</div>
      ${metrics.map(m => {
        const r   = _pctRank(m.val, m.bench);
        const pct = Math.min(95, Math.max(3, r.pct));
        return `<div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:11px;color:rgba(255,255,255,.6)">${m.label}</span>
            <span style="font-size:10px;font-weight:700;color:${r.color}">${r.label}</span>
          </div>
          <div style="position:relative;height:16px;background:rgba(255,255,255,.07);border-radius:8px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,${r.color}55,${r.color});border-radius:8px;transition:width .9s ease"></div>
            <span style="position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:8.5px;color:#fff;font-weight:700">${pct}th</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:2px">
            <span style="font-size:9px;color:rgba(255,255,255,.3)">You: ${m.fmt(m.val)}</span>
            <span style="font-size:9px;color:rgba(255,255,255,.3)">Median: ${m.fmt(m.bench[1])}</span>
          </div>
        </div>`;
      }).join('')}
      <button class="asp-view-ask-btn" style="margin-top:4px"
        data-msg="My India peer benchmark shows my net worth and income percentiles. What's the single most impactful change I can make to move from my current percentile to the top 25% in the next 3 years?">
        🤖 How do I move up the ranks?
      </button>`;
    box.querySelectorAll('.asp-view-ask-btn').forEach(b => b.addEventListener('click', () => handleAskBtn(b)));
  }

  /* ── 5. TRANSACTION TEXT ANALYZER ───────────────────────────────────────── */
  function buildTransactionAnalyzerSection() {
    return `
    <div class="apl-lab-section asp-fade-in" style="padding:14px 0 10px;border-top:1px solid rgba(255,255,255,.07)">
      <div class="apl-section-title" style="padding:0 14px 6px">📋 Transaction Analyzer</div>
      <div style="padding:0 14px">
        <div style="font-size:10px;color:rgba(255,255,255,.35);margin-bottom:6px">Paste bank SMS, UPI history, or expense list — Arya auto-categorizes it</div>
        <textarea id="txn-input" rows="4" placeholder="Zomato Rs.420 debited\nSwiggy Rs.680 debited\nSBI Life Premium Rs.12500 debited\nMF SIP Rs.5000 debited\nAmazon Rs.2300 debited" style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px;color:#fff;font-size:11px;resize:vertical;box-sizing:border-box;line-height:1.5"></textarea>
        <button id="txn-analyze-btn" style="width:100%;margin-top:6px;padding:8px;background:linear-gradient(135deg,rgba(0,80,110,.5),rgba(0,212,255,.08));border:1px solid rgba(0,212,255,.25);border-radius:8px;color:#00d4ff;font-size:11px;font-weight:700;cursor:pointer">
          📊 Analyze Transactions
        </button>
        <div id="txn-results" style="margin-top:8px"></div>
      </div>
    </div>`;
  }

  function wireTransactionAnalyzerSection() {
    const CAT_MAP = {
      food:       { re:/zomato|swiggy|domino|mcdonald|kfc|pizza|restaurant|uber.*eat|cafe|dine|food|blinkit|zepto/i, label:'🍔 Food & Dining',  color:'#ff6b35' },
      transport:  { re:/uber|ola|rapido|metro|petrol|fuel|parking|toll|irctc|railway|redbus/i,                       label:'🚗 Transport',       color:'#ffd93d' },
      shopping:   { re:/amazon|flipkart|myntra|nykaa|ajio|reliance|dmart|big bazaar|meesho/i,                        label:'🛍️ Shopping',        color:'#b97dff' },
      investment: { re:/mutual fund|mf\b|sip|groww|zerodha|coin|parag|ppf|nps|elss|nifty/i,                         label:'📈 Investments',     color:'#4dffb4' },
      insurance:  { re:/lic|sbi life|hdfc life|max life|bajaj.*life|premium|insurance|kotak life/i,                  label:'🛡️ Insurance',       color:'#00d4ff' },
      emi:        { re:/emi|home loan|car loan|mortgage|housing loan|personal loan/i,                                 label:'🏠 EMI / Loans',    color:'#ff4d6d' },
      utilities:  { re:/electricity|water board|gas|airtel|jio|bsnl|broadband|dth|tata sky|netflix|prime|spotify/i,  label:'⚡ Bills & Utilities', color:'#7ec8e3' },
      medical:    { re:/apollo|fortis|hospital|pharmacy|medicine|health|1mg|netmeds|medplus/i,                        label:'🏥 Medical',         color:'#ff9500' },
    };

    document.getElementById('txn-analyze-btn')?.addEventListener('click', async () => {
      const raw = document.getElementById('txn-input')?.value?.trim();
      if (!raw) return;
      const btn = document.getElementById('txn-analyze-btn');
      const res = document.getElementById('txn-results');
      btn.disabled = true; btn.textContent = '⏳ Analyzing…';
      res.innerHTML = '<div style="text-align:center;padding:10px;color:rgba(255,255,255,.3);font-size:11px">Categorizing transactions…</div>';

      const parsed = [];
      raw.split('\n').filter(l => l.trim()).forEach(line => {
        const m = line.match(/(?:rs\.?|₹)\s*([0-9,]+(?:\.[0-9]+)?)/i);
        if (!m) return;
        const amt = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(amt) && amt > 0) {
          let cat = 'other';
          for (const [k, c] of Object.entries(CAT_MAP)) { if (c.re.test(line)) { cat = k; break; } }
          parsed.push({ line: line.slice(0, 70), amt, cat });
        }
      });

      if (!parsed.length) {
        res.innerHTML = '<div style="color:rgba(255,255,255,.35);font-size:11px;text-align:center;padding:8px">No amounts found. Include ₹ or Rs. before amounts.</div>';
        btn.disabled = false; btn.textContent = '📊 Analyze Transactions'; return;
      }

      const totals = {};
      let grand = 0;
      parsed.forEach(p => { totals[p.cat] = (totals[p.cat]||0) + p.amt; grand += p.amt; });
      const sorted = Object.entries(totals).sort((a,b) => b[1]-a[1]);
      const income = parseFloat(get('finos_income','0'))||0;

      res.innerHTML = `
        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.5);margin-bottom:8px">
          ${parsed.length} transactions · Total: <span style="color:#ff4d6d">${INR(Math.round(grand))}</span>
          ${income ? ` · <span style="color:rgba(255,255,255,.4)">${(grand/income*100).toFixed(0)}% of income</span>` : ''}
        </div>
        ${sorted.map(([cat, amt]) => {
          const c = CAT_MAP[cat] || { label:'📦 Other', color:'#888' };
          const pct = (amt/grand*100).toFixed(1);
          return `<div style="margin-bottom:7px">
            <div style="display:flex;justify-content:space-between;margin-bottom:2px">
              <span style="font-size:11px;color:rgba(255,255,255,.7)">${c.label}</span>
              <span style="font-size:11px;font-weight:700;color:${c.color}">${INR(Math.round(amt))}</span>
            </div>
            <div style="height:6px;background:rgba(255,255,255,.07);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${c.color};border-radius:3px"></div>
            </div>
            <div style="font-size:9px;color:rgba(255,255,255,.25);margin-top:1px">${pct}% of total</div>
          </div>`;
        }).join('')}
        <button class="asp-view-ask-btn" data-msg="Analyzed my transactions: ${JSON.stringify(Object.fromEntries(sorted.map(([k,v])=>[k,Math.round(v)])))}. Total ₹${Math.round(grand)}/month. Is this spending pattern healthy for someone with ${income?'income ₹'+Math.round(income):'my profile'}? Where am I overspending? Give me a specific budget cut plan." style="margin-top:8px;width:100%">
          🤖 Is my spending healthy?
        </button>`;
      res.querySelectorAll('.asp-view-ask-btn').forEach(b => b.addEventListener('click', () => handleAskBtn(b)));
      btn.disabled = false; btn.textContent = '📊 Re-analyze';
    });
  }

  /* ── 6. LIFE EVENT ADVISOR ───────────────────────────────────────────────── */
  const _LIFE_EVENTS = [
    { icon:'💍', label:'Marriage',      color:'#ff6b9d',
      prompt:'I am planning to get married. Restructure my complete financial plan for this life event. Cover: estimated wedding budget, emergency fund adjustment (combined couple), insurance upgrade, joint investment strategy, tax benefits as a couple, budget reallocation. Be specific with ₹ amounts using my profile data.' },
    { icon:'👶', label:'First Child',   color:'#ffd93d',
      prompt:'I am expecting my first child. Replan my finances for parenthood. Cover: education corpus needed (₹1.5Cr+ in 18 years at 10% education inflation), term insurance critical upgrade to 15-20x income, delivery expense planning, SIP increase target, Sukanya Samriddhi if girl child, monthly budget impact.' },
    { icon:'🏠', label:'Home Purchase', color:'#4dffb4',
      prompt:'I want to buy a home in India. Build a complete home purchase plan. Cover: down payment I can afford (20% of property), maximum EMI sustainable (40% rule), home loan amount and best tenure, total cost of ownership, rent vs buy analysis for my city, Section 80C and 24(b) tax benefits.' },
    { icon:'💼', label:'Job Change',    color:'#00d4ff',
      prompt:'I am changing jobs with a salary increase plus joining bonus. Build a financial plan for this transition. Cover: bonus deployment strategy (emergency first, then investments), exact SIP increase I should do, NPS/EPF portability checklist, updated 50/30/20 budget for new salary, tax implications of joining bonus.' },
    { icon:'📈', label:'Windfall',      color:'#b97dff',
      prompt:'I received a financial windfall (inheritance or bonus). Help me deploy it wisely. Cover: immediate tax implications, emergency fund top-up first, debt clearance priority, STP vs lump-sum into equity, asset allocation across equity/debt/gold, the exact split I should do with real numbers.' },
    { icon:'🎓', label:'Education',     color:'#ff9500',
      prompt:'I want to plan for higher education funding (mine or child). Calculate corpus needed with 10-12% education inflation. Recommend: PPF vs Sukanya vs ELSS vs 529-equivalent, timeline-based glide path, education loan strategy as backup, monthly SIP needed starting today to fund the goal.' },
  ];

  function buildLifeEventsSection() {
    return `
    <div id="agt-life-events" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)">
      <div class="agt-section-label">🌅 LIFE EVENT ADVISOR</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:6px">
        ${_LIFE_EVENTS.map((e, i) => `
          <button class="agt-life-btn" data-idx="${i}" title="${e.label}"
            style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px 4px;cursor:pointer;text-align:center;transition:all .15s">
            <div style="font-size:20px;margin-bottom:3px">${e.icon}</div>
            <div style="font-size:9px;color:rgba(255,255,255,.6);font-weight:600;line-height:1.2">${e.label}</div>
          </button>`).join('')}
      </div>
      <div id="agt-life-result" style="display:none;margin-top:8px"></div>
    </div>`;
  }

  function wireLifeEventsSection() {
    document.querySelectorAll('.agt-life-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const ev  = _LIFE_EVENTS[idx];
        const res = document.getElementById('agt-life-result');
        if (!res) return;

        document.querySelectorAll('.agt-life-btn').forEach(b => {
          b.style.borderColor = 'rgba(255,255,255,.08)';
          b.style.background  = 'rgba(255,255,255,.04)';
        });
        btn.style.borderColor = ev.color;
        btn.style.background  = ev.color + '15';

        res.style.display = 'block';
        res.innerHTML = `
          <div style="background:rgba(255,255,255,.04);border:1px solid ${ev.color}33;border-radius:10px;padding:10px">
            <div style="font-size:10px;font-weight:700;color:${ev.color};margin-bottom:6px">${ev.icon} ${ev.label} Financial Plan</div>
            <div class="asp-thinking" style="display:inline-flex;gap:4px"><span></span><span></span><span></span></div>
            <div id="agt-life-stream" style="font-size:10.5px;color:rgba(255,255,255,.75);line-height:1.6;margin-top:6px"></div>
          </div>`;
        res.scrollIntoView({ behavior:'smooth', block:'nearest' });

        const streamEl = document.getElementById('agt-life-stream');
        let full = '';
        try {
          await streamFromOllama(
            BASE_SYSTEM + getPersonaAppend() + '\n' + buildUserContext(getPageKey()),
            ev.prompt,
            tok => { full += tok; if (streamEl) streamEl.innerHTML = richText(full); },
            380
          );
          res.querySelector('.asp-thinking')?.remove();
          if (streamEl) {
            streamEl.innerHTML = richText(full);
            streamEl.insertAdjacentHTML('afterend',
              `<button class="asp-view-ask-btn" style="margin-top:8px;width:100%;font-size:10px"
                data-msg="Give me a month-by-month action checklist for ${ev.label} — what exactly do I do in month 1, 2, and 3?">
                🤖 Month-by-month checklist
              </button>`);
            res.querySelectorAll('.asp-view-ask-btn').forEach(b => b.addEventListener('click', () => handleAskBtn(b)));
          }
          await AryaMemoryDB.store(
            `Life event plan for ${ev.label}: ${full.slice(0, 120)}`,
            ['life-event', ev.label.toLowerCase()], 'plan'
          ).catch(() => {});
        } catch {
          if (streamEl) streamEl.innerHTML = '<span style="color:rgba(255,100,100,.5)">Start Ollama to get your personalized plan.</span>';
        }
      });
    });
  }

  /* ── 7. AI DEBATE MODE ───────────────────────────────────────────────────── */
  function buildDebateSection() {
    return `
    <div id="agt-debate" style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)">
      <div class="agt-section-label">⚖️ AI DEBATE MODE</div>
      <div style="font-size:9.5px;color:rgba(255,255,255,.3);margin:4px 0 7px">Enter a financial dilemma — Arya argues both sides then gives a verdict</div>
      <input id="agt-debate-q" type="text" placeholder="e.g. Prepay home loan vs invest in SIP?"
        style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:7px;padding:7px 10px;color:#fff;font-size:11px;box-sizing:border-box;margin-bottom:6px">
      <button id="agt-debate-run" style="width:100%;padding:7px;background:rgba(255,165,0,.08);border:1px solid rgba(255,165,0,.25);border-radius:7px;color:#ffa500;font-size:11px;font-weight:700;cursor:pointer">⚖️ Start Debate</button>
      <div id="agt-debate-result" style="margin-top:8px;display:none"></div>
    </div>`;
  }

  function wireDebateSection() {
    document.getElementById('agt-debate-run')?.addEventListener('click', async () => {
      const q   = document.getElementById('agt-debate-q')?.value?.trim();
      if (!q) return;
      const res = document.getElementById('agt-debate-result');
      const btn = document.getElementById('agt-debate-run');
      btn.disabled = true; btn.textContent = '⏳ Debating…';
      res.style.display = 'block';
      res.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
          <div style="background:rgba(0,255,100,.04);border:1px solid rgba(0,255,100,.18);border-radius:8px;padding:8px">
            <div style="font-size:9.5px;font-weight:800;color:#4dffb4;margin-bottom:5px">🟢 BULL CASE</div>
            <div id="debate-bull" style="font-size:10px;color:rgba(255,255,255,.7);line-height:1.5">
              <div class="asp-thinking"><span></span><span></span><span></span></div>
            </div>
          </div>
          <div style="background:rgba(255,80,80,.04);border:1px solid rgba(255,80,80,.18);border-radius:8px;padding:8px">
            <div style="font-size:9.5px;font-weight:800;color:#ff4d6d;margin-bottom:5px">🔴 BEAR CASE</div>
            <div id="debate-bear" style="font-size:10px;color:rgba(255,255,255,.7);line-height:1.5">
              <div class="asp-thinking"><span></span><span></span><span></span></div>
            </div>
          </div>
        </div>
        <div id="debate-verdict" style="display:none;background:rgba(255,211,0,.05);border:1px solid rgba(255,211,0,.2);border-radius:8px;padding:8px">
          <div style="font-size:9.5px;font-weight:800;color:#ffd93d;margin-bottom:4px">⚖️ Arya's Verdict</div>
          <div id="debate-verdict-text" style="font-size:10px;color:rgba(255,255,255,.75);line-height:1.5"></div>
        </div>`;
      res.scrollIntoView({ behavior:'smooth', block:'nearest' });

      const ctx = buildUserContext(getPageKey());
      const bullEl = document.getElementById('debate-bull');
      const bearEl = document.getElementById('debate-bear');

      let bull = '';
      try {
        await streamFromOllama(
          BASE_SYSTEM + ctx + '\nNow argue the strongest possible BULL CASE for this decision. 4-5 crisp bullet points. No hedging.',
          'Bull case for: ' + q,
          tok => { bull += tok; if (bullEl) bullEl.innerHTML = richText(bull); }, 200
        );
      } catch { if (bullEl) bullEl.innerHTML = '<span style="color:rgba(255,255,255,.25)">Offline</span>'; }

      let bear = '';
      try {
        await streamFromOllama(
          BASE_SYSTEM + ctx + '\nNow argue the strongest possible BEAR CASE against this decision. 4-5 crisp bullet points. No hedging.',
          'Bear case against: ' + q,
          tok => { bear += tok; if (bearEl) bearEl.innerHTML = richText(bear); }, 200
        );
      } catch { if (bearEl) bearEl.innerHTML = '<span style="color:rgba(255,255,255,.25)">Offline</span>'; }

      const vrdBox = document.getElementById('debate-verdict');
      const vrdEl  = document.getElementById('debate-verdict-text');
      if (vrdBox) vrdBox.style.display = 'block';
      let vrd = '';
      try {
        await streamFromOllama(
          BASE_SYSTEM + ctx + '\nGive a 2-3 sentence balanced verdict for THIS specific person given their financial profile. Be direct.',
          `Bull: ${bull.slice(0,180)} | Bear: ${bear.slice(0,180)} | Q: ${q}`,
          tok => { vrd += tok; if (vrdEl) vrdEl.innerHTML = richText(vrd); }, 150
        );
      } catch { if (vrdEl) vrdEl.textContent = 'Start Ollama for Arya\'s verdict.'; }

      btn.disabled = false; btn.textContent = '⚖️ New Debate';
    });
  }

  /* ── 8. FINANCIAL REPORT GENERATOR ──────────────────────────────────────── */
  function generateFinancialReport() {
    const name   = get('finos_display_name','User');
    const age    = get('finos_age','30');
    const city   = get('finos_city','India');
    const income = parseFloat(get('finos_income','0'))        || 0;
    const nw     = parseFloat(get('finos_net_worth','0'))     || 0;
    const sip    = parseFloat(get('finos_sip_amount','0'))    || 0;
    const health = parseFloat(get('finos_health_score','0'))  || 0;
    const dna    = get('finos_financial_dna','Explorer');
    const fire   = parseFloat(get('finos_fire_target','30000000')) || 30000000;
    const emerg  = parseFloat(get('finos_emergency_fund','0'))|| 0;
    const debt   = parseFloat(get('finos_total_debt','0'))    || 0;
    const persona = ADVISOR_PERSONAS[_currentPersona];

    const fireYrs = (() => {
      if (!income || !sip) return '?';
      const r  = 0.12 / 12;
      const gap = fire - nw;
      if (gap <= 0) return 0;
      const mo = Math.ceil(Math.log(1 + gap * r / Math.max(sip, 1)) / Math.log(1 + r));
      return Math.ceil(mo / 12);
    })();

    const hColor = health >= 70 ? '#4dffb4' : health >= 40 ? '#ffd93d' : '#ff4d6d';
    const efMonths = income > 0 ? (emerg / income).toFixed(1) : '?';
    const sipRate  = income > 0 ? (sip / income * 100).toFixed(0) : '?';
    const debtEMI  = debt > 0 ? (debt / 120) : 0; // rough 10yr EMI estimate
    const debtRatio = income > 0 ? (debtEMI / income * 100).toFixed(0) : '0';

    const html = `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>FIN-OS Report — ${name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0d15;color:#e0e0e0;padding:32px 28px;max-width:860px;margin:0 auto;line-height:1.5}
h1{font-size:26px;font-weight:900;color:#fff;margin-bottom:2px}
.sub{color:rgba(0,212,255,.7);font-size:12px;margin-bottom:28px;letter-spacing:.3px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:28px}
.card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:16px}
.clabel{font-size:9.5px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px}
.cval{font-size:20px;font-weight:900;color:#00d4ff}
.csub{font-size:10px;color:rgba(255,255,255,.35);margin-top:2px}
.sec{margin-bottom:26px}
.sec-title{font-size:14px;font-weight:800;color:#fff;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:6px;margin-bottom:14px}
.bar-row{display:flex;align-items:center;gap:10px;margin-bottom:7px}
.blabel{width:130px;font-size:10.5px;color:rgba(255,255,255,.6)}
.btrack{flex:1;height:8px;background:rgba(255,255,255,.07);border-radius:4px;overflow:hidden}
.bfill{height:100%;border-radius:4px}
.bval{width:70px;font-size:10.5px;color:rgba(255,255,255,.8);text-align:right;font-weight:700}
.good{color:#4dffb4} .warn{color:#ffd93d} .danger{color:#ff4d6d}
.action-list li{font-size:11.5px;margin-bottom:8px;padding-left:4px}
.persona-badge{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:3px 10px;font-size:11px;color:#fff;margin-left:10px}
.footer{text-align:center;color:rgba(255,255,255,.2);font-size:9.5px;margin-top:32px;border-top:1px solid rgba(255,255,255,.05);padding-top:14px}
</style>
</head>
<body>
<h1>💸 FIN-OS Financial Health Report <span class="persona-badge">${persona.icon} ${persona.name} Mode</span></h1>
<div class="sub">${name} · ${city} · Age ${age} · Generated ${new Date().toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric'})}</div>

<div class="grid">
  <div class="card"><div class="clabel">Health Score</div><div class="cval" style="color:${hColor}">${health}/100</div><div class="csub">DNA: ${dna}</div></div>
  <div class="card"><div class="clabel">Net Worth</div><div class="cval">${INR(nw)}</div><div class="csub">Debt: ${INR(debt)}</div></div>
  <div class="card"><div class="clabel">Monthly Income</div><div class="cval">${INR(income)}</div><div class="csub">SIP: ${INR(sip)}/mo</div></div>
  <div class="card"><div class="clabel">FIRE Target</div><div class="cval">${INR(fire)}</div><div class="csub">ETA: ~${fireYrs} years</div></div>
</div>

<div class="sec">
  <div class="sec-title">📊 Key Metrics vs Best-Practice Targets</div>
  ${[
    { label:'Emergency Fund', actual: efMonths + ' mo', pct: Math.min(100, income > 0 ? emerg/income/6*100 : 0), target:'6 months income', color: parseFloat(efMonths) >= 6 ? '#4dffb4' : parseFloat(efMonths) >= 3 ? '#ffd93d' : '#ff4d6d' },
    { label:'Savings / SIP Rate', actual: sipRate + '%', pct: Math.min(100, income > 0 ? sip/income/0.20*100 : 0), target:'20% of income', color: parseFloat(sipRate) >= 20 ? '#4dffb4' : parseFloat(sipRate) >= 10 ? '#ffd93d' : '#ff4d6d' },
    { label:'Debt-to-Income', actual: debtRatio + '%', pct: Math.min(100, 100 - parseFloat(debtRatio)/40*100), target:'<40% EMI rule', color: parseFloat(debtRatio) <= 20 ? '#4dffb4' : parseFloat(debtRatio) <= 40 ? '#ffd93d' : '#ff4d6d' },
    { label:'NW vs Income Ratio', actual: income > 0 ? (nw/income).toFixed(0)+'x' : '?', pct: Math.min(100, income > 0 ? nw/income/10*100 : 0), target:'10x monthly income', color: income > 0 && nw >= income*10 ? '#4dffb4' : income > 0 && nw >= income*5 ? '#ffd93d' : '#ff4d6d' },
  ].map(m=>`<div class="bar-row">
    <div class="blabel">${m.label}</div>
    <div class="btrack"><div class="bfill" style="width:${m.pct.toFixed(0)}%;background:${m.color}"></div></div>
    <div class="bval" style="color:${m.color}">${m.actual}</div>
  </div>`).join('')}
</div>

<div class="sec">
  <div class="sec-title">🎯 Priority Action Plan</div>
  <ol class="action-list" style="padding-left:18px">
    ${emerg < income * 3 ? `<li><span class="danger">URGENT — Build Emergency Fund:</span> You have ${efMonths} months. Add ${INR(income*6-emerg)} to reach the 6-month target. Park in liquid fund or HDFC Liquid/Savings account.</li>` : `<li><span class="good">Emergency Fund ✓</span> — Well-funded at ${efMonths} months. Review every 6 months as income grows.</li>`}
    ${sip < income * 0.15 ? `<li><span class="warn">Increase SIP:</span> At ${sipRate}% savings rate, you need to increase SIP by ${INR(income*0.20-sip)}/month. Set up auto-increment SIP to grow 10% every year.</li>` : `<li><span class="good">SIP Rate ✓</span> — Strong ${sipRate}% savings rate. Consider stepping up 10% annually.</li>`}
    ${income > 0 && nw < income * 5 ? `<li><span class="warn">Accelerate Net Worth:</span> At ${(nw/income).toFixed(0)}x income, focus on reducing discretionary spend and parking every bonus into investments.</li>` : `<li><span class="good">Net Worth Track ✓</span> — Ahead of curve at ${income > 0 ? (nw/income).toFixed(0) : '?'}x income. Keep compounding.</li>`}
    <li>Review and rebalance portfolio every 6 months. Ensure equity allocation = (100 - age)% = ${100 - parseInt(age)}% for balanced ${persona.name} approach.</li>
  </ol>
</div>

<div class="footer">
  Generated by Arya AI · FIN-OS · ${new Date().toLocaleString('en-IN')} · All data from local profile · 100% private · No cloud
</div>
</body></html>`;
    const blob = new Blob([html], { type:'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  /* ── 9. BACKGROUND FINANCIAL MONITOR ─────────────────────────────────────── */
  function startBackgroundMonitor() {
    setTimeout(_runMonitorChecks, 2500);
  }

  function _runMonitorChecks() {
    const income = parseFloat(get('finos_income',          '0')) || 0;
    const emerg  = parseFloat(get('finos_emergency_fund',  '0')) || 0;
    const sip    = parseFloat(get('finos_sip_amount',      '0')) || 0;
    const debt   = parseFloat(get('finos_total_debt',      '0')) || 0;
    const score  = parseFloat(get('finos_health_score',    '0')) || 0;
    if (!income) return;

    const alerts = [];
    if (emerg < income * 3)
      alerts.push({ lvl:'danger', msg:`Emergency fund is only ${(emerg/income).toFixed(1)} months — build to 6 months (₹${Math.round(income*6-emerg).toLocaleString('en-IN')})` });
    if (sip < income * 0.10)
      alerts.push({ lvl:'warn',   msg:`SIP is only ${(sip/income*100).toFixed(0)}% of income — target 15-20% to build long-term wealth` });
    if (debt > 0 && (debt/120)/income > 0.45)
      alerts.push({ lvl:'danger', msg:`Estimated EMI exceeds 45% of income — high debt stress, consider accelerated repayment` });
    if (score > 0 && score < 35)
      alerts.push({ lvl:'warn',   msg:`Financial health score ${Math.round(score)}/100 — multiple areas need attention` });

    if (!alerts.length) return;
    if (document.getElementById('arya-monitor-bar')) return; // already shown

    const bar = document.createElement('div');
    bar.id = 'arya-monitor-bar';
    bar.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;background:rgba(255,150,0,.07);border-bottom:1px solid rgba(255,150,0,.18);flex-shrink:0">
        <span style="font-size:14px;flex-shrink:0;margin-top:1px">⚠️</span>
        <div style="flex:1;min-width:0">
          ${alerts.map(a => `<div style="font-size:10px;color:${a.lvl==='danger'?'#ff6b6b':'#ffd93d'};line-height:1.55">${a.msg}</div>`).join('')}
        </div>
        <button onclick="document.getElementById('arya-monitor-bar').remove()"
          style="background:none;border:none;color:rgba(255,255,255,.25);font-size:14px;cursor:pointer;flex-shrink:0;padding:0;line-height:1">✕</button>
      </div>`;
    const panel = document.getElementById('arya-sp-panel');
    const tabsEl = panel?.querySelector('#arya-sp-tabs');
    if (tabsEl) panel.insertBefore(bar, tabsEl);
  }

  /* ══ INJECT CSS ══════════════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('arya-sp-css')) return;
    const s = document.createElement('style');
    s.id = 'arya-sp-css';
    s.textContent = `
/* ── Arya Sidebar Panel v2 ────────────────────────────────────── */
#arya-sp-backdrop {
  position: fixed !important; inset: 0 !important; z-index: 999990 !important;
  background: rgba(0,0,0,.72) !important; backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  opacity: 0 !important; pointer-events: none !important;
  transition: opacity .3s ease !important;
}
#arya-sp-backdrop.open { opacity: 1 !important; pointer-events: all !important; }

#arya-sp-panel {
  position: fixed !important;
  top: 50% !important; left: 50% !important;
  right: auto !important; bottom: auto !important;
  z-index: 999991 !important;
  width: min(1100px, 94vw) !important;
  height: min(92vh, 960px) !important;
  background: linear-gradient(160deg, #08101e 0%, #0a0d18 55%, #090c14 100%) !important;
  border: 1px solid rgba(0,212,255,.22) !important;
  border-radius: 22px !important;
  display: flex !important; flex-direction: column !important;
  transform: translate(-50%, -50%) scale(0.91) !important;
  opacity: 0 !important;
  transition: transform .38s cubic-bezier(.22,.61,.36,1), opacity .28s ease !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif !important;
  box-shadow:
    0 40px 120px rgba(0,0,0,.95),
    0 0 0 1px rgba(0,212,255,.10),
    0 0 80px rgba(0,212,255,.06),
    inset 0 1px 0 rgba(255,255,255,.07) !important;
  overflow: hidden !important;
}
#arya-sp-panel.open {
  transform: translate(-50%, -50%) scale(1) !important;
  opacity: 1 !important;
}
@media (max-width: 720px) {
  #arya-sp-panel {
    width: 100vw !important; height: 100dvh !important;
    border-radius: 0 !important;
    top: 0 !important; left: 0 !important;
    transform: translateY(24px) !important;
  }
  #arya-sp-panel.open { transform: translateY(0) !important; }
}

/* ── Header ────────────────────────────────────────────────────────── */
#arya-sp-header {
  flex-shrink: 0;
  background: linear-gradient(135deg,rgba(0,212,255,.1) 0%,rgba(123,47,247,.08) 60%,rgba(0,0,0,0) 100%);
  border-bottom: 1px solid rgba(0,212,255,.12);
  padding: 10px 16px 10px;
  display: flex; align-items: center; gap: 12px;
  position: relative;
}
#arya-sp-header::after {
  content:''; position:absolute; inset:0; pointer-events:none;
  background: radial-gradient(ellipse 70% 60% at 20% 0%, rgba(0,212,255,.05) 0%, transparent 70%);
}
#arya-sp-avatar {
  width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0;
  background: linear-gradient(135deg, #00d4ff 0%, #7b2ff7 100%);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; box-shadow: 0 4px 16px rgba(0,212,255,.35), 0 2px 6px rgba(0,0,0,.5);
  position: relative;
}
#arya-sp-pulse {
  position: absolute; top: -2px; right: -2px;
  width: 10px; height: 10px; border-radius: 50%;
  background: #00ffb3; border: 2px solid #08101e;
  animation: aspPulse 2.4s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(0,255,179,.6);
}
@keyframes aspPulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.35);opacity:.65} }
#arya-sp-title-wrap { flex: 1; min-width: 0; }
#arya-sp-title {
  font-size: 15px; font-weight: 900; color: #fff; letter-spacing: -.2px; line-height: 1.2;
  background: linear-gradient(90deg, #fff 0%, rgba(0,212,255,.9) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
#arya-sp-page-label {
  font-size: 9.5px; color: rgba(0,212,255,.7); font-weight: 700;
  letter-spacing: .7px; margin-top: 2px; text-transform: uppercase;
  display: flex; align-items: center; gap: 5px;
}
#arya-sp-page-label::before {
  content:''; display:inline-block; width:4px; height:4px; border-radius:50%;
  background: #00d4ff; box-shadow: 0 0 5px #00d4ff;
}
#arya-sp-close {
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.09);
  border-radius: 10px; width: 30px; height: 30px;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,.4); font-size: 14px; line-height: 1;
  flex-shrink: 0; transition: all .18s;
}
#arya-sp-close:hover { background: rgba(255,80,80,.12); border-color: rgba(255,80,80,.3); color: #ff6b6b; transform: scale(1.08); }

/* ── Live Ticker Strip ─────────────────────────────────────────────── */
#arya-ticker-strip {
  flex-shrink: 0; overflow: hidden; height: 26px;
  background: rgba(0,0,0,.25); border-bottom: 1px solid rgba(255,255,255,.04);
  display: flex; align-items: center;
}
#arya-ticker-inner {
  display: flex; gap: 0; align-items: center; height: 100%;
  white-space: nowrap; will-change: transform;
}
.arya-tick-item {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 0 14px; height: 100%; font-size: 10.5px; font-weight: 700;
  border-right: 1px solid rgba(255,255,255,.05); flex-shrink: 0;
}
.arya-tick-name { color: rgba(255,255,255,.4); font-size: 10px; letter-spacing: .3px; }
.arya-tick-price { color: rgba(255,255,255,.85); }
.arya-tick-chg.up { color: #4dffb4; }
.arya-tick-chg.down { color: #ff4d6d; }
.arya-tick-chg.flat { color: rgba(255,255,255,.35); }
@keyframes arya-ticker-scroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
#arya-ticker-inner.scrolling { animation: arya-ticker-scroll 28s linear infinite; }

/* ── Snapshot widget ───────────────────────────────────────────────── */
#arya-sp-snapshot {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 6px 16px 6px;
  border-bottom: 1px solid rgba(255,255,255,.05);
  background: rgba(0,212,255,.02);
}
.asp-snap-ring-wrap { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.asp-snap-ring-label { font-size: 9px; color: rgba(255,255,255,.35); font-weight: 700; text-transform: uppercase; letter-spacing: .5px; }
.asp-snap-goal { flex: 1; min-width: 0; }
.asp-snap-goal-name { font-size: 12px; color: rgba(255,255,255,.75); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.asp-snap-goal-track { height: 6px; background: rgba(255,255,255,.07); border-radius: 4px; margin: 6px 0 4px; overflow: hidden; }
.asp-snap-goal-fill { height: 100%; background: linear-gradient(90deg,#00d4ff,#7b2ff7); border-radius: 4px; transition: width 1.2s cubic-bezier(.22,.61,.36,1); }
.asp-snap-goal-meta { font-size: 10.5px; color: rgba(255,255,255,.3); }

/* ── Context pills bar ─────────────────────────────────────────────── */
#arya-sp-context {
  flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  padding: 5px 16px; background: rgba(0,0,0,.15);
  border-bottom: 1px solid rgba(255,255,255,.04);
  overflow-x: auto; scrollbar-width: none;
}
#arya-sp-context::-webkit-scrollbar { display: none; }
.asp-ctx-pill {
  flex-shrink: 0; white-space: nowrap;
  background: rgba(0,212,255,.07); border: 1px solid rgba(0,212,255,.14);
  border-radius: 20px; padding: 4px 11px;
  font-size: 10.5px; font-weight: 600; color: rgba(0,212,255,.8); letter-spacing: .3px;
}
.asp-ctx-pill.good  { background: rgba(0,255,180,.08); border-color: rgba(0,255,180,.2); color: #00ffb3; }
.asp-ctx-pill.warn  { background: rgba(255,180,0,.08);  border-color: rgba(255,180,0,.2);  color: #ffb300; }
.asp-ctx-pill.crit  { background: rgba(255,60,60,.08);  border-color: rgba(255,60,60,.2);  color: #ff4444; }

/* ── Messages ──────────────────────────────────────────────────────── */
#arya-sp-messages {
  flex: 1; overflow-y: auto; padding: 16px 20px;
  display: flex; flex-direction: column; gap: 12px;
  scroll-behavior: smooth;
}
#arya-sp-messages::-webkit-scrollbar { width: 3px; }
#arya-sp-messages::-webkit-scrollbar-track { background: transparent; }
#arya-sp-messages::-webkit-scrollbar-thumb { background: rgba(0,212,255,.18); border-radius: 3px; }

.asp-msg { display: flex; gap: 11px; }
.asp-msg.arya { align-items: flex-start; }
.asp-msg.user { align-items: flex-start; flex-direction: row-reverse; }
.asp-msg-avatar {
  width: 32px; height: 32px; border-radius: 11px; flex-shrink: 0;
  background: linear-gradient(135deg,#00d4ff,#7b2ff7);
  display: flex; align-items: center; justify-content: center; font-size: 14px;
  box-shadow: 0 3px 12px rgba(0,212,255,.25);
}
.asp-msg.user .asp-msg-avatar {
  background: linear-gradient(135deg,#7b2ff7,#b97dff);
  box-shadow: 0 3px 12px rgba(123,47,247,.3);
}
.asp-msg-bubble {
  max-width: 76%; padding: 11px 15px; border-radius: 18px;
  font-size: 14px; line-height: 1.65; color: rgba(255,255,255,.88);
}
.asp-msg.arya .asp-msg-bubble {
  background: rgba(0,212,255,.07); border: 1px solid rgba(0,212,255,.14);
  border-top-left-radius: 4px;
  box-shadow: 0 2px 16px rgba(0,0,0,.25);
}
.asp-msg.user .asp-msg-bubble {
  background: linear-gradient(135deg,rgba(123,47,247,.2),rgba(185,125,255,.12));
  border: 1px solid rgba(123,47,247,.25);
  border-top-right-radius: 4px; color: rgba(255,255,255,.92);
  box-shadow: 0 2px 16px rgba(0,0,0,.25);
}
.asp-cursor::after { content:'▌'; animation: aspBlink .65s infinite; }
@keyframes aspBlink { 0%,100%{opacity:1} 50%{opacity:0} }
.asp-thinking { display: flex; align-items: center; gap: 6px; padding: 12px 16px; }
.asp-thinking span {
  width: 8px; height: 8px; border-radius: 50%; background: rgba(0,212,255,.55);
  animation: aspDot 1.3s ease-in-out infinite;
}
.asp-thinking span:nth-child(2) { animation-delay: .18s; background: rgba(123,47,247,.6); }
.asp-thinking span:nth-child(3) { animation-delay: .36s; background: rgba(185,125,255,.55); }
@keyframes aspDot { 0%,100%{opacity:.2;transform:scale(.75)} 50%{opacity:1;transform:scale(1.2)} }

/* 7. Rating buttons */
.asp-rating {
  display: flex; align-items: center; gap: 6px;
  margin-top: 5px; padding-left: 36px;
}
.asp-rate-btn {
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08);
  border-radius: 8px; padding: 3px 8px; font-size: 12px; cursor: pointer;
  color: rgba(255,255,255,.4); transition: all .15s;
}
.asp-rate-btn:hover { background: rgba(255,255,255,.1); color: #fff; transform: scale(1.1); }
.asp-rate-text { font-size: 11px; color: rgba(255,255,255,.4); }

/* ── Quick chips ───────────────────────────────────────────────────── */
#arya-sp-chips {
  flex-shrink: 0; padding: 7px 16px 6px;
  display: flex; flex-wrap: wrap; gap: 6px;
  border-top: 1px solid rgba(255,255,255,.05);
  max-height: 80px; overflow-y: auto; scrollbar-width: none;
}
#arya-sp-chips::-webkit-scrollbar { display: none; }
.asp-chip {
  padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: 12px; font-weight: 600;
  background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.09);
  color: rgba(255,255,255,.68); transition: all .18s; white-space: nowrap;
  letter-spacing: .01em;
}
.asp-chip:hover {
  background: rgba(0,212,255,.12); border-color: rgba(0,212,255,.32); color: #00d4ff;
  transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,212,255,.15);
}
.asp-chip-followup { background: rgba(123,47,247,.08); border-color: rgba(123,47,247,.2); color: rgba(185,125,255,.85); }
.asp-chip-followup:hover { background: rgba(123,47,247,.16); border-color: rgba(185,125,255,.4); color: #b97dff; box-shadow: 0 4px 14px rgba(123,47,247,.2); }

/* ── Input area ────────────────────────────────────────────────────── */
#arya-sp-input-wrap {
  flex-shrink: 0; display: flex; gap: 8px; align-items: flex-end;
  padding: 10px 16px 14px; border-top: 1px solid rgba(255,255,255,.06);
  background: linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,.4) 100%);
}
#arya-sp-input {
  flex: 1; padding: 11px 15px;
  background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12);
  border-radius: 16px; color: #fff; font-size: 13.5px; font-family: inherit;
  resize: none; outline: none; line-height: 1.55;
  min-height: 44px; max-height: 120px;
  transition: border-color .2s, background .2s, box-shadow .2s;
}
#arya-sp-input::placeholder { color: rgba(255,255,255,.25); }
#arya-sp-input:focus {
  border-color: rgba(0,212,255,.45); background: rgba(0,212,255,.04);
  box-shadow: 0 0 0 3px rgba(0,212,255,.06);
}
#arya-sp-mic {
  width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
  cursor: pointer; font-size: 18px; display: flex; align-items: center; justify-content: center;
  transition: all .18s;
}
#arya-sp-mic:hover { background: rgba(0,212,255,.12); border-color: rgba(0,212,255,.3); transform: scale(1.05); }
#arya-sp-mic.listening { background: rgba(255,60,60,.18); border-color: #ff4d6d; animation: aspPulse 1s infinite; }
#arya-sp-send {
  width: 44px; height: 44px; border-radius: 14px; flex-shrink: 0;
  background: linear-gradient(135deg,#00d4ff 0%,#7b2ff7 100%);
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all .18s; box-shadow: 0 4px 18px rgba(0,212,255,.3);
}
#arya-sp-send:hover { transform: scale(1.07) translateY(-1px); box-shadow: 0 6px 24px rgba(0,212,255,.45); }
#arya-sp-send:disabled { opacity: .35; cursor: not-allowed; transform: none; box-shadow: none; }
#arya-sp-send svg { width: 16px; height: 16px; fill: #fff; stroke: none; }

/* Offline notice */
#arya-sp-offline { display: none; padding: 10px 16px; font-size: 12px; color: rgba(255,180,0,.8); background: rgba(255,180,0,.06); border-top: 1px solid rgba(255,180,0,.12); text-align: center; }
#arya-sp-offline.show { display: block; }

/* History notice */
#arya-sp-history-notice {
  flex-shrink: 0; padding: 6px 16px; font-size: 11px;
  color: rgba(255,255,255,.3); text-align: center;
  border-bottom: 1px solid rgba(255,255,255,.04);
  background: rgba(123,47,247,.04);
}

/* TOC inject button */
#arya-toc-btn {
  display: block; width: calc(100% - 24px); margin: 12px;
  padding: 10px 14px; background: linear-gradient(135deg,rgba(0,212,255,.12),rgba(123,47,247,.1));
  border: 1px solid rgba(0,212,255,.2); border-radius: 12px;
  color: #00d4ff; font-size: 13px; font-weight: 700; cursor: pointer;
  text-align: left; font-family: inherit; transition: all .2s;
}
#arya-toc-btn:hover { background: linear-gradient(135deg,rgba(0,212,255,.2),rgba(123,47,247,.15)); transform: translateY(-1px); }

/* Sidebar arrow toggle */
.sb-arya-row .sb-arya-arrow { transition: transform .2s; }
.arya-panel-open .sb-arya-arrow { transform: rotate(90deg); }

/* Light theme */
/* Panel stays dark always — it's a Bloomberg-style cockpit, not a page element */
[data-theme="light"] #arya-sp-panel { background: linear-gradient(160deg, #08101e 0%, #0a0d18 55%, #090c14 100%) !important; border-color: rgba(0,212,255,.22) !important; box-shadow: 0 40px 120px rgba(0,0,0,.9), 0 0 0 1px rgba(0,212,255,.10), 0 0 80px rgba(0,212,255,.06) !important; }
[data-theme="light"] #arya-sp-header { background: linear-gradient(135deg, rgba(0,100,200,.07), rgba(100,0,200,.05)); border-bottom-color: rgba(0,100,200,.12); }
[data-theme="light"] .asp-msg-bubble { color: #1a1a2e; }
[data-theme="light"] .asp-msg.arya .asp-msg-bubble { background: rgba(0,100,200,.06); border-color: rgba(0,100,200,.12); }
[data-theme="light"] .asp-msg.user .asp-msg-bubble { background: rgba(100,0,200,.08); border-color: rgba(100,0,200,.15); color: #1a1a2e; }
[data-theme="light"] #arya-sp-input { background: #fff; border-color: rgba(0,0,0,.12); color: #1a1a2e; }
[data-theme="light"] .asp-chip { background: rgba(0,0,0,.04); border-color: rgba(0,0,0,.1); color: #333; }
[data-theme="light"] #arya-sp-title { color: #0a0d15; }
[data-theme="light"] #arya-sp-snapshot { background: rgba(0,100,200,.03); }
[data-theme="light"] #arya-ticker-strip { background: rgba(0,0,0,.04); border-bottom-color: rgba(0,0,0,.08); }
[data-theme="light"] .arya-tick-name { color: rgba(0,0,0,.45); }
[data-theme="light"] .arya-tick-price { color: rgba(0,0,0,.8); }
[data-theme="light"] .arya-tick-chg.flat { color: rgba(0,0,0,.35); }

/* ── Tab bar ───────────────────────────────────────────────── */
#arya-sp-tabs {
  flex-shrink: 0; display: flex; gap: 2px;
  padding: 5px 12px 0; border-bottom: 1px solid rgba(255,255,255,.07);
  background: rgba(0,0,0,.3); overflow-x: auto; scrollbar-width: none;
}
#arya-sp-tabs::-webkit-scrollbar { display: none; }
.asp-tab {
  flex-shrink: 0; padding: 5px 12px 6px; border-radius: 8px 8px 0 0; border: none;
  border-bottom: 2.5px solid transparent;
  background: transparent; color: rgba(255,255,255,.35); font-size: 11px;
  font-weight: 700; cursor: pointer; font-family: inherit;
  transition: color .18s, background .18s, border-color .18s; white-space: nowrap;
  display: flex; flex-direction: row; align-items: center; gap: 5px; min-width: 0;
}
.asp-tab .asp-tab-icon { font-size: 13px; line-height: 1; }
.asp-tab .asp-tab-label { font-size: 10px; letter-spacing: .4px; font-weight: 800; text-transform: uppercase; }
.asp-tab.active {
  background: rgba(0,212,255,.06); color: #00d4ff;
  border-bottom-color: #00d4ff;
}
.asp-tab:hover:not(.active) { background: rgba(255,255,255,.04); color: rgba(255,255,255,.65); }

/* ── View system ────────────────────────────────────────────── */
.asp-view { display: none; flex: 1; flex-direction: column; overflow: hidden; min-height: 0; }
.asp-view.active { display: flex; }
#asp-view-chat { overflow: hidden; }

/* Roadmap view inside panel */
#asp-view-roadmap { overflow: hidden; }
#arya-rm-container {
  flex: 1; overflow-y: auto; padding: 14px 12px;
  scrollbar-width: thin; scrollbar-color: rgba(0,212,255,.2) transparent;
}
#arya-rm-container::-webkit-scrollbar { width: 3px; }
#arya-rm-container::-webkit-scrollbar-thumb { background: rgba(0,212,255,.2); border-radius: 3px; }
#arya-rm-container .rm-steps { grid-template-columns: 1fr !important; }
#arya-rm-container .rm-hero  { flex-direction: column !important; padding: 16px !important; }

/* Mindmap view inside panel */
#asp-view-mindmap { overflow: hidden; }
.asp-mm-hint {
  flex-shrink: 0; padding: 8px 12px; font-size: 10.5px;
  color: rgba(255,255,255,.3); text-align: center;
  border-bottom: 1px solid rgba(255,255,255,.04); letter-spacing: .2px;
}
#arya-mm-container { flex: 1; position: relative; overflow: hidden; min-height: 360px; }
#arya-mm-container svg { width: 100% !important; height: 100% !important; }
#arya-mm-container .mm-legend { flex-wrap: wrap; gap: 6px; padding: 10px 12px; }
#arya-mm-container .mm-reset-btn { bottom: 60px; right: 10px; }

/* Timeline view inside panel */
#asp-view-timeline { overflow: hidden; }
#arya-tl-container { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
#arya-tl-container .tl-header { padding: 12px 14px 0; margin-bottom: 14px !important; flex-shrink: 0; }
#arya-tl-container .tl-header h2 { font-size: 15px !important; }
#arya-tl-container .tl-scroll { flex: 1; }
#arya-tl-container .tl-legend { padding: 8px 14px; flex-shrink: 0; }

/* ── Ask Arya buttons in views ─────────────────────────────────────── */
.asp-view-ask-btn {
  flex-shrink: 0; margin: 10px 16px 14px; padding: 11px 16px;
  background: linear-gradient(135deg,rgba(0,212,255,.09),rgba(123,47,247,.08));
  border: 1px solid rgba(0,212,255,.2); border-radius: 14px;
  color: #00d4ff; font-size: 12.5px; font-weight: 700; cursor: pointer;
  font-family: inherit; transition: all .2s; text-align: left;
  display: flex; align-items: center; gap: 8px;
}
.asp-view-ask-btn:hover {
  background: linear-gradient(135deg,rgba(0,212,255,.16),rgba(123,47,247,.13));
  transform: translateY(-1px); box-shadow: 0 4px 20px rgba(0,212,255,.12);
}

/* Fade-in animation for tab views */
@keyframes aspFadeIn { from { opacity:0;transform:translateY(6px); } to { opacity:1;transform:translateY(0); } }
.asp-fade-in { animation: aspFadeIn .28s ease forwards; }

/* Spinner for lazy-load placeholders */
@keyframes aspSpinRm { to { transform: rotate(360deg); } }
.asp-rm-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 280px; gap: 14px; color: rgba(255,255,255,.35); font-size: 12.5px; }
.asp-rm-spinner { width: 38px; height: 38px; border: 3px solid rgba(0,212,255,.12); border-top-color: #00d4ff; border-radius: 50%; animation: aspSpinRm 1s linear infinite; }

/* ── Goal Cards ──────────────────────────────────────────────────── */
.apl-goal-card { background: rgba(255,255,255,.04); border-radius: 10px; padding: 10px 12px; border: 1px solid rgba(255,255,255,.07); transition: border-color .2s; }
.apl-goal-card:hover { border-color: rgba(0,212,255,.2); }

/* ── News Cards ──────────────────────────────────────────────────── */
.apl-news-card { padding: 8px 10px; margin-bottom: 6px; background: rgba(255,255,255,.03); border-radius: 8px; border-left: 2px solid rgba(0,212,255,.3); }
.apl-news-card:last-child { margin-bottom: 0; }
.apl-news-text { font-size: 11.5px; line-height: 1.55; color: rgba(255,255,255,.68); margin-bottom: 0; }

/* ── Command Hint ─────────────────────────────────────────────────── */
.asp-cmd-hint { padding: 6px 12px; font-size: 10.5px; color: rgba(255,255,255,.45); background: rgba(0,212,255,.06); border-top: 1px solid rgba(0,212,255,.12); letter-spacing: .01em; }
.asp-cmd-hint b { color: #00d4ff; }

/* ── Wealth Chart section ─────────────────────────────────────────── */
.apl-lab-section svg text { font-family: inherit; }

/* ── Ring entrance animation ─────────────────────────────── */
.apl-ring-fill { transition: stroke-dasharray 1.2s cubic-bezier(.22,.61,.36,1); }
.apl-big-ring-fill { transition: stroke-dasharray 1.4s cubic-bezier(.22,.61,.36,1); }
@keyframes aspRingPop { 0%{transform:scale(.85);opacity:0} 60%{transform:scale(1.06)} 100%{transform:scale(1);opacity:1} }
.apl-pillar svg { animation: aspRingPop .5s ease both; }
.apl-pillar:nth-child(1) svg { animation-delay:.05s }
.apl-pillar:nth-child(2) svg { animation-delay:.15s }
.apl-pillar:nth-child(3) svg { animation-delay:.25s }
.apl-pillar:nth-child(4) svg { animation-delay:.35s }
.apl-pillar:nth-child(5) svg { animation-delay:.45s }
@keyframes aspTabFade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
.asp-view.active { animation: aspTabFade .28s ease both; }

/* Light theme */
[data-theme="light"] #arya-sp-tabs { background: rgba(0,0,0,.04); border-bottom-color: rgba(0,0,0,.06); }
[data-theme="light"] .asp-tab { color: rgba(0,0,0,.4); }
[data-theme="light"] .asp-tab.active { background: rgba(0,100,200,.08); color: #0064c8; border-bottom-color: #0064c8; }
[data-theme="light"] .asp-view-ask-btn { background: rgba(0,100,200,.06); border-color: rgba(0,100,200,.15); color: #0064c8; }
[data-theme="light"] .apl-goal-card { background: rgba(0,0,0,.03); border-color: rgba(0,0,0,.08); }
[data-theme="light"] .apl-news-card { background: rgba(0,0,0,.03); border-left-color: rgba(0,100,200,.3); }
[data-theme="light"] .apl-news-text { color: rgba(0,0,0,.7); }
[data-theme="light"] .asp-cmd-hint { background: rgba(0,100,200,.05); border-top-color: rgba(0,100,200,.12); color: rgba(0,0,0,.5); }

/* ── Inline AI Response Box ──────────────────────────────────────── */
.asp-inline-resp { display:none; background: rgba(0,212,255,.06); border: 1px solid rgba(0,212,255,.18); border-radius: 12px; padding: 12px 14px; margin-top: 8px; animation: aspFadeIn .25s ease forwards; }
.asp-inline-resp-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.asp-inline-resp-who { font-size: 11px; font-weight: 800; color: #00d4ff; letter-spacing: .04em; }
.asp-inline-resp-x { background: none; border: none; color: rgba(255,255,255,.28); cursor: pointer; font-size: 13px; padding: 0 2px; line-height: 1; transition: color .15s; }
.asp-inline-resp-x:hover { color: rgba(255,255,255,.7); }
.asp-inline-resp-body { font-size: 12px; line-height: 1.65; }
.asp-inline-resp-text { color: rgba(255,255,255,.82); }
.asp-inline-resp-ft { margin-top: 10px; display: flex; gap: 8px; }
.asp-inline-resp-go { background: rgba(0,212,255,.1); border: 1px solid rgba(0,212,255,.2); border-radius: 20px; color: #00d4ff; font-size: 10.5px; font-weight: 700; padding: 4px 12px; cursor: pointer; transition: background .2s; }
.asp-inline-resp-go:hover { background: rgba(0,212,255,.18); }
.asp-inline-dots { display: inline-flex; gap: 3px; align-items: center; vertical-align: middle; }
.asp-inline-dots span { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,.45); animation: aspDot 1.2s ease-in-out infinite; }
.asp-inline-dots span:nth-child(2) { animation-delay: .2s; }
.asp-inline-dots span:nth-child(3) { animation-delay: .4s; }
[data-theme="light"] .asp-inline-resp { background: rgba(0,100,200,.05); border-color: rgba(0,100,200,.15); }
[data-theme="light"] .asp-inline-resp-who { color: #0064c8; }
[data-theme="light"] .asp-inline-resp-x { color: rgba(0,0,0,.25); }
[data-theme="light"] .asp-inline-resp-x:hover { color: rgba(0,0,0,.6); }
[data-theme="light"] .asp-inline-resp-text { color: rgba(0,0,0,.78); }
[data-theme="light"] .asp-inline-resp-go { background: rgba(0,100,200,.08); border-color: rgba(0,100,200,.2); color: #0064c8; }
[data-theme="light"] .asp-inline-resp-go:hover { background: rgba(0,100,200,.14); }

/* ── Agent Tab ─────────────────────────────────────────────────────── */
#asp-view-agent { padding: 0; }
#agt-wrap { padding: 18px 20px 24px; }
.agt-intro { margin-bottom: 18px; }
.agt-intro-title {
  font-size: 16px; font-weight: 900; letter-spacing: .02em; margin-bottom: 5px;
  background: linear-gradient(90deg, #b97dff, #7b2ff7);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
}
.agt-intro-sub { font-size: 12px; color: rgba(255,255,255,.38); line-height: 1.6; }

.agt-input-area { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.agt-goal-input {
  width: 100%; background: rgba(255,255,255,.05);
  border: 1px solid rgba(185,125,255,.22); border-radius: 14px;
  color: rgba(255,255,255,.9); font-size: 13.5px; line-height: 1.6;
  padding: 13px 15px; resize: none; outline: none;
  font-family: inherit; box-sizing: border-box;
  transition: border-color .2s, background .2s, box-shadow .2s;
  min-height: 80px;
}
.agt-goal-input:focus {
  border-color: rgba(185,125,255,.55); background: rgba(185,125,255,.04);
  box-shadow: 0 0 0 3px rgba(185,125,255,.07);
}
.agt-goal-input::placeholder { color: rgba(255,255,255,.22); }
.agt-run-btn {
  background: linear-gradient(135deg, #b97dff 0%, #7b2ff7 100%);
  border: none; border-radius: 14px; color: #fff; font-size: 14px; font-weight: 800;
  padding: 13px 24px; cursor: pointer;
  transition: transform .18s, box-shadow .18s, opacity .18s;
  letter-spacing: .03em; align-self: stretch;
  box-shadow: 0 4px 20px rgba(123,47,247,.4);
}
.agt-run-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(123,47,247,.55); }
.agt-run-btn:disabled { opacity: .4; cursor: not-allowed; transform: none; box-shadow: none; }

.agt-steps-hd {
  font-size: 10px; font-weight: 800; color: rgba(255,255,255,.3);
  letter-spacing: .1em; text-transform: uppercase; margin-bottom: 10px;
  display: flex; align-items: center; gap: 8px;
}
.agt-steps-hd::after { content:''; flex:1; height:1px; background: rgba(255,255,255,.06); }
#agt-steps { margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; }
.agt-step-item { }
.agt-step-goal { font-size: 12px; color: rgba(255,255,255,.5); font-style: italic; padding: 8px 12px; background: rgba(255,255,255,.04); border-radius: 10px; border-left: 2px solid rgba(255,255,255,.1); }
.agt-step-think { font-size: 11.5px; color: rgba(255,255,255,.38); display: flex; align-items: center; gap: 8px; padding: 5px 2px; }
.agt-step-tool {
  font-size: 12px; color: #ffd93d; padding: 7px 12px;
  background: rgba(255,211,61,.06); border-left: 3px solid rgba(255,211,61,.5);
  border-radius: 0 10px 10px 0;
}
.agt-step-tool b { font-weight: 800; color: #ffec6e; }
.agt-step-result { padding: 5px 0; }
.agt-result-pre {
  font-size: 11px; color: rgba(255,255,255,.72);
  background: rgba(255,255,255,.04); border-radius: 10px;
  padding: 10px 13px; margin: 0; white-space: pre-wrap; word-break: break-word;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; line-height: 1.6;
  border: 1px solid rgba(255,255,255,.06);
}
.agt-step-done { font-size: 11.5px; color: #4dffb4; font-weight: 800; display: flex; align-items: center; gap: 5px; }
.agt-step-error { font-size: 12px; color: #ff4d6d; padding: 7px 12px; background: rgba(255,77,109,.07); border-radius: 10px; border: 1px solid rgba(255,77,109,.15); }

.agt-final-hd {
  font-size: 10px; font-weight: 800; color: #4dffb4;
  letter-spacing: .1em; text-transform: uppercase; margin-bottom: 12px;
  display: flex; align-items: center; gap: 8px;
}
.agt-final-hd::after { content:''; flex:1; height:1px; background: rgba(77,255,180,.15); }
.agt-final-text { font-size: 13px; line-height: 1.75; color: rgba(255,255,255,.88); margin-bottom: 14px; }
.agt-final-ft { display: flex; gap: 8px; flex-wrap: wrap; }
.agt-mem-btn {
  background: rgba(185,125,255,.1); border: 1px solid rgba(185,125,255,.22);
  border-radius: 20px; color: #b97dff; font-size: 11px; font-weight: 700;
  padding: 6px 14px; cursor: pointer; transition: all .18s;
}
.agt-mem-btn:hover { background: rgba(185,125,255,.22); transform: translateY(-1px); }
.agt-chat-btn {
  background: rgba(0,212,255,.09); border: 1px solid rgba(0,212,255,.2);
  border-radius: 20px; color: #00d4ff; font-size: 11px; font-weight: 700;
  padding: 6px 14px; cursor: pointer; transition: all .18s;
}
.agt-chat-btn:hover { background: rgba(0,212,255,.18); transform: translateY(-1px); }

#agt-memory-section { border-top: 1px solid rgba(255,255,255,.07); padding-top: 14px; margin-top: 8px; }
.agt-mem-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 12px; font-weight: 800; color: rgba(255,255,255,.55); }
.agt-mem-badge { display: inline-block; background: rgba(185,125,255,.2); color: #b97dff; border-radius: 10px; font-size: 10px; font-weight: 900; padding: 1px 7px; margin-left: 5px; }
.agt-mem-add-btn { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; color: rgba(255,255,255,.5); font-size: 10.5px; padding: 2px 10px; cursor: pointer; transition: all .2s; }
.agt-mem-add-btn:hover { border-color: rgba(185,125,255,.35); color: #b97dff; }
#agt-mem-add-row { display: flex; gap: 6px; margin-bottom: 10px; }
.agt-mem-input { flex: 1; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; color: rgba(255,255,255,.85); font-size: 11.5px; padding: 6px 10px; outline: none; font-family: inherit; }
.agt-mem-input:focus { border-color: rgba(185,125,255,.5); }
.agt-mem-save { background: #b97dff; border: none; border-radius: 8px; color: #fff; font-size: 11px; font-weight: 800; padding: 6px 12px; cursor: pointer; }
.agt-mem-list { display: flex; flex-direction: column; gap: 5px; max-height: 220px; overflow-y: auto; }
.agt-mem-item { display: flex; align-items: flex-start; gap: 7px; padding: 7px 10px; background: rgba(255,255,255,.03); border-radius: 8px; border: 1px solid rgba(255,255,255,.06); }
.agt-mem-type { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 8px; flex-shrink: 0; text-transform: uppercase; letter-spacing: .05em; }
.agt-mem-type.fact { background: rgba(0,212,255,.12); color: #00d4ff; }
.agt-mem-type.goal { background: rgba(0,255,179,.12); color: #00ffb3; }
.agt-mem-type.preference { background: rgba(185,125,255,.15); color: #b97dff; }
.agt-mem-type.event { background: rgba(255,211,61,.12); color: #ffd93d; }
.agt-mem-type.chat { background: rgba(255,255,255,.08); color: rgba(255,255,255,.4); }
.agt-mem-type.auto { background: rgba(255,255,255,.06); color: rgba(255,255,255,.3); }
.agt-mem-text { font-size: 11px; color: rgba(255,255,255,.6); flex: 1; line-height: 1.5; }
.agt-mem-del { background: none; border: none; color: rgba(255,255,255,.2); cursor: pointer; font-size: 12px; padding: 0; flex-shrink: 0; transition: color .15s; }
.agt-mem-del:hover { color: #ff4d6d; }

.agt-brief-hd { font-size: 10.5px; font-weight: 800; color: #ffd93d; letter-spacing: .06em; text-transform: uppercase; margin-bottom: 6px; }

/* Light theme — agent */
[data-theme="light"] .agt-goal-input { background: rgba(0,0,0,.04); border-color: rgba(140,60,220,.2); color: #111; }
[data-theme="light"] .agt-goal-input::placeholder { color: rgba(0,0,0,.3); }
[data-theme="light"] .agt-result-pre { background: rgba(0,0,0,.04); color: rgba(0,0,0,.7); }
[data-theme="light"] .agt-mem-item { background: rgba(0,0,0,.03); border-color: rgba(0,0,0,.07); }
[data-theme="light"] .agt-mem-text { color: rgba(0,0,0,.6); }
[data-theme="light"] .agt-mem-input { background: #fff; border-color: rgba(0,0,0,.15); color: #111; }
[data-theme="light"] .agt-step-tool { color: #b07000; background: rgba(176,112,0,.06); }
[data-theme="light"] .agt-final-text { color: rgba(0,0,0,.8); }
[data-theme="light"] .agt-intro-sub { color: rgba(0,0,0,.4); }

/* ── Rich text highlights ────────────────────────────────────────── */
.asp-hl-inr { color: #ffd93d; font-weight: 800; }
.asp-hl-pct { color: #00d4ff; font-weight: 700; }
.asp-hl-warn { color: #ff4d6d; font-weight: 700; text-transform: uppercase; font-size: 0.85em; letter-spacing: .04em; }

/* ── Inline Calculator Card ──────────────────────────────────────── */
.asp-calc-card { background: rgba(0,212,255,.06); border: 1px solid rgba(0,212,255,.18); border-radius: 12px; padding: 14px; margin: 8px 0; }
.asp-calc-title { font-size: 12.5px; font-weight: 800; color: #00d4ff; margin-bottom: 10px; letter-spacing: .02em; }
.asp-calc-row { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.asp-calc-label { font-size: 11.5px; color: rgba(255,255,255,.5); flex: 1; min-width: 0; }
.asp-calc-input { width: 110px; background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.12); border-radius: 6px; color: var(--text-primary,#fff); font-size: 12px; padding: 4px 8px; outline: none; }
.asp-calc-input:focus { border-color: rgba(0,212,255,.5); }
.asp-calc-result { font-size: 12px; color: rgba(255,255,255,.75); background: rgba(255,255,255,.04); border-radius: 8px; padding: 8px 10px; margin-top: 4px; line-height: 1.6; }
[data-theme="light"] .asp-calc-card { background: rgba(0,100,200,.05); border-color: rgba(0,100,200,.15); }
[data-theme="light"] .asp-calc-title { color: #0064c8; }
[data-theme="light"] .asp-calc-input { background: #fff; border-color: rgba(0,0,0,.15); color: #111; }

/* ── Pulse Dashboard Tab ─────────────────────────────────────────── */
#asp-view-pulse { padding: 12px 0; overflow-y: auto; }
#arya-pulse-inner { padding: 0 14px 16px; }
.apl-header { display: flex; align-items: center; gap: 14px; padding: 12px 0 10px; }
.apl-big-ring { width: 90px; height: 90px; flex-shrink: 0; transform: rotate(-90deg); }
.apl-header-info { flex: 1; min-width: 0; }
.apl-header-title { font-size: 15px; font-weight: 800; color: var(--text-primary,#fff); }
.apl-header-sub { font-size: 11.5px; color: rgba(255,255,255,.4); margin-top: 2px; }
.apl-corpus { font-size: 12px; font-weight: 700; color: #00ffb3; margin-top: 5px; }
.apl-pillars { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; margin: 14px 0 10px; }
.apl-pillar { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.apl-ring { width: 48px; height: 48px; transform: rotate(-90deg); }
.apl-pillar-icon { font-size: 13px; margin-top: 2px; }
.apl-pillar-label { font-size: 9.5px; color: rgba(255,255,255,.45); text-align: center; font-weight: 600; }
.apl-pillar-detail { font-size: 9px; color: rgba(255,255,255,.3); text-align: center; }
.apl-nudges-title { font-size: 11px; font-weight: 700; color: rgba(255,255,255,.35); letter-spacing: .08em; text-transform: uppercase; margin: 10px 0 6px; }
.apl-nudges { display: flex; flex-direction: column; gap: 6px; }
.apl-nudge { display: flex; gap: 8px; align-items: flex-start; background: rgba(255,255,255,.04); border-left: 3px solid #ffb300; border-radius: 0 8px 8px 0; padding: 8px 10px; }
.apl-nudge-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
.apl-nudge-text { font-size: 11.5px; line-height: 1.55; color: rgba(255,255,255,.75); }
.apl-all-good { text-align: center; padding: 12px; font-size: 12px; color: #00ffb3; }
.apl-kpi-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-top: 12px; }
.apl-kpi { background: rgba(255,255,255,.04); border-radius: 10px; padding: 10px 8px; text-align: center; border: 1px solid rgba(255,255,255,.07); }
.apl-kpi-val { font-size: 13px; font-weight: 800; color: var(--text-primary,#fff); }
.apl-kpi-lbl { font-size: 9.5px; color: rgba(255,255,255,.35); margin-top: 2px; }
.apl-kpi-card { cursor:pointer; transition: background .18s, transform .18s, border-color .18s !important; }
.apl-kpi-card:hover { background:rgba(255,255,255,.06) !important; transform:translateY(-2px); border-color:rgba(0,212,255,.2) !important; }
.apl-kpi-card:active { transform:translateY(0); }
/* 360° HUD rows */
.apl-hud-row { display:flex; align-items:flex-start; gap:8px; }
.apl-hud-icon { font-size:16px; flex-shrink:0; margin-top:1px; }
.apl-hud-body { flex:1; min-width:0; }
.apl-hud-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:3px; }
.apl-hud-label { font-size:10.5px; font-weight:700; color:rgba(255,255,255,.6); }
.apl-hud-val { font-size:10.5px; font-weight:800; }
.apl-hud-bar { height:3px; background:rgba(255,255,255,.07); border-radius:2px; overflow:hidden; margin-bottom:2px; }
.apl-hud-fill { height:100%; border-radius:2px; transition: width 1.1s cubic-bezier(.22,.61,.36,1); }
.apl-hud-detail { font-size:9px; color:rgba(255,255,255,.3); line-height:1.4; }
[data-theme="light"] .apl-nudge { background: rgba(0,0,0,.03); }
[data-theme="light"] .apl-nudge-text { color: rgba(0,0,0,.65); }
[data-theme="light"] .apl-kpi { background: rgba(0,0,0,.03); border-color: rgba(0,0,0,.07); }

/* Force ALL panel content dark regardless of page theme */
#arya-sp-panel, #arya-sp-panel * { --text-primary: rgba(255,255,255,.9); }
#arya-sp-panel .asp-view { background: transparent !important; }
[data-theme="light"] #arya-sp-panel .apl-lab-section,
[data-theme="light"] #arya-sp-panel .apl-pulse-inner,
[data-theme="light"] #arya-sp-panel #arya-pulse-inner,
[data-theme="light"] #arya-sp-panel [class^="apl-"],
[data-theme="light"] #arya-sp-panel [class*=" apl-"] { background-color: transparent !important; color: inherit; }
[data-theme="light"] #arya-sp-panel .apl-section-title { color: rgba(255,255,255,.9) !important; }
[data-theme="light"] #arya-sp-panel .apl-hud-label,
[data-theme="light"] #arya-sp-panel .apl-hud-detail,
[data-theme="light"] #arya-sp-panel .apl-lab-label { color: rgba(255,255,255,.4) !important; }
[data-theme="light"] #arya-sp-panel .apl-lab-result { background: rgba(255,255,255,.04) !important; }

/* ── Scenario Lab & Inflation Eroder shared ─────────────────────────── */
.apl-lab-section { padding: 14px 14px 10px; background: transparent; }
.apl-section-title { font-size: 12.5px; font-weight: 800; color: var(--text-primary,#fff); letter-spacing: .02em; margin-bottom: 12px; }
.apl-lab-grid { display: flex; flex-direction: column; gap: 10px; }
.apl-lab-row { display: flex; flex-direction: column; gap: 4px; }
.apl-lab-label { display: flex; justify-content: space-between; font-size: 11px; color: rgba(255,255,255,.45); }
.apl-lab-num { font-weight: 800; color: #00d4ff; font-size: 11px; }
.apl-slider { width: 100%; -webkit-appearance: none; height: 4px; border-radius: 2px; background: rgba(255,255,255,.1); outline: none; cursor: pointer; }
.apl-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #00d4ff; cursor: pointer; border: 2px solid #0a0d17; box-shadow: 0 0 8px rgba(0,212,255,.5); }
.apl-slider::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #00d4ff; border: 2px solid #0a0d17; cursor: pointer; }
.apl-lab-result { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 12px 14px; margin-top: 10px; }
.apl-lab-res-corpus { font-size: 20px; font-weight: 900; color: #00ffb3; letter-spacing: -.01em; }
.apl-lab-accent { font-weight: 700; font-size: 11.5px; color: #00d4ff; }
.apl-lab-ai-comment { background: rgba(168,85,247,.08); border: 1px solid rgba(168,85,247,.2); border-radius: 10px; padding: 10px 12px; margin-top: 8px; font-size: 11.5px; color: rgba(255,255,255,.7); }
.apl-lab-ai-thinking { font-size: 11px; color: rgba(255,255,255,.4); }
[data-theme="light"] .apl-slider { background: rgba(0,0,0,.12); }
[data-theme="light"] .apl-slider::-webkit-slider-thumb { border-color: #fff; }
[data-theme="light"] .apl-lab-result { background: rgba(0,0,0,.03); border-color: rgba(0,0,0,.08); }
[data-theme="light"] .apl-lab-num { color: #0064c8; }

/* ── v5.0 new feature shared styles ────────────────────────────── */
.agt-mc-inp {
  width: 100%; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1);
  border-radius: 7px; padding: 6px 9px; color: #fff; font-size: 11.5px;
}
.agt-mc-inp:focus { outline: none; border-color: rgba(185,125,255,.5); }
.agt-section-label {
  font-size: 9.5px; font-weight: 800; color: rgba(255,255,255,.35);
  letter-spacing: .6px; text-transform: uppercase;
}
/* Persona buttons active state is set via JS; base style only here */
.agt-persona-btn:hover { opacity: .85; }
/* Arya persona badge in header */
#arya-persona-badge {
  font-size: 9px; font-weight: 800; letter-spacing: .3px;
  border: 1px solid; border-radius: 20px; padding: 2px 7px;
  white-space: nowrap; flex-shrink: 0; transition: color .2s, border-color .2s;
}
/* v6.0 — Run History */
.agt-hist-item { transition: border-color .18s; }
.agt-hist-item:hover { border-color: rgba(0,212,255,.25) !important; }
/* v6.0 — Voice button active state (toggled via JS) */
#agt-voice-btn.listening {
  background: rgba(255,80,80,.25) !important; border-color: rgba(255,80,80,.5) !important;
  animation: arya-pulse 0.9s ease-in-out infinite;
}
/* v6.0 — Quick preset buttons */
#agt-quick-fire:hover { background: rgba(255,107,53,.22) !important; }
#agt-quick-tax:hover  { background: rgba(77,255,180,.16) !important; }
/* v6.0 — Wealth X-Ray, Tax Optimizer, Insurance gap sections */
.arya-xray-legend-dot { width:8px; height:8px; border-radius:2px; flex-shrink:0; }
`;
    document.head.appendChild(s);
  }

  /* ══ CONTEXT PILLS ═══════════════════════════════════════════════════════ */
  function buildContextPills() {
    const pills  = [];
    const name   = get('finos_display_name', '');
    const health = parseFloat(get('finos_health_score', '0'));
    const dna    = get('finos_financial_dna', '');
    const streak = getJ('finos_streak', { count: 0 });
    const port   = window.FINOS_USER_CONTEXT?.financial?.portfolio;
    const nw     = parseFloat(get('finos_net_worth', '0'));
    const savings = parseFloat(get('finos_savings_rate', '0'));

    if (name) pills.push({ label: name.split(' ')[0], cls: '' });
    if (dna)  pills.push({ label: dna + ' DNA', cls: '' });
    if (health > 0) {
      const cls = health >= 70 ? 'good' : health >= 45 ? 'warn' : 'crit';
      pills.push({ label: 'Health ' + Math.round(health), cls });
    }
    if (savings > 0) {
      const cls = savings >= 25 ? 'good' : savings >= 15 ? 'warn' : 'crit';
      pills.push({ label: savings + '% savings', cls });
    }
    if (streak.count > 1) pills.push({ label: '🔥 ' + streak.count + 'd streak', cls: 'good' });
    if (nw > 0) pills.push({ label: 'NW ' + INR(nw), cls: '' });
    if (port?.pnl_pct != null) {
      const cls = port.pnl_pct >= 0 ? 'good' : 'crit';
      pills.push({ label: 'P&L ' + (port.pnl_pct >= 0 ? '+' : '') + port.pnl_pct + '%', cls });
    }
    return pills;
  }

  /* ══ BUILD PANEL DOM ════════════════════════════════════════════════════ */
  function buildPanel(pageKey) {
    const page      = PAGE_REGISTRY[pageKey] || PAGE_REGISTRY['_default'];
    const pills     = buildContextPills();
    const snapshot  = buildSnapshotHTML();
    const chips     = buildDynamicChips(pageKey);

    const pillsHTML = pills.length
      ? pills.map(p => `<span class="asp-ctx-pill ${p.cls}">${p.label}</span>`).join('')
      : '<span class="asp-ctx-pill">Set up profile for personalized insights</span>';

    const panel = document.createElement('div');
    panel.id = 'arya-sp-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Arya AI — financial coach');
    panel.innerHTML = `
      <div id="arya-sp-header">
        <div id="arya-sp-avatar">
          ${page.icon}
          <span id="arya-sp-pulse"></span>
        </div>
        <div id="arya-sp-title-wrap">
          <div id="arya-sp-title">Arya AI</div>
          <div id="arya-sp-page-label">${page.name}</div>
        </div>
        <span id="arya-persona-badge" style="font-size:9px;font-weight:800;letter-spacing:.3px;border:1px solid rgba(0,212,255,.3);border-radius:20px;padding:3px 9px;white-space:nowrap;flex-shrink:0;color:#00d4ff;cursor:pointer;transition:all .2s" title="Switch advisor mode — go to Agent tab">🎯 Balanced</span>
        <span id="arya-emotion-badge" title="Arya mood: Calm" style="font-size:18px;transition:all .3s;cursor:default;flex-shrink:0">😌</span>
        <button id="arya-sp-close" aria-label="Close Arya panel">✕</button>
      </div>

      <!-- Live Market Ticker -->
      <div id="arya-ticker-strip">
        <div id="arya-ticker-inner">
          <div class="arya-tick-item">
            <span class="arya-tick-name">NIFTY 50</span>
            <span class="arya-tick-price" id="tick-nifty">—</span>
            <span class="arya-tick-chg" id="tick-nifty-chg">—</span>
          </div>
          <div class="arya-tick-item">
            <span class="arya-tick-name">SENSEX</span>
            <span class="arya-tick-price" id="tick-sensex">—</span>
            <span class="arya-tick-chg" id="tick-sensex-chg">—</span>
          </div>
          <div class="arya-tick-item">
            <span class="arya-tick-name">BANK NIFTY</span>
            <span class="arya-tick-price" id="tick-banknifty">—</span>
            <span class="arya-tick-chg" id="tick-banknifty-chg">—</span>
          </div>
          <div class="arya-tick-item">
            <span class="arya-tick-name">USD/INR</span>
            <span class="arya-tick-price" id="tick-usdinr">—</span>
            <span class="arya-tick-chg flat">—</span>
          </div>
          <div class="arya-tick-item">
            <span class="arya-tick-name">GOLD/10g</span>
            <span class="arya-tick-price" id="tick-gold">—</span>
            <span class="arya-tick-chg" id="tick-gold-chg">—</span>
          </div>
          <div class="arya-tick-item">
            <span class="arya-tick-name">BTC/INR</span>
            <span class="arya-tick-price" id="tick-btc">—</span>
            <span class="arya-tick-chg" id="tick-btc-chg">—</span>
          </div>
        </div>
      </div>

      ${snapshot}

      <div id="arya-sp-context">${pillsHTML}</div>

      <!-- Tab bar — icon + label two-row style -->
      <div id="arya-sp-tabs" role="tablist">
        <button class="asp-tab active" role="tab" aria-selected="true"  data-view="chat">
          <span class="asp-tab-icon">💬</span><span class="asp-tab-label">Chat</span>
        </button>
        <button class="asp-tab" role="tab" aria-selected="false" data-view="roadmap">
          <span class="asp-tab-icon">🗺️</span><span class="asp-tab-label">Plan</span>
        </button>
        <button class="asp-tab" role="tab" aria-selected="false" data-view="mindmap">
          <span class="asp-tab-icon">🧠</span><span class="asp-tab-label">Map</span>
        </button>
        <button class="asp-tab" role="tab" aria-selected="false" data-view="timeline">
          <span class="asp-tab-icon">🌅</span><span class="asp-tab-label">Life</span>
        </button>
        <button class="asp-tab" role="tab" aria-selected="false" data-view="pulse">
          <span class="asp-tab-icon">📊</span><span class="asp-tab-label">Pulse</span>
        </button>
        <button class="asp-tab" role="tab" aria-selected="false" data-view="calendar">
          <span class="asp-tab-icon">📅</span><span class="asp-tab-label">Cal</span>
        </button>
        <button class="asp-tab" role="tab" aria-selected="false" data-view="indiamap">
          <span class="asp-tab-icon">🇮🇳</span><span class="asp-tab-label">India</span>
        </button>
        <button class="asp-tab" role="tab" aria-selected="false" data-view="agent">
          <span class="asp-tab-icon">🤖</span><span class="asp-tab-label">Agent</span>
        </button>
      </div>

      <!-- CHAT view (default) -->
      <div id="asp-view-chat" class="asp-view active" role="tabpanel">
        <div id="arya-sp-messages" role="log" aria-live="polite" aria-label="Arya conversation"></div>
        <div id="arya-sp-chips">
          ${chips.map(c => `<button class="asp-chip">${c}</button>`).join('')}
        </div>
        <div id="arya-sp-offline">
          ⚠️ Ollama offline — run <code style="background:rgba(255,255,255,.1);padding:1px 5px;border-radius:4px;">ollama serve</code> in terminal to enable AI
        </div>
        <div id="arya-sp-input-wrap">
          <textarea id="arya-sp-input" placeholder="Ask Arya anything about your finances…" rows="1" aria-label="Message Arya"></textarea>
          <button id="arya-sp-mic" title="Voice input (en-IN)" aria-label="Voice input">🎙️</button>
          <button id="arya-sp-send" aria-label="Send message">
            <svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
          </button>
        </div>
      </div>

      <!-- ROADMAP view -->
      <div id="asp-view-roadmap" class="asp-view" role="tabpanel">
        <div id="arya-rm-container">
          <div class="asp-rm-loading"><div class="asp-rm-spinner"></div>Building your roadmap…</div>
        </div>
        <button class="asp-view-ask-btn" data-msg="Review my complete financial roadmap — which step needs urgent attention? Give me a detailed plan with my actual numbers.">🤖 Ask Arya about my roadmap</button>
      </div>

      <!-- MINDMAP view -->
      <div id="asp-view-mindmap" class="asp-view" role="tabpanel">
        <div class="asp-mm-hint">🖱️ Drag to pan · Scroll to zoom · Click nodes to expand</div>
        <div id="arya-mm-container">
          <div class="asp-rm-loading"><div class="asp-rm-spinner"></div>Plotting your financial map…</div>
        </div>
        <button class="asp-view-ask-btn" data-msg="Looking at my financial mindmap — which branch (income, investing, goals, debt, safety, insurance, tax, FIRE) needs the most work? Give me a concrete next step for each weak area.">🤖 Ask about my financial map</button>
      </div>

      <!-- TIMELINE view -->
      <div id="asp-view-timeline" class="asp-view" role="tabpanel">
        <div id="arya-tl-container">
          <div class="asp-rm-loading"><div class="asp-rm-spinner"></div>Mapping your life journey…</div>
        </div>
        <button class="asp-view-ask-btn" data-msg="Looking at my life journey timeline — what milestone should I focus on right now and what are the 3 concrete actions I should take this month?">🤖 Ask about my life journey</button>
      </div>

      <!-- PULSE view -->
      <div id="asp-view-pulse" class="asp-view" role="tabpanel">
        <div id="arya-pulse-container" style="overflow-y:auto;flex:1">
          <div class="asp-rm-loading"><div class="asp-rm-spinner"></div>Calculating your financial pulse…</div>
        </div>
      </div>

      <!-- CALENDAR view -->
      <div id="asp-view-calendar" class="asp-view" role="tabpanel">
        <div id="arya-cal-container" style="overflow-y:auto;flex:1">
          <div class="asp-rm-loading"><div class="asp-rm-spinner"></div>Building your spending calendar…</div>
        </div>
      </div>

      <!-- INDIA MAP view -->
      <div id="asp-view-indiamap" class="asp-view" role="tabpanel">
        <div id="arya-map-container" style="overflow-y:auto;flex:1">
          <div class="asp-rm-loading"><div class="asp-rm-spinner"></div>Loading India affordability map…</div>
        </div>
      </div>

      <!-- AGENT view -->
      <div id="asp-view-agent" class="asp-view" role="tabpanel" style="overflow-y:auto">
        <div id="arya-agent-container">
          <div class="asp-rm-loading"><div class="asp-rm-spinner"></div>Loading Agent…</div>
        </div>
      </div>
    `;
    return panel;
  }

  /* ══ PANEL STATE ════════════════════════════════════════════════════════ */
  let _panelOpen   = false;
  let _aiRunning   = false;
  let _chatHistory = [];

  /* ══ MESSAGE RENDERING ══════════════════════════════════════════════════ */
  function appendMessage(role, text, streaming = false) {
    const log = document.getElementById('arya-sp-messages');
    if (!log) return null;
    const wrap = document.createElement('div');
    wrap.className = `asp-msg ${role}`;
    const initials = role === 'arya' ? '🤖' : (get('finos_display_name', 'U')[0] || 'U').toUpperCase();
    const cls      = streaming ? 'asp-cursor' : '';
    wrap.innerHTML = `
      <div class="asp-msg-avatar">${initials}</div>
      <div class="asp-msg-bubble ${cls}">${text || ''}</div>
    `;
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap.querySelector('.asp-msg-bubble');
  }

  function showThinking() {
    const log = document.getElementById('arya-sp-messages');
    if (!log) return null;
    const wrap = document.createElement('div');
    wrap.className = 'asp-msg arya';
    wrap.id = 'arya-sp-thinking';
    wrap.innerHTML = `
      <div class="asp-msg-avatar">🤖</div>
      <div class="asp-msg-bubble asp-thinking"><span></span><span></span><span></span></div>
    `;
    log.appendChild(wrap);
    log.scrollTop = log.scrollHeight;
    return wrap;
  }

  function removeThinking() { document.getElementById('arya-sp-thinking')?.remove(); }

  /* ══ 7. CONVERSATION RATINGS ════════════════════════════════════════════ */
  function addRatingButtons(bubbleEl, responseText, pageKey) {
    const wrap = document.createElement('div');
    wrap.className = 'asp-rating';
    wrap.innerHTML = `<span class="asp-rate-text">Helpful?</span><button class="asp-rate-btn" data-v="1">👍</button><button class="asp-rate-btn" data-v="-1">👎</button>`;
    wrap.addEventListener('click', e => {
      const btn = e.target.closest('.asp-rate-btn');
      if (!btn) return;
      const val = parseInt(btn.dataset.v);
      try {
        const fb = JSON.parse(localStorage.getItem('finos_arya_ratings') || '[]');
        fb.push({ ts: Date.now(), page: pageKey, val, preview: responseText.slice(0, 80) });
        set('finos_arya_ratings', JSON.stringify(fb.slice(-100)));
      } catch {}
      wrap.innerHTML = val > 0
        ? '<span class="asp-rate-text" style="color:#00ffb3">✓ Glad that helped, yaar!</span>'
        : '<span class="asp-rate-text" style="color:#ffb300">Thanks — I\'ll improve!</span>';
    });
    bubbleEl?.parentElement?.insertAdjacentElement('afterend', wrap);
  }

  /* ══ 6. SMART FOLLOW-UP CHIPS ═══════════════════════════════════════════ */
  function generateFollowUps(responseText) {
    const t = responseText.toLowerCase();
    const chips = [];
    if (/sip|mutual fund|mf/i.test(t))           chips.push('Calculate my SIP amount');
    if (/tax|80c|section|deduction/i.test(t))     chips.push('Tax saving options');
    if (/portfolio|stock|equity/i.test(t))         chips.push('Review my portfolio');
    if (/goal/i.test(t))                           chips.push('Check my goals');
    if (/emergency fund/i.test(t))                 chips.push('Emergency fund check');
    if (/debt|emi|loan/i.test(t))                  chips.push('Debt payoff plan');
    if (/insurance/i.test(t))                      chips.push('Insurance audit');
    if (/rebalance|allocation/i.test(t))           chips.push('Rebalancing guide');
    if (/risk|volatile/i.test(t))                  chips.push('My risk tolerance');
    if (/save|savings/i.test(t))                   chips.push('Boost savings rate');
    chips.push('Tell me more');
    return chips.slice(0, 4);
  }

  function updateFollowUpChips(chips) {
    const el = document.getElementById('arya-sp-chips');
    if (!el) return;
    el.innerHTML = chips.map(c => `<button class="asp-chip asp-chip-followup">💬 ${c}</button>`).join('');
  }

  /* ══ PANEL TAB SYSTEM — Roadmap / MindMap / Timeline in panel ══════════ */
  let _rmRendered      = false;
  let _mmRendered      = false;
  let _tlRendered      = false;
  let _pulseRendered   = false;
  let _calRendered     = false;
  let _mapRendered     = false;
  let _agentRendered   = false;

  function switchAryaTab(name) {
    document.querySelectorAll('.asp-tab').forEach(t => {
      const active = t.dataset.view === name;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.asp-view').forEach(v => {
      v.classList.toggle('active', v.id === 'asp-view-' + name);
    });

    if (name === 'roadmap' && !_rmRendered) {
      _rmRendered = true;
      ensureRoadmapEngine(() => {
        const el = document.getElementById('arya-rm-container');
        if (el && window.AryaRoadmap) { el.innerHTML = ''; AryaRoadmap.init(el, null, null); }
      });
    }
    if (name === 'mindmap' && !_mmRendered) {
      _mmRendered = true;
      ensureRoadmapEngine(() => {
        const el = document.getElementById('arya-mm-container');
        if (el && window.AryaRoadmap) { el.innerHTML = ''; AryaRoadmap.init(null, el, null); }
      });
    }
    if (name === 'timeline' && !_tlRendered) {
      _tlRendered = true;
      ensureRoadmapEngine(() => {
        const el = document.getElementById('arya-tl-container');
        if (el && window.AryaRoadmap) { el.innerHTML = ''; AryaRoadmap.init(null, null, el); }
      });
    }
    if (name === 'pulse' && !_pulseRendered) {
      _pulseRendered = true;
      const el = document.getElementById('arya-pulse-container');
      if (el) {
        el.innerHTML = buildPulseView()
          + buildCrossPageHUD()
          + buildSmartInsightCards()
          + buildNetWorthTimeline()
          + buildWealthFingerprint()
          + buildPageActivityMatrix()
          + buildBehavioralDNA()
          + buildWealthChart()
          + buildGoalCards()
          + buildIndiaFinCalendar()
          + buildPortfolioStressTest()
          + buildCompoundRace()
          + buildSavingsRateMeter()
          + buildTaxDashboard()
          + buildDebtFreedomPlanner()
          + buildScenarioLab()
          + buildInflationEroder()
          + buildMonteCarloSection()
          + buildTimeMachineSection()
          + buildPeerBenchmarkSection()
          + buildTransactionAnalyzerSection()
          + buildWealthXRaySection()
          + buildTaxOptimizerSection()
          + buildInsuranceGapSection()
          + buildWealthVelocity()
          + buildGoalProbabilityMatrix()
          + buildNewsWidget();
        wireScenarioLab();
        wireInflationEroder();
        wireMonteCarloSection();
        wireTimeMachineSection();
        wirePeerBenchmarkSection();
        wireTransactionAnalyzerSection();
        wireNewsWidget();
        el.querySelectorAll('.asp-view-ask-btn').forEach(btn => {
          btn.addEventListener('click', () => handleAskBtn(btn));
        });
      }
    }
    // Animate rings after pulse renders
    if (name === 'pulse') {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById('arya-pulse-container');
          if (!el) return;
          el.querySelectorAll('[data-circ][data-score]').forEach(circle => {
            const circ = parseFloat(circle.dataset.circ);
            const score = parseFloat(circle.dataset.score);
            const filled = (circ * score / 100).toFixed(1);
            circle.style.strokeDasharray = `${filled} ${circ}`;
          });
        });
      });
    }
    if (name === 'calendar' && !_calRendered) {
      _calRendered = true;
      const el = document.getElementById('arya-cal-container');
      if (el) {
        el.innerHTML = buildHeatmapView();
        wireHeatmap();
        el.querySelectorAll('.asp-view-ask-btn').forEach(btn => {
          btn.addEventListener('click', () => handleAskBtn(btn));
        });
      }
    }
    if (name === 'indiamap' && !_mapRendered) {
      _mapRendered = true;
      const el = document.getElementById('arya-map-container');
      if (el) { el.innerHTML = buildIndiaMap(); wireIndiaMap(); }
    }
    if (name === 'agent' && !_agentRendered) {
      _agentRendered = true;
      const el = document.getElementById('arya-agent-container');
      if (el) {
        el.innerHTML = buildAgentView();
        el.classList.add('asp-fade-in');
        wireAgentView();
      }
    }
  }

  function ensureRoadmapEngine(cb) {
    if (window.AryaRoadmap) { cb(); return; }
    // Lazy-load arya-roadmap.js — resolve path from the panel script tag
    const panelSrc = Array.from(document.scripts)
      .find(sc => sc.src && sc.src.includes('arya-sidebar-panel'))?.src || '';
    const roadmapSrc = panelSrc
      ? panelSrc.replace('arya-sidebar-panel.js', 'arya-roadmap.js').split('?')[0]
      : '../js/arya-roadmap.js';
    const s = document.createElement('script');
    s.src = roadmapSrc;
    s.onload = cb;
    s.onerror = () => {
      ['arya-rm-container', 'arya-mm-container', 'arya-tl-container'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<p style="text-align:center;padding:40px 16px;color:rgba(255,255,255,.3);font-size:12px;line-height:1.6;">Roadmap engine unavailable.<br>Open roadmap.html for the full experience.</p>';
      });
    };
    document.head.appendChild(s);
  }

  /* ══ SEND MESSAGE ═══════════════════════════════════════════════════════ */
  async function sendMessage(userText, isAutoInsight = false) {
    if (_aiRunning) return;
    _aiRunning = true;

    const sendBtn   = document.getElementById('arya-sp-send');
    const inputEl   = document.getElementById('arya-sp-input');
    const offlineEl = document.getElementById('arya-sp-offline');
    if (sendBtn)  sendBtn.disabled = true;
    if (inputEl)  inputEl.disabled = true;

    if (!isAutoInsight) {
      appendMessage('user', userText);
      _chatHistory.push({ role: 'user', text: userText });
    }

    const thinkEl   = showThinking();
    const pageKey   = getPageKey();
    const pageInfo  = PAGE_REGISTRY[pageKey] || PAGE_REGISTRY['_default'];

    // Detect and display emotion from user message
    let _emotionAppend = '';
    if (!isAutoInsight) {
      const emotion = detectEmotion(userText);
      updateEmotionIndicator(emotion);
      _emotionAppend = EMOTION_MODES[emotion]?.append || '';
    }

    // Fetch macro news context (non-blocking, max 2s, skip for auto-insights)
    let newsLines = '';
    if (!isAutoInsight) {
      newsLines = await Promise.race([
        fetchMacroNews(),
        new Promise(r => setTimeout(() => r(''), 2000))
      ]);
    }
    const newsSection = newsLines
      ? `\n\nLATEST INDIA FINANCE HEADLINES (use only if directly relevant to user's query — do not force-fit):\n${newsLines}`
      : '';

    // Full system prompt with user context (includes session, memory, bias)
    const userCtx   = buildUserContext(pageKey);
    const systemPmt = `${BASE_SYSTEM}${getPersonaAppend()}${_emotionAppend}${newsSection}\n\nCurrent page: ${pageInfo.name}\n\n${userCtx}`;

    // Build prompt with recent chat history for follow-ups
    let fullPrompt = userText;
    if (!isAutoInsight && _chatHistory.length > 2) {
      const recent = _chatHistory.slice(-6).slice(0, -1);
      const histStr = recent.map(m => `${m.role === 'user' ? 'User' : 'Arya'}: ${m.text}`).join('\n');
      if (histStr) fullPrompt = `Previous conversation:\n${histStr}\n\nUser: ${userText}`;
    }

    let bubbleEl = null;
    let finalText = '';

    // Auto-insights: 320 tokens (focused, fast) — user questions: 600 (thorough, detailed)
    const numPredict = isAutoInsight ? 320 : 600;

    try {
      finalText = await streamFromOllama(systemPmt, fullPrompt, partialText => {
        if (!bubbleEl) {
          removeThinking();
          bubbleEl = appendMessage('arya', '', true);
        }
        if (bubbleEl) {
          bubbleEl.textContent = partialText;
          bubbleEl.classList.add('asp-cursor');
          const log = document.getElementById('arya-sp-messages');
          if (log) log.scrollTop = log.scrollHeight;
        }
      }, numPredict);

      removeThinking();
      if (!bubbleEl) bubbleEl = appendMessage('arya', finalText);
      else { bubbleEl.classList.remove('asp-cursor'); }
      // Render with rich text highlighting on the final response
      if (bubbleEl) bubbleEl.innerHTML = richText(finalText);

      // Inject inline calculator card if intent detected
      const calcIntent = detectCalcIntent(finalText, userText);
      if (calcIntent && bubbleEl) {
        const cardHTML = buildCalcCard(calcIntent);
        if (cardHTML) {
          const cardEl = document.createElement('div');
          cardEl.innerHTML = cardHTML;
          bubbleEl.parentElement?.insertAdjacentElement('afterend', cardEl.firstElementChild);
          wireCalcCard(calcIntent);
        }
      }

      _chatHistory.push({ role: 'arya', text: finalText });
      if (offlineEl) offlineEl.classList.remove('show');

      // 7. Add rating buttons after AI response
      if (!isAutoInsight) addRatingButtons(bubbleEl, finalText, pageKey);

      // 6. Update follow-up chips
      const followUps = generateFollowUps(finalText);
      updateFollowUpChips(followUps);

      // 5. AryaMemory integration — record this conversation
      if (window.AryaMemory?.loaded) {
        const topic = pageInfo.name.toLowerCase();
        window.AryaMemory.record(topic, finalText.slice(0, 200), [topic], 'neutral').catch(() => {});
        if (!isAutoInsight) window.AryaMemory.detectEmotion?.(topic, userText);
      }

      // 2. Save chat history to disk
      saveChatToDisk(pageKey, _chatHistory);

      // 3. Auto-extract memory from non-trivial, non-auto exchanges
      if (!isAutoInsight && userText.length > 20 && finalText.length > 60) {
        autoExtractMemory(userText, finalText).catch(() => {});
      }

    } catch (err) {
      removeThinking();
      if (bubbleEl) { bubbleEl.classList.remove('asp-cursor'); bubbleEl.remove(); }
      const fallback = offlineFallback(pageKey, userText);
      appendMessage('arya', fallback);
      if (offlineEl) offlineEl.classList.add('show');
    }

    _aiRunning = false;
    if (sendBtn)  sendBtn.disabled = false;
    if (inputEl)  { inputEl.disabled = false; if (!isAutoInsight) inputEl.focus(); }
  }

  /* ══ OFFLINE FALLBACK ════════════════════════════════════════════════════ */
  function offlineFallback(pageKey, question) {
    const name    = get('finos_display_name', 'Investor');
    const dna     = get('finos_financial_dna', 'Explorer');
    const health  = get('finos_health_score', '0');
    const savings = get('finos_savings_rate', '0');
    const tips = {
      'dashboard':      `${name}, your health score is ${health}/100. As a ${dna}, focus on pushing savings from ${savings}% to 25%+. Run "ollama serve" for full AI analysis.`,
      'portfolio':      `${name}, review holdings vs your ${dna} risk profile. Concentrated bets are the top wealth destroyers. Run "ollama serve" for portfolio review.`,
      'tax':            `${name}, maximize 80C (₹1.5L), 80D (₹25K), and NPS extra (₹50K) before March 31. Run "ollama serve" for personalized tax calcs.`,
      'track-finances': `${name}, savings rate is ${savings}%. Target 25%+. Cut the top non-essential expense category by 20% this month.`,
      'calculators':    `${name}, as a ${dna}, start with SIP calculator. Set a goal, calculate monthly SIP needed, and automate. Run "ollama serve" for AI numbers.`,
      'home':           `${name}, financial health is ${health}/100. #1 action for a ${dna} today: automate savings before spending. Run "ollama serve" for daily brief.`,
      '_default':       `${name}, Arya needs Ollama to run AI insights. In terminal:\n\nollama serve\n\nThen reload. Arya will analyze your ${dna} financial profile in full.`
    };
    return tips[pageKey] || tips['_default'];
  }

  /* ══ 4. VOICE INPUT ══════════════════════════════════════════════════════ */
  function setupVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micBtn = document.getElementById('arya-sp-mic');
    if (!micBtn) return;
    if (!SpeechRecognition) { micBtn.style.display = 'none'; return; }

    const recog = new SpeechRecognition();
    recog.lang = 'en-IN';
    recog.continuous = false;
    recog.interimResults = true;
    let listening = false;

    micBtn.addEventListener('click', () => {
      if (listening) { recog.stop(); return; }
      try { recog.start(); listening = true; micBtn.classList.add('listening'); }
      catch {}
    });

    recog.onresult = e => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
      const inputEl = document.getElementById('arya-sp-input');
      if (inputEl) { inputEl.value = transcript; inputEl.style.height = 'auto'; inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px'; }
    };

    recog.onend = () => {
      listening = false;
      micBtn.classList.remove('listening');
      const inputEl = document.getElementById('arya-sp-input');
      const text = inputEl?.value.trim();
      if (text && !_aiRunning) {
        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendMessage(text);
      }
    };

    recog.onerror = () => { listening = false; micBtn.classList.remove('listening'); };
  }

  /* ══ OPEN / CLOSE PANEL ═════════════════════════════════════════════════ */
  function openPanel() {
    if (_panelOpen) return;
    _panelOpen = true;

    const pageKey = getPageKey();
    // Track visit count for bias detection
    incPageVisitCount(pageKey);

    // Build DOM if not exists
    if (!document.getElementById('arya-sp-panel')) {
      const backdrop = document.createElement('div');
      backdrop.id = 'arya-sp-backdrop';
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', closePanel);

      const panel = buildPanel(pageKey);
      document.body.appendChild(panel);

      document.getElementById('arya-sp-close').addEventListener('click', closePanel);

      // Persona badge → open Agent tab to switch mode
      document.getElementById('arya-persona-badge')?.addEventListener('click', () => switchAryaTab('agent'));

      // Wire panel tabs
      document.getElementById('arya-sp-tabs')?.addEventListener('click', e => {
        const tab = e.target.closest('.asp-tab');
        if (tab) switchAryaTab(tab.dataset.view);
      });

      // Wire "Ask Arya about this" buttons in visual views
      document.querySelectorAll('.asp-view-ask-btn').forEach(btn => {
        btn.addEventListener('click', () => handleAskBtn(btn));
      });

      // Wire chips (both default + follow-up chips)
      document.getElementById('arya-sp-chips').addEventListener('click', e => {
        const chip = e.target.closest('.asp-chip');
        if (chip && !_aiRunning) {
          const inputEl = document.getElementById('arya-sp-input');
          if (inputEl) inputEl.value = '';
          // Strip leading "💬 " from follow-up chips
          const text = chip.textContent.trim().replace(/^💬\s*/, '');
          sendMessage(text);
        }
      });

      const inputEl = document.getElementById('arya-sp-input');
      const sendBtn = document.getElementById('arya-sp-send');

      inputEl.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
      });
      inputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = inputEl.value.trim();
          if (!text) return;
          inputEl.value = ''; inputEl.style.height = 'auto';
          if (text.startsWith('/')) { if (!processCommand(text)) sendMessage(text); }
          else if (!_aiRunning) sendMessage(text);
        }
        // Show command hint when user types "/"
        if (e.key === '/' && !inputEl.value) {
          setTimeout(() => {
            if (!document.getElementById('asp-cmd-hint')) {
              const hint = document.createElement('div');
              hint.id = 'asp-cmd-hint';
              hint.className = 'asp-cmd-hint';
              hint.innerHTML = 'Commands: <b>/sip</b> <b>/emi</b> <b>/fire</b> <b>/compare</b> <b>/news</b> <b>/help</b>';
              inputEl.closest('#arya-sp-input-wrap')?.insertAdjacentElement('beforebegin', hint);
              setTimeout(() => hint.remove(), 4000);
            }
          }, 50);
        }
      });
      sendBtn.addEventListener('click', () => {
        const text = inputEl.value.trim();
        if (!text) return;
        inputEl.value = ''; inputEl.style.height = 'auto';
        if (text.startsWith('/')) { if (!processCommand(text)) sendMessage(text); }
        else if (!_aiRunning) sendMessage(text);
      });

      // 4. Setup voice input
      setupVoiceInput();

      document.addEventListener('keydown', _escHandler);
    }

    // Animate open
    requestAnimationFrame(() => {
      document.getElementById('arya-sp-backdrop')?.classList.add('open');
      requestAnimationFrame(() => { document.getElementById('arya-sp-panel')?.classList.add('open'); });
    });

    document.querySelector('.sb-arya-row')?.classList.add('arya-panel-open');

    // Populate live ticker on panel open
    setTimeout(_refreshTicker, 600);

    // 2. Load persistent chat history on first open
    if (_chatHistory.length === 0) {
      const saved = loadChatFromDisk(pageKey);
      if (saved.length > 0) {
        // Show history notice
        const msgs = document.getElementById('arya-sp-messages');
        if (msgs) {
          const notice = document.createElement('div');
          notice.id = 'arya-sp-history-notice';
          notice.textContent = `↑ Last conversation (restored) — ask anything new below`;
          msgs.appendChild(notice);
        }
        // Render last 6 saved messages
        saved.slice(-6).forEach(m => appendMessage(m.role, m.text));
        _chatHistory = saved;
        // Don't auto-trigger insight since we restored history
      } else {
        // 10. Smart greeting on first-ever open
        setTimeout(() => {
          const greeting = buildSmartGreeting(pageKey);
          appendMessage('arya', greeting);
          _chatHistory.push({ role: 'arya', text: greeting });
          saveChatToDisk(pageKey, _chatHistory);
          // Proactive nudges — fire critical alerts before AI insight
          const nudges = computeNudges();
          if (nudges.length) {
            const nudgeHTML = `<div style="display:flex;flex-direction:column;gap:5px;margin:2px 0">${nudges.map(n=>`<div style="display:flex;gap:7px;align-items:flex-start;font-size:11.5px;line-height:1.5;padding:6px 9px;background:rgba(255,255,255,.04);border-left:3px solid ${n.color};border-radius:0 7px 7px 0"><span>${n.icon}</span><span>${n.text}</span></div>`).join('')}</div>`;
            const nudgeEl = appendMessage('arya', '');
            if (nudgeEl) nudgeEl.innerHTML = nudgeHTML;
          }
          // Proactive daily brief (once per day, before page insight)
          const todayBriefKey = 'arya_brief_' + new Date().toISOString().slice(0,10);
          const hasBrief = localStorage.getItem(todayBriefKey);
          if (!hasBrief && parseFloat(get('finos_health_score','0')) > 0) {
            setTimeout(() => triggerProactiveBrief(pageKey), nudges.length ? 1400 : 900);
          } else {
            // Auto page insight after greeting
            const page = PAGE_REGISTRY[pageKey] || PAGE_REGISTRY['_default'];
            setTimeout(() => sendMessage(page.prompt, true), nudges.length ? 1200 : 800);
          }
        }, 350);
      }
    }
  }

  function _escHandler(e) { if (e.key === 'Escape') closePanel(); }

  function closePanel() {
    if (!_panelOpen) return;
    _panelOpen = false;
    document.getElementById('arya-sp-panel')?.classList.remove('open');
    document.getElementById('arya-sp-backdrop')?.classList.remove('open');
    document.querySelector('.sb-arya-row')?.classList.remove('arya-panel-open');
    document.removeEventListener('keydown', _escHandler);
    clearTimeout(_tickerTimer);
    const ti = document.getElementById('arya-ticker-inner');
    if (ti) ti.classList.remove('scrolling');
  }

  /* ══ WIRE SIDEBAR BUTTON ════════════════════════════════════════════════ */
  let _btnWired = false;
  function wireSidebarButton() {
    if (_btnWired) return;

    const btn = document.getElementById('sb-arya-btn');
    if (btn) {
      btn.removeAttribute('onclick');
      btn.onclick = null;
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        if (_panelOpen) closePanel(); else openPanel();
      });
      _btnWired = true;
      return;
    }

    // TOC sidebar pages (learn/detail pages)
    const toc = document.querySelector('.toc-sidebar');
    if (toc && !document.getElementById('arya-toc-btn')) {
      const tocBtn = document.createElement('button');
      tocBtn.id = 'arya-toc-btn';
      tocBtn.innerHTML = '🤖 Ask Arya about this page';
      tocBtn.setAttribute('aria-label', 'Open Arya AI panel');
      toc.insertAdjacentElement('afterbegin', tocBtn);
      tocBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        if (_panelOpen) closePanel(); else openPanel();
      });
      _btnWired = true;
    }
  }

  /* ══ STATUS CHECK ════════════════════════════════════════════════════════ */
  async function checkStatus() {
    const dotEl  = document.getElementById('sb-arya-dot');
    const textEl = document.getElementById('sb-arya-status');
    for (const url of OLLAMA_ENDPOINTS) {
      try {
        const tagsUrl = url.replace('/api/generate', '/api/tags');
        const r = await fetch(tagsUrl, { signal: AbortSignal.timeout(2500) });
        if (r.ok || r.type === 'opaque') {
          if (dotEl)  { dotEl.style.background = '#00ffb3'; dotEl.style.boxShadow = '0 0 6px #00ffb3'; }
          if (textEl) textEl.textContent = 'Online';
          return;
        }
      } catch {}
    }
    if (dotEl)  { dotEl.style.background = '#ff4444'; dotEl.style.boxShadow = 'none'; }
    if (textEl) textEl.textContent = 'Offline · Start Ollama';
  }

  /* ══ INIT ════════════════════════════════════════════════════════════════ */
  /* ── Live Ticker Refresh ─────────────────────────────────────────── */
  let _tickerTimer = null;
  async function _refreshTicker() {
    const el = document.getElementById('arya-ticker-inner');
    if (!el) return;

    // Remove stale clones so we can re-clone with fresh data after fetch
    el.querySelectorAll('[data-ticker-clone]').forEach(n => n.remove());

    const upd = (id, val, changeEl, chg) => {
      const p = document.getElementById(id);
      const c = document.getElementById(changeEl);
      if (p) p.textContent = val;
      if (c && chg != null) {
        const up = chg >= 0;
        c.textContent = `${up ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%`;
        c.className   = `arya-tick-chg ${up ? 'up' : 'down'}`;
      }
    };

    try {
      const mkt = await aryaAPILive('/api/market/overview');
      if (mkt.indices) {
        const n  = mkt.indices['NIFTY 50']   || mkt.indices['Nifty 50'];
        const s  = mkt.indices['SENSEX']      || mkt.indices['Sensex'];
        const bn = mkt.indices['NIFTY BANK']  || mkt.indices['Nifty Bank'];
        if (n)  upd('tick-nifty',     n.price?.toLocaleString('en-IN'),  'tick-nifty-chg',    n.change_pct);
        if (s)  upd('tick-sensex',    s.price?.toLocaleString('en-IN'),  'tick-sensex-chg',   s.change_pct);
        if (bn) upd('tick-banknifty', bn.price?.toLocaleString('en-IN'), 'tick-banknifty-chg',bn.change_pct);
      }
    } catch (_) {}

    try {
      const fx = await aryaAPILive('/api/fx');
      if (fx.USD_INR) {
        const p = document.getElementById('tick-usdinr');
        if (p) p.textContent = '₹' + fx.USD_INR.toFixed(2);
      }
    } catch (_) {}

    try {
      const comm = await aryaAPILive('/api/commodities');
      const g = comm.commodities?.['GOLD (10g MCX)'];
      if (g) upd('tick-gold', '₹' + (g.price||0).toLocaleString('en-IN'), 'tick-gold-chg', g.change_pct);
    } catch (_) {}

    try {
      const cry = await aryaAPILive('/api/crypto?coins=bitcoin');
      const b   = cry.crypto?.bitcoin;
      if (b) upd('tick-btc', '₹' + Math.round(b.price_inr||0).toLocaleString('en-IN'), 'tick-btc-chg', b.change_24h);
    } catch (_) {}

    // Duplicate originals for seamless CSS loop (animation: 0 → -50%)
    [...el.children].forEach(item => {
      const clone = item.cloneNode(true);
      clone.setAttribute('data-ticker-clone', '1');
      clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      el.appendChild(clone);
    });

    el.classList.add('scrolling');
    clearTimeout(_tickerTimer);
    _tickerTimer = setTimeout(_refreshTicker, 30000);
  }

  function init() {
    injectCSS();

    const pageKey = getPageKey();
    // 1. Record this page visit for session navigation
    recordPageVisit(pageKey);

    wireSidebarButton();
    checkStatus();

    // Silent pre-probe: cache the working endpoint NOW, before the user clicks.
    setTimeout(() => _findEndpoint().catch(() => {}), 1200);

    // v5.0: Start background financial health monitor
    startBackgroundMonitor();

    // Save weekly health score snapshot for trend tracking
    saveHealthSnapshot();

    // Re-try wiring after DOM settles (handles late-rendering sidebars)
    if (!_btnWired) {
      setTimeout(() => { if (!_btnWired) wireSidebarButton(); }, 500);
      setTimeout(() => { if (!_btnWired) wireSidebarButton(); }, 1500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ══ PUBLIC API ══════════════════════════════════════════════════════════ */
  window.AryaSidebar = {
    open:         openPanel,
    close:        closePanel,
    ask:          (q) => { if (!_panelOpen) openPanel(); setTimeout(() => sendMessage(q), 500); },
    runAgent:     (goal) => {
      if (!_panelOpen) openPanel();
      setTimeout(() => { switchAryaTab('agent'); setTimeout(() => {
        const g = document.getElementById('agt-goal');
        const r = document.getElementById('agt-run');
        if (g) g.value = goal;
        if (r) r.click();
      }, 400); }, 500);
    },
    memory:       AryaMemoryDB,
    tools:        AgentTools,
    clearHistory: (pageKey) => {
      const pk = pageKey || getPageKey();
      localStorage.removeItem(chatStoreKey(pk));
      _chatHistory = [];
    }
  };

}(/* IIFE */));
