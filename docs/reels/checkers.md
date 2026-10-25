# Author tooling and library-wide checks

Part of the Money Reels guide (`docs/REELS.md`, section 8). The step-by-step authoring guide is `docs/REELS-AUTHORS.md`.

## Checks

- **Guide for authors:** `docs/REELS-AUTHORS.md` is the one-page "Adding a reel" guide: the steps, the schema, what each checklist line means, what the validator bans, how Hindi review works, and a good and a bad reel side by side.
- **`npm run reels:check -- <reel-id>`** (`mobile/scripts/reel-check.mts`, logic in `lib/reels/qa.ts`) prints the checklist for one reel: validator errors, both languages in proportion, Hindi/compliance review state, ladder entry, tool link and trust note, beat usable and re-derived, duration and the voice's timing in both languages, caption speed, quiz quality, advice and link wording, repeated titles and hooks, topic/cast/lesson, share safety, file size and drawing cost. `--all` checks every reel (exit code 1 when anything blocks); `--summary` prints coverage (reels per topic and ladder rung, per format and per pillar, ids with no tool, unreachable ids, empty topic × rung cells, quiz answer positions, size); `--drafts` checks the 50 draft reels.
- **Library invariants:** `__tests__/reels-library-qa.test.mts` holds every live reel and every draft to those checks and names the reel that breaks one: unique ids and titles, ladder entry and topic chip, share-safe text, 30 KB a reel (library total reported), scenes 1.5-12 s and reels 20-60 s silent and with each voice, slider and guess figures re-derived by a month-by-month ledger rather than `figures.ts`, cast names, Money Map cells and series ids resolving, and a drawing-cost budget (animated pieces per scene, 30; per beat, 30; counted by `sceneCost`).
- **Known findings** are listed, one line and a reason each, in `lib/reels/qa-allowlist.ts`; only errors can be listed, warnings are always printed. Fix the content, then delete the line.
