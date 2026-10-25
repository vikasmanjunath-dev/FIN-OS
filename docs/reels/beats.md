# Playable reels: beats, sliders and the cast

Part of the Money Reels guide (`docs/REELS.md`, section 3). A beat is the one thing a viewer does inside a reel: the reel stops after a middle scene, the viewer acts, then it plays on. Seven kinds exist; 71 of the 177 live reels have one (slider 16, spot 15, myth 12, guess 10, sort 7, path 6, order 5; the other 106 are plain explainers).


## The beat engine (guess, slider, myth)

- **Beats.** A reel can carry one `poke` (`{ after, beat }`): the reel stops after scene `after`, the viewer does something, then it plays on. Three kinds: **guess** (drag a marker on a log scale, lock it in, see the gap), **slider** (a what-if slider driven by a `SliderModel` that calls `figures.ts`, so the slider holds no formula of its own) and **myth** (3 to 5 cards, Myth or Fact). Types are in `lib/reels/types.ts`; all the decisions (where the clock stops, how a guess is judged, what the slider shows, how cards are scored, the rules each beat must keep) are pure functions in `lib/reels/beats.ts`; the screens are in `components/reels/Poke.tsx`.
- **No-touch path.** With no input for 8 s (`IDLE_MS`) a beat reveals itself and, for a passive viewer, plays on after 6 s more. Every beat has Skip or Continue, and the slider has plus and minus buttons and screen-reader increment and decrement actions. A wrong guess is never a failure screen.
- **Rules.** `validateReel` checks the beat position (not the first or last scene) and runs the beat's texts through the same Hindi, wording and `{gap}` checks as scenes, and `validateBeat` checks ranges, step counts, model sanity and card counts. The slider takeaway is checked as the viewer first sees it, and a test fills it at every position.
- **Where they live.** `lib/reels/content-play.ts` holds the playable reels written by hand (14 now, listed under "Cast and playable reels"; waves 3 and 4 add more in their own files, see `library.md`). `lib/reels/library.ts` joins them to the main reels as `LIBRARY` (the feed, Home card and share text read from it) and holds their tool links as `PLAY_ACT` (`ACT_ALL` is both maps). A scam reel points at no tool, as for the other scam reels.
- **Tests.** `__tests__/reels-play.test.mts`.

## Later beats and slider models

- **New beats.** `spot` (tap the red flags in a message split into 4 to 9 pieces; 2 to 4 flags, at least one normal piece; reveal explains each; to-do line), `path` (choose what a character does; each path shows its result; no path may be called best or wrong unless `clear`), `sort` (cards into 2 or 3 bins, one at a time), `order` (tap items first to last; the deck is a fixed shuffle). All have the 8 s no-touch reveal and no penalty. Screens in `components/reels/Poke.tsx`, which now scrolls when its content is tall.
- **Slider models.** Besides sip-years, sip-delay and inflation-years: `emi-rate`, `emi-tenure`, `goal-sip`, `step-up`, `tax-income`, `corpus-spend`, `card-interest`, all from existing `figures.ts` and `taxcore.ts` functions. `evalModel` returns value, put, base, lost and the always-positive `diff`; `sliderBars` draws the two bars; `xFormat: 'inr'` shows the slider's own value as rupees; takeaway keys are `{x} {value} {put} {base} {lost} {diff}`. Extra figures live in `lib/reels/figures-play.ts`.

## Cast and playable reels

- **Cast.** A scene may name `who` (one of the people in `lib/reels/cast.ts`, drawn by `components/reels/Cast.tsx`) and the player draws that person instead of Mitra. Add a new person to both files; a test checks they agree.
- **Playable reels.** `content-play.ts` now holds 14: guess-sip, guess-emi, delay-cost, inflation-slide, myths-money, myths-scams, spot-kyc-sms, spot-invest-group, choose-bonus, sort-needs-wants, order-first-salary, emi-rate-slide, goal-sip-slide, corpus-spend-slide. Sample links in scam reels are written without `http://` because the privacy test treats any `https?://host` in source as a place the app contacts.

## Robustness

- **A broken beat never breaks a reel.** `isBeatUsable` (in `beats.ts`) applies the same rules the tests hold every beat to (valid ranges, model figures, card counts, pause point) before a reel pauses for it; a reel whose beat fails simply plays without it. `BeatBoundary` wraps the beat as well: if it throws while drawing, it writes the redacted crash note (Diagnostics) and the reel plays on. A test checks every beat in the library is usable and that bad ones are refused.
- **Backgrounding.** Leaving the app pauses the reel and silences the voice.
