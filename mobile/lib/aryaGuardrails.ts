// @ts-nocheck
// Arya's deterministic safety layer: refuses clearly illegal requests (tax evasion, forged documents) and appends a plain-language note
// when a reply drifts into buy/sell calls, guaranteed returns or price predictions. Never rewrites the model's text; it only adds.
// Machine-assisted port: the rules are sliced unchanged from js/arya-guardrails.js so __tests__/guardrails.parity.test.mts can prove
// the phone flags and words everything exactly as the website does.


  const SECURITY = String.raw`(?:[A-Z]{3,12}\b|shares?\b|stocks?\b|equity\b|units?\b|fund\b|etf\b|nifty|sensex|crypto|bitcoin|ethereum|futures?|options?|call|put)`;
  // "you should buy HDFCBANK", "I recommend selling Reliance shares", "go ahead and invest in this fund", "must buy"
  const RECOMMEND = new RegExp(
    String.raw`\b(?:you\s+(?:should|must|need\s+to|ought\s+to)|i\s+(?:recommend|suggest|advise)|go\s+ahead\s+and|definitely|i'?d\s+(?:buy|sell)|my\s+advice\s+is\s+to)\b[^.!?\n]{0,60}?\b(?:buy(?:ing)?|sell(?:ing)?|short(?:ing)?|accumulat(?:e|ing)|book(?:ing)?\s+profits?|exit(?:ing)?|invest(?:ing)?\s+in|go(?:ing)?\s+long)\b[^.!?\n]{0,60}?${SECURITY}`,
    'i');
  // "BUY RELIANCE above 2900, target 3000"
  const IMPERATIVE_CALL = /(?:^|\n)\s*(?:buy|sell|short)\s+[A-Za-z][A-Za-z&.\- ]{2,30}\s+(?:at|above|below|near|with\s+(?:a\s+)?(?:target|stop))/i;
  const GUARANTEE = /\b(?:guarantee[sd]?|assured|risk[- ]?free|sure[- ]?shot|cannot\s+lose|can'?t\s+lose|100%\s+safe|no\s+risk)\b[^.!?\n]{0,50}\b(?:returns?|profits?|gains?|income|growth)\b|\b(?:returns?|profits?|gains?)\b[^.!?\n]{0,30}\b(?:are|is|will\s+be)\s+(?:guaranteed|assured)\b/i;
  const PREDICTION = /\b(?:will|is\s+going\s+to|is\s+sure\s+to)\s+(?:definitely\s+|certainly\s+|surely\s+)?(?:go\s+up|rise|rally|double|triple|crash|fall|hit|reach|touch|cross)\b[^.!?\n]{0,40}(?:₹|rs\.?\s*)?\d/i;
  const ADVICE_ASK = /\b(?:should\s+i|can\s+i|is\s+it\s+(?:good|safe|wise)\s+to|what\s+should\s+i)\b[^.?!\n]{0,40}\b(?:buy|sell|invest\s+in|exit|hold|short|put\s+money)\b/i;
  const EVASION = /\b(?:evade|evading|evasion|hide\s+(?:my\s+)?(?:income|money|assets)|black\s+money|unaccounted|without\s+(?:paying\s+tax|declaring)|fake\s+(?:rent\s+receipts?|bills?|invoices?|80c|hra)|forge|backdate\s+(?:a\s+)?(?:document|receipt|invoice)|launder)/i;

  const NOTES = {
    direct_recommendation: '⚠️ Arya gives analysis, not buy/sell calls. Treat the above as information to weigh, not an instruction — for a personal recommendation talk to a SEBI-registered investment adviser.',
    guaranteed_returns: '⚠️ No investment is guaranteed — market-linked returns can be negative, and even "safe" products carry inflation, liquidity or default risk.',
    price_prediction: '⚠️ Nobody can reliably predict prices — read any target as a scenario, not a forecast.',
    advice_requested: 'ℹ️ Arya isn\'t a SEBI-registered adviser. This is general education based on the numbers you shared, not personalised investment advice.',
  };

  const REFUSAL = 'I can\'t help with evading tax, hiding income or creating false documents — that\'s illegal and the penalties are severe. ' +
    'What I can do is help you legally reduce tax: 80C/80D/NPS deductions, picking the better regime, HRA, capital-gains harvesting and timing. Want me to run those numbers for you?';

  function apply(userText, replyText) {
    const user = String(userText || '');
    let reply = String(replyText || '');
    const flags = [];

    if (EVASION.test(user)) return { text: REFUSAL, flags: ['evasion_request'], blocked: true };

    if (RECOMMEND.test(reply) || IMPERATIVE_CALL.test(reply)) flags.push('direct_recommendation');
    if (GUARANTEE.test(reply)) flags.push('guaranteed_returns');
    if (PREDICTION.test(reply)) flags.push('price_prediction');
    if (!flags.length && ADVICE_ASK.test(user)) flags.push('advice_requested');

    // Don't stack the same note twice (idempotent on repeated passes)
    const notes = flags.map((f) => NOTES[f]).filter((n) => n && !reply.includes(n.slice(0, 40)));
    // The model sometimes already includes its own disclaimer — don't double up on the soft note
    const hasOwn = /not\s+(?:a\s+)?(?:sebi|financial\s+advice|investment\s+advice)|sebi[- ]registered/i.test(reply);
    const toAdd = flags.includes('advice_requested') && hasOwn ? [] : notes;
    if (toAdd.length) reply = reply.replace(/\s+$/, '') + '\n\n' + toAdd.join('\n');
    return { text: reply, flags, blocked: false };
  }

  // ── Phone-only addition: invented figures ─────────────────────────────────────────────────────────────────────────────
  // Everything above is sliced unchanged from the website and parity-tested. This part is the phone's own and is NOT in
  // js/arya-guardrails.js: a model can state a figure about the person ("your net worth is ₹45 lakh") that is nowhere in their
  // records. Such a sentence gets a plain note under it. Only sentences about "you / your" are checked; general examples
  // and hypotheticals ("if you invest ₹5,000...") are left alone. Like apply(), it only ever appends.
  const MONEY = /(?:₹|rs\.?\s*|inr\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|l\b|crores?|cr\b|k\b|thousand)?|(?<![\d.])(\d[\d,]*(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr\b)(?![a-z])/gi;
  const ABOUT_YOU = /\b(?:your|you(?:'re|\s+are|\s+have|\s+had|\s+hold|\s+owe|\s+earn|\s+spend|\s+save|\s+saved|\s+invest|\s+pay|\s+paid|\s+make|\s+currently|\s+now)|you've|aapka|aapke|aapki)\b/i;
  // Sentences that advise or illustrate rather than state a fact about the person. A false alarm is worse than a missed one here
  // (the note is only useful if it is rare), so these are skipped.
  const HYPOTHETICAL = /\b(?:if|suppose|assuming|assume|for example|for instance|e\.g\.|say you|could|would|might|target|guide|recommended|rule of thumb|aim|try|consider|set aside|put aside|allocate|budget(?:ing)? for|keep|avoid|ensure|make sure|start|increase|reduce|cut|limit|usually|typically|at least|up to|maximum|ceiling|per year|slab|worth considering)\b/i;
  const FIGURE_NOTE = 'ℹ️ Some amounts above are stated as yours but do not match anything recorded in the app';

  function moneyValue(num, unit) {
    const n = parseFloat(String(num).replace(/,/g, ''));
    if (!Number.isFinite(n)) return null;
    const u = String(unit || '').toLowerCase();
    const mult = /^(lakhs?|lacs?|l)$/.test(u) ? 1e5 : /^(crores?|cr)$/.test(u) ? 1e7 : /^(k|thousand)$/.test(u) ? 1e3 : 1;
    return n * mult;
  }
  function amountsIn(text) {
    const out = [];
    const re = new RegExp(MONEY.source, 'gi');
    let m;
    while ((m = re.exec(String(text || '')))) {
      const v = m[1] !== undefined ? moneyValue(m[1], m[2]) : moneyValue(m[3], m[4]);
      if (v !== null) out.push({ value: v, raw: m[0].trim() });
    }
    return out;
  }
  const near = (a, b, tol) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * (tol || 0.015));
  const APPROX = /\b(?:about|around|roughly|approximately|approx\.?|nearly|almost|close to|some)\b|~/i;
  // "₹10,000–₹15,000", "between ₹10,000 and ₹15,000", "₹10,000 to ₹15,000": a range is advice, not a claim about the person
  const RANGE = /(?:₹|rs\.?\s*)?[\d,.]+\s*(?:lakhs?|lacs?|crores?|cr|k)?\s*(?:–|—|-|to|and)\s*(?:₹|rs\.?\s*)[\d,.]+|between\s+(?:₹|rs\.?\s*)[\d,.]+/i;

  /**
   * known: either an array of rupee figures the app holds (each may also be quoted per year or per month), or
   * { figures, monthly }: `monthly` are the per-month amounts (income, spending, SIP, EMI) that may be quoted per year. The second
   * form is what the app passes: letting every figure be multiplied or divided by 12 would match too many numbers by chance.
   * The question's own amounts count as known too, so "my rent is ₹20,000, is that too high?" can be answered with ₹20,000.
   */
  function applyFigures(userText, replyText, known) {
    let reply = String(replyText || '');
    const pos = (a) => (Array.isArray(a) ? a : []).filter((n) => Number.isFinite(n) && n > 0);
    const figures = Array.isArray(known) ? pos(known) : pos(known && known.figures);
    const monthly = Array.isArray(known) ? figures : pos(known && known.monthly);
    const given = amountsIn(userText).map((a) => a.value);
    const okTol = (v, tol) => figures.concat(given).some((k) => near(v, k, tol))
      || monthly.concat(given).some((k) => near(v, k * 12, tol))
      || (Array.isArray(known) && figures.some((k) => near(v, k / 12, tol)));
    const unverified = [];
    String(reply).split(/(?<=[.!?])\s+|\n+/).forEach((sentence) => {
      if (!ABOUT_YOU.test(sentence) || HYPOTHETICAL.test(sentence) || RANGE.test(sentence)) return;
      const tol = APPROX.test(sentence) ? 0.08 : 0.015;         // "about ₹44 lakh" may round; "₹44 lakh" should not
      amountsIn(sentence).forEach((a) => {
        if (a.value >= 1000 && !okTol(a.value, tol) && !unverified.includes(a.raw)) unverified.push(a.raw);
      });
    });
    const flags = unverified.length ? ['unverified_figures'] : [];
    if (flags.length && !reply.includes(FIGURE_NOTE)) {
      reply = reply.replace(/\s+$/, '') + '\n\n' + FIGURE_NOTE + ' (' + unverified.slice(0, 4).join(', ') + '). Check them against your trackers before relying on them.';
    }
    return { text: reply, flags, unverified };
  }

export { apply, applyFigures, NOTES, REFUSAL, FIGURE_NOTE };
