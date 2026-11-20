# 2026-11-09: SML required hardest part: tracks and tasks

The 9 rows still pending in `TRACKER.md`. Each is hard because it needs real data, real people or a founder choice. Each track lists what only the founder can give (BLOCK) and what can be built now so the real input drops straight in (BUILD). Status: TODO / DOING / DONE / BLOCKED.

## Track 1: Ranker that learns from usage (G2)
| ID | Task | Status |
|---|---|---|
| T1.1 | Offline replay harness | DONE already (LT3, `tools/pulse/replay.py`, IPS/SNIPS/replay, safety net) |
| T1.2 | Gate for a learned ranker | DONE already (written in replay.py, not met by anything) |
| T1.3 | Synthetic-log tests | DONE already (`tests/test_pulse_replay.py`) |
| T1.5 | Flagged default-off epsilon-greedy over the rule top-K that logs propensity | DONE: `js/sml/pulse-explore.js` (v1.0) + wiring in `js/arya-sidebar-panel.js`, reset key added in `js/sml/report.js`, `tests/js/sml-pulse-explore.test.js` (6; sml JS total 140 pass). Flags: `finos_pulse_explore_on` AND `finos_pulse_counters_on`, key `finos_pulse_explore`, cap 400 rows (gate needs 1,000, so the log must be exported in batches). A 400-row synthetic log loads in `replay.py --log`. browser-verified (see TRACKER Q6; a preload bug was found and fixed); cache `?v=` helpers 11, panel 13 |
| T1.4 | BLOCK: real opt-in usage logs from people | BLOCKED |

## Track 2: Real categoriser numbers (I3-I6)
| ID | Task | Status |
|---|---|---|
| T2.1 | One-command categoriser run | DONE already (LT4/I1: `tools/categoriser/validate_rows.py`, `categoriser/harness.py`, Gate C) |
| T2.2 | Redaction checker | DONE already (`validate_rows.py` rejects phones, emails, UPI, PAN, Aadhaar-like, 5+ digit runs, dates, ids) |
| T2.3 | BLOCK: >= 1,000 redacted rows from several people | BLOCKED |

## Track 3: Router beyond note level (C11, C12, E7)
| ID | Task | Status |
|---|---|---|
| T3.1 | Consented-message review tool | DONE already (K1 capture, L1 redacted export, LT2 `tools/review/router_review.html`) |
| T3.2 | Steer/block decision table | DONE: `training/operating_points.py`, `tests/test_operating_points.py`, output `eval/router_operating_points_0.5.1.json`. Finding: today 0.5.1 gives recall 0.980 / FA 4.04% on test_v8 at thr 0.35, not the recorded 0.9886 / 4.85%; cause NOT the TF-IDF export (T3.4) |
| T3.4 | Explain the 0.5.1 difference | DONE (finding): stored threshold is 0.35 and TF-IDF export is not the cause; accuracy 0.9563 vs 0.9574 recorded (about 1 row) so class predictions are almost identical. The guard numbers today at thr 0.30 (347/351, 24/495 false alarms) equal the recorded numbers at 0.35, i.e. the live risk mass is about one grid step (~0.05) lower than when recorded. The router embeds with Ollama `mxbai-embed-large`, so the likely cause is a changed embedding build; NOT proven (old vectors were not kept). Nothing changed: threshold stays 0.35 for the founder to decide (0.30 would restore the recorded operating point: recall 0.989, 4.9% false alarm, 470 harmless refused per 10k) |
| T3.3 | BLOCK: real consented messages; founder picks the accepted false-alarm rate | PARTIAL: public FABRIC questions scanned as an outside check (Q11, unlabelled); real consented messages still needed |

## Track 4: Verifier gate (D9)
| ID | Task | Status |
|---|---|---|
| T4.1 | DONE (provisional): 959 sub-agent labels accepted 2026-11-08, verdict NO-GO | DONE |
| T4.2 | BLOCK: founder labels on a sample, to re-run `score_gate.py` | BLOCKED |

## Track 5: On-device encoder (C13)
| ID | Task | Status |
|---|---|---|
| T5.1 | Size sheet for candidate encoders | DONE: `eval/encoder_budget_2026-11-09.md` (params from memory, unverified; no latency). Verdict: only ~118M multilingual models fit a phone (59-118 MB), needs a new head and sealed set |
| T5.2 | BLOCK: reference phones to measure | BLOCKED |

## Track 6: Merge and language check (M3, Q3)
| ID | Task | Status |
|---|---|---|
| T6.1 | HANDED OVER: two commit blocks and push commands given | DONE |
| T6.2 | BLOCK: founder merges PR #3 with a merge commit; native Hindi check of the steer line | PARTIAL: provisional sub-agent check done and wording fixed (Q10); native check still open |

## Order of work
All BUILD tasks are done; only BLOCK items remain (T1.4, T2.3, T3.3, T4.2, T5.2, T6.2).
