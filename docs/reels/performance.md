# Performance

Part of the Money Reels guide (`docs/REELS.md`, section 7). Run `cd mobile && npm run reels:perf` for the counts below.


The target from the blueprint: a reel is under 30 KB, plays with no network, holds about 30 frames a second on a mid-range Android, and never autoplays sound. The first three held already; the frame rate was the risk. **Nothing here has been measured on a phone.** The numbers below come from counting the data (no device needed) and from the web preview on a laptop (a development build of React, which is slower than the phone's release build but shows what each design costs relative to the other).

**What it was.** `ReelPlayer` kept the clock in React state and a 40 ms `setInterval` set it, so all of the player re-rendered 25 times a second: the progress bars, the title, the big words, the stage (Mitra or a cast member, and the picture), the caption, the pill row, the steer card and both sheets, even though only the stage and the progress bar change from frame to frame. Mitra alone is about 30 SVG nodes, and every node was rebuilt every tick.

**What it is now.**

| Change | Where |
|---|---|
| The clock is an object outside React (`createClock`), not state. It tells its watchers to redraw when the clock moves into a new 33 ms frame, or when it is set on purpose (a jump, a restart, the end of a beat). Never more than 30 times a second. | `lib/reels/frame.ts` |
| The loop that ticks it is `startFrameLoop`: `requestAnimationFrame` (so it follows the screen and cannot queue calls behind a slow render), at most 30 frames a second on any refresh rate, with a timer behind it for pages that get no refresh (a background tab, the hidden web preview). A slow frame is late, never doubled. | `frame.ts`, `ReelPlayer.tsx` |
| The voice clock is unchanged: each frame still measures real elapsed time (capped at 120 ms), asks `holdAtSceneEnd` and moves the clock. The same function, the same arguments. | `ReelPlayer.tsx` |
| The player renders only when what it shows changes: it reads a small "phase" from the clock (scene number, finished, at the beat's stopping point), which changes a few times a reel. | `phaseOf`, `phaseCode` |
| Only three things watch the clock: the progress bar (`SegmentFills`, each segment its own memo), the stage (`Art`) and the caption while it slides in or out (`LiveCaption`; a still caption is not redrawn: `captionElapsed` reports one value for the middle of the scene, which draws the same caption). Nothing else is given `t`. A source test holds this. | `ReelPlayer.tsx` |
| `PillRow`, the trust and ask sheets and the caption are `memo` with handlers made once (`useCallback`), so the player's own re-renders (a scene change, a toast) touch less. | `ReelPlayer.tsx` |
| A finished picture is not drawn again. Bars, counter, line, donut and shield settle at 50-80% of their scene (`settleAt`); `pictureP` folds every later `p` into one value, so `SceneryLayer` (memo) finds its props equal and skips. Coins and steps settle when their last item has appeared. Only a shield breathes with the clock and keeps drawing. A known-answer test computes the drawing's parameters the way `Scenery.tsx` does and checks they are identical from the settle point on and different just before it. | `frame.ts`, `Scenery.tsx` |
| Mitra builds everything that does not move once (body, ears, belly, coin, feet, brows, beak, the gradient) as module-level React elements and hands back the same objects, so React skips them. Each frame redraws the bob group, the eyes and the mood's extras: 10-11 of about 31 nodes. The picture is unchanged (same shapes, same order). | `Mitra.tsx` |
| Scenery wraps each label once (cache), and finds a picture's largest bar, line range, donut total and counter type size once per picture, not once per frame. | `Scenery.tsx` |
| With reduced motion nothing watches the clock. | `ReelPlayer.tsx` |
| A reel that is not on screen runs nothing: no frame loop (it starts only for the active, playing, unpaused reel with no sheet or beat open), no voice, no subscription that fires. The reels beside the active one are drawn once and sit still. | `ReelPlayer.tsx` |

**What was not done, and why.** The hint was to unmount the picture's `Svg` while a reel is not active. It stays mounted, as a still first frame: the feed marks a reel active when it is 70% on screen, so unmounting would mean building the picture in the middle of the swipe, which is the jank this is meant to remove, and a reel that is not on screen costs nothing per frame either way. What it does cost is the one-off build of the neighbours' first frames (about 30 SVG nodes each), which `windowSize={3}` pays off-screen. If a phone shows a hitch when the feed builds the next neighbour, the lever is in `app/learn/reels.tsx` (owned elsewhere): `maxToRenderPerBatch={1}` already spreads it; `windowSize={2}` would keep one neighbour instead of two. `Cast` (the story characters, about 40 nodes) still redraws entirely every frame: it is another session's file.

**Counted from the data** (`npm run reels:perf`; `-- <reel-id>` for one reel, `-- --all` for every reel, `--drafts` for the drafts). 177 reels, 936 scenes, 69 minutes of animation. 689 of the 936 scenes have no picture at all (just Mitra and the words), so Mitra is the main per-frame cost, not the scenery. Animated pieces per scene (the QA budget, 30): mean 9.8, worst 20 (`section-80c`, `rbi-and-emi`, `retire-number-steps` and others: steps and bars). Beats: worst 16. Largest finished picture: steps with 25 SVG nodes.

| | Before | After |
|---|---|---|
| Whole-player renders while a reel plays | 25 a second (1 per 40 ms tick); 103,631 playing every reel once | 0 per frame; about 1,290 playing every reel once (a scene change, the start, the question screen) |
| Picture redraws | 25 a second | at most 30 a second (28.8 on a 144 Hz screen); none for a settled picture, a held scene end or a paused reel |
| SVG node renders, playing every reel once | 3,441,030 | 1,592,210 (54% fewer) |

**Measured in the web preview** (React development build, a laptop, viewport 375 wide; `fiber.actualDuration` of each commit through a temporary DevTools hook, 14 seconds from the start, rAF replaced by a 16 ms timer because the preview pane's refresh stops when it is hidden; a temporary script, not kept). "Busy" is render time per second of playing; mean/p95/max are per commit.

| Reel | | Commits / s | Render ms mean | p95 | max | Busy ms / s |
|---|---|---|---|---|---|---|
| `rbi-and-emi` (steps then bars, the heaviest kind) | before | 25.6 | 2.69 | 3.4 | 5.5 | 68.7 |
| | after | 29.9 | 0.89 | 1.5 | 9.0 | 26.7 |
| `emi-rate-slide` (slider beat; counted while ticking) | before | 25.8 | 2.94 | 3.8 | 30.3 | 74.7 |
| | after | 29.3 | 1.10 | 2.0 | 19.5 | 29.1 |
| `emi-trap` (counter, then a donut) | before | 25.4 | 3.11 | 4.5 | 28.0 | 79.2 |
| | after | 29.7 | 0.75 | 1.2 | 9.7 | 22.3 |

So a frame costs about a third of what it did, and the render time per second is 2.5-3.5 times lower even though frames are drawn 17% more often (30 instead of 25: smoother, not more work). The largest commit in a run is a scene change or a beat mounting, not a tick. While paused, on a beat or on the question screen the commits per second are 0, as before.

**Checked in the web preview after the change** (`emi-trap`, `emi-rate-slide`, `rbi-and-emi`): captions follow the scenes; tapping the picture pauses (the veil shows, 0 commits) and plays on; tapping the scene bar jumps; a double tap adds to My moves and leaves play/pause as it was; holding the picture opens "How this is worked out"; a swipe right saves ("Saved for later") and a swipe left opens the steer card; the slider beat pauses the reel at its scene's end; the question screen, the verdict and "Watch again" work; bars, the cheering and worried Mitra, blinking and the wing flap draw as before. Only the active reel ticks. Not exercised in the preview: reduced motion, the voice (sound off), a real touch swipe on the feed, and a swipe to the next reel (the web feed would not scroll under script).

**Still to measure on a real mid-range Android** (a Redmi or Galaxy A class phone, a release build, not a debug build): frames per second and dropped frames while a heavy reel plays (the `section-80c` family, a reel with `who`), and with the voice on; whether the swipe to the next reel hitches (the feed builds the new neighbour then); memory after thirty reels; whether `react-native-svg` redraws the changing nodes cheaply enough (the rest is now skipped in JavaScript, but the native views are still updated for what changes); and the Cast characters. Use the Performance monitor in the React Native dev menu, or `adb shell dumpsys gfxinfo <package> framestats`. If the frame rate falls short, the next levers are: Mitra's bob and eyes on the native driver (a transform on one `View` instead of SVG props), a lower frame rate for Mitra than for the picture, and a lighter `Cast`.

**Tests.** `__tests__/reels-perf.test.mts` holds known answers for the frame grid, budget, loop (60/90/120/144 Hz, a slow screen, no refresh, stopping), clock, phases, settle points, the caption's still stretch and the node counts; and source checks that the player has no `setInterval` and no tick in state, passes `t` only inside `Art`, lets only three components watch the clock, memoises the still parts and starts the frame loop only for the active reel.
