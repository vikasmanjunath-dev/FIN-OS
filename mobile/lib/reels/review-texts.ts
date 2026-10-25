// Every piece of text a reviewer has to read, with a plain-words label for where it appears on screen. The Hindi sheet and the compliance sheet
// both read from here so they can never disagree about what "every text of a reel" means. Pure: it only reads the reel, a trust note or a money fact.
// Superset of validate.ts textsOf(): the same texts plus the unit under a counter, each with a label.
import { sliderLine } from '@/lib/reels/beats';
import type { Beat, L, Reel } from '@/lib/reels/types';
import type { Trust } from '@/lib/reels/trust';

export type TextGroup = 'title' | 'scene' | 'picture' | 'beat' | 'quiz' | 'trust' | 'fact';

export interface ReviewText {
  /** What the person sees this as: "Scene 3", "Quiz option 2 (right)", "How this is worked out: assumes". */
  where: string;
  group: TextGroup;
  en: string;
  hi: string;
  /** Only for a slider takeaway: the template with its {gaps}, so the two languages can be compared gap for gap. `en`/`hi` hold it filled in. */
  tpl?: L;
}

const t = (where: string, group: TextGroup, l: L, tpl?: L): ReviewText => ({ where, group, en: l.en, hi: l.hi, ...(tpl ? { tpl } : {}) });

function beatRows(b: Beat): ReviewText[] {
  const o: ReviewText[] = [];
  const add = (where: string, l: L, tpl?: L) => o.push(t(`Interaction: ${where}`, 'beat', l, tpl));
  add('question', b.q);
  if (b.kind === 'guess') add('answer reveal', b.reveal);
  if (b.kind === 'slider') {
    add('slider label', b.label); add('slider unit', b.unit);
    add('takeaway (figures filled in)', sliderLine(b, b.start), b.takeaway);
  }
  if (b.kind === 'myth') b.cards.forEach((c, i) => { add(`card ${i + 1} (${c.fact ? 'fact' : 'myth'})`, c.s); add(`card ${i + 1} reason`, c.why); });
  if (b.kind === 'spot') {
    add('message from', b.from);
    b.parts.forEach((p, i) => { add(`message piece ${i + 1}${p.flag ? ' (red flag)' : ''}`, p.t); if (p.flag) add(`piece ${i + 1} why it is a red flag`, p.flag); });
    add('what to do', b.todo);
  }
  if (b.kind === 'path') { add('situation', b.setup); b.options.forEach((x, i) => { add(`option ${i + 1}`, x.label); add(`option ${i + 1} result`, x.result); }); add('verdict', b.verdict); }
  if (b.kind === 'sort') { b.bins.forEach((x, i) => add(`bin ${i + 1}`, x)); b.cards.forEach((c, i) => { add(`card ${i + 1} (belongs in bin ${c.bin + 1})`, c.t); add(`card ${i + 1} reason`, c.why); }); }
  if (b.kind === 'order') b.items.forEach((c, i) => { add(`step ${i + 1}`, c.t); add(`step ${i + 1} reason`, c.why); });
  return o;
}

/** All of a reel's on-screen text in reading order: title, scenes (caption, big words, picture text), the interaction, the quiz. */
export function reelTexts(r: Reel): ReviewText[] {
  const o: ReviewText[] = [t('Title', 'title', r.title)];
  r.scenes.forEach((s, i) => {
    const n = `Scene ${i + 1}`;
    o.push(t(n, 'scene', s.say));
    if (s.big) o.push(t(`${n} big words`, 'scene', s.big));
    const p = s.prop; if (!p) return;
    const pic = (w: string, l: L) => o.push(t(`${n} picture: ${w}`, 'picture', l));
    if (p.kind === 'counter') { if (p.label) pic('counter label', p.label); if (p.unit) pic('counter unit', p.unit); }
    if (p.kind === 'bars') p.items.forEach((x, j) => { pic(`bar ${j + 1} label`, x.label); pic(`bar ${j + 1} value`, x.text); });
    if (p.kind === 'line' && p.label) pic('chart label', p.label);
    if (p.kind === 'donut') { p.parts.forEach((x, j) => pic(`slice ${j + 1} label`, x.label)); if (p.centre) pic('centre', p.centre); }
    if (p.kind === 'coins' && p.label) pic('coins label', p.label);
    if (p.kind === 'shield') { pic('shield', p.text); if (p.sub) pic('shield note', p.sub); }
    if (p.kind === 'steps') p.items.forEach((x, j) => pic(`checklist row ${j + 1}`, x));
  });
  if (r.poke) o.push(...beatRows(r.poke.beat));
  o.push(t('Quiz question', 'quiz', r.quiz.q));
  r.quiz.options.forEach((x, i) => o.push(t(`Quiz option ${i + 1}${i === r.quiz.answer ? ' (right answer)' : ''}`, 'quiz', x)));
  o.push(t('Quiz why', 'quiz', r.quiz.why));
  return o;
}

/** The "How this is worked out" note of a reel. */
export function trustTexts(n: Trust): ReviewText[] {
  const o = [t('How this is worked out: formula', 'trust', n.formula), t('How this is worked out: assumes', 'trust', n.assumes)];
  if (n.formulaMine) o.push(t('How this is worked out: formula (person’s own figures)', 'trust', n.formulaMine));
  if (n.assumesMine) o.push(t('How this is worked out: assumes (person’s own figures)', 'trust', n.assumesMine));
  return o;
}

/** A money fact (calm-stop screen). */
export const factTexts = (text: L): ReviewText[] => [t('Money fact', 'fact', text)];
