// Search across every screen on the phone. Pure: the index and the query go in, ranked entries come out.
// The index is a hand-kept list (title, a few plain words people use for it, and Hindi / Hinglish terms), plus every calculator
// from lib/calcs. __tests__/search.test.mts fails if an entry points at a screen that does not exist, or a screen has no entry.
import { CALCS, GROUPS } from './calcs/index.ts';

export interface Entry { id: string; title: string; sub: string; route: string; group: string; keywords: string; icon: string }

const e = (route: string, title: string, sub: string, group: string, keywords: string, icon: string): Entry => ({ id: route, title, sub, route, group, keywords, icon });

export const SCREENS: Entry[] = [
  // tabs and account
  e('/dashboard', 'Home', 'Your money at a glance', 'Main', 'overview summary dashboard ghar', '🏠'),
  e('/portfolio', 'Portfolio', 'Stocks and funds you hold', 'Main', 'holdings stocks shares mutual funds demat', '💼'),
  e('/markets', 'Markets', 'Indices and sectors', 'Main', 'nifty sensex bank nifty sector bazaar', '📊'),
  e('/arya', 'Arya', 'Ask the assistant', 'Main', 'ai chat assistant help sawal', '🧠'),
  e('/track', 'Track', 'Your trackers in one place', 'Main', 'trackers expenses budget kharcha', '🗂️'),
  e('/profile', 'Your profile', 'Name, age, income, dependents', 'Account', 'age income dependents name details', '👤'),
  e('/search', 'Search', 'Find any tool or tracker', 'Account', 'find look up', '🔍'),
  e('/security', 'App lock and backup', 'PIN lock and an encrypted backup', 'Account', 'pin passcode lock fingerprint face biometric encrypt backup restore export', '🔐'),
  e('/alerts', 'Alerts', 'Things that need your attention', 'Main', 'notifications bell warnings due overspend goal behind renewal', '🔔'),
  e('/settings', 'Settings', 'Language, reminders, account, sync', 'Account', 'language hindi reminders notifications sign in sync backup', '⚙️'),
  e('/privacy', 'Privacy & your data', 'What is stored, export and delete', 'Account', 'export delete erase data permissions', '🔒'),
  e('/terms', 'Terms of use', 'The ground rules', 'Account', 'legal conditions', '📄'),
  // trackers
  e('/tracker/networth', 'Net worth', 'Assets minus liabilities', 'Trackers', 'assets liabilities wealth sampatti', '💰'),
  e('/tracker/budget', 'Budget', 'Limits and what is left', 'Trackers', 'monthly limit spending kharcha', '🧾'),
  e('/tracker/transactions', 'Transactions', 'Everything you logged', 'Trackers', 'expenses income spending entries', '🧾'),
  e('/tracker/recurring', 'Recurring entries', 'Rent, SIP and bills each month', 'Trackers', 'rent bills monthly auto repeat', '🔁'),
  e('/tracker/subscriptions', 'Subscriptions', 'Renewals and what they cost', 'Trackers', 'netflix spotify ott renewals cancel', '🔔'),
  e('/tracker/emergency', 'Emergency fund', 'Months of expenses covered', 'Trackers', 'cushion safety buffer rainy day', '🛡️'),
  e('/tracker/health', 'Health score', 'Seven areas out of 100', 'Trackers', 'financial health score rating', '❤️'),
  e('/tracker/goals', 'Goals', 'What you are saving for', 'Trackers', 'target house education car wedding lakshya', '🎯'),
  e('/tracker/insurance', 'Insurance', 'Policies and cover gaps', 'Trackers', 'term life health bima premium cover', '🛡️'),
  e('/tracker/epf', 'EPF', 'Provident fund projection', 'Trackers', 'pf provident fund employer retirement', '🏛️'),
  e('/tracker/nps', 'NPS', 'National Pension System', 'Trackers', 'pension tier 1 tier 2 80ccd', '🏛️'),
  e('/tracker/ppf', 'PPF & small savings', 'Public Provident Fund, SSY, NSC', 'Trackers', 'ppf ssy sukanya nsc kvp post office', '🏛️'),
  e('/tracker/fixed', 'Deposits & fixed income', 'FD, RD, bonds and maturities', 'Trackers', 'fixed deposit fd rd bond maturity interest', '💰'),
  e('/tracker/gold', 'Gold', 'Physical, digital, SGB', 'Trackers', 'sona sgb sovereign gold bond jewellery', '🪙'),
  e('/tracker/crypto', 'Crypto', 'Holdings and tax', 'Trackers', 'bitcoin ethereum vda tax 30%', '₿'),
  e('/tracker/passive', 'Passive income', 'Dividends, rent, interest, SWP', 'Trackers', 'freedom income dividend rent swp', '🌴'),
  e('/tracker/harvest', 'Tax harvesting', 'Use losses, free gains', 'Trackers', 'ltcg stcg capital gains loss harvest 1.25 lakh', '🍂'),
  e('/tracker/watchlist', 'Watchlist', 'Stocks and funds you follow', 'Trackers', 'follow track price stock fund nifty ticker', '👁️'),
  e('/tracker/import', 'Import a bank statement', 'CSV or account aggregator file', 'Trackers', 'statement csv upload bank import', '📥'),
  e('/tracker/holdings-import', 'Import holdings', 'Broker holdings file', 'Trackers', 'zerodha groww demat csv upload', '📥'),
  // tools
  e('/tools/score', 'Money Score', 'One number for your money picture', 'Tools', 'score rating check next moves', '⭐'),
  e('/tools/dna', 'Financial DNA', 'Nine questions about your money mindset', 'Tools', 'quiz personality behaviour mindset', '🧬'),
  e('/tools/calculators', 'Calculators', 'SIP, EMI, HRA and more', 'Tools', 'calculator sip emi fd rd hra gratuity', '🧮'),
  e('/tools/retirement', 'Retirement planner', 'Corpus, spending and odds', 'Tools', 'fire retire monte carlo pension corpus', '🌅'),
  e('/tools/tax', 'Tax savings', 'Deductions, old vs new regime', 'Tools', '80c 80d regime deduction save tax', '🧾'),
  e('/tools/taxplanner', 'Tax planner', 'Both regimes side by side', 'Tools', 'income tax slabs surcharge hra new old', '🧾'),
  e('/tools/itr', 'ITR prep kit', 'What you need to file', 'Tools', 'return filing tds form 16 documents', '📋'),
  e('/tools/salary', 'Salary structure', 'CTC to take-home', 'Tools', 'ctc in hand hra basic nps', '💵'),
  e('/tools/offers', 'Job offer comparer', 'What an offer really pays', 'Tools', 'ctc compare job hike variable esop', '🤝'),
  e('/tools/prepay', 'Prepay or invest', 'Loan against market', 'Tools', 'prepayment loan invest sip decision', '⚖️'),
  e('/tools/homeloan', 'Home loan', 'EMI, schedule, prepayment', 'Tools', 'emi mortgage affordability 24b', '🏠'),
  e('/tools/debt', 'Debt payoff', 'Avalanche or snowball', 'Tools', 'loans clear snowball avalanche credit card', '🏦'),
  e('/tools/credit', 'Credit score', 'CIBIL and what lifts it', 'Tools', 'cibil score utilisation', '📈'),
  e('/tools/goalopt', 'Goal optimizer', 'Which goal first and the SIP each needs', 'Tools', 'goals sip inflation priority', '🎯'),
  e('/tools/stepup', 'SIP step-up', 'Raise your SIP every year', 'Tools', 'sip increase annual top up', '📈'),
  e('/tools/rebalance', 'Portfolio rebalancer', 'Drift from your target mix', 'Tools', 'allocation equity debt gold target', '⚖️'),
  e('/tools/lifecover', 'Life cover needed', 'How much term cover', 'Tools', 'term insurance hlv human life value', '🛡️'),
  e('/tools/windfall', 'Windfall allocator', 'Where a bonus or lump sum goes first', 'Tools', 'bonus rsu sale lump sum inheritance', '🎁'),
  e('/tools/leak', 'Future loss', 'What leaking money would have become', 'Tools', 'leak waste small spends invested', '💧'),
  e('/tools/calendar', 'Financial calendar', 'Everything that is due', 'Tools', 'due dates sip renewal tax advance tax deadline', '📅'),
  e('/tools/report', 'Financial report', 'A one-page summary you can share', 'Tools', 'summary share advisor pdf export statement', '📄'),
  e('/tools/realestate', 'Real estate', 'Buy or rent, true cost, rental yield', 'Tools', 'property flat house stamp duty buy vs rent', '🏠'),
  // learn (the lesson list mirrors content/learn/manifest.json; __tests__/search.test.mts fails if they drift)
  e('/learn', 'Learn', 'Lessons on money, markets and insurance', 'Learn', 'lessons education course sip rsi equity mutual funds insurance basics seekho', '📚'),
  e('/learn/finance101', 'Personal Finance 101', 'Finance 101 — dismantle money myths, understand income vs wealth and EMI traps.', 'Learn', 'lesson learn money foundations finance101', '📖'),
  e('/learn/principles', 'The Constitution', 'Immutable laws of money — compounding, leverage, time value explained simply.', 'Learn', 'lesson learn money foundations principles', '📖'),
  e('/learn/foundations', 'Foundation Matrix', 'Build your financial foundation — principles, insurance, income vs wealth fundamentals.', 'Learn', 'lesson learn money foundations foundations', '📖'),
  e('/learn/equity', 'Equity Deep Dive', 'Equity Deep Dive — what a stock is, how the market works, and market cap, in five minutes before the full Masterclass.', 'Learn', 'lesson learn markets and instruments equity', '📖'),
  e('/learn/mutual_funds', 'Mutual Funds', 'Mutual Funds Deep Dive — the quick version before the full MF Masterclass.', 'Learn', 'lesson learn markets and instruments mutual funds', '📖'),
  e('/learn/etf', 'ETF Deep Dive', 'ETF Deep Dive — the quick version before the full ETF Masterclass.', 'Learn', 'lesson learn markets and instruments etf', '📖'),
  e('/learn/debt', 'Debt Deep Dive', 'Debt Deep Dive — the quick version before the full Debt Market Masterclass.', 'Learn', 'lesson learn markets and instruments debt', '📖'),
  e('/learn/money_market', 'Money Market', 'Money Market Deep Dive — treasury bills, CPs and where short-term cash actually goes.', 'Learn', 'lesson learn markets and instruments money market', '📖'),
  e('/learn/commodity', 'Commodity Deep Dive', 'Commodity Deep Dive — the quick version before the full Commodity Masterclass.', 'Learn', 'lesson learn markets and instruments commodity', '📖'),
  e('/learn/crypto', 'Crypto Deep Dive', 'Crypto Deep Dive — the shared-ledger concept, Bitcoin vs Ethereum, and how not to get scammed by tokenomics.', 'Learn', 'lesson learn markets and instruments crypto', '📖'),
  e('/learn/forex', 'Forex Deep Dive', 'Forex Deep Dive — the quick version before the full Forex Masterclass.', 'Learn', 'lesson learn markets and instruments forex', '📖'),
  e('/learn/fno', 'F&O Deep Dive', 'F&O Deep Dive — the quick version before the full Derivatives Masterclass.', 'Learn', 'lesson learn markets and instruments fno', '📖'),
  e('/learn/fundamental', 'Fundamental Analysis: God Mode', 'Fundamental Analysis: God Mode — reading a balance sheet, P&L and cash flow statement like an analyst.', 'Learn', 'lesson learn analysing investments fundamental', '📖'),
  e('/learn/technical', 'Technical Analysis: The Pulse', 'Technical Analysis: The Pulse — reading charts, patterns and momentum without the jargon.', 'Learn', 'lesson learn analysing investments technical', '📖'),
  e('/learn/indicators', 'Technical Toolkit (Full)', 'Technical Toolkit — the full indicator reference, from moving averages to RSI.', 'Learn', 'lesson learn analysing investments indicators', '📖'),
  e('/learn/metrics', 'Metric Armory (Full)', 'Metric Armory — the full reference of financial ratios and what each one actually tells you.', 'Learn', 'lesson learn analysing investments metrics', '📖'),
  e('/learn/analysis', 'Select Analysis Protocol', 'Pick your analysis protocol — fundamental or technical — before diving into the full toolkit.', 'Learn', 'lesson learn analysing investments analysis', '📖'),
  e('/learn/insurance', 'Shield Protocol (Insurance)', 'Shield Protocol — health, term life, and critical illness cover explained before you shop for a policy.', 'Learn', 'lesson learn protection insurance', '📖'),
  e('/learn/insight-sip', 'SIP Power', 'Starting a SIP at 25 vs 35 isn\'t a 10-year gap — it\'s a ₹1.2 crore one. The real cost of waiting, in numbers.', 'Learn', 'lesson learn quick insights insight sip', '📖'),
  e('/learn/insight-emi', 'The EMI Trap', 'Why your EMI barely dents the principal in year one — and the one prepayment habit that fixes it.', 'Learn', 'lesson learn quick insights insight emi', '📖'),
  e('/learn/insight-debt', 'Good vs Bad Debt', 'Good debt builds wealth, bad debt drains it — the line between leverage and chains, in two minutes.', 'Learn', 'lesson learn quick insights insight debt', '📖'),
  e('/learn/insight-inflation', 'Inflation Reality', 'Your savings account is losing you 4% a year, quietly. Why inflation is the wealth killer nobody notices.', 'Learn', 'lesson learn quick insights insight inflation', '📖'),
  e('/learn/insight-rbi', 'RBI & You', 'How one RBI rate decision moves your EMI, your FD returns, and the market — in that order.', 'Learn', 'lesson learn quick insights insight rbi', '📖'),
  e('/learn/investor-mindset', 'Investor Mindset Guide', 'Master the mental game of investing — biases, patience and conviction.', 'Learn', 'lesson learn investor mindset investor mindset', '📖'),
  e('/learn/investor-profile', 'Apex Cognitive Architectures | Deep Dive', 'Apex Cognitive Architectures — a deep dive into investor personality types and the decision framework that fits each one.', 'Learn', 'lesson learn investor mindset investor profile', '📖'),
  // pulse and Arya
  e('/pulse', 'PULSE', 'What matters for you today, ranked', 'Main', 'insights ranked since last visit recommended', '🧭'),
  e('/pulse/memory', 'What Arya remembers', 'See, edit, delete; what will be sent', 'Account', 'memory notes privacy online switch told', '🧠'),
  e('/pulse/life', 'Life events', 'Marriage, child, home, job change', 'Main', 'marriage baby wedding home job windfall education', '🎉'),
  // insurance and funds
  e('/insurance', 'Insurance hub', 'Cover types, questions to ask, your policies', 'Trackers', 'bima cover directory compare health term critical ulip claim', '🛡️'),
  e('/funds', 'Mutual fund search', 'Find a fund, Direct vs Regular, compare', 'Tools', 'mf nav scheme amfi direct regular growth idcw sip compare', '📈'),
  e('/funds/expense', 'Direct vs Regular', 'What the expense ratio costs over your years', 'Tools', 'expense ratio ter direct regular commission', '💸'),
  // market research
  e('/market', 'Market research', 'News, share and fund look-up, screener, gold, currency, crypto', 'Tools', 'news stock price share lookup fund nav screener gold dollar bitcoin', '🔭'),
  e('/market/news', 'Market news', 'Headlines with the source and time', 'Tools', 'news headlines sentiment business', '📰'),
  e('/market/screener', 'Stock screener', 'Day move and distance from the 52-week high and low', 'Tools', 'screener nifty 50 gainers losers 52 week high low', '🔎'),
  e('/market/commodities', 'Gold, silver and oil', 'World prices converted to rupees, with the date', 'Tools', 'gold silver crude oil commodity sona chandi', '🪙'),
  e('/market/fx', 'Currency rates', 'Dollar, euro, pound and more against the rupee', 'Tools', 'usd inr dollar euro pound exchange rate forex', '💱'),
  e('/market/crypto', 'Crypto prices', 'Bitcoin, Ethereum and other coins', 'Tools', 'bitcoin ethereum coin price crypto', '₿'),
  // planners
  e('/plan/forecast', 'Spending forecast', 'What you are likely to spend this month', 'Tools', 'forecast budget forecast predict spending next month', '🔮'),
  e('/plan/lifegoals', 'Life goals planner', 'Your goals in order and the SIP each needs', 'Tools', 'goals roadmap sip per goal marriage house education retirement', '🗺️'),
  e('/plan/growth', 'Growth projection', 'What your investments could grow to at a return you choose', 'Tools', 'portfolio growth sip projection compounding', '🌱'),
  e('/plan/couple', 'Couple finance', 'Two incomes, shared bills and joint goals', 'Tools', 'partner spouse split bills joint goals household', '👫'),
  e('/plan/benchmark', 'Benchmarks', 'Your figures against rules of thumb', 'Tools', 'compare rule of thumb savings rate emi share targets', '📏'),
  e('/plan/mydates', 'Your dates and export', 'Add your own dates, export the calendar', 'Tools', 'custom dates ics export calendar own reminder', '🗓️'),
  // feedback, diagnostics, welcome
  e('/feedback', 'Feedback', 'Tell us what to fix; saved on this phone first', 'Account', 'suggestion bug report complaint', '💬'),
  e('/diagnostics', 'Diagnostics', 'Crash notes and optional screen counts', 'Account', 'crash errors report counts usage', '🩺'),
  e('/onboarding/welcome', 'Welcome tour', 'What FIN·OS is and is not, and first steps', 'Account', 'intro start tutorial onboarding', '👋'),
];

/** Every calculator as an entry. */
export const CALC_ENTRIES: Entry[] = CALCS.map(c => ({
  id: `/tools/calc/${c.id}`, title: c.title, sub: c.blurb, route: `/tools/calc/${c.id}`,
  group: GROUPS.find(g => g.id === c.group)?.label ?? 'Calculators', keywords: `calculator ${c.id}`, icon: GROUPS.find(g => g.id === c.group)?.icon ?? '🧮',
}));

export const INDEX: Entry[] = [...SCREENS, ...CALC_ENTRIES];

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ऀ-ॿ% ]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Ranked matches. Every word of the query must appear somewhere (title, subtitle, keywords). Title matches beat keyword matches;
 * an exact title beats a prefix, a prefix beats a word start, a word start beats a substring.
 */
export function search(query: string, index: Entry[] = INDEX, limit = 12): Entry[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  const scored: { entry: Entry; score: number; pos: number }[] = [];
  index.forEach((entry, pos) => {
    const title = norm(entry.title), sub = norm(entry.sub), kw = norm(entry.keywords);
    let total = 0;
    for (const w of words) {
      let s = 0;
      if (title === w) s = 100;
      else if (title.startsWith(w)) s = 80;
      else if (title.split(' ').some(t => t.startsWith(w))) s = 60;
      else if (title.includes(w)) s = 40;
      else if (kw.split(' ').some(t => t === w)) s = 35;
      else if (kw.split(' ').some(t => t.startsWith(w))) s = 28;
      else if (sub.split(' ').some(t => t.startsWith(w))) s = 20;
      else if (kw.includes(w) || sub.includes(w)) s = 10;
      if (s === 0) return;                             // a word with no match drops the entry
      total += s;
    }
    if (total && words.every(w => title.includes(w) || kw.includes(w) || sub.includes(w))) {
      if (norm(entry.title) === words.join(' ')) total += 50;
      if (POPULAR.includes(entry.route)) total += 5;     // breaks ties towards the screens people open most
      scored.push({ entry, score: total, pos });
    }
  });
  return scored.sort((a, b) => b.score - a.score || a.pos - b.pos).slice(0, limit).map(s => s.entry);
}

/** What to show before anything is typed. */
export const POPULAR: string[] = ['/tools/score', '/tracker/networth', '/tools/retirement', '/tools/calc/sip', '/tools/calc/emi', '/tools/taxplanner', '/tools/calendar', '/tracker/budget'];
export const popularEntries = (): Entry[] => POPULAR.map(r => INDEX.find(x => x.route === r)).filter((x): x is Entry => !!x);
