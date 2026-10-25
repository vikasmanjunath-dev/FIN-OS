# Accessibility: the player, the beats, the gesture UI

Part of the Money Reels guide (`docs/REELS.md`, section 7). Everything here was checked in the web preview and the DOM only; VoiceOver and TalkBack have not been tried on a phone.

## Pass 1: scene control and the beats

- **Scene progress** is one full-width, 44 px control (`accessibilityRole="adjustable"`, value "3 of 7"). A tap jumps to the scene under the finger; a screen reader steps scenes with increment and decrement. It replaces one button per scene, which were 35 px wide on a 320 px phone when a reel had seven scenes (the layout audit counted them as too small).
- **Beats** were audited at 1x on 390 px and at 1.35x and 2x on 320 px, both while asking and after the no-touch reveal (`scratchpad` script reusing `AUDIT_JS` from `scripts/layout-audit.py`). Findings and fixes are in the list below.
- Findings from the beat audit, and what changed: (1) a slider takeaway printed "5 years years" because `{x}` had started to include its unit; `{x}` is a plain number again, `{xu}` has the unit, and a test covers every slider in the library; (2) a tall reveal pushed the page up under the top bar on the web preview, fixed with `minHeight: 0` on the beat's scroll area (and on the question screen's); (3) on a reveal the beat scrolls to its end so Continue stays in view, and the reel's title is hidden while a beat is on to give it room; (4) bar labels and values no longer overflow at large text. What the audit still reports is scrolled-out content counted as clipped, which is expected: it measures at rest, and a long reveal is scrolled. At 1.35x text on a 320 px phone the question screens of the longest beats (the scam message) need a scroll to reach Check; the reveal and Continue are in view.

## Pass 2: gesture UI, calm stop, sheets, banners

Audited at 320 px wide, 1x / 1.35x / 2x text, English and Hindi, reduce-motion on, with the layout audit's checks (`scripts/layout-audit.py` `AUDIT_JS`, reused by a scratch script) and DOM semantics. Guards are in `__tests__/reels-a11y2.test.mts`.

- **The picture is the one pause/play button.** The body of the player used to be a single button labelled "Pause", so on a phone the caption, the big words and the season badge inside it were hidden from VoiceOver and TalkBack. The outer body is now a touch surface a screen reader skips (`accessible={false}`), the picture is the button (with the save / pledge / steer custom actions), and the caption, big words and season badge are beside it.
- **Reels that are off screen are hidden from a screen reader** (`aria-hidden` / `importantForAccessibility`); the feed keeps the neighbouring reels drawn, and before this the web tree listed three reels' worth of controls.
- **After the answer**: the verdict, then this reel's move, then Next and Watch again, then "KEEP OR SHARE" (Save, I'll do this, Remind me, Play together, Share) and "TUNE YOUR REELS" (I know this, Less of this), then the two pills. The view scrolls just far enough that the verdict and the main buttons are in view; before, Next sat 1.4 screens down at 1x and 3.2 at 2x. Every button has a spoken label without its emoji or arrow.
- **Live regions** hold words only and each message is in exactly one: the verdict, the "got it" confirmation and the toast are text that stays mounted (empty until used) so they are announced once on Android and the web; iPhone ignores live regions, so `announce()` (iOS only, `components/reels/announce.ts`) says them there. No live region wraps a button any more (the beat reveals, Ask Mitra's answer and the banners did). The readout above a slider is no longer live (the slider announces its own value).
- **Toast** sits over the scene bar instead of over the buttons.
- **Steer sheet**: the backdrop is no longer a button wrapped around the card of buttons.
- **Scene control** exposes `aria-valuetext` (the web ignores `accessibilityValue`), and a tap on the web (no `locationX` on a click) now jumps to the scene under the finger instead of restarting.
- **Reduce motion** follows the setting while the app is open (`reduceMotionChanged`), and the scroll after an answer is not animated.
- **Calm stop**: Done is the first, filled button; "Keep exploring (optional)" is last and quiet; the decorative owl is hidden from a screen reader and does not scale.
- **Money date**: each step is announced; a locked track is a picture, not an adjustable control; stepper labels in Hindi.
- **My moves**: the move button no longer runs off a 320 px screen (it did at every text size); each button names its reel; titles are headings.
- **Banners** (`components/reels/Banner.tsx`, used by the feed): the words are the live region, the OK button is outside it and 44 px, the text scrolls inside the banner and the banner never takes more than 55% of the screen.
- **Not fixed in pass 2 (not re-checked since):** the feed's top bar (title and "1 / 3 watched" line) wraps into the topic chips from 1.35x text; the top bar comes after the list in reading order; the feed's own labels ("Close reels", "Voice on/off") are English only; the caption is a live region as well as the voice, so with sound and a screen reader both on it is said twice; `next()` scrolls with animation under reduce motion; inactive `EpisodeEnd` is not hidden from a screen reader (it has no `active` prop).
- **Needs a real phone**: everything above that is about VoiceOver or TalkBack (focus order, what is read and when, whether `announce()` and the live regions are heard once) was checked in the DOM only.
