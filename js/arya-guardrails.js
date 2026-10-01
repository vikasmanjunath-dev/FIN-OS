/**
 * Arya guardrails — deterministic safety layer on top of the LLM.   (v1.0)
 *
 * The model is told not to give buy/sell calls, but prompts are not enforcement. This runs on every
 * final answer and (a) refuses clearly illegal requests, (b) adds a plain-language note when the reply
 * drifts into personalised buy/sell calls, guaranteed returns or price predictions.
 *
 *   const g = AryaGuardrails.apply(userText, replyText);
 *   g.text   → what to show (reply, possibly with a note appended — or a refusal)
 *   g.flags  → ['direct_recommendation' | 'guaranteed_returns' | 'price_prediction' | 'advice_requested' | 'evasion_request']
 *   g.blocked → true when the reply was replaced
 *
 * Principles: never silently rewrite financial content; add, don't edit. Refuse only for clear illegality
 * (tax evasion, forged documents). False positives on ordinary education ("what is a SIP?") are tested for.
 * Not a substitute for a licensed adviser — and says so.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AryaGuardrails = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

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

  return { apply, NOTES, REFUSAL };
});
