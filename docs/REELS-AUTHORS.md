# Writing a Money Reel: the author's guide

One page for someone adding or reviewing a reel. The reference for how reels work is `docs/REELS.md`; the production plan and the review gate are in `docs/REELS-400-PLAN.md`. Everything below runs from `Initial Deployment/mobile`.

## The steps

1. **Brief it first.** Topic (`basics invest loans credit protect tax retire safety goals`), ladder rung (`myth` what people wrongly believe, `concept` how it works, `decision` choosing with your numbers, `action` the move), format (explainer, or one beat: `guess slider myth spot path sort order`), the one thing it teaches, and the tool it leads to. `npm run reels:check -- --summary` shows which topic × rung cells are empty: aim at a gap.
2. **Write the data** with `t(en, hi)` and `sc(mood, say, { big, prop, who })` from `lib/reels/kit.ts` (a scene's length follows its caption). Put it in a content file and in the exported array (a **draft** goes in a `content-w*` file listed in `lib/reels/drafts.ts` instead). Figures come from `lib/reels/figures.ts` through `fill()` and `money()`; never type a number into a caption.
3. **Register it** (one line each): `META` in `meta.ts` (`DRAFT_META` for a draft: rung, Money Score pillar weights, triggers, `growth` if it says "put in more"); a tool link in `journey.ts` `ACT`, `act-more.ts` or `PLAY_ACT` (`DRAFT_ACT`) unless it is a scam reel (those point at no tool); a `TRUST` note in `trust.ts` if it quotes computed figures; optionally an episode in `series.ts`.
4. **Run the checklist**: `npm run reels:check -- your-id` (add `--drafts` for a draft). Fix every `✗`; read every `!`.
5. **Test the maths**: add a known-answer test for any new figure (worked by hand or by a plain loop, never by the function under test). Then `npm test`.
6. **Look at it**: `npx expo start --web`, open `/learn/reels?id=your-id`, with sound on and at large text.
7. **Hand it to review** (below). A draft stays out of the app until signed off.

## The shape of a reel

```ts
{ id: 'kebab-case-id', topic: 'invest', lesson: 'insight-sip' /* optional: a Learn lesson id */, tags: ['SIP', 'compounding'],
  title: t('...', '...'),
  scenes: Scene[],            // 4-9 scenes, each { ms, mood, say: L, big?: L, who?: CastId, prop?: Prop }
  poke?: { after: 1, beat },  // at most one beat, after a middle scene (the reel pauses there)
  quiz: { q: L, options: L[], answer: number, why: L } }   // L = { en, hi }, both always present
```

Pictures (`prop`): `counter`, `bars`, `line`, `donut`, `coins`, `shield`, `steps`. Beats: `guess`, `slider` (ten models, all in `figures.ts`), `myth`, `spot`, `path`, `sort`, `order`; every beat reveals by itself after 8 s without a touch, so write the reveal to stand alone.

## What the checklist tells you

| Line | What it checks | Blocks? |
|---|---|---|
| Script rules | everything `validate.ts` bans (next section) | yes |
| English and Hindi in proportion | Hindi not a cut-down or padded copy of the English | warns |
| Hindi and compliance review | signed off in `review.ts`, waiting (draft), or built before the gate | no (it is a to-do) |
| Ladder entry, tool link, trust note | `META`, `ACT`, `TRUST` present and sane; a slider or guess reel with figures needs a trust note | yes / warns |
| Beat usable, numbers re-derive | `isBeatUsable`, `validateBeat`, and the slider's figure worked out again by a month-by-month ledger; a guess answer must be stated in the reveal | yes |
| Duration, reading time, voice | 20-60 s, scenes 1.5-12 s, **also with the phone's voice** (`withVoiceTiming`, English and Hindi); warns above 22 characters a second or when the voice makes the reel more than 75% longer | yes / warns |
| Quiz | answer index valid, options distinct in both languages, an explanation that teaches; warns when the right option is far longer than the rest | yes / warns |
| Advice, promise and link wording | softer wording than the validator (e.g. "guarantees", "you should"), `http://`, PAN/Aadhaar/long numbers, e-mail addresses | yes / warns |
| Title and hook not repeated | no other reel has the same title (en or hi); warns on the same opening line | yes / warns |
| Topic, cast, lesson, place | topic has a chip and map row; cast and lesson exist; the reel is on the Money Map or in a series | yes / warns |
| Safe to share | the shared text is title + quiz explanation only: no `mine` flag, no identifier, no link | yes |
| File size and drawing cost | under 30 KB; no scene over 30 animated pieces (a counter is 4, a bar 3, a checklist row 3, a donut part 2, a coin 2 up to 8) | yes / warns |

`!` lines are judgement calls. `✗` lines block: `npm run reels:check -- --all` and `npm test` both fail. `~` lines are known findings listed in `lib/reels/qa-allowlist.ts` with a reason; do not add to that file to hide your own problem. Other commands: `--summary` (coverage by topic, rung, format, pillar; reels with no tool; unreachable reels; gaps), `--drafts`.

## What the validator bans (`lib/reels/validate.ts`)

20-45 s in all, 4-9 scenes, 2.5-6.5 s a scene; captions up to 125 characters (English) and 150 (Hindi), "big words" up to 18; a plain counter must name its unit; at most 4 checklist rows; text inside a picture must fit its box with no one- or two-letter last line; both languages present, Hindi in Devanagari and not identical to the English; no unfilled `{gap}`, `NaN`, `undefined`; no "risk-free", "guaranteed returns", "you should buy", "can't lose", "get rich" and the like; any `%` needs "assumed", "illustration", "about", "rough" somewhere; quiz of 2-4 options with distinct text and a valid answer; a beat after a middle scene and passing `validateBeat` (for example, a choose-your-path must not call a path "best" unless it really is). Scam reels name no number but 1930 and no real link or sender.

## How Hindi review works

A native Hindi reader checks the Hindi reads naturally and says what the English says; a compliance reader checks tax, insurance, investing and scam wording. For a draft: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --import ./__tests__/register-aliases.mjs scripts/review-sheet.mts > ../docs/review/<wave>-review-sheet.md` makes the side-by-side sheet with sign-off boxes. When both have signed, add the reel to `REVIEWED` in `lib/reels/review.ts` with both names and the date (`{ hindi, compliance, on: 'YYYY-MM-DD' }`); the reel, its ladder entry and its tool link join the library at the next build. `EXPO_PUBLIC_REELS_DRAFTS=1` includes every draft for a review session. Related tools: `scripts/verify-numbers.mts` (the phone's calculators, checked by a second method) and `scripts/voice-brief.mts` (the recording brief for a voice artist) are separate; this checklist does not repeat them.

## A good reel and a bad one

Good (an excerpt; a real reel has five to seven scenes):

```ts
sc('think', fill(t('Put {s} aside every month for {y} years, with growth at an assumed {r}% a year.',
                   'हर महीने {s} अलग रखें, {y} साल तक, अनुमानित {r}% सालाना बढ़त के साथ।'), { s: money(5000), y: 30, r: 12 })),
sc('surprised', fill(t('You put in {p}. It grows to about {f}.', 'आप {p} लगाते हैं। यह बढ़कर लगभग {f} हो जाता है।'), { p: money(put), f: money(fv) }),
   { prop: { kind: 'bars', items: [/* two bars, labels of at most 2 short lines */] } }),
sc('worry', t('{r}% is an assumption, not a promise. Real returns go up and down.', '...'))
quiz: { q: t('How much of the final amount was growth?', '...'), options: [t('About 10%', '...'), t('About half', '...'), t('About 90%', '...')], answer: 2, why: fill(...) }
```

It is good because every figure is computed (`fill`, `money`) and a known-answer test covers it; the percentage is called an assumption; each sentence is short enough to read at a comfortable pace (up to 22 characters a second) and to be spoken; the options are equally specific; and the explanation shows the working.

Bad, and what the checklist says:

```ts
sc('cheer', t('Invest ₹5,000 now and you will earn 12% guaranteed returns, risk-free! http://bit.ly/sip', 'अभी ₹5,000 निवेश करें और 12% गारंटीड रिटर्न पाएँ, जोखिम-मुक्त!'))
quiz: { q: t('Best?', '...'), options: [t('Yes', '...'), t('Yes', '...')], answer: 4, why: t('Yes.', '...') }
```

A typed figure instead of `fill`; "guaranteed returns" and "risk-free" (validator); a link (`http-link`); the quiz answer is out of range, the options repeat and the explanation teaches nothing (`quiz-answer`, `quiz-options`, `quiz-why`); no ladder entry, tool link or trust note (`meta-missing`, `act-missing`, `trust-missing`); the Hindi is shorter than the English (`hindi-proportion`).
