// The rules every reel must pass (run by __tests__/reels.test.mts and by anyone adding a reel). Returns a list of problems; empty means fine.
import { beatTexts, validateBeat } from '@/lib/reels/beats';
import { totalMs, wrap } from '@/lib/reels/engine';
import { CAST_IDS } from '@/lib/reels/cast';
import type { L, Prop, Reel } from '@/lib/reels/types';

const DEVANAGARI = /[ऀ-ॿ]/;
const LETTERS = /[A-Za-z]/;
/** Promises and advice a money explainer must never make. "Not guaranteed" is fine; "guaranteed returns" is not. */
const BANNED = /\b(risk[- ]free|sure[- ]?shot|can'?t lose|get rich|guaranteed (returns?|profit|income)|you (will|'ll) earn|you should (buy|invest in|sell)|buy this|best (stock|fund) to)\b/i;

export function textsOf(r: Reel): L[] {
  const out: L[] = [r.title, r.quiz.q, r.quiz.why, ...r.quiz.options];
  if (r.poke) out.push(...beatTexts(r.poke.beat));
  for (const s of r.scenes) {
    out.push(s.say); if (s.big) out.push(s.big);
    const p: Prop | undefined = s.prop;
    if (!p) continue;
    if (p.kind === 'counter' && p.label) out.push(p.label);
    if (p.kind === 'bars') p.items.forEach(i => out.push(i.label, i.text));
    if (p.kind === 'line' && p.label) out.push(p.label);
    if (p.kind === 'donut') { p.parts.forEach(x => out.push(x.label)); if (p.centre) out.push(p.centre); }
    if (p.kind === 'coins' && p.label) out.push(p.label);
    if (p.kind === 'shield') { out.push(p.text); if (p.sub) out.push(p.sub); }
    if (p.kind === 'steps') out.push(...p.items);
  }
  return out;
}

export function validateReel(r: Reel): string[] {
  const bad: string[] = [];
  const at = (m: string) => bad.push(`${r.id}: ${m}`);
  if (!/^[a-z0-9-]+$/.test(r.id)) at('id must be lowercase letters, digits and dashes');
  const total = totalMs(r);
  if (total < 20_000 || total > 45_000) at(`runs ${(total / 1000).toFixed(1)} s; a reel is 20-45 s`);
  if (r.scenes.length < 4 || r.scenes.length > 9) at(`${r.scenes.length} scenes; use 4-9`);
  r.scenes.forEach((s, i) => {
    if (s.who !== undefined && !(CAST_IDS as readonly string[]).includes(s.who)) at(`scene ${i + 1} names a cast member (${s.who}) that does not exist`);
    if (s.ms < 2500 || s.ms > 6500) at(`scene ${i + 1} lasts ${s.ms} ms; use 2.5-6.5 s`);
    if (s.say.en.length > 125) at(`scene ${i + 1} English caption is ${s.say.en.length} characters (max 125)`);
    if (s.say.hi.length > 150) at(`scene ${i + 1} Hindi caption is ${s.say.hi.length} characters (max 150)`);
    if (s.big && s.big.en.length > 18) at(`scene ${i + 1} big text "${s.big.en}" is too long`);
    if (s.prop?.kind === 'bars' && s.prop.items.length < 2) at(`scene ${i + 1} bars need at least two items`);
    if (s.prop?.kind === 'line' && s.prop.points.length < 3) at(`scene ${i + 1} line needs at least three points`);
    if (s.prop?.kind === 'donut' && s.prop.parts.some(p => !(p.value > 0))) at(`scene ${i + 1} donut parts must be positive`);
  });
  // Text drawn inside a picture has a fixed box: it must fit in the stated number of lines (same limits as components/reels/Scenery.tsx),
  // and its last line must not be a stray one- or two-letter word.
  const fits = (where: string, l: L, max: number, lines: number) => (['en', 'hi'] as const).forEach(lang => {
    const w = wrap(l[lang], max);
    if (w.length > lines) at(`${where} (${lang}) needs ${w.length} lines, room for ${lines}: "${l[lang]}"`);
    else if (w.length > 1 && w[w.length - 1].length < 3) at(`${where} (${lang}) leaves an orphan word: "${l[lang]}"`);
  });
  r.scenes.forEach((s, i) => {
    const p = s.prop; const n = `scene ${i + 1}`;
    if (!p) return;
    if (p.kind === 'steps') { if (p.items.length > 4) at(`${n} has ${p.items.length} checklist rows; room for 4`); p.items.forEach(x => fits(`${n} step`, x, 19, 2)); }
    if (p.kind === 'counter' && p.format === 'plain' && !p.unit) at(`${n} plain counter needs a unit`);
    if (p.kind === 'counter' && p.unit) fits(`${n} counter unit`, p.unit, 14, 1);
    if (p.kind === 'shield') { fits(`${n} shield`, p.text, 11, 3); if (p.sub) fits(`${n} shield note`, p.sub, 14, 2); }
    if (p.kind === 'bars') p.items.forEach(x => fits(`${n} bar label`, x.label, 11, 2));
    if (p.kind === 'counter' && p.label) fits(`${n} counter label`, p.label, 22, 3);
    if (p.kind === 'line' && p.label) fits(`${n} chart label`, p.label, 26, 2);
    if (p.kind === 'coins' && p.label) fits(`${n} coin label`, p.label, 24, 2);
    if (p.kind === 'donut') { if (p.centre) fits(`${n} donut centre`, p.centre, 9, 2); }
  });
  for (const x of textsOf(r)) {
    if (!x.en.trim() || !x.hi.trim()) { at('an empty text'); continue; }
    if (LETTERS.test(x.en) && x.en === x.hi && x.en.length > 6) at(`"${x.en}" is the same in both languages (untranslated?)`);
    if (LETTERS.test(x.en) && x.en.length > 12 && !DEVANAGARI.test(x.hi)) at(`Hindi text has no Devanagari: "${x.hi}"`);
    if (BANNED.test(x.en) || BANNED.test(x.hi)) at(`promise or advice wording: "${x.en}"`);
    if (/\{\w+\}/.test(x.en) || /\{\w+\}/.test(x.hi)) at(`an unfilled {gap} in "${x.en}"`);
    if (/NaN|undefined|Infinity/.test(x.en + x.hi)) at(`a broken figure in "${x.en}"`);
  }
  const all = textsOf(r).map(x => x.en).join(' ');
  if (/%/.test(all) && !/assum|illustrat|rough|about|near|common guide/i.test(all)) at('quotes percentages without saying they are assumptions, illustrations or rough');
  if (r.poke) {
    const i = r.poke.after;
    if (!Number.isInteger(i) || i < 1 || i > r.scenes.length - 2) at(`the beat pauses after scene ${i + 1}; use a scene in the middle (2 to ${r.scenes.length - 1})`);
    for (const m of validateBeat(r.poke.beat)) at(m);
  }
  const q = r.quiz;
  if (q.options.length < 2 || q.options.length > 4) at('quiz needs 2-4 options');
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) at('quiz answer index is out of range');
  if (new Set(q.options.map(o => o.en)).size !== q.options.length) at('quiz options repeat');
  return bad;
}
