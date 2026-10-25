# The habit loop: episode, streak, saved, moves, milestones, seasons, facts, health

Part of the Money Reels guide (`docs/REELS.md`, section 5). Rule for all of it: no guilt, no loss wording, no points.

## Today's episode

- **Today's episode.** `lib/reels/episode.ts` composes the For you tab into at most three reels (`EPISODE_SIZE`) minus those already finished today: the best-ranked reel first, then the best-ranked playable reel so there is always something to touch, then the next best, preferring topics not yet used. After them comes `EpisodeEnd`, a calm "That's enough for today" page with the one move, a "Tomorrow:" teaser and an optional way to keep exploring. The episode is fixed for the visit, like the order. The All and topic tabs are unchanged.

## Streak

`lib/reels/streak.ts` (`forgivingStreak`) replaces the strict reset in the app: one rest day in any seven is bridged automatically (rest days are not counted, only bridged); a second rest within a week, or two missed days together, ends the run. `streakOf` in `journey.ts` stays for its tests.

## Reels health

`lib/reels/stats.ts` and `lib/reelsStatsStorage.ts` keep daily counters (reels finished, right first time, beats shown and played, "I know this" and "less" taps, moves started, receipts, Ask Mitra questions, minutes on screen), with no reel names or amounts, in `finos_session_reels_stats` (never synced, deletable). `app/learn/health.tsx`, opened from Diagnostics, shows the last 28 days against the blueprint's starting hypotheses (Money Days 8 or more in 28, 15 or more moves per 100 reels, under 8 steering taps per 100, under 3 minutes a day).

## Gestures, Saved, My moves, milestones, seasons, facts, Money date

- **Gestures** (in `ReelPlayer.tsx`): double-tap the picture = "I'll do this" (a double tap toggles play/pause twice, so playback is unchanged); swipe right = keep the reel for later; swipe left = a small sheet asking "I know this" or "fewer on this topic"; hold the picture = how the figures are worked out. Only clearly sideways moves are captured, so the feed still scrolls. Every gesture also has a button after the quiz (Save, I'll do this, Play together) and a screen-reader custom action. A one-line tip shows on the first reel for the first three visits only (`tips` in the profile).
- **Saved and My moves.** `saved` and `pledges` live in the reels profile (`reelsProfile.ts`: `toggleSaved`, `addPledge`, `removePledge`; bounded at 60 and 20, ids validated; same on-phone key as "I know this", never synced). The feed has a "🔖 Saved" tab (snapshot taken when the tab opens, so un-saving does not pull a reel from under the thumb). `app/learn/moves.tsx` lists pledges with where each stands (not started, watching your figure, improved), the receipts, and the saved reels; it is linked from the Learn index and from the calm stop. For a reel with no tool, "I'll do this" simply keeps it for later.
- **Real milestones** (`milestones.ts`): first SIP, three and six months of cover, a cleared loan, noticed from the figures already on the phone. The first check is a silent baseline (nothing is celebrated that was true before the reels began); later ones show once as a gold banner. A cleared loan needs a loan that was seen earlier.
- **Seasons** (`seasons.ts`): Diwali week (5 days before to 2 after, dates listed for 2026 to 2030 and to be checked each year), Budget week (29 Jan to 4 Feb) and March year-end (15 to 31 March) tint the stage and add a small badge. The lessons do not change.
- **Money fact of the day** (`facts.ts`): 23 short, true facts at the calm stop; figures are computed from the reels' own tested functions and projections say "assumed". Hindi is a draft for the native reviewer like the rest.
- **Money date** (`together.ts`, `TogetherSheet.tsx`): "👫 Play together" on any reel with a guess beat. Two people on one phone each guess the reel's example question, the first guess is hidden, then both are shown against the answer, with a tie when they are within 5%. It uses only the reel's example figures (never the personalised version), keeps nothing and sends nothing.
- **Health counters** gain `saves`, `pledges` and `together`, and a "pledges per 100 reels" row.
- **Voice wiring** (applied for the content session's voice engine): with sound on the player plays `withVoiceTiming(reel)`, so scenes last as long as the voice needs; the clock holds at a scene's end (up to 1.6 s) until the sentence is finished, the beat's pause waits for the same, and the caption lights the word being said (`useVoice`, `Caption`). Turning sound on or off keeps the person in the same place in the same scene.
- **Not built, and why:** a sound set, recorded voice and commissioned art (assets), more Indian languages (translators), backend sync and push (a hosted backend).

## The Reels tab

- **A bottom tab of its own.** Reels is the second of six tabs (Home, Reels, Markets, Arya, Track, Portfolio), in the thumb zone next to Home, the most-visited screen. Pressing it does not show a tab screen: `listeners.tabPress` in `app/(tabs)/_layout.tsx` stops the tab switch and pushes `/learn/reels`, the full-screen feed, so the close button returns to the tab you came from. `app/(tabs)/reels.tsx` is only a redirect for the case where the tab route is opened directly (a deep link).
- **Badge.** `reelsTabState` (in `lib/reels/streak.ts`, pure and tested) reads the day list the streak uses: a tick when today's episode is done, the streak number when a streak is alive and today is still open, a small dot otherwise ("today's reel is ready"). The accessibility label says the same in words. `hooks/useReelsTab.ts` refreshes it on route change and when the app returns to the foreground. Nothing leaves the phone.
- The Home screen's "Today's reel" row is now a card; see "Home card" below.

## Home card

Home's plain "Today's reel" row is now one calm card (`components/ReelsHomeCard.tsx`, built from the pure `homeCard(state, now)` in `lib/reels/homecard.ts`). It still opens `/learn/reels`.

- **What it shows**: the episode's anchor reel (the first pick of `composeEpisode`) with the ranker's one-line reason; how many of today's reels are finished ("1 of 3 today"); the forgiving streak in plain words ("4-day streak", no counting of anything missed); a **Start** / **Continue** / **Done for today** button; and, when the person has pledged moves, a quiet second line "N moves on your list" that opens `/learn/moves`. A season day adds the season badge and name to the heading.
- **States** (`kind`): `new` (nothing finished yet, ever: a plain welcome, no count, no streak), `mid` (a reel or more finished today, or a returning person with none yet), `done` (the whole episode finished: no reel is pushed, "Come back tomorrow for the next"), `rest` (a rest day is being bridged: "A rest day is built in, so your streak is safe"). A **strained** person (loan payments over the strain line, see `signals.ts`) gets no streak, a calm reason, a calm title in place of any growth-framed one, and no growth celebration (a started or raised SIP); a cleared loan or months of cover are still celebrated.
- **Celebration**: a fresh real receipt (first) or milestone (otherwise) becomes one gold line "🎉 Three months of cover". It reads the same state the feed's banner reads, so it is "once" in the same way: the feed's banner marks it seen when the person taps OK, and the line goes. Home never marks anything seen itself.
- **Cheap and steady**: no network and no new storage key. It reuses the state `useReelsJourney` already loads on focus. Until that has loaded, the old plain row is drawn in a box of the same minimum height (`REELS_CARD_MIN_HEIGHT`), so the list does not jump; there is no skeleton. The extra lines (celebration, moves) only appear for people who have them.
- **Both languages** are produced in `homeCard` (`L` pairs) and chosen by the card with `useLang`. Hindi is a draft for the native reviewer.
- **Reels tab**: `reelsTabState(days, today, pledges?)` takes the pledge count as an optional third input. Badge and streak are unchanged; the only difference is the accessibility label ("Reels, today's reel is ready, 3-day streak, 2 moves on your list"). Nothing is drawn on the icon, to keep the tab calm. `useReelsTab` reads the profile (existing key) as well as the days.
- **Tests**: `__tests__/reels-home.test.mts` (known answers for every state in both languages, a wording scan, the tab label, the wiring, and that no storage key is added).
- **Not verified**: VoiceOver / TalkBack reading of the card on a real phone; the card at very large text sizes beyond the web preview.

## Episode finish rate

Reels health counts episodes opened (`eps`) and finished (`epfin`: every reel in the episode answered in the same visit) and shows the share against the 70% starting hypothesis.
