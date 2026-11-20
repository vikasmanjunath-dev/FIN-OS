/**
 * SmlRouterLadder — action ladder on top of the router decision (sml/ROADMAP E7/E9, founder decision F3: note false alarm <= 5%, block false alarm <= 2%).   (v1.0)
 *
 * decide(decision, regexFlags, replyText, opts) → { action: 'none'|'note'|'block', text, changed, reason }
 *   decision  the /api/route answer requested with ladder:true; decision.ladder = { action, kind, t_note, t_block } comes from the SERVER (router 0.5.1 + ladder.json)
 *   opts      { mode: 'note'|'block'|'both', adviceNote, refusal, lang: 'en'|'hi' }
 * Levels: NOTE appends one short note after the model's answer (the existing "not a SEBI-registered adviser" note for advice; a plain "this may be unlawful" caution for
 * evasion). BLOCK replaces the answer with a refusal that points to the lawful route, only for a high-confidence evasion request. It never edits the model's words,
 * never waits (a decision that has not arrived is "late"), and does nothing when the regex guard (AryaGuardrails) already flagged the message: guards are added, never removed.
 * Reasons: noted | blocked | no_decision | no_ladder | none | mode_off | regex_already_flagged | own_disclaimer | already_present | no_note
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlRouterLadder = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const OWN = /not\s+(?:a\s+)?(?:sebi|financial\s+advice|investment\s+advice)|sebi[- ]registered/i;   // same test as arya-guardrails.js
  const TEXT = {
    en: {
      caution: 'ℹ️ This request may involve something unlawful, such as hiding income or altering a document. I can explain the lawful options instead.',
      block: 'I can\'t help with that: it would mean evading tax, hiding income or changing documents, which is unlawful. ' +
        'I can help you legally reduce tax (80C / 80D / NPS, choosing the better regime, HRA, timing of capital gains). Want me to run those numbers?',
    },
    hi: {
      caution: 'ℹ️ यह अनुरोध कुछ ऐसा हो सकता है जो कानूनन ठीक नहीं है, जैसे आय छिपाना या दस्तावेज़ बदलना। मैं इसके बजाय कानूनी विकल्प समझा सकता हूँ।',
      block: 'मैं इसमें मदद नहीं कर सकता: इसका मतलब कर की चोरी, आय छिपाना या दस्तावेज़ बदलना होगा, जो गैरकानूनी है। ' +
        'मैं कानूनी तरीके से कर घटाने में मदद कर सकता हूँ (80C / 80D / NPS, बेहतर कर व्यवस्था चुनना, HRA, कैपिटल गेन का समय)। क्या मैं ये आँकड़े निकालूँ?',
    },
  };

  function decide(decision, regexFlags, replyText, opts) {
    const o = opts || {};
    const none = (reason) => ({ action: 'none', text: String(replyText == null ? '' : replyText), changed: false, reason });
    if (!decision || typeof decision !== 'object' || decision.error || typeof decision.intent !== 'string') return none('no_decision');
    const L = decision.ladder;
    if (!L || typeof L !== 'object' || (L.action !== 'note' && L.action !== 'block' && L.action !== 'none')) return none('no_ladder');
    if (L.action === 'none') return none('none');
    const mode = o.mode === 'note' || o.mode === 'block' ? o.mode : 'both';
    const flags = Array.isArray(regexFlags) ? regexFlags : [];
    if (flags.indexOf('evasion_request') >= 0 || (L.kind === 'advice' && flags.indexOf('advice_requested') >= 0)) return none('regex_already_flagged');
    const t = TEXT[o.lang === 'hi' ? 'hi' : 'en'];
    const reply = String(replyText == null ? '' : replyText);
    if (L.action === 'block' && mode !== 'note') {
      return { action: 'block', text: (o.lang === 'hi' ? t.block : (typeof o.refusal === 'string' && o.refusal) || t.block), changed: true, reason: 'blocked' };
    }
    if (mode === 'block') return none('mode_off');                       // block-only mode: notes are off
    const note = L.kind === 'advice' ? o.adviceNote : t.caution;           // a block downgraded to a note in note-only mode is the caution
    if (typeof note !== 'string' || !note) return none('no_note');
    if (reply.indexOf(note.slice(0, 40)) >= 0) return none('already_present');
    if (L.kind === 'advice' && OWN.test(reply)) return none('own_disclaimer');
    return { action: 'note', text: reply.replace(/\s+$/, '') + '\n\n' + note, changed: true, reason: 'noted' };
  }

  return { VERSION: '1.0', decide, TEXT };
});
