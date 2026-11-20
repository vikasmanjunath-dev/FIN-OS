/**
 * SmlRouterAdvisory — soft, advisory-only use of the router decision (sml/PLAN.md W1, ROADMAP E8).   (v1.0)
 *
 * decide(decision, regexFlags, replyText, noteText) → { note: string|null, reason }
 * Adds nothing but the EXISTING "not a SEBI-registered adviser" note (passed in as noteText, taken from AryaGuardrails.NOTES.advice_requested), and only when:
 *   the router says advice_seeking with needs_guard, the regex guard did NOT already flag the message, and the model has not already written its own
 *   disclaimer or the note. It never blocks, never edits the model's words, never waits: a decision that has not arrived is simply "late".
 * For evasion_request it adds no visible text (the regex guard already refuses what it recognises; the router-only cases are only counted).
 * Reasons: shown | no_decision | not_advice | evasion_counter_only | regex_already_flagged | own_disclaimer | already_present | no_note
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SmlRouterAdvisory = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const OWN = /not\s+(?:a\s+)?(?:sebi|financial\s+advice|investment\s+advice)|sebi[- ]registered/i;     // same test as arya-guardrails.js

  function decide(decision, regexFlags, replyText, noteText) {
    if (!decision || typeof decision !== 'object' || decision.error || typeof decision.intent !== 'string') return { note: null, reason: 'no_decision' };
    if (decision.intent === 'evasion_request' && decision.needs_guard) return { note: null, reason: 'evasion_counter_only' };
    if (decision.intent !== 'advice_seeking' || !decision.needs_guard) return { note: null, reason: 'not_advice' };
    const flags = Array.isArray(regexFlags) ? regexFlags : [];
    if (flags.indexOf('advice_requested') >= 0 || flags.indexOf('evasion_request') >= 0) return { note: null, reason: 'regex_already_flagged' };
    if (typeof noteText !== 'string' || !noteText) return { note: null, reason: 'no_note' };
    const reply = String(replyText == null ? '' : replyText);
    if (reply.indexOf(noteText.slice(0, 40)) >= 0) return { note: null, reason: 'already_present' };
    if (OWN.test(reply)) return { note: null, reason: 'own_disclaimer' };
    return { note: noteText, reason: 'shown' };
  }

  /** reply with the note appended after a blank line (same shape as AryaGuardrails.apply); unchanged when there is no note */
  function append(replyText, note) {
    const r = String(replyText == null ? '' : replyText);
    return note ? r.replace(/\s+$/, '') + '\n\n' + note : r;
  }

  const STEER = {
    en: "I can't help with ways around tax or legal rules. I can explain the legal options instead.",
    hi: 'मैं टैक्स या क़ानूनी नियमों से बचने के तरीक़े नहीं बता सकती। चाहें तो मैं क़ानूनी विकल्प समझा सकती हूँ।'
  };
  /** Steer level (flag-gated by the caller, default OFF): for a router-only evasion_request add ONE fixed redirect line; never edits the model's words. */
  function steer(decision, regexFlags, replyText, lang) {
    if (!decision || typeof decision !== 'object' || decision.error) return { note: null, reason: 'no_decision' };
    if (decision.intent !== 'evasion_request' || !decision.needs_guard) return { note: null, reason: 'not_evasion' };
    const flags = Array.isArray(regexFlags) ? regexFlags : [];
    if (flags.indexOf('evasion_request') >= 0) return { note: null, reason: 'regex_already_flagged' };
    const t = STEER[lang === 'hi' ? 'hi' : 'en'];
    if (String(replyText == null ? '' : replyText).indexOf(t.slice(0, 30)) >= 0) return { note: null, reason: 'already_present' };
    return { note: t, reason: 'steer_shown' };
  }

  return { VERSION: '1.1', decide, append, steer, STEER };
});
