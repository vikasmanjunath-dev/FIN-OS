'use strict';
const test = require('node:test');
const assert = require('node:assert');
const Ladder = require('../../../js/sml/router-ladder.js');
const Shadow = require('../../../js/sml/router-shadow.js');

const dec = (action, kind, intent) => ({ intent: intent || (kind === 'advice' ? 'advice_seeking' : 'evasion_request'), needs_guard: true, ladder: { action, kind, t_note: 0.05, t_block: 0.55 } });
const NOTE = 'ℹ️ Arya isn\'t a SEBI-registered adviser. This is general education based on the numbers you shared, not personalised investment advice.';
const REF = 'I can\'t help with evading tax, hiding income or creating false documents — that\'s illegal.';

test('note: advice gets the existing adviser note, appended after the answer', () => {
  const r = Ladder.decide(dec('note', 'advice'), [], 'Index funds are low cost.', { mode: 'both', adviceNote: NOTE });
  assert.strictEqual(r.action, 'note'); assert.strictEqual(r.reason, 'noted'); assert.ok(r.text.startsWith('Index funds are low cost.\n\n')); assert.ok(r.text.endsWith(NOTE));
});
test('note: an evasion below the block level gets the lawful-options caution; Hindi has its own text', () => {
  assert.ok(Ladder.decide(dec('note', 'unlawful'), [], 'x', { mode: 'both' }).text.includes('lawful options'));
  assert.ok(Ladder.decide(dec('note', 'unlawful'), [], 'x', { mode: 'both', lang: 'hi' }).text.includes('कानूनी विकल्प'));
});
test('block: replaces the answer with the refusal, only for a block level', () => {
  const r = Ladder.decide(dec('block', 'unlawful'), [], 'Here is how to hide cash...', { mode: 'both', refusal: REF });
  assert.deepStrictEqual([r.action, r.text, r.reason], ['block', REF, 'blocked']);
  assert.ok(!r.text.includes('hide cash'));
});
test('modes: note-only turns a block into the caution; block-only drops notes', () => {
  const n = Ladder.decide(dec('block', 'unlawful'), [], 'a', { mode: 'note' });
  assert.strictEqual(n.action, 'note'); assert.ok(n.text.includes('lawful options'));
  assert.strictEqual(Ladder.decide(dec('note', 'advice'), [], 'a', { mode: 'block', adviceNote: NOTE }).reason, 'mode_off');
  assert.strictEqual(Ladder.decide(dec('block', 'unlawful'), [], 'a', { mode: 'block', refusal: REF }).action, 'block');
});
test('never doubles the regex guard: a message the regex already flagged is left alone', () => {
  assert.strictEqual(Ladder.decide(dec('block', 'unlawful'), ['evasion_request'], REF, { mode: 'both', refusal: REF }).reason, 'regex_already_flagged');
  assert.strictEqual(Ladder.decide(dec('note', 'advice'), ['advice_requested'], 'a', { mode: 'both', adviceNote: NOTE }).reason, 'regex_already_flagged');
});
test('advice note is skipped when the model already disclaimed or the note is present', () => {
  assert.strictEqual(Ladder.decide(dec('note', 'advice'), [], 'I am not a SEBI-registered adviser, but...', { mode: 'both', adviceNote: NOTE }).reason, 'own_disclaimer');
  assert.strictEqual(Ladder.decide(dec('note', 'advice'), [], 'a\n\n' + NOTE, { mode: 'both', adviceNote: NOTE }).reason, 'already_present');
  assert.strictEqual(Ladder.decide(dec('note', 'advice'), [], 'a', { mode: 'both' }).reason, 'no_note');
});
test('fail-open: no decision, an error, a decision without a ladder level, or a bogus level all leave the answer unchanged', () => {
  [null, undefined, {}, { error: 'x' }, { intent: 'advice_seeking' }, { intent: 'advice_seeking', ladder: { action: 'nuke' } }, { intent: 'advice_seeking', ladder: { action: 'none' } }].forEach((d) => {
    const r = Ladder.decide(d, [], 'answer', { mode: 'both' }); assert.strictEqual(r.text, 'answer'); assert.strictEqual(r.changed, false);
  });
});
test('counters: recordLadder changes only its four integer fields and keeps no text', () => {
  let s = Shadow.emptyStats(1);
  ['note', 'note', 'block', 'late', 'skipped', 'bogus'].forEach((x) => { s = Shadow.recordLadder(s, x); });
  assert.deepStrictEqual([s.ladder_note, s.ladder_block, s.ladder_late, s.ladder_skipped], [2, 1, 1, 1]);
  assert.ok(/ladder: note 2, block 1, skipped 1, late 1/.test(Shadow.summary(Object.assign({}, s, { total: 3 }))));
  const dirty = Shadow.recordLadder(Object.assign({}, s, { ladder_note: -4, ladder_block: 'x', extra: 'secret text' }), 'note');
  assert.strictEqual(dirty.ladder_note, 1); assert.strictEqual(dirty.ladder_block, 0); assert.ok(!('extra' in dirty));
});
