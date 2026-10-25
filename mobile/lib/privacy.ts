// What the phone app does with data — written from what the code actually does, and guarded by __tests__/privacy.test.mts
// (which fails if the app starts talking to a host, or asking for a permission, that is not described here).
// Pure: no React Native imports.

/** Who is responsible for the notice. Left empty on purpose until the operator's business details exist — do not invent them. */
export const ENTITY: { name: string | null; address: string | null; grievanceOfficer: string | null; grievanceEmail: string | null } =
  { name: null, address: null, grievanceOfficer: null, grievanceEmail: null };

export type FlowKind = 'device' | 'account' | 'backend' | 'file' | 'share' | 'link';

export interface Flow {
  id: string;
  kind: FlowKind;
  title: string;
  when: string;
  sent: string;
  personal: boolean;
  optional: boolean;
  control: string;
}

export const FLOWS: Flow[] = [
  {
    id: 'device', kind: 'device', title: 'Your FIN·OS data, on this phone',
    when: 'Always, while you use the app.',
    sent: 'Nothing. Transactions, budgets, goals, holdings, subscriptions, policies, scores and settings are kept in this app\'s storage so the tools work.',
    personal: true, optional: false,
    control: 'Export it, or delete it, from Privacy & your data.',
  },
  {
    id: 'account', kind: 'account', title: 'Sign-in and sync (Supabase)',
    when: 'Only if you sign in.',
    sent: 'Your email and password to sign in (or, if this build offers Continue with Google, you sign in on Google\'s own page in your phone\'s browser and the app receives only a one-time code), then your holdings and your tracker data (everything except device-only settings) so they follow you to the website and your other devices. The sign-in is kept on this phone encrypted under a key in the phone\'s secure storage.',
    personal: true, optional: true,
    control: 'Use the app without an account and nothing is sent. Sign out any time (this signs out this phone only); delete your cloud copy or your account from Privacy & your data. Deleting the account also removes what the website saved for it.',
  },
  {
    id: 'arya', kind: 'backend', title: 'Arya chat, market research and fund search (your Arya backend)',
    when: 'When you open Markets or Market research, look up a price, a share or a fund, search for a mutual fund, or ask Arya a question.',
    sent: 'The share symbols, fund scheme codes and fund-name search words you look up, as you typed them. With a chat message: the question as you typed it, and as context your name, income, spending, net worth, portfolio value, SIP total and health score, each only when recorded and only while the "figures" switch in What Arya remembers is on. Two more kinds of context go only if you turn them on there (both are off until you do): up to 3 topics and 4 notes you gave Arya, and the type and month of life events you declared. What Arya remembers shows exactly what will be sent before you ask, and you can switch the online model off entirely. A short question about your own figures (net worth, an SIP sum) is answered on the phone and not sent. When Arya looks something up with a tool, only a public lookup term goes: a share symbol, a coin name or fund-name words; each call is listed under the answer and in the Arya Agent tab, where tools can be switched off. The portfolio analysis screens (sectors, risk, simulation, research) and the market detail screens send the tickers and fund codes you hold, or the symbol you opened, to the same backend to fetch price history, fund NAV history and company figures. These go to the Arya backend address in Settings — software you run yourself (by default the computer running the app\'s development server), not a FIN·OS-operated server.',
    personal: true, optional: true,
    control: 'Do not open Arya, Markets or fund search, or leave the backend unset; switch the online model off in What Arya remembers. The backend, not your phone, then fetches prices, fund NAVs, news and company data from public providers (NSE, AMFI, Yahoo Finance, CoinGecko, mfapi.in, which mirrors AMFI fund NAV history and receives only the scheme code, and the news publishers\' feeds); those providers see your backend\'s computer, not your phone. The last answers are kept on this phone so they can be shown offline, with their time; "Clear saved market data" in Market research removes them. The saved answers include price histories, fund NAV series, sector and fundamentals look-ups for the symbols you opened or hold.',
  },
  {
    id: 'files', kind: 'file', title: 'Files you choose (bank statements, broker holdings, trade files)',
    when: 'When you import a statement, a holdings file or a trade file (Trade journal), or export your trades.',
    sent: 'Nothing. The file is read on the phone, shown to you as a preview, and only then saved. From a bank statement, account numbers and names are never read; from a holdings file only instrument names, ISINs, quantities and prices are. If you are signed in, imported holdings sync like any holding you add yourself.',
    personal: true, optional: true,
    control: 'Every statement import can be undone from Import a bank statement → Past imports. Imported holdings can be removed one by one in the Portfolio tab. An imported trade file can be undone from Trade journal → Import and export → Past imports.',
  },
  {
    id: 'share', kind: 'share', title: 'The share sheet',
    when: 'Only when you tap Share, or Export CSV in the Trade journal.',
    sent: 'Money Score Share: a short text with your Money Score and pillar scores — no rupee amounts. It goes wherever you pick in your phone\'s share sheet. Trade journal Export CSV shares your trades (with their notes) the same way, as text, and only where you choose.',
    personal: false, optional: true,
    control: 'Do not tap Share or Export CSV.',
  },
  {
    id: 'news-links', kind: 'link', title: 'News article links (a publisher\'s website)',
    when: 'Only when you tap "Read the article" on a headline in Market news.',
    sent: 'Nothing from your phone\'s FIN·OS data. The article\'s own address opens in your phone\'s in-app browser, so the publisher\'s website sees your phone\'s network address and anything its own page collects, as if you had opened the link yourself.',
    personal: false, optional: true,
    control: 'Do not tap an article. The headline and summary are readable without opening it.',
  },
  {
    id: 'lesson-links', kind: 'link', title: 'Reference links in lessons (third-party websites)',
    when: 'Only when you tap a cited source at the bottom of a lesson.',
    sent: 'Nothing from your phone\'s FIN·OS data. The selected source address opens in your phone\'s browser; that website can see your phone\'s network address and anything its own page collects.',
    personal: false, optional: true,
    control: 'Do not tap a source link. Lesson text remains available in the app.',
  },
  {
    id: 'reports', kind: 'share', title: 'Feedback, crash notes and screen counts',
    when: 'Only when you open Share on the Feedback or Diagnostics screen, read the text, and tap Share.',
    sent: 'Nothing is sent automatically, and there is no crash-reporting or analytics service. If the app fails, a short note is kept on this phone (error name, a message with numbers, e-mails, links and IDs removed, a few code locations, the screen name, app version and phone system). Screen counts are kept only if you switch them on. When you share, the exact text you were shown goes where you pick in your phone\'s share sheet.',
    personal: false, optional: true,
    control: 'Read, delete or share them from Diagnostics and Feedback. Screen counts are off until you turn them on.',
  },
];

/** Things the app deliberately does not do — shown to the person, and kept true by tests. */
export const NOT_DOING = [
  'No analytics, advertising or tracking SDKs.',
  'No access to your contacts, photos, location, camera or microphone.',
  'No selling or sharing of your data.',
  'No crash, feedback or usage data is sent automatically: it stays on this phone until you read it and choose to share it.',
];

/**
 * What the app asks the phone for. Nothing here prompts you except notifications and fingerprint or face. Vibration and Run at start-up
 * come from the haptics and notifications libraries' own Android manifests (each library's AndroidManifest.xml under node_modules; __tests__/privacy.test.mts reads them).
 */
export const PERMISSIONS = [
  'Internet access',
  'Notifications (only if you turn reminders on)',
  'Fingerprint or face (only if you turn on app lock with it)',
  'Vibration (haptic feedback)',
  'Run at start-up (to keep reminders after a restart)',
];

/** Storage keys shown in "What is on this phone". `list` counts the entries of a JSON array; `value` just says it is set. */
export const DATA_ITEMS: { key: string; label: string; kind: 'list' | 'value' }[] = [
  { key: 'finos_transactions', label: 'Transactions', kind: 'list' },
  { key: 'finos_holdings_v1', label: 'Holdings', kind: 'list' },
  { key: 'finos_subscriptions', label: 'Subscriptions', kind: 'list' },
  { key: 'finos_goals', label: 'Goals', kind: 'list' },
  { key: 'finos_insurance_policies', label: 'Insurance policies', kind: 'list' },
  { key: 'finos_ppf_portfolio', label: 'PPF & small-savings accounts', kind: 'list' },
  { key: 'finos_recurring_v1', label: 'Recurring entries', kind: 'list' },
  { key: 'finos_money_score_history', label: 'Money Score history', kind: 'list' },
  { key: 'finos_budgets', label: 'Budget limits', kind: 'value' },
  { key: 'finos_reminders_mobile', label: 'Reminder preferences', kind: 'value' },
  { key: 'finos_applock_meta', label: 'App lock settings (the PIN itself is in the phone\'s secure storage)', kind: 'value' },
  { key: 'finos_alerts_state', label: 'Alerts you have read or dismissed', kind: 'value' },
  { key: 'finos_watchlist', label: 'Watchlist', kind: 'list' },
  { key: 'finos_holding_dates', label: 'Purchase dates of holdings', kind: 'value' },
  { key: 'finos_feedback_log', label: 'Feedback you saved', kind: 'list' },
  { key: 'finos_diag_crashes', label: 'Crash notes (redacted)', kind: 'list' },
  { key: 'finos_usage', label: 'Screen counts (only if you turned them on)', kind: 'value' },
  { key: 'finos_consents', label: 'Your choices about sharing', kind: 'value' },
  { key: 'finos_onboarding_mobile', label: 'Welcome tour progress', kind: 'value' },
  { key: 'finos_reels_watched', label: 'Which money reels you watched and whether you answered the question right (syncs with your other tracker data if you sign in)', kind: 'value' },
  { key: 'finos_reels_days', label: 'The days you finished a money reel, for your streak (syncs with your other tracker data if you sign in)', kind: 'value' },
  { key: 'finos_session_reels_profile', label: 'Reels you said you already know, topics you asked for less of, reels you saved, moves you said you would do, real milestones already shown, and your answers to the reels welcome (what you are here for, how comfortable you are with money terms) (never synced; in your own export and backup)', kind: 'value' },
  { key: 'finos_session_reels_moves', label: 'Things you started from a money reel and any change they led to (never synced; in your own export and backup)', kind: 'value' },
  { key: 'finos_session_reels_stats', label: 'Daily counts of how you use the money reels: reels finished, questions right, moves started, minutes. No reel names or amounts (never synced; in your own export and backup)', kind: 'value' },
  { key: 'finos_session_reels_challenges', label: 'Which seven-day challenges you started and the days you marked each task done (never synced; in your own export and backup)', kind: 'value' },
  { key: 'finos_session_reels_voice', label: 'How you want the reels read aloud: speed, style, breaths and the voice you picked for each language (never synced; in your own export and backup)', kind: 'value' },
  { key: 'finos_session_reels_nudge', label: 'Whether you want a daily money-reel reminder, and at what hour (never synced; in your own export and backup)', kind: 'value' },
  { key: 'finos_session_reels_reminders', label: 'Reminders you set after a money reel, with the time and the screen they open (never synced; in your own export and backup)', kind: 'value' },
  { key: 'finos_session_reels_notify', label: 'Whether you want follow-ups on things you said you would do and a Sunday look-back, and when each follow-up was placed (never synced; in your own export and backup)', kind: 'value' },
  { key: 'finos_learned_modules', label: 'Lessons you marked as learned (syncs with your other tracker data if you sign in)', kind: 'value' },
  { key: 'finos_learn_opened', label: 'When you last opened each lesson (syncs like your other tracker data if you sign in)', kind: 'value' },
  { key: 'finos_session_arya_memory_v1', label: 'What Arya remembers: notes and topics (never synced; in your own export and backup)', kind: 'list' },
  { key: 'finos_session_arya_life_v1', label: 'Life events you declared (never synced; in your own export and backup)', kind: 'list' },
  { key: 'finos_session_arya_prefs_v1', label: 'Arya privacy switches (never synced)', kind: 'value' },
  { key: 'finos_pulse_snapshot', label: 'Last PULSE snapshot: net worth, debt, SIP and savings rate (syncs like your other tracker data if you sign in)', kind: 'value' },
  { key: 'finos_insurance_checks_v1', label: 'Your answers to insurance questions (syncs like your other tracker data if you sign in)', kind: 'value' },
  { key: 'finos_funds_recent_v1', label: 'Funds you opened recently (syncs like your other tracker data if you sign in)', kind: 'list' },
  { key: 'finos_funds_compare_v1', label: 'Funds in your compare tray (syncs like your other tracker data if you sign in)', kind: 'list' },
  { key: 'marketcache_v1_index', label: 'Last saved market answers, including the symbols you looked at (not exported or backed up)', kind: 'value' },
  { key: 'finos_sync_never_couple_v1', label: 'Couple finance: your partner\'s figures, typed by you (never uploaded or synced; in your own export and backup)', kind: 'value' },
  { key: 'finos_sync_never_trade_journal_v1', label: 'Trade journal: your trades, charges, feelings and notes (never uploaded or synced; in your own export and backup)', kind: 'list' },
  { key: 'finos_sync_never_trade_journal_tags_v1', label: 'Trade journal tags (never uploaded or synced; in your own export and backup)', kind: 'list' },
  { key: 'finos_nw_history', label: 'Net worth points PULSE recorded, one a day (syncs like your other tracker data if you sign in)', kind: 'value' },
  { key: 'finos_calendar_custom_events', label: 'Your own calendar dates', kind: 'list' },
  { key: 'finos_life_goals_planner_v1', label: 'Life goals planner draft', kind: 'value' },
  { key: 'finos_growth_sim_v1', label: 'Growth projection draft', kind: 'value' },
  { key: 'finos_forecast_next_month', label: 'Latest spending forecast (derived)', kind: 'value' },
  { key: 'finos_goals_monthly_sip', label: 'Monthly SIP the goals need (derived, saved on a tap)', kind: 'value' },
  { key: 'finos_goals_target_total', label: 'Total of your goal targets (derived, saved on a tap)', kind: 'value' },
  { key: 'finos_goals_count', label: 'Number of goals counted (derived, saved on a tap)', kind: 'value' },
  { key: 'finos_life_goals_feasibility', label: 'Goals feasibility (derived, saved on a tap)', kind: 'value' },
  { key: 'finos_age', label: 'Your age', kind: 'value' },
  { key: 'finos_dependents', label: 'People who depend on your income', kind: 'value' },
  { key: 'finos_theme_mobile', label: 'Appearance choice', kind: 'value' },
  { key: 'finos_persona_mobile', label: 'Whether the facts strip on Home is hidden (never synced; not exported or backed up)', kind: 'value' },
  { key: 'finos_money_score', label: 'Latest Money Score', kind: 'value' },
  { key: 'finos_user_name', label: 'Your name', kind: 'value' },
  { key: 'finos_monthly_income', label: 'Income and other profile numbers', kind: 'value' },
];

/**
 * One line shown under "On this phone right now". The prefix is lib/safeStore.ts QUARANTINE_PREFIX; __tests__/privacy.test.mts checks
 * the claims in it (never uploaded, in your own export and backup, removed by erase).
 */
export const KEPT_ASIDE_NOTE = 'If a saved value cannot be read, the app keeps the unreadable text on this phone instead of overwriting it, until you erase your data (never uploaded; it is part of your own export and backup).';

/** How many entries a stored value holds (lists) or whether it is set (values). */
export function describeStored(raw: string | null, kind: 'list' | 'value'): string | null {
  if (raw == null || raw === '' || raw === '[]' || raw === '{}' || raw === '0') return null;
  if (kind === 'value') return 'saved';
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v.length ? `${v.length}` : null) : 'saved';
  } catch {
    return 'saved';
  }
}

export interface TermsSection { title: string; body: string[] }

/** Port of html/terms.html (a draft for legal review — operator, liability and governing law are not filled in). */
export const TERMS_STATUS = 'Draft for legal review. These terms describe how FIN·OS is meant to be used. They have not been reviewed by a lawyer, and the operator, liability and governing-law details are not filled in yet.';

export const TERMS: TermsSection[] = [
  { title: 'Using FIN·OS', body: [
    'FIN·OS is for adults (18 and over), for your own personal use.',
    'Use it lawfully. Do not try to break, overload, scrape or reverse-engineer it, or to access anyone else\'s data.',
    'Keep your phone safe. Anyone who can use your unlocked phone can see what FIN·OS stores on it.',
  ] },
  { title: 'What FIN·OS is, and is not', body: [
    'It is an educational tool. It helps you understand your money with calculators, trackers and estimates based on common rules of thumb and the rules it models.',
    'It is not advice. FIN·OS is not SEBI registered and does not give personalised investment, tax or legal advice. A score, a suggested next move or an Arya answer is an illustration, not a recommendation to buy, sell or file in a particular way.',
    'For important decisions, such as tax filing, insurance, loans or investments, check with a qualified professional.',
  ] },
  { title: 'Accuracy', body: [
    'Calculators state their assumptions (for example, income-tax slabs for FY 2025-26, without surcharge above ₹50 lakh). Rules change, so a result can be out of date.',
    'Market prices and other third-party data can be delayed, incomplete or wrong. FIN·OS does not guarantee them.',
    'Projections that use an assumed return are illustrations, not promises of returns.',
  ] },
  { title: 'Your data', body: [
    'By default your data stays on your phone. Privacy & your data shows what is stored, what can leave the phone, and how to export or delete it.',
    'You are responsible for backing it up.',
  ] },
  { title: 'Availability and changes', body: [
    'Features can change or be withdrawn. These terms will be updated when that matters, with the date of the latest change shown here.',
  ] },
  { title: 'Liability, governing law and contact', body: [
    'Operator: not set yet. To be added before launch.',
    'Limitation of liability: to be written by the operator\'s counsel.',
    'Governing law and courts: to be set by the operator\'s counsel.',
  ] },
];
