/**
 * FIN-OS Money Reels (web) — a small feed of short animated money lessons: today's episode of three reels, then a calm stop.
 *
 * The reels are data (js/reels-data.json, exported from the app's live reels by mobile/scripts/export-reels-web.mts): scenes with captions in
 * English and Hindi, a picture drawn in code, one try-it moment (a guess, a what-if slider, myth or fact, spot the scam, choose a path, sort,
 * put in order), a one-question quiz and a "how this is worked out" note. The figures the sliders show come from js/reels-eval.js, a tested
 * copy of the app's maths.
 *
 * Privacy: everything stays in the browser. The only network request is loading the data file. What you watch, answer and your day streak are
 * kept in localStorage under keys starting finos_session_reels_web_ (the site never syncs finos_session_* keys). No tracking, no sharing.
 * Also here, as in the app: the seasonal look (Diwali week, Budget week, March year-end), a money fact and a quiet look at the week at the calm stop,
 * reels to save for later, "I'll do this", and a small My moves list. All of it is plain lists in this browser; the maths and dates are tested copies (js/reels-eval.js).
 */
(function () {
  'use strict';

  const E = window.FinosReelsEval;
  const PREFIX = 'finos_session_reels_web_';
  const KEY_SEEN = PREFIX + 'seen', KEY_DAYS = PREFIX + 'days', KEY_EPISODE = PREFIX + 'episode';
  const KEY_STATS = PREFIX + 'stats', KEY_SAVED = PREFIX + 'saved', KEY_PLEDGES = PREFIX + 'pledges';
  const ID_OK = /^[a-z0-9-]{1,40}$/;
  const EPISODE_SIZE = 3;
  const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ── text the page itself says (the reels' own text is in the data) ───────────────────────────────────────────
  const UI = {
    en: {
      title: 'Money Reels', back: '← Back to Learn',
      sub: 'Three short animated lessons a day, with a moment to try it yourself. For education, not advice.',
      foot: 'Education, not advice. Every figure is an example with stated assumptions. What you watch and answer is kept only in this browser (keys starting finos_session_reels_web_) and is never sent anywhere or synced.',
      loading: 'Loading today’s reels…', loadErr: 'The reels could not be loaded. Check your connection and reload the page.',
      feedLabel: 'Today’s reels', langLabel: 'Language',
      statusNew: (n) => `Today’s episode: ${n} reels.`, statusDone: 'You’ve finished today’s reels. Watch any again, or come back tomorrow.', statusLeft: (d, n) => `${d} of ${n} watched today.`,
      streak: (n) => ` Day streak: ${n}.`,
      reelOf: (i, n) => `Reel ${i} of ${n}`, stageLabel: 'Reel picture. Press space to pause or play, left and right arrow keys to change scene.',
      play: 'Play', pause: 'Pause', prev: 'Previous scene', next: 'Next scene', restart: 'Start this reel again', paused: 'Paused', tapHint: 'Tap the picture to pause',
      topics: { basics: 'Basics', invest: 'Investing', loans: 'Loans', protect: 'Protection', tax: 'Tax', retire: 'Retirement', credit: 'Credit', safety: 'Scam safety', goals: 'Goals' },
      tryIt: 'Try it', skip: 'Skip this', cont: 'Continue',
      lock: 'Lock in my guess', yourGuess: 'Your guess', answerIs: 'In this example', gSpot: 'Spot on!', gClose: 'Close.', gFar: 'Quite far, and that gap is the lesson.',
      times: (t, side) => `about ${t}× too ${side === 'low' ? 'low' : 'high'}`,
      myth: 'Myth', fact: 'Fact', mRight: 'Right.', mWrong: 'Not quite.', mNext: 'Next', mScoreBtn: 'See my score', score: (r, n) => `You got ${r} of ${n}.`, thisIs: (f) => `This one is a ${f ? 'fact' : 'myth'}.`,
      spotCheck: 'Check my taps', spotHelp: 'Tap the parts you think are red flags, then check.', found: (f, t) => `You found ${f} of ${t} red flags.`, todo: 'What to do', flag: 'Red flag', missedFlag: 'You missed this one', notFlag: 'This part is normal',
      pathHelp: 'Tap a path to see where it leads.', verdict: 'What to take from it', another: 'Tap another path to compare.',
      sortHelp: 'Choose where this belongs.', sNext: 'Next card',
      orderHelp: 'Tap the steps in the order you would do them.', reset: 'Start over', orderScore: (r, n) => `${r} of ${n} in the right place.`, correctOrder: 'The order',
      quizTitle: 'Quick check', qRight: 'Correct.', qWrong: 'Not quite. The right answer is marked.', skipQuiz: 'Skip the quiz',
      done: 'Reel finished.', trust: 'How this is worked out', assumes: 'What was assumed', checked: (d) => `Note last checked ${d}.`,
      nextReel: 'Next reel', toStop: 'Finish today’s episode', replay: 'Watch this reel again',
      edu: 'For education, not advice. Example figures; yours will differ.',
      stopH: (n) => `That’s today’s ${n}.`, stopP: 'A small daily habit beats a long scroll. Come back tomorrow for a new episode.',
      stopStreak: (n) => `Day streak: ${n}. One rest day in a week never breaks it.`, stopTomorrow: (t) => `Coming up: ${t}`, again: 'Watch today’s again', learn: 'Back to Learn',
      stopApp: 'More reels, a voice and reels built from your own numbers are in the FIN-OS app.',
      mitra: 'Mitra the owl',
      factTitle: 'Money fact of the day', savedReel: 'Saved reel',
      save: '\uD83D\uDD16 Save for later', saved: '\uD83D\uDD16 Saved', pledge: '\u2705 I\u2019ll do this', pledged: '\u2705 On my moves',
      movesBtn: (n) => (n ? `My moves (${n})` : 'My moves'), movesTitle: 'My moves', pledgesH: 'I\u2019ll do this',
      pledgesNone: 'Nothing here yet. After a reel, tap \u201cI\u2019ll do this\u201d to keep its next step here.', since: (d) => `since ${d}`,
      savedH: 'Saved for later', savedNone: 'Nothing saved yet. After a reel, tap \u201cSave for later\u201d.', watch: 'Watch now', remove: 'Remove',
      movesNote: 'Kept only in this browser. The app can also notice when your own figures improve; this page never sees your numbers.',
      clear: 'Clear everything this page remembers', clearSure: 'Tap again to erase it', cleared: 'Cleared.',
    },
    hi: {
      title: 'मनी रील्स', back: '← Learn पर वापस',
      sub: 'रोज़ तीन छोटे एनिमेटेड पाठ, और ख़ुद आज़माने का एक मौक़ा। सिर्फ़ सीखने के लिए, सलाह नहीं।',
      foot: 'सिर्फ़ सीखने के लिए, सलाह नहीं। हर आँकड़ा बताई गई मान्यताओं वाला एक उदाहरण है। आप जो देखते और जवाब देते हैं वह सिर्फ़ इसी ब्राउज़र में रहता है (कुंजियाँ finos_session_reels_web_ से शुरू) और कहीं भेजा या सिंक नहीं किया जाता।',
      loading: 'आज की रील्स लोड हो रही हैं…', loadErr: 'रील्स लोड नहीं हो सकीं। अपना कनेक्शन जाँचें और पेज दोबारा खोलें।',
      feedLabel: 'आज की रील्स', langLabel: 'भाषा',
      statusNew: (n) => `आज का एपिसोड: ${n} रील्स।`, statusDone: 'आपने आज की रील्स देख ली हैं। चाहें तो कोई दोबारा देखें, या कल आएँ।', statusLeft: (d, n) => `आज ${n} में से ${d} देखीं।`,
      streak: (n) => ` लगातार दिन: ${n}।`,
      reelOf: (i, n) => `रील ${i} / ${n}`, stageLabel: 'रील की तस्वीर। रोकने या चलाने के लिए स्पेस दबाएँ, सीन बदलने के लिए बाएँ-दाएँ तीर।',
      play: 'चलाएँ', pause: 'रोकें', prev: 'पिछला सीन', next: 'अगला सीन', restart: 'यह रील फिर से शुरू करें', paused: 'रुका है', tapHint: 'रोकने के लिए तस्वीर छुएँ',
      topics: { basics: 'बुनियादी बातें', invest: 'निवेश', loans: 'लोन', protect: 'सुरक्षा', tax: 'टैक्स', retire: 'रिटायरमेंट', credit: 'क्रेडिट', safety: 'ठगी से बचाव', goals: 'लक्ष्य' },
      tryIt: 'आज़माएँ', skip: 'इसे छोड़ें', cont: 'आगे बढ़ें',
      lock: 'मेरा अंदाज़ा पक्का', yourGuess: 'आपका अंदाज़ा', answerIs: 'इस उदाहरण में', gSpot: 'बिल्कुल सही!', gClose: 'क़रीब।', gFar: 'काफ़ी दूर, और यही फ़र्क़ सीख है।',
      times: (t, side) => `लगभग ${t}× ${side === 'low' ? 'कम' : 'ज़्यादा'}`,
      myth: 'मिथक', fact: 'तथ्य', mRight: 'सही।', mWrong: 'ठीक नहीं।', mNext: 'अगला', mScoreBtn: 'मेरा स्कोर देखें', score: (r, n) => `आपके ${n} में से ${r} सही रहे।`, thisIs: (f) => `यह एक ${f ? 'तथ्य' : 'मिथक'} है।`,
      spotCheck: 'मेरे चुनाव जाँचें', spotHelp: 'जो हिस्से आपको लाल झंडे लगें उन्हें छुएँ, फिर जाँचें।', found: (f, t) => `आपने ${t} में से ${f} लाल झंडे पकड़े।`, todo: 'क्या करें', flag: 'लाल झंडा', missedFlag: 'यह आपसे छूट गया', notFlag: 'यह हिस्सा सामान्य है',
      pathHelp: 'किसी रास्ते को छुएँ और देखें वह कहाँ ले जाता है।', verdict: 'इससे क्या समझें', another: 'तुलना के लिए दूसरा रास्ता छुएँ।',
      sortHelp: 'चुनें यह कहाँ आता है।', sNext: 'अगला कार्ड',
      orderHelp: 'कदमों को उसी क्रम में छुएँ जिसमें आप उन्हें करेंगे।', reset: 'फिर से शुरू करें', orderScore: (r, n) => `${n} में से ${r} सही जगह पर।`, correctOrder: 'सही क्रम',
      quizTitle: 'झटपट जाँच', qRight: 'सही।', qWrong: 'ठीक नहीं। सही जवाब पर निशान है।', skipQuiz: 'क्विज़ छोड़ें',
      done: 'रील पूरी हुई।', trust: 'यह कैसे निकाला गया', assumes: 'क्या मान लिया गया', checked: (d) => `यह नोट आख़िरी बार ${d} को जाँचा गया।`,
      nextReel: 'अगली रील', toStop: 'आज का एपिसोड पूरा करें', replay: 'यह रील फिर देखें',
      edu: 'सिर्फ़ सीखने के लिए, सलाह नहीं। आँकड़े उदाहरण हैं; आपके अलग होंगे।',
      stopH: (n) => `आज के ${n} पूरे हुए।`, stopP: 'रोज़ की छोटी आदत लंबे स्क्रॉल से बेहतर है। नए एपिसोड के लिए कल आइए।',
      stopStreak: (n) => `लगातार दिन: ${n}। हफ़्ते में एक छुट्टी से यह कभी नहीं टूटता।`, stopTomorrow: (t) => `आगे: ${t}`, again: 'आज की रील्स फिर देखें', learn: 'Learn पर वापस',
      stopApp: 'और रील्स, आवाज़ और आपके अपने आँकड़ों वाली रील्स FIN-OS ऐप में हैं।',
      mitra: 'मित्रा उल्लू',
      factTitle: 'आज का पैसे का तथ्य', savedReel: 'सहेजी रील',
      save: '\uD83D\uDD16 बाद के लिए सहेजें', saved: '\uD83D\uDD16 सहेजी गई', pledge: '\u2705 मैं यह करूँगा/करूँगी', pledged: '\u2705 मेरे कामों में',
      movesBtn: (n) => (n ? `मेरे काम (${n})` : 'मेरे काम'), movesTitle: 'मेरे काम', pledgesH: 'मैं यह करूँगा/करूँगी',
      pledgesNone: 'अभी कुछ नहीं। रील के बाद \u201cमैं यह करूँगा/करूँगी\u201d छुएँ, तो उसका अगला क़दम यहाँ रहेगा।', since: (d) => `${d} से`,
      savedH: 'बाद के लिए सहेजी', savedNone: 'अभी कुछ सहेजा नहीं है। रील के बाद \u201cबाद के लिए सहेजें\u201d छुएँ।', watch: 'अभी देखें', remove: 'हटाएँ',
      movesNote: 'सिर्फ़ इसी ब्राउज़र में रहता है। ऐप आपके अपने आँकड़े सुधरने पर भी पहचान सकता है; यह पेज आपके आँकड़े कभी नहीं देखता।',
      clear: 'इस पेज की याद की हर चीज़ मिटाएँ', clearSure: 'मिटाने के लिए फिर छुएँ', cleared: 'मिटा दिया।',
    },
  };

  // ── small helpers ───────────────────────────────────────────────────────────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let lang = 'en';
  const li = () => (lang === 'hi' ? 1 : 0);
  const S = () => UI[lang];
  const tx = (pair) => pair[li()];
  const clamp01 = (p) => Math.min(1, Math.max(0, p));
  const ease = (p) => 1 - Math.pow(1 - clamp01(p), 3);
  const settle = (p, at) => ease(Math.min(1, p / (at || 0.7)));

  const store = {
    get(key, fallback) { try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode or full: the reels still work */ } },
  };
  function siteLang() { try { return window.localStorage.getItem('finos_lang') === 'hi' ? 'hi' : 'en'; } catch (e) { return 'en'; } }

  // What comes back from storage is never trusted: another tab, an older version or a person can leave anything there. Each reader returns a
  // well-formed value or an empty one, so a damaged entry costs only that entry, never the page.
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const validDay = (s) => {
    if (typeof s !== 'string' || !DAY_RE.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;          // a real calendar day, not 2026-13-45
  };
  /** { reelId: { at, correct } } with a real date and a boolean; anything else is dropped. */
  function cleanSeen(v) {
    const out = {};
    if (!isObj(v)) return out;
    for (const [id, w] of Object.entries(v).slice(0, 600)) {
      if (ID_OK.test(id) && isObj(w) && typeof w.at === 'string' && w.at.length <= 40 && Number.isFinite(new Date(w.at).getTime())) out[id] = { at: w.at, correct: w.correct === true };
    }
    return out;
  }
  /** A list of 'YYYY-MM-DD' days, each a real date, no repeats, the last 120. */
  function cleanDays(v) {
    return Array.isArray(v) ? Array.from(new Set(v.filter(validDay))).sort().slice(-120) : [];
  }
  /** { v: 1, days: { 'YYYY-MM-DD': { counter: whole number 0..500 } } } for the counters the page keeps. */
  function cleanStats(v) {
    const out = { v: 1, days: {} };
    if (!isObj(v) || !isObj(v.days)) return out;
    for (const [day, d] of Object.entries(v.days)) {
      if (!validDay(day) || !isObj(d)) continue;
      const row = {};
      for (const f of ['fin', 'pledges', 'saves', 'moves', 'receipts', 'together']) { const n = d[f]; if (typeof n === 'number' && Number.isFinite(n) && n > 0) row[f] = Math.min(500, Math.floor(n)); }
      out.days[day] = row;
    }
    const keys = Object.keys(out.days).sort();
    keys.slice(0, -90).forEach((k) => { delete out.days[k]; });
    return out;
  }
  const cleanSaved = (v) => (Array.isArray(v) ? Array.from(new Set(v.filter((x) => typeof x === 'string' && ID_OK.test(x)))).slice(-60) : []);
  const cleanPledges = (v) => {
    if (!Array.isArray(v)) return [];
    const seen = new Set(), out = [];
    for (const x of v) { if (isObj(x) && typeof x.id === 'string' && ID_OK.test(x.id) && typeof x.at === 'string' && x.at.length <= 40 && !seen.has(x.id)) { seen.add(x.id); out.push({ id: x.id, at: x.at }); } }
    return out.slice(-20);
  };
  /** Today's three ids if they were kept for today and are all real reels; otherwise null (a new episode is chosen). */
  function cleanEpisode(v, today, known) {
    if (!isObj(v) || v.day !== today || !Array.isArray(v.ids) || v.ids.length < 1 || v.ids.length > 6) return null;
    return v.ids.every((id) => typeof id === 'string' && known.has(id)) && new Set(v.ids).size === v.ids.length ? v.ids : null;
  }
  function loadLists() {
    state.saved = cleanSaved(store.get(KEY_SAVED, []));
    state.pledges = cleanPledges(store.get(KEY_PLEDGES, []));
    state.stats = cleanStats(store.get(KEY_STATS, null));
    state.seen = cleanSeen(store.get(KEY_SEEN, {}));
    state.days = cleanDays(store.get(KEY_DAYS, []));
  }
  /** A tally for today (reels finished, moves kept, reels saved): numbers only, no reel names, kept 90 days, shown back as the weekly line. */
  function bumpStat(field) {
    const days = state.stats.days, d = days[state.today] || (days[state.today] = {});
    d[field] = Math.min(500, (Number(d[field]) || 0) + 1);
    Object.keys(days).sort().slice(0, -90).forEach((k) => { delete days[k]; });
    store.set(KEY_STATS, state.stats);
  }
  const reelById = (id) => state.reels.find((r) => r.id === id) || null;
  const fmtDate = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' }) : ''; };

  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayNum = (key) => { const [y, m, d] = key.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };

  /** Days with a reel counted back from `from`, one rest day allowed in any seven (the app's rule; a missed day is never announced). */
  function runBack(active, from) {
    let count = 0; const rests = [];
    for (let cur = from, guard = 0; guard < 400; cur--, guard++) {
      if (active.has(cur)) { count++; continue; }
      if (rests.some((r) => r - cur < 7)) break;
      rests.push(cur);
      if (rests.length > 60) break;
      if (![...active].some((d) => d < cur)) break;
    }
    return count;
  }
  function streakNow(days, today) {
    const t = dayNum(today), active = new Set(days.filter((s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)).map(dayNum).filter((n) => Number.isFinite(n) && n <= t));
    return runBack(active, active.has(t) ? t : t - 1);
  }

  /** A small deterministic shuffle, so the same day gives the same order on every visit. */
  function shuffled(items, seed) {
    let a = (seed >>> 0) || 1;
    const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }

  /** Today's reels: the best unseen one, then one with something to try, then one from a different topic. Same all day (kept in the browser). */
  function composeEpisode(reels, seen, today) {
    const byId = new Map(reels.map((r) => [r.id, r]));
    const keptIds = cleanEpisode(store.get(KEY_EPISODE, null), today, new Set(reels.map((r) => r.id)));
    const pool0 = shuffled(reels, dayNum(today));
    const fresh = pool0.filter((r) => !seen[r.id]);
    const pool = fresh.length >= EPISODE_SIZE ? fresh : pool0;
    let picks;
    if (keptIds) picks = keptIds.map((id) => byId.get(id));
    else {
      picks = [pool[0]];
      if (!pool[0].beat) { const play = pool.find((r) => r.beat && !picks.includes(r)); if (play) picks.push(play); }
      while (picks.length < EPISODE_SIZE) {
        const rest = pool.filter((r) => !picks.includes(r));
        if (!rest.length) break;
        const topics = new Set(picks.map((p) => p.topic));
        picks.push(rest.slice(0, 6).find((r) => !topics.has(r.topic)) || rest[0]);
      }
      store.set(KEY_EPISODE, { day: today, ids: picks.map((r) => r.id) });
    }
    const tomorrow = pool.find((r) => !picks.includes(r)) || null;
    return { picks, tomorrow };
  }

  // ── pictures ────────────────────────────────────────────────────────────────────────────────────────────────
  const TONE = { cyan: 'var(--rl-cyan)', teal: 'var(--rl-teal)', gold: 'var(--rl-gold)', purple: 'var(--rl-purple)', red: 'var(--rl-red)' };
  const INK = 'var(--rl-ink)', SOFT = 'var(--rl-ink-soft)';

  function wrapText(text, max) {
    const out = []; let cur = '';
    for (const w of String(text).split(/\s+/)) {
      if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) out.push(cur);
    return out;
  }
  const svgText = (x, y, size, fill, weight, anchor, content) => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" style="fill:${fill}">${esc(content)}</text>`;
  function textLines(text, x, y, max, size, fill, weight, anchor) {
    const sz = Number.isFinite(size) ? size : 12;          // a missing size must never reach the picture as NaN
    return wrapText(text, max).slice(0, 4).map((ln, i) => svgText(x, y + i * (sz + 3), sz, fill || SOFT, weight || 400, anchor || 'middle', ln)).join('');
  }
  const inrFull = (n) => { const s = String(Math.round(n)); const l = s.slice(-3), r = s.slice(0, -3); return '₹' + (r ? r.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + l : l); };

  /** What sits beside Mitra for a scene, as SVG markup. Every shape is a function of p (how far through the scene we are, 0..1). */
  function propSvg(prop, p, now) {
    const t = (pair) => pair[li()];
    switch (prop.kind) {
      case 'counter': {
        const v = prop.from + (prop.to - prop.from) * settle(p, 0.75), col = TONE[prop.tone || 'cyan'], plain = prop.format === 'plain';
        const fmt = (n) => (plain ? String(Math.round(n)) : n >= 100000 ? E.money(Math.round(n))[li()] : inrFull(n));
        const size = plain ? 78 : Math.min(44, Math.floor(184 / (fmt(Math.max(prop.from, prop.to)).length * 0.62)));
        return svgText(100, 130, size, col, 800, 'middle', fmt(v)) + (plain && prop.unit ? svgText(100, 160, 18, INK, 800, 'middle', t(prop.unit)) : '') + (prop.label ? textLines(t(prop.label), 100, plain ? 188 : 164, 22, 12) : '');
      }
      case 'bars': {
        const n = prop.items.length, bw = n > 2 ? 44 : 62, gap = (200 - n * bw) / (n + 1), max = Math.max(...prop.items.map((i) => i.value)), base = 205, grow = settle(p, 0.65);
        return `<path d="M0 ${base} H200" style="stroke:var(--rl-axis)" stroke-width="2" fill="none"/>` + prop.items.map((it, i) => {
          const h = (it.value / max) * 140 * grow, x = gap + i * (bw + gap);
          return `<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="8" style="fill:${TONE[it.tone]}"/>` + (p > 0.45 ? svgText(x + bw / 2, base - h - 8, 15, INK, 800, 'middle', t(it.text)) : '') + textLines(t(it.label), x + bw / 2, base + 18, 11, 11);
        }).join('');
      }
      case 'line': {
        const pts = prop.points, n = pts.length, col = TONE[prop.tone || 'teal'], lo = Math.min(...pts), hi = Math.max(...pts);
        const X = (i) => 10 + (i / (n - 1)) * 180, Y = (v) => 190 - ((v - lo) / (hi - lo || 1)) * 140;
        const upto = settle(p, 0.8) * (n - 1), whole = Math.floor(upto), frac = upto - whole;
        const drawn = pts.slice(0, whole + 1).map((v, i) => [X(i), Y(v)]);
        if (whole < n - 1) drawn.push([X(whole) + (X(whole + 1) - X(whole)) * frac, Y(pts[whole]) + (Y(pts[whole + 1]) - Y(pts[whole])) * frac]);
        const line = drawn.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), last = drawn[drawn.length - 1];
        return `<path d="M10 190 H190 M10 190 V40" style="stroke:var(--rl-axis)" stroke-width="2" fill="none"/><path d="M10 190 L${line.replace(/ /g, ' L')} L${last[0]} 190 Z" style="fill:${col}" opacity="0.18"/>` +
          `<polyline points="${line}" fill="none" style="stroke:${col}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="6" style="fill:${col}"/>` + (prop.label ? textLines(t(prop.label), 100, 218, 26, 11) : '');
      }
      case 'donut': {
        const total = prop.parts.reduce((s, x) => s + x.value, 0), R = 58, C = 2 * Math.PI * R, sweep = settle(p, 0.7);
        let acc = 0;
        return `<circle cx="100" cy="105" r="${R}" style="stroke:var(--rl-track)" stroke-width="26" fill="none"/>` + prop.parts.map((part) => {
          const len = (part.value / total) * C * sweep, off = (acc / total) * C; acc += part.value;
          return `<circle cx="100" cy="105" r="${R}" style="stroke:${TONE[part.tone]}" stroke-width="26" fill="none" stroke-dasharray="${len} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 100 105)"/>`;
        }).join('') + (prop.centre ? textLines(t(prop.centre), 100, 102, 9, 14, INK, 800) : '') + prop.parts.map((part, i) =>
          `<circle cx="22" cy="${198 + i * 24}" r="6" style="fill:${TONE[part.tone]}"/>` + svgText(36, 203 + i * 24, 14, INK, 400, 'start', `${t(part.label)}: ${Math.round((part.value / total) * 100)}%`)).join('');
      }
      case 'coins': {
        const shown = Math.min(prop.count, 8), cols = Math.min(shown, 4);
        return Array.from({ length: shown }, (_, i) => {
          const appear = ease((p * (shown + 2) - i) / 1.2), col = i % cols, row = Math.floor(i / cols);
          const x = 100 - (cols - 1) * 22 + col * 44, y = 175 - row * 34 - (1 - appear) * 90;
          return `<g opacity="${appear.toFixed(3)}"><circle cx="${x}" cy="${y}" r="19" fill="#F0A500" stroke="#B87800" stroke-width="3"/>${svgText(x, y + 6, 18, '#3A2A00', 800, 'middle', '₹')}</g>`;
        }).join('') + (prop.label ? textLines(t(prop.label), 100, 236, 24, 12) : '');
      }
      case 'shield': {
        const pulse = 1 + (reduced ? 0 : Math.sin(now / 260) * 0.015), a = settle(p, 0.5);
        return `<g opacity="${a.toFixed(3)}" transform="translate(100 120) scale(${(pulse * (0.85 + 0.15 * a)).toFixed(4)}) translate(-100 -120)"><path d="M100 30 L170 56 V126 Q170 190 100 224 Q30 190 30 126 V56 Z" fill="#14234A" stroke="#22D3A6" stroke-width="5" stroke-linejoin="round"/>` +
          textLines(t(prop.text), 100, prop.sub ? 112 : 128, 11, 22, '#F5F7FA', 800) + (prop.sub ? textLines(t(prop.sub), 100, 158, 14, 13, '#9FE9D2', 400) : '') + '</g>';
      }
      case 'steps': {
        const n = prop.items.length, gap = Math.min(74, 230 / n);
        return prop.items.map((it, i) => {
          const a = ease((p * (n + 0.6) - i) / 0.9), y = 40 + gap / 2 + i * gap, dy = (1 - a) * 14;
          return `<g opacity="${a.toFixed(3)}"><rect x="6" y="${y - 24 + dy}" width="188" height="${Math.min(56, gap - 8)}" rx="14" style="fill:var(--rl-stage);stroke:var(--rl-stage-line)" stroke-width="2"/><circle cx="30" cy="${y + 4 + dy}" r="11" style="fill:var(--rl-teal)"/>` +
            `<path d="M24 ${y + 4 + dy} l5 5 l9 -10" stroke="#07241C" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${textLines(t(it), 50, y - 2 + dy, 19, 13, INK, 800, 'start')}</g>`;
        }).join('');
      }
      default: return '';
    }
  }

  /** Mitra the owl, a small friendly drawing whose face follows the scene's mood. */
  function mitraSvg(mood) {
    const eyeR = mood === 'surprised' ? 17 : 14;
    let pdx = 0, pdy = 1;
    if (mood === 'think') { pdx = 4; pdy = -4; } else if (mood === 'worry') { pdy = 3; } else if (mood === 'surprised') { pdy = 0; }
    const eyes = mood === 'cheer'
      ? '<path d="M30 64 Q44 48 58 64" fill="none" stroke="#2B1B0C" stroke-width="5" stroke-linecap="round"/><path d="M62 64 Q76 48 90 64" fill="none" stroke="#2B1B0C" stroke-width="5" stroke-linecap="round"/>'
      : `<circle cx="44" cy="62" r="${eyeR}" fill="#fff"/><circle cx="76" cy="62" r="${eyeR}" fill="#fff"/><circle cx="${44 + pdx}" cy="${62 + pdy}" r="${mood === 'surprised' ? 4 : 6.5}" fill="#2B1B0C"/><circle cx="${76 + pdx}" cy="${62 + pdy}" r="${mood === 'surprised' ? 4 : 6.5}" fill="#2B1B0C"/>`;
    const brows = mood === 'worry'
      ? '<path d="M30 44 L54 50 M90 44 L66 50" stroke="#2B1B0C" stroke-width="4" stroke-linecap="round"/>'
      : mood === 'think' ? '<path d="M30 46 L54 46 M66 40 Q78 34 90 42" stroke="#2B1B0C" stroke-width="4" fill="none" stroke-linecap="round"/>'
        : mood === 'surprised' ? '<path d="M30 40 Q44 30 58 40 M62 40 Q76 30 90 40" stroke="#2B1B0C" stroke-width="4" fill="none" stroke-linecap="round"/>' : '';
    const beak = mood === 'surprised' ? '<ellipse cx="60" cy="86" rx="6" ry="8" style="fill:var(--rl-beak)"/>' : '<path d="M52 80 L68 80 L60 94 Z" style="fill:var(--rl-beak)"/>';
    const wing = mood === 'cheer'
      ? '<ellipse cx="18" cy="82" rx="10" ry="26" transform="rotate(28 18 82)" style="fill:var(--rl-owl-dark)"/><ellipse cx="102" cy="82" rx="10" ry="26" transform="rotate(-28 102 82)" style="fill:var(--rl-owl-dark)"/>'
      : '<ellipse cx="17" cy="104" rx="10" ry="28" style="fill:var(--rl-owl-dark)"/><ellipse cx="103" cy="104" rx="10" ry="28" style="fill:var(--rl-owl-dark)"/>';
    const extra = mood === 'worry' ? '<path d="M96 40 q4 8 0 12 q-4 -4 0 -12z" fill="#4DB8FF"/>' : mood === 'surprised' ? svgText(100, 30, 26, 'var(--rl-gold)', 800, 'middle', '!') : mood === 'think' ? svgText(100, 30, 24, 'var(--rl-purple)', 800, 'middle', '?') : mood === 'cheer' ? '<path d="M14 24 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" style="fill:var(--rl-gold)"/>' : '';
    return `<svg viewBox="0 0 120 160" role="img" aria-label="${esc(S().mitra)}" focusable="false">${wing}<path d="M26 32 L40 14 L52 30 Z M94 32 L80 14 L68 30 Z" style="fill:var(--rl-owl-dark)"/>` +
      `<ellipse cx="60" cy="88" rx="40" ry="52" style="fill:var(--rl-owl)"/><ellipse cx="60" cy="108" rx="24" ry="30" style="fill:var(--rl-belly)"/>${eyes}${brows}${beak}` +
      '<path d="M48 142 l-4 10 m10 -10 l0 10 m10 -10 l4 10 M62 142 l-4 10 m10 -10 l0 10 m10 -10 l4 10" stroke="#C47F00" stroke-width="3" stroke-linecap="round" fill="none"/>' + extra + '</svg>';
  }

  /** A person from the reel's story, in place of Mitra: a simple head and shoulders, tinted by name. */
  function personSvg(id) {
    let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `<svg viewBox="0 0 100 120" role="img" aria-label="${esc(id)}" focusable="false"><path d="M10 120 Q12 80 50 78 Q88 80 90 120 Z" fill="hsl(${h},50%,48%)"/><circle cx="50" cy="46" r="26" fill="#E4B58C"/>` +
      `<path d="M24 46 Q22 14 50 14 Q78 14 76 46 Q68 30 50 30 Q32 30 24 46 Z" fill="hsl(${h},30%,22%)"/><circle cx="41" cy="48" r="3" fill="#2B1B0C"/><circle cx="59" cy="48" r="3" fill="#2B1B0C"/><path d="M42 58 Q50 65 58 58" stroke="#2B1B0C" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;
  }
  const nameOf = (id) => id.charAt(0).toUpperCase() + id.slice(1);

  // ── one reel's player ───────────────────────────────────────────────────────────────────────────────────────
  const state = { season: null, stats: { v: 1, days: {} }, saved: [], pledges: [], stopEl: null, io: null, data: null, reels: [], players: [], active: -1, episode: null, today: '', seen: {}, days: [], feed: null, last: 0, drawAt: 0 };

  const sceneMs = (reel, i) => Math.max(reel.scenes[i].ms, Math.min(7500, 1200 + 40 * tx(reel.scenes[i].say).length));

  function buildCard(reel, idx, total) {
    const el = document.createElement('article');
    el.className = 'rl-card'; el.tabIndex = -1; el.dataset.idx = String(idx);
    el.innerHTML =
      '<div class="rl-card-h"><span class="rl-chip" data-r="chip"></span><span class="rl-season" data-r="season" hidden></span><span class="rl-count" data-r="count"></span></div>' +
      '<h2 class="rl-reel-title" data-r="title"></h2>' +
      `<div class="rl-prog" aria-hidden="true">${reel.scenes.map(() => '<i><b></b></i>').join('')}</div>` +
      '<div class="rl-stage" data-r="stage" tabindex="0" role="group"><div class="rl-big" data-r="big"></div><div class="rl-who" data-r="who"></div><svg class="rl-prop" data-r="prop" viewBox="0 0 200 270" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"></svg><span class="rl-pause-badge" data-r="badge" hidden></span></div>' +
      '<p class="rl-say" data-r="say"></p>' +
      '<div class="rl-ctl" data-r="ctl"><button type="button" class="rl-ic" data-a="prev">⏮</button><button type="button" class="rl-ic rl-ic-main" data-a="toggle"></button><button type="button" class="rl-ic" data-a="nextscene">⏭</button></div>' +
      '<div class="rl-panel" data-r="panel" hidden tabindex="-1"></div>';
    return el;
  }

  function makePlayer(reel, idx, total, el, extra) {
    const q = (name) => el.querySelector(`[data-r="${name}"]`);
    const P = { reel, idx, total, el, extra: !!extra, phase: 'scene', si: 0, t: 0, playing: false, userPaused: false, beat: null, quiz: { picked: -1 }, finished: false, focusNext: false,
      r: { chip: q('chip'), count: q('count'), season: q('season'), title: q('title'), stage: q('stage'), big: q('big'), who: q('who'), prop: q('prop'), badge: q('badge'), say: q('say'), ctl: q('ctl'), panel: q('panel'), bars: el.querySelectorAll('.rl-prog i b') } };

    P.labels = () => {
      const s = S();
      P.r.chip.textContent = s.topics[reel.topic] || reel.topic;
      P.r.count.textContent = P.extra ? s.savedReel : s.reelOf(idx + 1, total);
      P.r.season.hidden = !state.season; if (state.season) P.r.season.textContent = `${state.season.badge} ${tx(state.season.label)}`;
      P.r.title.textContent = tx(reel.title);
      P.r.stage.setAttribute('aria-label', s.stageLabel);
      const toggle = el.querySelector('[data-a="toggle"]'), prev = el.querySelector('[data-a="prev"]'), nx = el.querySelector('[data-a="nextscene"]');
      toggle.textContent = P.playing ? '⏸' : '▶'; toggle.setAttribute('aria-label', P.playing ? s.pause : s.play);
      prev.setAttribute('aria-label', s.prev); nx.setAttribute('aria-label', s.next);
      P.r.badge.textContent = s.paused; P.r.badge.hidden = P.playing || P.phase !== 'scene' || !P.started;
      el.setAttribute('aria-label', `${P.extra ? s.savedReel : s.reelOf(idx + 1, total)}: ${tx(reel.title)}`);
    };

    P.drawScene = (p, now) => {
      const sc = reel.scenes[P.si];
      if (sc.prop) P.r.prop.innerHTML = propSvg(sc.prop, p, now || performance.now()); else P.r.prop.innerHTML = '';
    };
    P.enterScene = (i) => {
      P.phase = 'scene'; P.si = i; P.t = 0; P.started = true;
      const sc = reel.scenes[i];
      el.classList.remove('is-panel'); P.r.panel.hidden = true; P.r.ctl.style.display = '';
      P.r.say.textContent = tx(sc.say);
      P.r.big.textContent = sc.big ? tx(sc.big) : '';
      P.r.who.innerHTML = sc.who ? `<figure style="margin:0;text-align:center">${personSvg(sc.who)}<figcaption>${esc(nameOf(sc.who))}</figcaption></figure>` : mitraSvg(sc.mood);
      P.r.stage.classList.toggle('no-prop', !sc.prop);
      P.drawScene(reduced || !P.playing ? 1 : 0);      // a paused scene shows its finished picture; a playing one draws itself
      P.r.bars.forEach((b, k) => { b.style.width = k < i ? '100%' : '0'; });
      P.labels();
    };
    P.setPlaying = (on, byUser) => {
      P.playing = on && P.phase === 'scene';
      if (P.playing) P.started = true;
      if (byUser) P.userPaused = !on;
      P.labels();
    };
    P.refreshPanelClass = () => { el.classList.toggle('is-panel', P.phase !== 'scene'); };
    P.advance = () => {
      if (P.phase !== 'scene') return;
      if (reel.beat && P.si === reel.beat.after && !P.beatDone) return P.enterBeat();
      if (P.si < reel.scenes.length - 1) return P.enterScene(P.si + 1);
      P.enterQuiz();
    };
    P.tick = (dt, now) => {
      if (P.phase !== 'scene' || !P.playing) return;
      const dur = sceneMs(reel, P.si);
      P.t += dt;
      const p = clamp01(P.t / dur);
      P.r.bars[P.si].style.width = (p * 100).toFixed(1) + '%';
      if (!reduced && now - state.drawAt >= 33) { P.drawScene(p, now); }
      if (P.t >= dur) { P.r.bars[P.si].style.width = '100%'; P.drawScene(1, now); P.advance(); }
    };

    // phases with a panel
    P.showPanel = () => {
      P.r.panel.hidden = false; P.r.ctl.style.display = 'none'; P.playing = false;
      P.refreshPanelClass(); P.labels(); P.renderPanel();
    };
    P.enterBeat = () => { P.phase = 'beat'; P.beat = initBeat(reel.beat); P.r.bars.forEach((b) => { b.style.width = '100%'; }); P.focusNext = true; P.showPanel(); };
    P.enterQuiz = () => { P.phase = 'quiz'; P.quiz = { picked: -1 }; P.r.bars.forEach((b) => { b.style.width = '100%'; }); P.focusNext = true; P.showPanel(); };
    P.enterEnd = () => { P.phase = 'end'; P.focusNext = true; P.showPanel(); };
    P.restart = () => { P.beatDone = false; P.beat = null; P.enterScene(0); P.setPlaying(!reduced, true); P.userPaused = reduced; };

    P.renderPanel = () => {
      const panel = P.r.panel;
      if (P.phase === 'beat') panel.innerHTML = beatHtml(reel.beat, P.beat);
      else if (P.phase === 'quiz') panel.innerHTML = quizHtml(reel.quiz, P.quiz);
      else if (P.phase === 'end') panel.innerHTML = endHtml(P);
      wireInputs(P);
      if (P.keep && !P.focusNext) {
        const k = panel.querySelector(P.keep); P.keep = null;
        if (k) { try { k.focus({ preventScroll: true }); } catch (e) { /* fine */ } }
      }
      if (P.focusNext) {
        P.focusNext = false; P.keep = null;
        const f = panel.querySelector('[data-focus]') || panel;
        try { f.focus({ preventScroll: true }); } catch (e) { /* fine */ }
        // a result is brought into view inside the panel (never by scrolling the page); a new step starts at the top
        panel.scrollTop = f.matches('div[data-focus]') ? Math.max(0, f.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 64) : 0;
      }
    };
    P.refreshText = () => {
      P.labels();
      if (P.phase === 'scene') {
        const sc = reel.scenes[P.si];
        P.r.say.textContent = tx(sc.say); P.r.big.textContent = sc.big ? tx(sc.big) : '';
        P.drawScene(reduced ? 1 : clamp01(P.t / sceneMs(reel, P.si)));
      } else P.renderPanel();
    };
    return P;
  }

  // ── interactive beats ───────────────────────────────────────────────────────────────────────────────────────
  function initBeat(b) {
    switch (b.kind) {
      case 'guess': return { pos: 0.5, locked: false };
      case 'slider': return { x: b.start };
      case 'myth': return { i: 0, answers: [], shown: false };
      case 'spot': return { picked: b.parts.map(() => false), checked: false };
      case 'path': return { chosen: [] };
      case 'sort': return { i: 0, answers: [], shown: false };
      case 'order': return { chosen: [], deck: E.orderDeck(b.items.length), done: false };
      default: return {};
    }
  }
  const contBtn = (label) => `<div class="rl-row"><button type="button" class="rl-btn primary" data-a="cont">${esc(label || S().cont)}</button></div>`;
  const skipLink = () => `<button type="button" class="rl-link" data-a="cont">${esc(S().skip)}</button>`;
  const head = () => `<h3>${esc(S().tryIt)}</h3>`;

  function beatHtml(b, st) {
    const s = S();
    switch (b.kind) {
      case 'guess': {
        const v = E.posToValue(st.pos, b.min, b.max);
        if (!st.locked) {
          return `${head()}<p class="rl-q" tabindex="-1" data-focus>${esc(tx(b.q))}</p><output class="rl-val" data-o="gv">${esc(E.money(v)[li()])}</output>` +
            `<input type="range" min="0" max="1000" value="${Math.round(st.pos * 1000)}" data-in="guess" aria-label="${esc(s.yourGuess)}" aria-valuetext="${esc(E.money(v)[li()])}">` +
            `<div class="rl-rng"><span>${esc(E.money(b.min)[li()])}</span><span>${esc(E.money(b.max)[li()])}</span></div>` +
            `<div class="rl-row"><button type="button" class="rl-btn primary" data-a="lock">${esc(s.lock)}</button>${skipLink()}</div>`;
        }
        const r = E.scoreGuess(v, b.answer), verdict = r.verdict === 'spot' ? s.gSpot : r.verdict === 'close' ? s.gClose : s.gFar;
        const gap = r.side === 'exact' || r.verdict === 'spot' ? '' : ` (${s.times(r.times < 10 ? r.times.toFixed(1) : Math.round(r.times), r.side)})`;
        return `${head()}<div tabindex="-1" data-focus><p class="rl-q">${esc(tx(b.q))}</p><p><b>${esc(s.yourGuess)}:</b> ${esc(E.money(v)[li()])}${esc(gap)}<br><b>${esc(s.answerIs)}:</b> <span class="rl-val" style="display:inline">${esc(E.money(b.answer)[li()])}</span></p><p class="${r.verdict === 'far' ? '' : 'rl-good'}">${esc(verdict)}</p></div><p class="rl-why">${esc(tx(b.reveal))}</p>${contBtn()}`;
      }
      case 'slider': {
        const x = st.x, bars = E.sliderBars(b, x), line = E.sliderLine(b, x);
        return `${head()}<p class="rl-q" tabindex="-1" data-focus>${esc(tx(b.q))}</p><label class="rl-note" for="rl-sl" style="display:block;margin:0">${esc(tx(b.label))}: <b data-o="sx">${esc(E.xText(b, x, lang))}</b></label>` +
          `<input id="rl-sl" type="range" min="${b.min}" max="${b.max}" step="${b.step}" value="${x}" data-in="slider" aria-valuetext="${esc(E.xText(b, x, lang))}">` +
          `<div class="rl-rng"><span>${esc(E.xText(b, b.min, lang))}</span><span>${esc(E.xText(b, b.max, lang))}</span></div><div data-o="sbars">${barsHtml(bars)}</div>` +
          `<p class="rl-take" data-o="stake" aria-live="polite">${esc(tx(line))}</p>${contBtn()}`;
      }
      case 'myth': {
        if (st.i >= b.cards.length) { const right = E.scoreMyth(b.cards, st.answers).right; return `${head()}<p class="rl-q" tabindex="-1" data-focus>${esc(s.score(right, b.cards.length))}</p>${contBtn()}`; }
        const c = b.cards[st.i], last = st.i === b.cards.length - 1;
        const ans = st.answers[st.i];
        const body = `<p class="rl-q" tabindex="-1" data-focus>${esc(tx(c.s))}</p>`;
        if (!st.shown) return `${head()}<p class="rl-note">${st.i + 1} / ${b.cards.length}</p>${body}<div class="rl-opts row"><button type="button" class="rl-opt" data-a="myth" data-v="0">${esc(s.myth)}</button><button type="button" class="rl-opt" data-a="myth" data-v="1">${esc(s.fact)}</button></div>${skipLink()}`;
        const right = (ans === true) === c.fact;
        return `${head()}<p class="rl-note">${st.i + 1} / ${b.cards.length}</p><div tabindex="-1" data-focus><p class="rl-q">${esc(tx(c.s))}</p><p class="${right ? 'rl-good' : 'rl-bad'}">${esc(right ? s.mRight : s.mWrong)} ${esc(s.thisIs(c.fact))}</p></div><p class="rl-why">${esc(tx(c.why))}</p>` +
          `<div class="rl-row"><button type="button" class="rl-btn primary" data-a="mnext">${esc(last ? s.mScoreBtn : s.mNext)}</button></div>`;
      }
      case 'spot': {
        const flags = E.scoreSpot(b.parts, st.picked).flags;
        const partsHtml = b.parts.map((p, i) => {
          let cls = '', extra = '';
          if (st.checked) { const picked = st.picked[i]; if (p.flag) cls = picked ? 'ok' : 'miss'; else if (picked) cls = 'no'; }
          const label = st.checked && (p.flag || st.picked[i]) ? (p.flag ? (st.picked[i] ? s.flag : s.missedFlag) : s.notFlag) : '';
          extra = label ? `<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">${esc(label)}</span>` : '';
          return `<button type="button" class="rl-opt ${cls}" data-a="spot" data-v="${i}" aria-pressed="${st.picked[i] ? 'true' : 'false'}" ${st.checked ? 'disabled' : ''}>${esc(tx(p.t))}${extra}</button>`;
        }).join('');
        const msg = `<div class="rl-msg"><p class="rl-from">${esc(tx(b.from))}</p><div class="rl-opts">${partsHtml}</div></div>`;
        if (!st.checked) return `${head()}<p class="rl-q" tabindex="-1" data-focus>${esc(tx(b.q))}</p><p class="rl-note">${esc(s.spotHelp)}</p>${msg}<div class="rl-row"><button type="button" class="rl-btn primary" data-a="spotcheck">${esc(s.spotCheck)}</button>${skipLink()}</div>`;
        const found = E.scoreSpot(b.parts, st.picked).found;
        const why = b.parts.map((p) => (p.flag ? `<li><b>${esc(tx(p.t))}</b><br>${esc(tx(p.flag))}</li>` : '')).join('');
        return `${head()}<p class="rl-q" tabindex="-1" data-focus>${esc(s.found(found, flags))}</p>${msg}<ul class="rl-list">${why}</ul><p class="rl-why"><b>${esc(s.todo)}:</b> ${esc(tx(b.todo))}</p>${contBtn()}`;
      }
      case 'path': {
        const opts = b.options.map((o, i) => `<button type="button" class="rl-opt ${st.chosen.includes(i) ? 'ok' : ''}" data-a="path" data-v="${i}" aria-pressed="${st.chosen.includes(i) ? 'true' : 'false'}">${esc(tx(o.label))}</button>`).join('');
        const results = st.chosen.map((i) => `<p class="rl-why"><b>${esc(tx(b.options[i].label))}:</b> ${esc(tx(b.options[i].result))}</p>`).join('');
        const last = st.chosen[st.chosen.length - 1];
        return `${head()}<p class="rl-note">${esc(tx(b.setup))}</p><p class="rl-q">${esc(tx(b.q))}</p><div class="rl-opts">${opts}</div>` +
          (st.chosen.length ? `<div tabindex="-1" data-focus>${results}</div><p class="rl-take"><b>${esc(s.verdict)}:</b> ${esc(tx(b.verdict))}</p>${st.chosen.length < b.options.length ? `<p class="rl-note">${esc(s.another)}</p>` : ''}${contBtn()}` : `<p class="rl-note" tabindex="-1" data-focus>${esc(s.pathHelp)}</p>${skipLink()}`);
      }
      case 'sort': {
        if (st.i >= b.cards.length) { const right = E.scoreSort(b.cards, st.answers).right; return `${head()}<p class="rl-q" tabindex="-1" data-focus>${esc(s.score(right, b.cards.length))}</p>${contBtn()}`; }
        const c = b.cards[st.i], last = st.i === b.cards.length - 1;
        const bins = b.bins.map((bn, k) => `<button type="button" class="rl-opt ${st.shown ? (k === c.bin ? 'ok' : k === st.answers[st.i] ? 'no' : '') : ''}" data-a="sortbin" data-v="${k}" ${st.shown ? 'disabled' : ''}>${esc(tx(bn))}</button>`).join('');
        const right = st.answers[st.i] === c.bin;
        return `${head()}<p class="rl-q">${esc(tx(b.q))}</p><p class="rl-note">${st.i + 1} / ${b.cards.length}${st.shown ? '' : ' · ' + esc(s.sortHelp)}</p><p class="rl-q" tabindex="-1" ${st.shown ? '' : 'data-focus'}>${esc(tx(c.t))}</p><div class="rl-opts row">${bins}</div>` +
          (st.shown ? `<div tabindex="-1" data-focus><p class="${right ? 'rl-good' : 'rl-bad'}">${esc(right ? s.mRight : s.mWrong)}</p></div><p class="rl-why">${esc(tx(c.why))}</p><div class="rl-row"><button type="button" class="rl-btn primary" data-a="snext">${esc(last ? s.mScoreBtn : s.sNext)}</button></div>` : skipLink());
      }
      case 'order': {
        const n = b.items.length;
        const items = st.deck.map((idx) => { const pos = st.chosen.indexOf(idx); return `<button type="button" class="rl-opt" data-a="ord" data-v="${idx}" ${pos >= 0 || st.done ? 'disabled' : ''} aria-pressed="${pos >= 0 ? 'true' : 'false'}">${pos >= 0 ? `<span class="rl-order-n">${pos + 1}</span>` : ''}<span>${esc(tx(b.items[idx].t))}</span></button>`; }).join('');
        if (!st.done) return `${head()}<p class="rl-q" tabindex="-1" data-focus>${esc(tx(b.q))}</p><p class="rl-note">${esc(s.orderHelp)}</p><div class="rl-opts">${items}</div><div class="rl-row">${st.chosen.length ? `<button type="button" class="rl-btn" data-a="ordreset">${esc(s.reset)}</button>` : ''}${skipLink()}</div>`;
        const right = E.scoreOrder(st.chosen, n).right;
        return `${head()}<p class="rl-q" tabindex="-1" data-focus>${esc(s.orderScore(right, n))}</p><p class="rl-note"><b>${esc(s.correctOrder)}</b></p><ol class="rl-list" style="padding-left:20px;list-style:decimal">${b.items.map((it) => `<li><b>${esc(tx(it.t))}</b><br>${esc(tx(it.why))}</li>`).join('')}</ol>${contBtn()}`;
      }
      default: return contBtn();
    }
  }
  function barsHtml(bars) {
    return bars.map((br) => `<div class="rl-bar ${br.tone}"><span><span>${esc(tx(br.label))}</span><b>${esc(tx(br.text))}</b></span><i><em style="width:${(Math.max(0, Math.min(1, br.frac)) * 100).toFixed(1)}%"></em></i></div>`).join('');
  }

  function quizHtml(qz, st) {
    const s = S(), answered = st.picked >= 0;
    const opts = qz.options.map((o, i) => `<button type="button" class="rl-opt ${answered ? (i === qz.answer ? 'ok' : i === st.picked ? 'no' : '') : ''}" data-a="quiz" data-v="${i}" ${answered ? 'disabled' : ''}>${esc(tx(o))}</button>`).join('');
    const right = st.picked === qz.answer;
    return `<h3>${esc(s.quizTitle)}</h3><p class="rl-q" tabindex="-1" ${answered ? '' : 'data-focus'}>${esc(tx(qz.q))}</p><div class="rl-opts">${opts}</div>` +
      (answered ? `<div tabindex="-1" data-focus><p class="${right ? 'rl-good' : 'rl-bad'}">${esc(right ? s.qRight : s.qWrong)}</p></div><p class="rl-why">${esc(tx(qz.why))}</p><div class="rl-row"><button type="button" class="rl-btn primary" data-a="qdone">${esc(s.cont)}</button></div>`
        : `<div class="rl-row"><button type="button" class="rl-link" data-a="qskip">${esc(s.skipQuiz)}</button></div>`);
  }

  function endHtml(P) {
    const s = S(), r = P.reel, last = state.feed.children[P.idx + 1] === state.stopEl;
    const trust = r.trust ? `<details><summary>${esc(s.trust)}</summary><p>${esc(tx(r.trust.formula))}</p><p><b>${esc(s.assumes)}:</b> ${esc(tx(r.trust.assumes))}</p><p>${esc(s.checked(r.trust.asOf))}</p></details>` : '';
    const act = r.act ? `<a class="rl-btn primary rl-act" href="../${esc(r.act.href)}">${esc(tx(r.act.label))}</a>` : '';
    const isSaved = state.saved.includes(r.id), isPledged = state.pledges.some((x) => x.id === r.id);
    const keep = `<div class="rl-row"><button type="button" class="rl-btn" data-a="pledge" aria-pressed="${isPledged}">${esc(isPledged ? s.pledged : s.pledge)}</button><button type="button" class="rl-btn" data-a="save" aria-pressed="${isSaved}">${esc(isSaved ? s.saved : s.save)}</button></div>`;
    return `<p class="rl-done" tabindex="-1" data-focus>${esc(s.done)}</p>${trust}${keep}<div class="rl-row">${act}<button type="button" class="rl-btn ${act ? '' : 'primary'}" data-a="nextreel">${esc(last ? s.toStop : s.nextReel)}</button><button type="button" class="rl-link" data-a="replay">${esc(s.replay)}</button></div><p class="rl-edu">${esc(s.edu)}</p>`;
  }
  function onPanelClick(P, a, v) {
    const b = P.reel.beat, st = P.beat;
    P.focusNext = true;
    switch (a) {
      case 'cont': P.beatDone = true; P.enterScene(P.si + 1); P.setPlaying(!reduced && !P.userPaused); return;
      case 'lock': st.locked = true; break;
      case 'myth': st.answers[st.i] = v === '1'; st.shown = true; break;
      case 'mnext': st.i++; st.shown = false; break;
      case 'spot': st.picked[Number(v)] = !st.picked[Number(v)]; P.focusNext = false; P.keep = `[data-a="spot"][data-v="${Number(v)}"]`; break;
      case 'spotcheck': st.checked = true; break;
      case 'path': { const i = Number(v); if (!st.chosen.includes(i)) st.chosen.push(i); break; }
      case 'sortbin': st.answers[st.i] = Number(v); st.shown = true; break;
      case 'snext': st.i++; st.shown = false; break;
      case 'ord': { const i = Number(v); if (!st.chosen.includes(i)) st.chosen.push(i); P.focusNext = false; P.keep = '.rl-opt:not([disabled])'; if (st.chosen.length === b.items.length) { st.done = true; P.focusNext = true; } break; }
      case 'ordreset': st.chosen = []; break;
      case 'quiz': P.quiz.picked = Number(v); finishReel(P, P.quiz.picked === P.reel.quiz.answer); break;
      case 'qskip': finishReel(P, false, true); P.enterEnd(); return;
      case 'qdone': P.enterEnd(); return;
      case 'save': { const r = E.toggleSaved(state.saved, P.reel.id); state.saved = r.list; store.set(KEY_SAVED, state.saved); if (r.kept) bumpStat('saves'); P.focusNext = false; P.keep = '[data-a="save"]'; renderMoves(); break; }
      case 'pledge': {
        const had = state.pledges.some((x) => x.id === P.reel.id);
        state.pledges = had ? E.removePledge(state.pledges, P.reel.id) : E.addPledge(state.pledges, P.reel.id, new Date());
        store.set(KEY_PLEDGES, state.pledges); if (!had) bumpStat('pledges');
        P.focusNext = false; P.keep = '[data-a="pledge"]'; renderMoves(); break;
      }
      case 'nextreel': goNext(P); return;
      case 'replay': P.restart(); return;
      default: return;
    }
    P.renderPanel();
  }
  function goNext(P) {
    const next = state.feed.children[P.idx + 1];
    if (next) { next.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); setTimeout(() => { try { next.focus({ preventScroll: true }); } catch (e) { /* fine */ } }, reduced ? 0 : 450); }
  }

  /** A reel counts as watched once its quiz is answered or skipped. It is the only thing remembered: when, and whether the quiz was right. */
  function finishReel(P, correct, skipped) {
    if (P.finished) return;
    P.finished = true;
    state.seen[P.reel.id] = { at: new Date().toISOString(), correct: !!correct && !skipped };
    store.set(KEY_SEEN, state.seen);
    if (!state.days.includes(state.today)) { state.days.push(state.today); state.days = state.days.slice(-120); store.set(KEY_DAYS, state.days); }
    bumpStat('fin');
    renderStatus(); renderStop();
  }

  // ── the page ────────────────────────────────────────────────────────────────────────────────────────────────
  const doneToday = () => state.episode.picks.filter((r) => state.seen[r.id] && dayKey(new Date(state.seen[r.id].at)) === state.today).length;

  function renderStatus() {
    const s = S(), n = state.episode.picks.length, d = doneToday(), streak = streakNow(state.days, state.today);
    $('#rl-status').innerHTML = esc(d >= n ? s.statusDone : d > 0 ? s.statusLeft(d, n) : s.statusNew(n)) + (streak > 0 ? `<b>${esc(s.streak(streak))}</b>` : '');
  }
  function renderStop() {
    const el = state.stopEl; if (!el) return;
    const s = S(), n = state.episode.picks.length, streak = streakNow(state.days, state.today), tm = state.episode.tomorrow;
    const facts = state.data.facts || [], fact = facts.length ? facts[E.factIndex(new Date(), facts.length)] : null;
    const week = E.weekLine(E.weekOf(state.stats, new Date()));
    el.setAttribute('aria-label', s.stopH(n));
    el.innerHTML = `<div style="font-size:44px" aria-hidden="true">\uD83E\uDD89</div><h2 tabindex="-1" data-r="stoph">${esc(s.stopH(n))}</h2><p>${esc(s.stopP)}</p>` +
      (state.season ? `<p class="rl-season">${esc(state.season.badge)} ${esc(tx(state.season.label))}</p>` : '') +
      (streak > 0 ? `<p><b>${esc(s.stopStreak(streak))}</b></p>` : '') + (week ? `<p>${esc(tx(week))}</p>` : '') +
      (fact ? `<p class="rl-fact"><b>${esc(s.factTitle)}</b><br>${esc(tx(fact))}</p>` : '') + (tm ? `<p>${esc(s.stopTomorrow(tx(tm.title)))}</p>` : '') +
      `<div class="rl-row"><button type="button" class="rl-btn primary" data-a="again">${esc(s.again)}</button><a class="rl-btn" href="foundations.html">${esc(s.learn)}</a></div><p class="rl-edu">${esc(s.stopApp)} ${esc(s.edu)}</p>`;
  }

  // ── My moves: what you said you would do, and what you saved (plain lists in this browser) ────────────────────
  let clearArmed = false;
  function renderMoves() {
    const s = S(), btn = $('#rl-moves-btn'), box = $('#rl-moves');
    if (!btn || !box) return;
    const n = state.pledges.length + state.saved.length;
    btn.textContent = s.movesBtn(n);
    if (box.hidden) return;
    const row = (id, extra, at) => {
      const r = reelById(id); if (!r) return '';
      const act = r.act && extra === 'pledge' ? `<a class="rl-btn" href="../${esc(r.act.href)}">${esc(tx(r.act.label))}</a>` : '';
      return `<li><b>${esc(tx(r.title))}</b>${at ? ` <span class="rl-note">${esc(s.since(fmtDate(at)))}</span>` : ''}<div class="rl-row">${act}<button type="button" class="rl-btn" data-a="watch" data-v="${esc(id)}">${esc(s.watch)}</button><button type="button" class="rl-link" data-a="${extra === 'pledge' ? 'unpledge' : 'unsave'}" data-v="${esc(id)}">${esc(s.remove)}</button></div></li>`;
    };
    const pl = state.pledges.slice().reverse().map((x) => row(x.id, 'pledge', x.at)).join(''), sv = state.saved.slice().reverse().map((id) => row(id, 'save')).join('');
    box.innerHTML = `<h2 id="rl-moves-h" tabindex="-1">${esc(s.movesTitle)}</h2><h3>${esc(s.pledgesH)}</h3>${pl ? `<ul class="rl-list">${pl}</ul>` : `<p class="rl-note">${esc(s.pledgesNone)}</p>`}` +
      `<h3>${esc(s.savedH)}</h3>${sv ? `<ul class="rl-list">${sv}</ul>` : `<p class="rl-note">${esc(s.savedNone)}</p>`}<p class="rl-note">${esc(s.movesNote)}</p>` +
      `<div class="rl-row"><button type="button" class="rl-link" data-a="clear">${esc(clearArmed ? s.clearSure : s.clear)}</button></div>`;
  }
  function toggleMoves(open) {
    const btn = $('#rl-moves-btn'), box = $('#rl-moves');
    box.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); clearArmed = false;
    renderMoves();
    if (open) { try { box.querySelector('#rl-moves-h').focus({ preventScroll: false }); } catch (e) { /* fine */ } }
  }
  /** Plays a saved reel: it is added to the feed (after today's) and brought into view. */
  function playExtra(id) {
    const reel = reelById(id); if (!reel) return;
    let P = state.players.find((x) => x.reel.id === id && x.extra);
    if (!P) {
      const feed = state.feed, el = buildCard(reel, state.players.length, state.episode.picks.length);
      feed.insertBefore(el, state.stopEl);
      P = makePlayer(reel, state.players.length, state.episode.picks.length, el, true);
      state.players.push(P); P.enterScene(0); P.started = false; P.labels(); bindCard(P);
      if (state.io) state.io.observe(el);
    } else P.restart();
    P.el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    $('#rl-feed').scrollIntoView({ behavior: 'auto', block: 'nearest' });
    setTimeout(() => { try { P.el.focus({ preventScroll: true }); } catch (e) { /* fine */ } }, reduced ? 0 : 450);
  }
  function onMovesClick(e) {
    const btn = e.target.closest('[data-a]'); if (!btn) return;
    const a = btn.dataset.a, id = btn.dataset.v;
    if (a === 'watch') return playExtra(id);
    if (a === 'unpledge') { state.pledges = E.removePledge(state.pledges, id); store.set(KEY_PLEDGES, state.pledges); }
    else if (a === 'unsave') { state.saved = state.saved.filter((x) => x !== id); store.set(KEY_SAVED, state.saved); }
    else if (a === 'clear') {
      if (!clearArmed) { clearArmed = true; return renderMoves(); }
      [KEY_SEEN, KEY_DAYS, KEY_EPISODE, KEY_STATS, KEY_SAVED, KEY_PLEDGES].forEach((k) => { try { window.localStorage.removeItem(k); } catch (err) { /* fine */ } });
      state.seen = {}; state.days = []; state.saved = []; state.pledges = []; state.stats = { v: 1, days: {} }; clearArmed = false;
      renderMoves(); renderStatus(); renderStop(); state.players.forEach((P) => { P.finished = false; if (P.phase === 'end') P.renderPanel(); });
      const msg = document.createElement('p'); msg.className = 'rl-note'; msg.setAttribute('role', 'status'); msg.textContent = S().cleared; $('#rl-moves').appendChild(msg); return;
    }
    clearArmed = false; renderMoves();
    state.players.forEach((P) => { if (P.phase === 'end') P.renderPanel(); });
  }

  // The site's shared header, skip link and page-tools region come with English names. On this page they follow the language chosen here.
  const CHROME_HI = {
    'Skip to main content': 'मुख्य सामग्री पर जाएँ', 'Open navigation menu': 'नेविगेशन मेनू खोलें', 'Close navigation menu': 'नेविगेशन मेनू बंद करें',
    'Switch to light mode': 'लाइट मोड में बदलें', 'Switch to dark mode': 'डार्क मोड में बदलें', 'Toggle theme': 'थीम बदलें', 'Search': 'खोजें', 'FIN-OS Alerts': 'FIN-OS अलर्ट',
    'Page tools': 'पेज के औज़ार', 'Navigation': 'नेविगेशन', 'Main': 'मुख्य', 'Your profile': 'आपकी प्रोफ़ाइल', 'Search (Ctrl+K)': 'खोजें (Ctrl+K)',
  };
  const CHROME_EN = Object.fromEntries(Object.entries(CHROME_HI).map(([en, hi]) => [hi, en]));
  function localizeChrome() {
    const sel = '#finos-skip-link, .mob-ham, #floatThemeBtn, #fs-toggle, #finos-alert-bell, #finos-fixed-controls, aside.sidebar, nav.sb-nav, a.sb-identity, #sb-cmd';
    document.querySelectorAll(sel).forEach((el) => {
      const isLink = el.id === 'finos-skip-link', cur = (isLink ? el.textContent : el.getAttribute('aria-label')) || '';
      const next = lang === 'hi' ? CHROME_HI[cur.trim()] : CHROME_EN[cur.trim()];
      if (!next) return;
      if (isLink) el.textContent = next; else el.setAttribute('aria-label', next);
    });
  }

  function renderStatic() {
    const s = S();
    document.documentElement.setAttribute('lang', lang === 'hi' ? 'hi' : 'en');
    $('#rl-title').textContent = s.title; $('#rl-sub').textContent = s.sub; $('#rl-foot').textContent = s.foot; $('#rl-back').textContent = s.back;
    $('#rl-feed').setAttribute('aria-label', s.feedLabel);
    document.querySelectorAll('.rl-lang button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === lang ? 'true' : 'false'));
    document.title = s.title + ' | FIN-OS';
    const lg = $('.rl-lang'); if (lg) lg.setAttribute('aria-label', s.langLabel);
    localizeChrome();
    const loading = $('#rl-loading'); if (loading) loading.textContent = s.loading;
    if (state.data) renderMoves(); else { const mb = $('#rl-moves-btn'); if (mb) mb.textContent = s.movesBtn(0); }
  }

  function setLang(next, fromSite) {
    if (next !== 'en' && next !== 'hi') return;
    lang = next;
    if (!fromSite && window.FinosI18n && typeof window.FinosI18n.setLang === 'function') { try { window.FinosI18n.setLang(next); } catch (e) { /* the site menu keeps its own language */ } }
    else if (!fromSite) { try { window.localStorage.setItem('finos_lang', next); } catch (e) { /* private mode */ } }
    renderStatic();
    if (state.data) { state.players.forEach((P) => P.refreshText()); renderStatus(); renderStop(); renderMoves(); }
  }

  function setActive(i) {
    if (state.active === i) return;
    state.active = i;
    state.players.forEach((P, k) => {
      if (k === i) { if (!P.userPaused && !reduced && P.phase === 'scene') P.setPlaying(true); }
      else if (P.playing) P.setPlaying(false);
    });
  }

  function frame(now) {
    const dt = Math.min(100, now - (state.last || now)); state.last = now;
    const P = state.players[state.active];
    if (P && P.playing) { P.tick(dt, now); if (now - state.drawAt >= 33) state.drawAt = now; }
    window.requestAnimationFrame(frame);
  }

  /** The taps and keys of one card. */
  function bindCard(P) {
    const el = P.el;
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-a]');
      if (btn && el.contains(btn)) {
        const a = btn.dataset.a;
        if (a === 'toggle') { P.setPlaying(!P.playing, true); return; }
        if (a === 'prev') { P.enterScene(Math.max(0, P.si - 1)); return; }
        if (a === 'nextscene') { P.advance(); return; }
        if (P.phase !== 'scene') return onPanelClick(P, a, btn.dataset.v);
        return;
      }
      if (e.target.closest('[data-r="stage"]') && P.phase === 'scene') P.setPlaying(!P.playing, true);
    });
    P.r.stage.addEventListener('keydown', (e) => {
      if (P.phase !== 'scene') return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); P.setPlaying(!P.playing, true); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); P.advance(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); P.enterScene(Math.max(0, P.si - 1)); }
    });
    P.r.panel.addEventListener('keydown', (e) => { if (e.key === 'Escape' && P.phase === 'beat') { P.beatDone = true; P.enterScene(P.si + 1); P.setPlaying(!reduced && !P.userPaused); } });
  }

  function build() {
    const feed = state.feed = $('#rl-feed');
    feed.innerHTML = '';
    if (state.season) { feed.dataset.season = state.season.id; feed.style.setProperty('--rl-sa', state.season.tint[0]); feed.style.setProperty('--rl-sb', state.season.tint[1]); }
    const picks = state.episode.picks;
    picks.forEach((reel, idx) => {
      const el = buildCard(reel, idx, picks.length);
      feed.appendChild(el);
      const P = makePlayer(reel, idx, picks.length, el);
      state.players.push(P);
      P.enterScene(0); P.started = false; P.labels();
      bindCard(P);
    });
    const stop = state.stopEl = document.createElement('section');
    stop.className = 'rl-card rl-stop'; stop.tabIndex = -1;
    stop.addEventListener('click', (e) => {
      if (!e.target.closest('[data-a="again"]')) return;
      state.players.forEach((P) => { P.finished = false; P.restart(); P.setPlaying(false); P.userPaused = false; });
      feed.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
    feed.appendChild(stop);
    renderStop();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting && en.intersectionRatio >= 0.6) { const i = Number(en.target.dataset.idx); if (Number.isFinite(i) && en.target !== stop) setActive(i); else if (en.target === stop) setActive(-2); } });
    }, { root: feed, threshold: [0.6] });
    state.io = io;
    [...feed.children].forEach((c) => io.observe(c));
    window.requestAnimationFrame(frame);
    // arrow keys on the feed itself move one reel at a time
    feed.addEventListener('keydown', (e) => {
      if (e.target !== feed || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      const here = Math.round(feed.scrollTop / Math.max(1, feed.children[0].offsetHeight + 12)), to = feed.children[Math.min(feed.children.length - 1, Math.max(0, here + (e.key === 'ArrowDown' ? 1 : -1)))];
      to.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  }

  function init() {
    lang = siteLang();
    document.querySelectorAll('.rl-lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang, false)));
    window.addEventListener('finos:lang', (e) => { const next = e && e.detail && e.detail.lang; if (next && next !== lang) setLang(next, true); });
    renderStatic();
    window.addEventListener('load', () => { localizeChrome(); setTimeout(localizeChrome, 1200); });
    fetch('../js/reels-data.json', { credentials: 'omit' }).then((r) => { if (!r.ok) throw new Error('bad status'); return r.json(); }).then((data) => {
      state.data = E.expand(data); state.reels = state.data.reels;
      loadLists();
      const want = new URLSearchParams(window.location.search).get('season');      // ?season=diwali|budget|yearend previews a seasonal look
      state.season = (want && E.SEASONS[want]) || E.seasonOf(new Date());
      state.today = dayKey(new Date());
      state.episode = composeEpisode(state.reels, state.seen, state.today);
      build(); renderStatus(); renderMoves();
      $('#rl-moves-btn').addEventListener('click', () => toggleMoves($('#rl-moves').hidden));
      $('#rl-moves').addEventListener('click', onMovesClick);
    }).catch(() => { $('#rl-feed').innerHTML = `<div class="rl-err" role="alert">${esc(S().loadErr)}</div>`; });
  }

  // Pure helpers, exposed for tests/reels-web.test.js (it draws every picture and feeds hostile storage values through these).
  window.FinosReelsPage = { propSvg, mitraSvg, personSvg, cleanSeen, cleanDays, cleanStats, cleanSaved, cleanPledges, cleanEpisode, streakNow, loadLists, composeEpisode, state, setLang: (l) => { lang = l; } };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
