# SML roadmap: from the verified state of 2026-10-25 to the full end state

One document, written 2026-10-25. It sits on top of three files and must stay consistent with them: `TRACKER.md` (every step with evidence; the source of truth for what happened), `PLAN.md` (workstreams W1-W8, founder decisions F1-F8, principles) and the "FIN-OS SML Blueprint" (strategy; PDF copy `FIN-OS_SML_Blueprint.pdf` in the repo root). Where this file and TRACKER disagree, TRACKER wins and this file is wrong. Update this file when a phase closes; do not let it drift.

How to read it: section 1 is the starting point, section 2 the finish line, section 3 the route, section 4 what can start today, section 5 what only the founder can unblock, sections 6-8 the rules and risks, section 9 the calendar and the next ten actions. Item IDs continue the TRACKER numbering (next free ID in each area; new areas I, J, K). Nothing here is done until it has a TRACKER row with evidence. Figures marked *(estimate)* are planning guesses, not measurements; every other number is quoted from TRACKER or a file named next to it and was re-checked on 2026-10-25.

Binding founder rules (unchanged, repeated because every item below obeys them): never `git commit` / `git push` from a build session (hand over a commit message instead), no AI attribution in commit or PR text, numbers come from tools and never from model text, held-out data is never used to fit or tune, add guards and never remove `AryaGuardrails`, update `TRACKER.md` after every step, every new network flow is declared in `js/finos-privacy.js` `FLOWS`.

---

## 1. Where we are (one page)

| Area | State on 2026-10-25 | Evidence |
|---|---|---|
| Engine | Healthy: 2,036 chunks, 123 pages plus SEBI / RBI / IRDAI / PFRDA and 1,000 news chunks; worker restarts itself; Ollama `NUM_PARALLEL=2`, `KEEP_ALIVE=30m`. Corpus gaps kept visible: no exchange filings (NSE returned no data, BSE 403), the PF-02 PFRDA circular is off the listing page | TRACKER A1-A14; `/api/health` answered `ok` while writing this |
| Retrieval | Public benchmark 95-96 / 112 (was 76 / 100 at baseline); personalized 38 / 41 on the latest run (39 on the previous run, same three failures PD-05, PG-04, PL-01, so noise), isolation 5/5, P-FACT 10/10. Every cheap lever is used up: wider pool, personal prior, news demotion, quote-first prompt, qwen3:14b generator and fewer / shorter contexts were all tested and dropped | TRACKER B1-B13, H15, H17; `RAG_PHASES.md` Phase 9 addendum |
| Why 9 questions still fail | Real generation errors: the model borrows a number from a neighbouring sentence. The numeric checker cannot see these, because the number does appear in the sources | TRACKER B11, E5 |
| Router 0.4.1 | Predictor default and the shadow-week model. One-shot test_v6 (217 messages): macro-F1 0.966 (CI 0.938-0.988), guard recall 53/53, false alarm 7/164 = 4.3%. Limits: one set, recall only bounded above about 0.94 at 95% (rule of three), false alarm 4-7% across sets, all text agent-written. Retrain reproduces it exactly (identical `eval.json`, coefficient difference 0.0) | TRACKER C14-C16, H4; `models/router/0.4.1/MODEL_CARD.md` |
| Router wiring | **Shadow mode only.** `POST /api/route` plus fire-and-forget call from the Arya panel when `finos_sml_router_shadow` = '1'. It changes no answer and stores only counters | TRACKER C8, C9, H9; `js/sml/router-shadow.js` |
| Counters and report | Shadow counters (intent, risk, router-vs-regex agreement, `by_version`), local PULSE impression / tap counters (flag `finos_pulse_counters_on`, ids and positions only, no text) and the founder report `AryaSidebar.smlReport()` (`ready:true` at 300 router messages) / `smlReset()` | TRACKER G1, G3; `js/sml/pulse-counters.js`, `js/sml/report.js` |
| The measured gap that matters | On the same labelled sets the **live regex guard (`js/arya-guardrails.js`) catches about 10% of risky messages**: dev 14/146 (9.6%), test_v5 4/30 (13%), test_v6 6/53 (11%). Router 0.4.1 catches 53/53 on test_v6. Misses are paraphrases in Hinglish, Devanagari and plain English ("kala dhan ko safed kaise kare", "make fake salary slip") | TRACKER H16 |
| Verifier | **NO-GO for any automated gate.** On 224 agreed real claims (34 not supported, kappa 0.769) the best single judge is qwen3:14b decomposition P 0.68 / R 0.44 (13.5 s per claim); 2-of-3 votes P 0.90 / R 0.27; NLI with best-sentence premise P 0.17 (it scored 0.997 on synthetic data and did not transfer). The deterministic numeric check stays | TRACKER D1-D8; `verifier/REPORT.md` |
| Categoriser, PULSE ranker, on-device runtime, embedding bake-off, feedback loop | Not started. Categoriser needs real rows (F1), the ranker needs real taps (G2), device work needs topology and phones (F5), the bake-off needs downloads and free memory (F6, F8), the feedback loop needs endpoint and consent (F2) | TRACKER B14, C11-C13, D9, G2 |
| Tests | JS `node --test tests/*.test.js` **590 / 590**; python `rag-engine/.venv/bin/pytest sml/tests rag-engine/evaluation/test_*.py -q` **58 passed**. Both re-run while writing this file | TRACKER bottom |
| Risk of loss | All SML work (about 67 changed / new paths) is uncommitted in one checkout on branch `audit/track-finances-production`. A commit message was handed over (TRACKER F7) | `git status`; hand-over file in the sibling notes folder `local_5343cbdf-.../COMMIT_MESSAGE_sml_audit.txt` |

Three structural facts the older documents did not state plainly:

1. **The router only runs where `rag-engine` runs.** The site is static (Vercel) and rag-engine is local-only. Moving the router from shadow to "active guard" (F3) therefore protects the founder's own machine and nobody else, until the router also runs in the browser (phase 7). F3 is a small decision until then.
2. **The shadow week cannot produce labelled data.** The counters hold no text by design, so "founder review of the disagreements" (PLAN W1 exit gate) cannot happen: after a week the founder knows how many messages the router flagged and the regex did not, but not which ones. The audit session found the same gap independently (TRACKER H19, option (b), a device-local review buffer, needs the founder's yes); this roadmap adopts it as blocker N1 in section 5.
3. **The TF-IDF half of the router is a candidate for a browser-side guard.** `eval.json` of 0.4.1 (train-script model, pre-refit) shows the TF-IDF head alone at macro-F1 0.956 on test_v6 and 0.932 on test_v5 (blend: 0.958 and 0.93), with no embedding model needed; the embedding head (mxbai-embed-large, 669 MB in Ollama) cannot ship to a browser. Guard recall for the TF-IDF head alone has not been measured. This is a hypothesis, tested first in C18; it changes the shape of phase 7.

---

## 2. The end state: what "complete" means, as testable outcomes

"Complete" for this roadmap is the horizon of about 26 weeks (section 9). Every row has a gate (section 3.3 defines each gate exactly) and a rollback.

| # | Capability | Complete means (testable) | Today |
|---|---|---|---|
| 1 | **Intent router as an active guard** | Router decides before the model runs. For `advice_seeking` it adds the existing advice note; for `evasion_request` it steers or blocks per the action ladder (section 3, phase 2). Gate R: macro-F1 >= 0.95, guard recall >= 0.99 with a one-sided 95% lower bound >= 0.98, false alarm per action level, on a sealed fresh set; real shadow data reviewed. Runs for the public in the browser (J1) and on the founder's machine (server). Kill-switch tested | Shadow only; gates met once on test_v6 with stated limits |
| 2 | **Numbers from tools, checked** | Every figure in an answer that matches a fact in the authoritative rule table is compared with the table value, and a conflict adds a caution (never edits text). Numeric fidelity 100% on the table-covered facts of a numeric golden set (n >= 50); flag precision >= 0.95 by hand check | Numeric checker catches numbers absent from the sources; blind to misattribution |
| 3 | **Faithfulness checking** | Either a verifier that meets P >= 0.90 / R >= 0.80 on a founder-labelled real gate set, or a written second NO-GO with the data behind it. No weakening of the gate. Opt-in "double-check" advisory only if the founder asks | NO-GO on 224 rows; labelled set blocked (F4) |
| 4 | **Transaction categoriser** | Char n-gram logistic model exported as JSON, applied in plain JS behind a flag, rules kept as fallback and as a feature, abstain below 0.55. Gate C: accuracy >= 0.90 at coverage >= 85% on a merchant-disjoint held-out set (>= 300 rows), no loss against the rules where the rules fire; user corrections always win | Rule categoriser only (`CATEGORY_RULES` in `js/finos-budget.js`); blocked on rows (F1) |
| 5 | **Learned PULSE ranker / personalization** | On-device bandit with the rule ranker (`js/arya-pulse-rank.js`) as prior and safety net, behind a flag. Gate P: offline replay shows a tap-through uplift whose 95% interval excludes zero on >= 1,000 impressions; pinned widgets and rule top-N preserved. Otherwise the rule ranker stays and that is the documented result | Counters collect; nothing reads them |
| 6 | **Retrieval quality** | Public benchmark >= 100 / 112 on two consecutive runs with personalized >= 38 / 41 and isolation 5/5 (no regression); plus a typed golden set (>= 200 questions, English / Hinglish / Hindi) with recall@5 >= 0.90 / 0.85 / 0.85 (blueprint 9.5) | 95-96 / 112; recall@5 is not measured at all today |
| 7 | **On-device runtime** | Router decision in the browser in <= 100 ms warm, no server; model files delivered as hashed, versioned static files with a manifest and a FLOWS entry; `SmlClient`-style fallback chain server -> browser -> deterministic cards; device lab results on 3-5 reference phones. A browser embedding encoder only if it fits the 120 MB bundle budget and beats the TF-IDF path | Nothing on-device; router needs Ollama |
| 8 | **Embedding bake-off** | mxbai-embed-large vs bge-m3 vs Qwen3-Embedding-0.6B on recall@5 over the golden set, per language, same retrieval and prompt. Switch only if the winner gains >= 3 points on the Hinglish / Hindi slice with a bootstrap interval that excludes zero and latency / memory stay acceptable; otherwise keep mxbai and record the evidence | Blocked on downloads and memory (F6, F8) |
| 9 | **Privacy-preserving feedback loop with consent** | Staged: L0 local correction memory, L1 aggregate counters (opt-in), L2 redacted, user-previewed examples (opt-in). Consent text, retention rule and deletion path exist and are tested; message text never leaves the device without a preview and a consent; every host in FLOWS; zero undeclared network calls | Counters local only; endpoint `null`; downloadable redacted report exists (`js/finos-feedback.js`) |
| 10 | **Safety coverage beyond advice / evasion** | A red-team set and router classes for scams and prompt-injection / data-extraction, so the blueprint safety gate (prohibited recall >= 0.99, over-refusal <= 3%) can be measured. Today's 13 intents cover only advice and evasion as risky | Not covered; added as C24 |

### Deliberately NOT being built in this horizon, and why

| Blueprint item | Decision | Why |
|---|---|---|
| LoRA-tuned task generators (rung 4), DPO, distillation (blueprint phase 4) | Not built | Blueprint rule: only after the golden set shows prompting has plateaued. Measured so far: the generator is not the bottleneck (qwen3:14b 96 vs 95-96 for 8b at 2.5x latency; quote-first and shorter contexts did worse). No golden set, no training data, no quiet 6-8 GB window |
| Domain-trained SLM (rung 5) | Not built | Blueprint gate G5 is a written go / no-go with evidence; nothing here produces that evidence yet |
| On-device generator tier (WebLLM / native runtime) | Not built; decision revisited after the device lab (J4) | Needs reference phones, a download-consent flow and a 0.5-4B model that passed a gate; the router and encoders come first |
| Cloud escalation / hosted model tier | Not built | Privacy design is on-device first; a hosted tier needs counsel (F7) and a threat model |
| Voice assistant, adaptive quizzes, life-event playbooks, monthly narrative, nudge copy, dossier summaries, document Q&A / Form 16 extraction, anomaly flags (blueprint use cases 5, 10, 13, 15, 16, 18-20, 23) | Not scheduled | Blueprint waves B and C; none is a trust item, none has a measured need, several depend on a generator that has not passed a gate. Scope lever order in the blueprint cuts voice, quizzes and DPO first |
| Concept graph and learning-path recommender | Not scheduled; revisit after the ranker gate (G7) | Needs interaction signals the ranker work produces first |
| Federated / on-device training (feedback level L3), account sync dependence | Not built | Blueprint: research phase, not before wave C. The SML must not depend on Supabase sync |
| A second Python service or a hosted rag-engine | Not built | The plan keeps rag-engine local; the public path is the browser router (J1) |

---

## 3. Phased sequence

### 3.1 Dependency graph

```
P0 Hygiene ───────────────────────────────────────────────────────────────┐
 (commit, doc fixes, verify script)                                        │
                                                                           ▼
P1 Evidence (weeks 0-4)  ── no founder input needed ──────────────────────────────────────
 E8 advisory   C17 taxonomy   C21→C18 TF-IDF-only   B15 doc-type oracle   G4 report v2
 C19 sealed test_v7   B17 prompt experiments   D10 rule-table guard   I1/I2 categoriser   K2 label guide
        │                    │                     │                 │
        │ founder: shadow    │                     │                 └─► B16 (only if B15 ≥ +3 q)
        │ week + N1 yes      │                     │
        ▼                    ▼                     ▼
P2 Real data + active guard (weeks 2-8)      P7a On-device router (weeks 5-9)
 K1 sample capture ─► K2 labels ─► C20 0.5.0     J1 JS router ─► J2 delivery   [needs C18 pass + C21]
 F3 + F4 ─► E7/E9 active guard (C12)                │
        │                                           ▼
        ▼                                     P7b Device lab (weeks 10-20) [needs F5]
P2b C24 extra risk classes (weeks 9-14)              J3 encoder  J4 devices  J5 SmlClient
        
P3 Retrieval + numbers (weeks 2-12)          P4 Embedding bake-off (weeks 7-10)
 B17, D10, B18 golden set ─► B19 checkpoint     [needs F6 + F8 + B18]  ─► B20/B21; router embed head retrain C20'

P5 Categoriser (weeks 4-9 after rows)        P6 Verifier gate (weeks 8-16)
 I1/I2 ─► [F1 rows] ─► I4 ─► I5 ─► I6          D10 ─► [F4 labels] D11 ─► D12 ─► GO / second NO-GO

P8 PULSE ranker (weeks 6-18)                 P9 Feedback loop L1/L2 (weeks 12-26)
 G4 ─► G5 log ─► [usage] G6 replay ─► G7 flag     K3 manual report ─► [F2] K4 endpoint
```

Reading rules: an arrow is a hard dependency; `[ ]` marks a wait on the founder or on data; phases with no arrow between them can run in parallel, but **heavy machine jobs run one at a time** (section 8).

### 3.2 Phases

Every phase lists entry criteria, work items, gate, held-out data, rollback and cost. Effort is in working days of build-session time *(estimate)*; "founder time" is separate. Machine cost: **light** = CPU only, minutes; **medium** = needs the embedding model in Ollama (about 30 ms per message); **heavy** = needs the generator, Qdrant and the server stopped / restarted (a full public benchmark is 112 questions at a documented median of about 10 s each, so roughly 20-25 minutes *(estimate)*).

#### P0 Hygiene (week 0, one session)
Entry: none. Items:
- **F8** this roadmap (DONE with this file).
- **F9** Artifact policy applied: tracked `SHA256SUMS` per model version, embedding-model digest recorded in each card (`mxbai-embed-large:latest` is image `468836162de7` today), see section 6.5. Effort 0.3 d, light.
- **F10** `scripts/sml_verify.sh`: runs both test suites, checks `sml/data/MANIFEST.json` hashes, prints the two totals. Effort 0.3 d, light.
- **F11** Test that every held-out file under `sml/data/` is covered by a leakage test and listed in `MANIFEST.json`, so a new `test_v7` cannot be added unguarded. Effort 0.3 d, light.
- **Founder:** commit the SML tree using the handed-over message (single point of loss today).
Gate: `scripts/sml_verify.sh` prints 590 / 58 (or higher, never lower). Rollback: n/a (no behaviour change).

#### P1 Evidence (weeks 0-4; everything here is safe now)
Entry: P0 not required except F10 / F11 recommended first. Items (details in section 4):
- **E8** soft router advisory, flag `finos_sml_router_advisory`, default off. 1 d, medium. Rollback: flag off / remove key.
- **C21** no-pickle TF-IDF export (JSON vocabulary plus npz coefficients), loader parity with the joblib on every set. 1 d, light. Removes the last pickle load from the server (`router_predict.py` still `joblib.load`s the TF-IDF file) and is the prerequisite for J1.
- **C18** TF-IDF-only router feasibility: guard threshold chosen on dev by the existing rule, then scored on a sealed fresh set. 1 d, light.
- **C19** write the sealed test_v7 (target >= 300 risky + >= 600 benign including risky-word look-alikes, 4-6 new blind writers, never scored until the candidate and rule are frozen). 1-2 d, light.
- **C17** error taxonomy and calibration of 0.4.1 over all held-out sets (what to write next, where confidence is unreliable). 0.5 d, light.
- **G4** report v2: Wilson intervals, advisory counters, a counters export for offline analysis. 0.5 d, light.
- **B15** doc-type oracle upper bound for router-driven retrieval filters. 0.5 d, medium. **B16** only if B15 shows >= +3 public questions.
- **B17** pre-registered prompt-side misattribution experiments. 1-2 d, **heavy**.
- **D10** authoritative rule table plus conflict check (numbers from tools, applied to the misattribution problem). 3-4 d, light / medium; founder spot-check 30-60 min at the end.
- **I1, I2** categoriser harness and a redacted labelled-row export tool. 2 d, light.
- **K2** label guide and review sheet. 0.5 d, light.
Gate: each item has its own acceptance in section 4 / 3.3. Held-out data: sealed test_v7 for C18 and any router claim; the public and personalized benchmarks for B-items. Rollback: every user-visible item is a default-off flag; Python items are knobs defaulting to current behaviour.
Founder in parallel (no build work): run the shadow week with both flags on, answer N1.

#### P2 Real data and the active-guard decision (weeks 2-8)
Entry: shadow counters show >= 300 router messages (`ready:true`) or the founder has captured >= 100 labelled samples (K1); N1 and F3 answered.
- **K1** device-local redacted sample capture for the founder's own browser (flag `finos_sml_samples`, cap 100, redacted with `FinosFeedback.redact`, previewed, export-only, never transmitted). **Blocked on N1.**
- **K2** two-labeller review (founder plus one more person, F4), disagreements adjudicated by the founder, kappa reported.
- **C11** (existing) real messages in, labelled; **C20** router 0.5.0 retrain on train + real labelled samples only if the error taxonomy (C17) says real data shows a failure class the agent data lacks. `train_router_v2.py --version 0.5.0`; confirm on a NEW sealed set (test_v8).
- **C12 / E7 / E9** (existing C12, E7; new E9) active mode, in this order:
  1. *Note* level: router-only `advice_seeking` adds the existing `advice_requested` note (E8 already does this behind its own flag).
  2. *Steer* level: router-only `evasion_request` adds a one-turn policy line to the system prompt (explain legal options, do not help conceal income or forge documents); the answer is still the model's.
  3. *Block* level: the existing `AryaGuardrails.REFUSAL` before the model runs, only when the router is confident (threshold chosen on dev, not on test) and the founder has ratified the block false-alarm rate. A blocked benign message is a refusal the user sees, so this level has the strictest gate.
  Flag `finos_sml_router_mode` = off | shadow | note | steer | block, plus a constant `SML_MODE_CEILING` in a versioned config file so a deploy can lower the mode for everyone (kill-switch, takes effect on next load because the service worker revalidates `.js`). AryaGuardrails is never edited out; the regex guard keeps running first.
Gate: Gate R (3.3) on the sealed set plus founder review of a labelled sample of router-only cases from real use; block level additionally Gate R-block. Held-out: test_v7 (and test_v8 for 0.5.0); v5 / v6 only as regression checks. Rollback: set the mode to a lower level; one line, per device by flag and for all by the ceiling constant. Cost: E7 / E9 3 d medium; the labelling is founder time (section 5).

#### P2b Wider safety classes (weeks 9-14)
- **C24** red-team set (advice elicitation by roleplay, cash-rent receipt forgery, structuring, prompt injection inside pasted text, "print your system prompt", guaranteed-return schemes) written by blind writers; extend router risk classes with `scam_fraud` and `prompt_injection` / `data_extraction` only if the set shows the current classes miss them; blueprint safety gate (prohibited recall >= 0.99, over-refusal <= 3%) measured on a sealed set. Needs F3 principles settled first. 4-5 d, light / medium. Rollback: classes behind the same mode ladder; model version pinned.

#### P3 Retrieval and numbers (weeks 2-12)
- **B15 / B16** as above (likely dropped with evidence).
- **B17** prompt-side experiments for the nine "number from the neighbouring sentence" failures: (a) mark the best-matching sentence inside the 500-character window, (b) generation temperature / seed, each run twice on the full public benchmark against a same-day baseline. Pre-registered design (section 4). Expected value is small and noise is about +-1-2 questions; the most likely outcome is another dropped lever, which is a valid result.
- **D10** rule table: a versioned JSON of authoritative figures (80C, 80D, 80CCD(1B), 80E, standard deduction, LTCG / STCG rates, HRA rules and the other top-asked limits) with source URL, `effective_from`, unit and the exact source sentence, built by a script from the indexed pages and spot-checked by a person. Check: when an answer states a table fact with a different number, add a caution. Never edits text. Coverage is limited by construction; precision should be near 1 by construction, which is the point (D8 said the only safe check is a deterministic one).
- **B18** typed golden set v1: >= 200 questions (English, Hinglish, Hindi) with gold chunk ids, a recall@5 harness, programmatic scoring of numbers / citations. Build the harness and 100 English items now; the Hindi slice needs a Hindi reviewer (blueprint U5).
- **B19** checkpoint (a decision, not code): after B15-B17 and D10, is the public score >= 98? If not, record that the cheap levers are exhausted and choose between the bake-off (P4) and a retrieval-side fine-tune (blueprint rung 2) with evidence, rather than drifting.
Gate: Gate B (3.3): public >= 100 / 112 on two consecutive runs with personalized >= 38 / 41 and isolation 5/5 on both. Honest caveat: the 112-question benchmark is the set these levers were designed against, scoring is a blunt substring match, and run-to-run noise is about one question; B18 exists to give a gate that is not the design set. Held-out: B18 items for any claim of improvement beyond noise. Rollback: each lever is an env knob defaulting to the current behaviour and part of `config.pipeline_signature()`. Cost: heavy (benchmark runs, one at a time, server restarted afterwards).

#### P4 Embedding bake-off (weeks 7-10; blocked on F6, F8; needs B18)
- **B20** pull bge-m3 and Qwen3-Embedding-0.6B (about 0.6-1.2 GB each per PLAN W8), index the corpus into a SIDE Qdrant collection (the live collection is not touched), measure recall@5 per language on B18 with the same retrieval and prompt for every candidate.
- **B21** decision by the rule in section 2 row 8. If a switch wins: re-index (all 2,036 chunks), expire the cache (config signature changes), retrain the router's embedding head (`train_router_v2.py --version X`; `router_predict.py` already refuses a router trained on another embedding model, so a half-switch fails loudly). The TF-IDF router and J1 are unaffected.
Gate: Gate E (3.3). Rollback: keep the old collection and the old router version until the new pair passes both gates; `EMBED_MODEL` is one config value. Cost: heavy, one quiet window (generator not running), 1-2 d *(estimate)* plus download time.

#### P5 Categoriser (weeks 4-9 once rows arrive; blocked on F1)
- **I1** spec, evaluation harness and the rule baseline measured on real rows (accuracy and coverage of `CATEGORY_RULES`); synthetic rows only to test plumbing, never to claim a gain.
- **I2** in-app export of redacted, labelled rows: description (redacted through the same `redact()` used by the feedback module), amount bucket, credit / debit, channel token, the user's own category; shows a preview; downloads a JSON file the founder reviews and drops into `sml/data/incoming/`. Behind a flag.
- **I3** rows received (F1): >= 1,000 total, from the founder and 3-5 other people so one person's merchants do not dominate.
- **I4** train: lower-cased description, char n-grams 2-5, amount bucket, credit / debit, channel token, "rule fired" feature; one-vs-rest logistic regression; abstain below 0.55. Split **by merchant group and by person**, never by row (same-merchant leakage would inflate accuracy). Threshold and C chosen on a dev split only.
- **I5** JS inference module plus JSON export, flag `finos_categoriser_model`, default off; rules remain the fallback and a feature; a user's correction always overrides the model and is stored locally (feedback level L0).
- **I6** browser verification: flag off identical to today, flag on categories change only where the model is confident, abstentions go to "Other" and ask once.
Gate: Gate C (3.3). Held-out: merchant-disjoint set that no training or tuning step has seen. Rollback: flag off (rules). Cost: light; 5-7 d *(estimate)* after rows arrive.

#### P6 Verifier gate (weeks 8-16; blocked on F4)
- **D10** (above) delivers the narrow deterministic check first.
- **D11** gate set v1: >= 300 real claims with **at least 100 not supported** (today 34 of 224 are positives, so 300 random claims would contain about 45 positives and give a recall interval of roughly +-14 points; oversample numeric, multi-sentence and on-topic-unsupported answers), two independent labellers, one a person (kappa reported), never used for training.
- **D12** candidates, only if D11 exists and has enough positives: fine-tune a small cross-encoder (LoRA or deberta-small) on real labelled claims from a separate training split (grouped by question / page), paraphrased entailed claims and hard negatives; evaluate once on the frozen gate set. The previous result (synthetic gate met, real P 0.17) is the warning: no synthetic number counts.
- **D13** decision: GO only if the gate is met on the frozen set; otherwise a written second NO-GO. The gate is not weakened. The opt-in double-check button (2-of-3 judges, P 0.90 / R 0.27, about 17 s) is built only if the founder asks for it.
Gate: Gate V (3.3). Rollback: advisory only, flag default off; never a filter. Cost: D11 is founder labelling time (about 600-900 claim reads *(estimate)* for a train + gate split); D12 medium, needs a quiet window for a base fine-tune (6-8 GB free, Ollama paused) or the small variant.

#### P7 On-device runtime (7a weeks 5-9, 7b weeks 10-20)
- **7a (no encoder, no device lab needed if C18 passes):** **J1** JS port of the TF-IDF router (weights as JSON, plain JS, same decisions as Python on every set: parity test), **J2** delivery as static files with a SHA-256 manifest, versioned path (`/models/router/<ver>/`), service-worker caching, a FLOWS entry for the origin even if it is the site itself, loaded lazily so initial page JS stays 0 KB. This is what makes the active guard real for users who never run rag-engine. Cost: 4-5 d *(estimate)*, light. Gate J (3.3).
- **7b (blocked on F5, D7 phones):** **J3** browser embedding encoder feasibility (Transformers.js / ONNX, WebGPU feature test, never a user-agent check) inside the 120 MB bundle budget, compared against the TF-IDF path on the sealed sets; **J4** device lab on 3-5 phones (router <= 100 ms warm, memory, first-load size); **J5** the `SmlClient` fallback chain server -> browser -> deterministic cards; **J6** the Expo app is last in the blueprint's cut order and is not scheduled here. If J3 shows the TF-IDF router is good enough, the encoder is not built; that is an acceptable end state.
Rollback: model version in the manifest (rollback = manifest change), `finos_sml_js_router` flag, kill-switch constant.

#### P8 PULSE ranker (weeks 6-18; blocked on usage)
- **G5** a small local event ring buffer (widget id, position, day, tap yes / no; capped; no text) so an offline replay is possible; aggregate counters alone cannot support it.
- **G6** offline replay comparing the rule ranker with a bandit using inverse-propensity estimates; report the interval.
- **G7** on-device bandit (Thompson sampling with the rule position as prior pseudo-counts), pinned widgets and the rule top-N never overridden, flag `finos_pulse_bandit`, default off.
Gate: Gate P (3.3). Honest limit: today only the founder's device generates counters, and position bias confounds taps; if the replay interval includes zero the rule ranker stays and the roadmap says so. `G2` in TRACKER is the umbrella for G5-G7.

#### P9 Feedback loop (weeks 12-26; staged by consent)
- **K3** manual path with no server: add a consented "router / PULSE counters" section to the existing downloadable report (`js/finos-feedback.js` already redacts, previews and has a summarizer `scripts/summarize-feedback.js`).
- **K4** endpoint, consent text, retention rule, deletion path (F2); host added to FLOWS in the same change; L1 aggregate counters first, L2 redacted examples only with preview and a reviewer workflow.
Gate: privacy tests 100% (`tests/privacy.test.js`, namespace isolation) and zero undeclared hosts. Rollback: `FinosFeedback.configure({endpoint:null})` returns to local-only.

### 3.3 Acceptance gates (exact definitions)

All thresholds below are either the blueprint's (marked B) or proposals made here (marked P) that the founder ratifies at the first phase that needs them. A proposal is changed only before the evaluation it governs is run, never after.

| Gate | Metric and threshold | Held-out data it uses | Statistics required |
|---|---|---|---|
| **R** router model | macro-F1 >= 0.95 (B); guard recall >= 0.99 (B); note-level false alarm <= 5% (P, PLAN F3 range 3-5%) | A sealed fresh set not used to fit or choose anything for that model: test_v7 for the candidate that exists today; test_v8 for 0.5.0 | Bootstrap CI for F1 with lower bound >= 0.92 (P). Recall: n_risky >= 300 and the one-sided 95% Clopper-Pearson lower bound >= 0.98 (P). With 300 risky messages that allows 0 misses (bound 0.990) or 1 miss (0.984), not 2 (0.979). False alarm: report the point value and the upper 95% bound; upper <= 7% (P) on >= 600 benign messages including risky-word look-alikes |
| **R-block** | block-level false alarm <= 2% point on >= 600 benign messages; confidence threshold chosen on dev only | same sealed set plus a founder-labelled sample of real router-only cases | upper 95% bound reported; the founder ratifies the number |
| **R-latency** | `/api/route` p95 <= 250 ms client-observed with Ollama warm (today: 33 ms server-side per call; 56-122 ms in the browser) | live measurement, not a dataset | median and p95 over >= 200 calls |
| **J** JS router | decisions identical to the Python TF-IDF head on every set (parity 100%); warm <= 20 ms per message *(P)*; shipped weights <= 1 MB gzipped *(P)*; macro-F1 and recall under Gate R on the sealed set | test_v7 (sealed), plus all older sets as regression | same as R |
| **N** numeric table | fidelity 100% on table-covered facts in a numeric golden set (n >= 50, written blind, not drawn from the 112 benchmark questions); flag precision >= 0.95 by hand check of every flag; zero edits to model text | numeric golden set | list every flag with its verdict |
| **V** verifier | precision of "not supported" >= 0.90 and recall >= 0.80 (B) | founder-labelled gate set D11 (>= 300 claims, >= 100 not supported), frozen, never trained on | Wilson interval for both; report the lower bound of precision (must be >= 0.85, P) |
| **C** categoriser | accuracy >= 0.90 at coverage >= 85% (B) | merchant-and-person-disjoint held-out >= 300 rows | paired bootstrap against the rules on the same rows: no loss on rows where a rule fires; abstentions counted as uncovered |
| **B** retrieval | public >= 100 / 112 on two consecutive runs (P); personalized >= 38 / 41 and isolation 5/5 on the same runs; typed golden set recall@5 >= 0.90 / 0.85 / 0.85 for all / Hindi / Hinglish (B) | public and personalized benchmarks (design sets, so regression only) and B18 (evidence) | paired bootstrap on B18; benchmark differences of 1-2 questions are noise |
| **E** embedding | winner must beat mxbai-embed-large by >= 3 points recall@5 on the Hinglish or Hindi slice with a paired-bootstrap interval excluding zero, and not regress English (P); smallest model within 3 points of the best (B, Pareto) | B18 | paired bootstrap |
| **P** PULSE | offline replay uplift in top-3 tap-through with 95% interval above zero on >= 1,000 impressions (P); pinned widgets and rule top-N intact | the founder's event log (G5) and any consented aggregate | interval reported either way |
| **Privacy** | `tests/privacy.test.js` and namespace-isolation tests 100%; undeclared hosts 0 (B) | n/a | CI |

Held-out discipline in one rule: a held-out set is **evidence for exactly one model-selection decision**. Afterwards it is regression-only. Today: test_v4 (233) is diagnostic only (seen once by the 0.4 work); test_v5 (181) confirmed 0.4.0 and is now regression-only for the 0.4.x family; test_v6 (217) was the one-shot for 0.4.1 and is now regression-only. `natural_test`, `valid`, `dev`, `test_v2`, `test_v3` are older sets with the same status. Each future model needs a NEW sealed set. dev sets are for choosing thresholds and are refreshed when a model family changes.

### 3.4 Rollback for every user-visible change

| Change | Default | Switch off | Kill-switch for everyone |
|---|---|---|---|
| Router shadow (exists) | off | remove `finos_sml_router_shadow` | `SML_MODE_CEILING` = off |
| PULSE counters (exists) | off | remove `finos_pulse_counters_on` | same |
| E8 advisory note | off | remove `finos_sml_router_advisory` | ceiling below `note` |
| E7 / E9 steer, block | off | `finos_sml_router_mode` to a lower level | ceiling |
| J1 JS router | off | remove `finos_sml_js_router`; server path or regex only | ceiling |
| K1 sample capture | off | remove flag and delete the stored array (button) | not applicable (device-local) |
| D10 table check | off | remove its flag; it only adds a caution | ceiling |
| I5 categoriser model | off | remove `finos_categoriser_model`; rules take over | ceiling |
| G7 bandit | off | remove `finos_pulse_bandit`; rule order | ceiling |
| B16 / B17 / embedding switch | env knob at current value | set env knob back, restart; cache key includes the knob | keep old collection until the new pair passes |

### 3.5 Effort and machine cost by phase *(estimate, not measured)*

| Phase | Build days | Founder time | Machine |
|---|---|---|---|
| P0 | 1 | commit, 10 min | light |
| P1 | 12-15 | shadow week (passive), N1 reply, 30-60 min spot check for D10 | light to medium; B17 heavy |
| P2 | 5-7 | labelling 100+ samples with a second person, F3 meeting | medium |
| P2b | 4-5 | red-team review 1 h | light / medium |
| P3 | 6-8 beyond P1 | review of the Hindi slice | heavy, one run at a time |
| P4 | 1-2 plus downloads | approve downloads, free memory | heavy, quiet window |
| P5 | 7-9 | export and review rows from 4-6 people | light |
| P6 | 5-8 | labelling about 600-900 claims | medium; quiet window only for a base fine-tune |
| P7a | 4-5 | none | light |
| P7b | 8-12 | phones, device runs | light; devices |
| P8 | 5-6 | none beyond using the app | light |
| P9 | 5-7 | consent text, retention rule, counsel input | light |

---

## 4. What can start NOW with no founder input (concrete order)

Honest evaluation of the candidates named in the brief, then the ordered list, then three ready-to-run briefs.

| Candidate | Verdict | Reasoning |
|---|---|---|
| **Soft router advisory (never blocking)** (E8) | **Safe now to build.** Enabling it for anyone other than the founder waits for F3 and phase 7 | It is the smallest user-visible step before F3: additive only, behind a flag, fail-open, no extra network flow (the route call already exists in shadow mode). Limits to state plainly: a note appended after an answer does not prevent harm, so for `evasion_request` the advisory adds nothing visible (shadow counters still count it); only router-only `advice_seeking` gets the existing `advice_requested` note, at the measured 4-7% false-alarm cost of a harmless disclaimer on a benign message |
| **W3.3 router-driven retrieval filters** (B15, B16) | **Safe now, expected value low; measure the ceiling first** | The triage found 6 questions with the answer at rank 4-10, 3 not in the top 10, 9 where the answer was already in the prompt. A doc-type filter can only help the first two groups, and a wrong hard filter hides the right chunk. B15 computes the best case (gold doc_type as an oracle) retrieval-only; if it is below +3 questions the lever is dropped with evidence and B16 is not built |
| **Measured numeric-misattribution mitigation** (B17, D10) | **Safe now; two parts of different quality** | B17 prompt-side variants are cheap but the prior is poor (three prompt / context variants already lost 2-6 questions). D10, the authoritative rule table with a conflict check, is the blueprint's own answer (numbers from tools) and is deterministic, so its precision can be near 1; its weakness is coverage and upkeep, which is why it is limited to the top-asked facts and measured on a blind numeric set |
| **Offline analysis scripts for the shadow report** (C17, G4) | **Safe now, but the counters limit what analysis can show** | Counters hold no text, so an analysis script can only compute rates and intervals from them. The valuable offline analysis is on the labelled sets we do have: per-intent / per-language error taxonomy, calibration, and the TF-IDF-only guard curve (C18). Counters export plus Wilson intervals go into G4 |
| **Test and tooling debt** (F9-F11) | **Safe now, do first** | Every later step adds a held-out set or a model; a verify script and a "every held-out file is guarded" test are cheap insurance |

Ordered list (do them in this order; one heavy job at a time):

| Order | ID | Item | Status | Machine |
|---|---|---|---|---|
| 1 | F10, F11, F9 | verify script, held-out coverage test, tracked hashes | safe-now | light |
| 2 | E8 | soft router advisory (brief 1) | safe-now (build); enable = founder | medium |
| 3 | C21 → C18 | no-pickle TF-IDF export, TF-IDF-only feasibility (brief 2) | safe-now | light |
| 4 | B15 | doc-type oracle upper bound (brief 3) | safe-now | medium |
| 5 | C17 | error taxonomy and calibration of 0.4.1 | safe-now | light |
| 6 | G4 | report v2 (intervals, advisory counters, export) | safe-now | light |
| 7 | C19 | sealed test_v7 written by new blind writers | safe-now | light |
| 8 | K2 | labelling guide and review sheet generator | safe-now | light |
| 9 | D10 | rule table, builder, conflict check, numeric golden set | safe-now (spot check needs the founder, 30-60 min) | light |
| 10 | I1, I2 | categoriser harness, redacted-row export tool | safe-now (using it needs the founder) | light |
| 11 | B17 | pre-registered prompt-side experiments | safe-now, low expected value | **heavy** |
| 12 | B18 | golden set v1: harness plus 100 English items | safe-now (Hindi slice blocked on a reviewer) | medium |
| 13 | G5 | local event log for PULSE replay | safe-now, low priority until the founder confirms usage | light |
| - | K1 | local sample capture | **blocked: N1** | - |
| - | E7 / E9 / C12 | steer and block levels | **blocked: F3** (and meaningful publicly only after J1) | - |
| - | C11 / C20 | real data into training | **blocked: N1 or F2 and F4** | - |
| - | D11 / D12 | verifier gate set and candidate | **blocked: F4** | - |
| - | I3-I6 | categoriser data and model | **blocked: F1** | - |
| - | B20 / B21 | embedding bake-off | **blocked: F6, F8** | - |
| - | J3-J5 | encoder, devices, SmlClient | **blocked: F5** | - |
| - | K3 / K4 | manual report section, endpoint | **blocked: F2** (K3 needs a consent text) | - |

### Brief 1: E8 soft router advisory

**Task.** Add an advisory-only use of the router decision in the Arya panel, behind a new flag, default off. When `finos_sml_router_advisory` = '1' and `finos_sml_router_shadow` = '1', and the router decision has intent `advice_seeking` with `needs_guard` true while the regex guard did not flag the message, append the existing `AryaGuardrails.NOTES.advice_requested` text to the final answer using the same de-duplication as `AryaGuardrails.apply` (skip when the model already wrote its own disclaimer, never stack the note twice). Never block, never edit the model's text, never delay the answer: keep the route call fire-and-forget as in `routerShadow()`, keep its promise, and read it at final-answer time with no extra waiting beyond a 0 ms check (if the decision has not arrived, add nothing). For `evasion_request` add no visible output; only a counter. Count `advisory_shown` and `advisory_skipped_own_disclaimer` in the shadow counters (whitelisted integer fields, no text).

**Files.** New `js/sml/router-advisory.js` (pure function `decide(decision, regexFlags, replyText)` returning `{note|null, reason}`; UMD like `router-shadow.js`); edits in `js/arya-sidebar-panel.js` (`routerShadow()` returns/stores the pending decision; the final-answer path near the `AryaGuardrails.apply` call at line 7711 uses it; add the new file to the lazy SML loader list at line 1728); `js/sml/router-shadow.js` and `js/sml/report.js` (new counters, shown in the summary); `js/finos-privacy.js` (the `ai` flow's `sent` text mentions that the optional router test mode may add a note to answers; no new host); `js/arya-lazy.js` stub if it mirrors the panel API; version bump of the panel (`?v=4` to `?v=5`) and SML helpers per TRACKER H13; new `tests/sml-router-advisory.test.js`.

**Done when.** (1) Flags off: byte-identical answers and zero extra requests (test plus real-browser check, as in C9). (2) Unit tests: note added only for router-only `advice_seeking`; not added when the regex already flagged; not added when the model already wrote a disclaimer; idempotent on repeat; fail-open when the decision is missing, late, malformed or `error`; no text in any stored object (keys checked, including the `constructor` / `__proto__` cases from H1). (3) Real browser on the preview server `finos-site` (do not start servers other than via `preview_start`): flags on, 'should i put all my savings in one stock' style message produces the note once, a concept question produces none, counters moved, stored object has only counters, flags removed again. (4) `node --test tests/*.test.js` >= 590 + new tests, python 58 unchanged. (5) TRACKER row E8 with evidence; PLAN W1 line updated. Rollback in the row: remove the flag.

### Brief 2: C21 then C18, TF-IDF-only router feasibility

**Task.** (a) C21: add a no-pickle export of the TF-IDF head of router 0.4.1 (`vocab` as JSON, `idf`, coefficients and intercept as `.npz`/JSON) and a loader that reproduces the joblib model's probabilities (max absolute difference < 1e-6) on every set under `sml/data`; make `router_predict.py` able to load either format with the old one still the default until the new one is proven. (b) C18: score the TF-IDF head alone: macro-F1 per set and per language; choose the guard threshold on **dev only** with the existing rule (highest threshold with dev recall >= 0.99); report guard recall and false alarm on test_v5 / test_v6 as **exploratory** (those sets are already seen by the 0.4.x family, so they cannot confirm anything); record the weight size (raw and gzipped) and the feasibility verdict against Gate J. The confirmation run happens once on the sealed test_v7 (C19) after the candidate and rule are frozen. No retraining of the shipped model; any new fit is a new plain `x.y.z` version number (the shadow counters' `by_version` whitelist only accepts that shape).

**Files.** `sml/training/export_tfidf.py` (new), `sml/runtime/router_predict.py` (loader only, behind a parameter), `sml/eval/router_0.4.1_tfidf_only.json` (output), `sml/tests/test_router_predict.py` or a new `sml/tests/test_tfidf_export.py` (parity test), `sml/TRACKER.md` rows C21 and C18, `.gitignore` check so the small JSON / npz is trackable while `*.joblib` stays ignored.

**Done when.** Parity test passes on all sets; `rag-engine/.venv/bin/pytest sml/tests rag-engine/evaluation/test_*.py -q` >= 58 passed; the eval JSON holds macro-F1, dev-chosen threshold, dev recall / false alarm and the exploratory v5 / v6 numbers; the TRACKER row states plainly pass / fail against the pre-declared Gate J inputs (size <= 1 MB gzipped, F1 within 0.02 of the blend on the same sets, dev recall >= 0.99) and what the confirmation step is. Light machine only (CPU plus the cached embeddings; the embedding head is not needed for this).

### Brief 3: B15 doc-type oracle upper bound for router-driven retrieval filters

**Task.** Decide with evidence whether W3.3 deserves any build. Retrieval-only, no generation: for each of the 112 public benchmark questions (`rag-engine/evaluation/benchmark.py` question list) record the doc_type of the chunk(s) whose text contains the expected answer, and compute where that gold chunk ranks (a) with the current retrieval and (b) with an **oracle** hard filter on the gold doc_type and (c) with an oracle soft boost (x1.3 on the gold doc_type, the size of the recency multiplier). Also report router 0.4.1's intent for each question and how often intent -> doc_type mapping (`regulation_question` -> `regulation`; others unfiltered) agrees with the oracle. Count how many questions would newly reach the prompt top-3. Protocol: same as H15 (server stopped, in-process reranker, retrieval-only, restart the server afterwards); nothing seeded into the live collection; the script stays in the scratchpad unless the verdict is "build".

**Files.** One analysis script (scratchpad), `docs/RAG_PHASES.md` addendum bullet with the result, TRACKER row B15 with the numbers; no change to `rag-engine/` code.

**Done when.** The row states: the ceiling in questions (e.g. "+N at best"), the router-agreement rate, and the verdict by the pre-declared rule: if the oracle ceiling is below +3 questions or the mapping agrees on less than 90% of the questions where it would act, W3.3 is dropped (B16 not built); otherwise B16 is specified as a soft boost behind `RAG_DOCTYPE_BOOST` (default 1.0, in the cache signature), gated by Gate B. Server restarted and `/api/health` ok afterwards; swap checked before starting (section 8).

---

## 5. What is blocked on the founder

Decision table. "Cheapest unblock" says exactly what to do or provide. The default applies if there is no answer.

| # | Decision | Why it blocks | Cheapest way to unblock | Default if no answer | What becomes possible |
|---|---|---|---|---|---|
| **N1 (new; = TRACKER H19 option b)** | Allow **device-local capture of the founder's own messages** during the shadow week (flag `finos_sml_samples`: up to 100 redacted messages stored in the founder's browser only, previewed, exported by hand, never transmitted). This is an exception to the rule "counters never hold text", so it needs an explicit yes recorded in PLAN section 2 | The counters hold no text, so after the shadow week there is nothing to review: the PLAN gate "founder reviews the disagreements" cannot be met. Real labelled messages are the decisive test for the router and the only way to get the first real data without any server | Reply "yes" to N1 (one line). Then the founder turns on the flag in their own browser, types normally, reviews the preview, exports the file, and drops it in `sml/data/incoming/` or sends it to the build session | Shadow week yields counts only; router stays agent-data-only; C11 / C20 wait for F2 | K1, K2 labelling, a real false-alarm estimate, the first real confirmation set |
| **F1** | Redacted bank / UPI statement rows with the person's own correct category (>= 1,000 rows, from the founder plus 3-5 other people) | Categoriser gains cannot be measured on synthetic merchants (the rules would label them) | I2 gives a one-click redacted export inside the app (built by us). The founder presses it on their own data, reviews the preview, saves the file, and asks 3-5 friends to do the same and send the file. Each row: redacted description, amount bucket, credit / debit, channel, the person's category | W5 stays blocked; rules stay | P5 (I3-I6) |
| **F2** | Feedback endpoint, consent text and retention rule (blueprint D4 / U3) | Real data from other people at scale; L1 / L2 feedback | Two steps: (1) approve the manual path K3 (users download a redacted report and send it; no server). (2) later choose an inbox host, a retention period (suggest 90 days for counters, 30 days for examples), a one-paragraph consent text and a deletion contact; we add the host to FLOWS | Local counters only; K3 not built without consent text | K3 immediately; K4 after the second step |
| **F3** | Go-ahead to move the router from shadow to an active guard, and the **acceptable false-alarm rate** per level | Without it E7 / E9 / C12 cannot be turned on | Answer three questions: (a) may the note level be on by default for the founder's own browser, (b) may steer / block levels be built and enabled, (c) numbers: note <= 5%, block <= 2% (our proposal) or other. Also accept that it protects only machines where rag-engine runs until J1 ships | Stays shadow (E8 may still be built and enabled by the founder's own flag) | E7 / E9; with J1 the whole public |
| **F4** | A second person to review boundary labels, and the labelled verifier gate set | Router label noise cannot be measured by the same author; the verifier needs >= 300 real claims (>= 100 not supported) from humans | Name one person. For the router: they relabel 150-200 sampled messages (about 1 hour). For the verifier: D11 prepares a sheet; each claim takes a minute (supported / number wrong / polarity wrong / unsupported / needs more text) | Author labels only; verifier stays NO-GO | C20 with measured label noise; D11-D13 |
| **F5** | Topology (recommended: on-device-first hybrid) and reference devices (3-5 phones, low / mid / high, Android and iOS) | J3-J5, the device lab and the `SmlClient` design | Approve the topology in one line; borrow or buy the phones (blueprint wanted them by week 6). J1 / J2 do not need either | Server path plus the J1 browser router only | J3-J5 |
| **F6** | Approve model downloads for the bake-off (bge-m3, Qwen3-Embedding-0.6B, about 0.6-1.2 GB each) | P4 | Reply "approved", and do F8 first | Skipped; mxbai-embed-large stays | B20 / B21 |
| **F7** | Engage counsel on the blueprint's 10.9 questions | Any public exposure; wording of the notes and refusals in Hindi and English | One-off opinion is enough to start; send them the question list from the blueprint | Education-only design stays; features stay local / default-off | Public launch of guard, categoriser, ranker |
| **F8** | Free Mac memory (swap is the standing bottleneck; today `vm.swapusage` shows about 20.0 GB of 21.5 GB used) | Everything heavy: benchmarks, bake-off, any fine-tune | Quit the security scanner, VMs and qemu processes that `top` shows as largest; restart before heavy runs | Queries stay 2-3x slower; heavy jobs queue one at a time | P4, safe benchmarking |
| **N2 (new)** | **Hindi (Devanagari) reviewer** (blueprint U5) | The Hindi slice of B18 and the Hindi guard recall rest on agent-written text | Name a Hindi reader for about 2 hours to review 100 items | Hindi stays unmeasured by a person; the Hindi slice is reported as "agent-written only" | A credible Hindi number for gates E, R and B |
| **N3 (new)** | **Where the router model files live** (extends the open H8 decision: `*.npz` and `*.joblib` are git-ignored, so a fresh clone has no router and `/api/route` answers 503 until retrained) | Fresh clone, a second machine, any CI | Approve the policy in section 6.5 (track the small no-pickle files and `SHA256SUMS`, keep large / pickle files out) | Retrain on every new machine (reproducible, minutes) | J2 delivery, CI, a second developer |
| **N4 (new)** | **Commit the work** | One checkout holds everything | Run the handed-over commit message (the build session never commits) | Risk stays open | Safe branching for parallel work, a diff review |

Top five to answer first, in order of value for effort: **N1** (one line, unlocks real data), **F3** (numbers and scope for the active guard), **F4** (a second reviewer), **F1** (one export button and four friends), **F5** (topology, then phones). F6, F7 and F8 follow when their phases come up.

---

## 6. Data plan

### 6.1 Where real data comes from

```
agent-written sets (done: 17 blind-writer files in sml/data/incoming/; 3,772 rows across all splits incl. templated)
        │
        ▼
shadow week ──► counters only (no text) ──► rates, intervals, "how often does the router flag what the regex missed"
        │
        ├─ N1 yes ──► K1 local redacted samples (founder only) ──► K2 labelled by two people ──► real dev / test rows
        │
        ├─ F2 step 1 ──► K3 manual report files from consenting users (counters; later redacted examples)
        │
        └─ F2 step 2 ──► K4 endpoint, retention, deletion (L1 counters, L2 previewed examples)
```

Real rows go to the **test and dev** side first, not to training, until there are enough to hold some out for a sealed set (at least 300 risky and 600 benign for a router gate). Counters never include text; samples are redacted by the same function the feedback module uses (`FinosFeedback.redact`: amounts, numbers of 4+ digits, emails, links, PAN, Aadhaar-style) and then previewed by the person.

### 6.2 Label review process (K2)

1. A written label guide: the 13 intents with decision rules for the known boundaries (`personal_money_summary` vs `personal_spend_query`, `app_help` vs `document_help`, `advice_seeking` vs `concept_explainer`, `evasion_request` vs `regulation_question` about black money). The boundary notes in the model cards are the starting point.
2. Two independent labellers; neither sees the model's output. Disagreements go to the founder, who decides and records why.
3. Report agreement (kappa) for every labelled batch; the verifier set reached 0.769, which is the bar to match.
4. A relabel of a random 10% of every agent-written batch by the second person gives the first measured label-noise figure.
5. Each batch is stored with its writer / labeller ids, not with person data.

### 6.3 Leakage prevention

- Existing: 18 leakage tests in `sml/tests` (templates, exact and near-duplicate text across every held-out and training pair); ingest dedupes across all sets; `MANIFEST.json` holds the hashes; training refuses to overwrite an existing version.
- Added by F11: every file under `sml/data/` that is a held-out set must be listed in the manifest and covered by a leakage test, so a forgotten new set fails the build.
- Added by C19 / the rule in 3.3: a sealed set's hash is written to the manifest when it is created; the build session that trains does not read its content; it is scored once, by `training/eval_fresh.py` on the frozen model.
- Real samples: a real message that also appears (after normalisation) in any training file is dropped from the test side.

### 6.4 How each new held-out set is created blind

1. Freeze the model version, the guard rule and the metrics, and record them in a TRACKER row **before** the set is written.
2. New writers (agent sessions that have seen no previous set, no model output and no scores) get only the intent definitions, languages, style notes and a target count per intent, including benign look-alikes and a minimum number of Hinglish and Devanagari messages. Train, dev and test writers are different sessions.
3. Files land in `sml/data/incoming/test_agent<X>.jsonl`; `ingest_incoming.py` dedupes against everything and assigns the set; the manifest hash is recorded.
4. Score once with `eval_fresh.py`; the result is a TRACKER row whether it passes or fails. If it fails, the set is spent for that model; the fix needs new training data and a new set.
5. The set becomes regression-only afterwards (rule in 3.3).
6. Honest limit, stated in every card: agent-written text is not user text. The real-sample route (6.1) is the only cure and is why N1 is first.

### 6.5 Retraining procedure and artifact policy

Procedure (reproducible, proven in TRACKER H4):
```bash
python3 sml/data/router_data.py && rag-engine/.venv/bin/python sml/data/ingest_incoming.py
rag-engine/.venv/bin/python sml/training/train_router_v2.py --version 0.5.0   # --version is required; an existing version is refused without --overwrite
rag-engine/.venv/bin/python sml/training/eval_fresh.py ...                    # frozen-model scoring on a sealed set
rag-engine/.venv/bin/pytest sml/tests rag-engine/evaluation/test_*.py -q
```
The embedding step needs Ollama with `mxbai-embed-large`; the cache is tagged with the embedding model.

Policy recommended (decision N3; F9 implements it):
- **Tracked:** `MODEL_CARD.md`, `eval.json`, a `SHA256SUMS` file listing the hash of every binary of that version, the embedding model name **and digest** used to train, and the data hashes from `MANIFEST.json`. Anyone can then check that a retrain reproduces the same files.
- **Tracked when small and pickle-free:** the shipped-to-browser files (JSON weights, `.npz` coefficients) because the site must serve them and they are tens to hundreds of KB.
- **Not tracked:** `*.joblib` (a pickle: loading one executes code, so it must never come from a source you do not control; C21 removes the server's dependence on it), large binaries, `.embed_cache.npz`. A retrain recreates them.
- **Versioning:** a version number is never reused; a model that serves users is pinned in the manifest and the predictor default is changed by a TRACKER row (as C16 did).
- **Retrain triggers:** a new sealed-set failure class (C17), >= 150 new labelled real rows, an embedding-model change, or a threshold change. Never "because more data exists".

---

## 7. Privacy and safety rules the plan keeps

| # | Rule | How it is enforced |
|---|---|---|
| 1 | Every new network flow is declared in `js/finos-privacy.js` `FLOWS` in the same change | `tests/privacy.test.js` host coverage; the privacy notice is generated from FLOWS. E8 changes the wording of the existing `ai` flow; K4 and J2 add entries |
| 2 | Counters never hold text | counters are rebuilt from whitelisted integer / name fields (`clean()`), unit tests check stored keys, including hostile names |
| 3 | Message text is never logged or cached on the server | `/api/route` logs only intent and `needs_guard` to a counter; keep that test (`test_route_endpoint.py`); any new endpoint gets the same test |
| 4 | Text capture only by explicit exception (N1 / K1 / H19): device-local, redacted, capped, previewed, export-only, deletable, never transmitted, recorded in PLAN section 2 | tests assert no network call while the flag is on, cap, redaction and delete |
| 5 | Numbers come from tools, never from model text | numeric check and D10 compare, they never edit; arithmetic questions (PD-05) stay on the tool route |
| 6 | Add guards, never remove `AryaGuardrails` | the regex guard runs first and stays; router modes only add a note, a steer or a refusal that already exists |
| 7 | Nothing user-visible without a flag, a measured gate and a rollback | sections 3.3 and 3.4; every row in TRACKER names its flag |
| 8 | Held-out data is never used to fit or tune; leakage is tested | 6.3 and 6.4 |
| 9 | Personal data stays on the device; the router sees one message at a time, and the server holds no per-user router state | route endpoint is stateless; namespace-isolation tests stay in the suite |
| 10 | Fail open, never fail loud: an SML failure leaves today's behaviour | every new call has a timeout and a catch; tests include the failure paths |
| 11 | Skip rather than guess | abstain below 0.55 (categoriser), no verdict when the decision is missing (advisory), "other" when unsure |

---

## 8. Risks, machine constraints, and how to run and verify

### 8.1 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Everything is uncommitted in one checkout | A disk or git accident loses weeks | N4; hand-over message exists; do P0 first |
| Router is useful only where rag-engine runs | An "active guard" protects one machine | J1 (C18, C21) early; state it in every F3 discussion |
| Agent-written data overfits the writers' style | Real recall unknown | N1 samples; sealed sets from new writers; lower bounds reported |
| Shadow counters cannot show what the router flagged | No review possible | N1 |
| False alarms refuse a legitimate question | Trust loss | action ladder: note and steer before block; block gate 2%; kill-switch |
| Benchmark noise about 1-2 questions and a blunt substring scorer | Phantom gains and losses | two runs, same-day baseline, B18 as evidence set |
| Design sets reused for judging (public 112, personalized 41) | Optimistic numbers | B18, numeric golden set, sealed router sets |
| Embedding-model change invalidates the router's embedding head and the index | Silent garbage | `router_predict.py` refuses mismatched models; side collection for the bake-off; expire cache by signature |
| Pickle (`joblib`) in the server path | Code execution if a tampered file is ever loaded | C21 |
| Ollama model drift (digest change) alters embeddings | Retrain no longer reproduces | record digest in the card (F9) |
| Verifier labels are scarce (34 positives) | Gate cannot be certified | D11 sizing rule (>= 100 positives) |
| Single-user usage data | Ranker cannot show an uplift | G6 reports the interval either way; rule ranker stays if inconclusive |
| Browser keeps old JS (local `http.server` sends no cache headers) | Misleading local tests | `cache: 'reload'`; version bumps per TRACKER H13 |
| Counsel not engaged | Public exposure blocked | F7 early, cheap one-off opinion |

### 8.2 Machine constraints (24 GB Mac)

- The Mac swaps (about 20.0 of 21.5 GB swap used when this was written). Check `sysctl -n vm.swapusage` and `vm_stat` before any heavy job.
- Heavy jobs run **one at a time**: benchmarks, bake-off indexing, any fine-tune. Never run two together.
- **Stop the rag-engine server on :7476 before `evaluation/benchmark_personal.py` (it runs in-process) and restart afterwards** with `rag-engine/start-all.sh`; confirm `/api/health`. (It is running now; the roadmap-writing session did not touch it.)
- No long `sleep`s (a long foreground sleep is killed and a machine sleep during a run produces fake multi-thousand-second latencies, so a run that spans a sleep is not a measurement). Use the Monitor tool or poll in short steps.
- macOS has no `setsid` and no `timeout`. Background python ignores SIGINT; stop it with `kill`.
- A base fine-tune needs 6-8 GB free with Ollama paused; otherwise use the small variant or LoRA.
- The local `python3 -m http.server` preview sends no Cache-Control: hard reload after JS changes.

### 8.3 How to run and verify (correct today)

```bash
# tests (re-run 2026-10-25: JS 590 pass, python 58 passed)
node --test tests/*.test.js
rag-engine/.venv/bin/pytest sml/tests rag-engine/evaluation/test_*.py -q

# engine
rag-engine/.venv/bin/python scripts/rag_status.py       # health and counts
rag-engine/start-all.sh                                  # (re)start the stack; also applies the Ollama env

# benchmarks (one at a time)
cd rag-engine && .venv/bin/python evaluation/benchmark.py --json out.json
cd rag-engine && .venv/bin/python evaluation/benchmark_personal.py --json out.json   # stop the server first

# router
python3 sml/data/router_data.py && rag-engine/.venv/bin/python sml/data/ingest_incoming.py
rag-engine/.venv/bin/python sml/training/train_router_v2.py --version 0.5.0           # --version required; refuses to overwrite
rag-engine/.venv/bin/python sml/runtime/router_predict.py "your message"

# the founder's shadow week, in the browser console of a FIN-OS page
localStorage.setItem('finos_sml_router_shadow','1'); localStorage.setItem('finos_pulse_counters_on','1')
await AryaSidebar.smlReport()      # ready:true at 300 router messages
await AryaSidebar.smlReset()       # removes counters only, flags stay
```
Never commit from a build session; commit messages carry no AI attribution.

---

## 9. Timeline (weeks from the day this roadmap is accepted) and the next ten actions

Rows separate build time (what the build sessions can do without anyone) from founder-gated waits (clock time that passes while a person or data is needed). A wait does not stop the build track; it stops only the items that depend on it.

| Weeks | Build track (no one needed) | Founder-gated waits (default if nobody answers) |
|---|---|---|
| 0-1 | P0 (F9-F11); E8; C21 + C18; B15; C17 starts | Founder: commit (N4); turn on the two flags; answer N1; shadow week begins. Default: counts only |
| 2-3 | G4; C19 sealed set written; K2 guide; D10 builder; B17 runs (one at a time); I1 / I2 | Shadow week ends: `smlReport()`, expect `ready:true` only if about 300 messages were typed (may need 2-3 weeks); N1 samples reviewed; F4 reviewer named |
| 4-6 | C18 confirmation on sealed v7 (if candidate frozen); J1 / J2 if C18 passes; B18 harness and English items; B16 only if B15 said so; I4 if F1 rows arrived | F3 decision meeting with real data in hand (default: stays shadow); F1 rows (default: P5 waits); labelling of real samples with the second person (about 1-2 weeks) |
| 7-10 | E7 / E9 active modes with the ladder, browser verification; C20 (0.5.0) only if C17 / real data justify it; D10 finish and numeric golden set; B19 checkpoint | F6 + F8 for the bake-off (default: skipped); counsel (F7) engaged; Hindi reviewer N2 |
| 11-16 | P4 bake-off and decision; P6 D11 sheets ready then D12 when labels arrive; C24 red-team and extra classes; G6 replay | Verifier labelling (about 2-3 weeks of part-time founder work; default: stays NO-GO); F5 topology and phones |
| 17-26 | J3-J5 device lab and `SmlClient`; G7 flag if G6 passed; K3 / K4 endpoint, consent, retention; re-baseline everything; update this file | F2 step 2 (inbox host, retention, consent text); counsel's opinion before any public exposure |

Milestones: **M1 (week 3)** evidence pack: advisory built, TF-IDF verdict, oracle ceiling, sealed v7 written. **M2 (week 8)** active guard on the founder's machine (if F3) and, if C18 passed, a browser router behind a flag. **M3 (week 12)** retrieval checkpoint (>= 100 / 112 or a recorded re-plan) and embedding decision. **M4 (week 16)** categoriser and verifier verdicts. **M5 (week 26)** device lab result, ranker verdict, feedback loop live or deliberately deferred.

### Next 10 actions (one screen)

1. **Founder:** commit the SML work with the handed-over message (N4).
2. **Founder:** keep `finos_sml_router_shadow` and `finos_pulse_counters_on` on in your browser and use FIN-OS normally; run `await AryaSidebar.smlReport()` after a week.
3. **Founder:** answer **N1** (device-local redacted sample capture, yes / no).
4. **Build:** F10 / F11 / F9 (verify script, held-out coverage test, hashes in the cards) so everything after is guarded.
5. **Build:** E8 soft router advisory (brief 1).
6. **Build:** C21 then C18, TF-IDF-only router feasibility (brief 2); decides whether the public gets a browser guard.
7. **Build:** B15 doc-type oracle upper bound (brief 3); decides whether W3.3 exists.
8. **Build:** C17 error taxonomy, C19 sealed test_v7, G4 report v2, K2 label guide.
9. **Founder:** name the second reviewer (F4) and say yes or no to F3 with the false-alarm numbers you accept (note <= 5%, block <= 2% proposed).
10. **Founder:** pick the 3-5 people who will export redacted statement rows once I2 exists (F1), and name the phones you can borrow (F5).

---

## Appendix A: ID map (all new IDs; none exist in TRACKER yet except F8)

| Area | New IDs |
|---|---|
| B Retrieval | B15 oracle bound, B16 soft boost (conditional), B17 prompt experiments, B18 golden set, B19 checkpoint, B20 / B21 bake-off (under B14) |
| C Router | C17 error taxonomy, C18 TF-IDF-only, C19 sealed test_v7, C20 router 0.5.0, C21 no-pickle export, C22 action ladder spec, C23 sealed test_v8, C24 red-team and extra classes; C11-C13 stay |
| D Verifier | D10 rule table, D11 gate set, D12 candidate, D13 decision; D9 stays |
| E Arya | E8 advisory, E9 mode switch and ceiling; E7 stays |
| F Docs | F8 this roadmap, F9 artifact policy, F10 verify script, F11 held-out coverage test |
| G PULSE | G4 report v2, G5 event log, G6 replay, G7 bandit; G2 is the umbrella |
| I Categoriser (new area) | I1 harness, I2 export tool, I3 rows, I4 train, I5 JS + flag, I6 verification |
| J On-device (new area) | J1 JS router, J2 delivery, J3 encoder, J4 device lab, J5 SmlClient, J6 Expo (unscheduled) |
| K Data and feedback (new area) | K1 sample capture, K2 label guide, K3 manual report section, K4 endpoint |

Flags (all default off): `finos_sml_router_shadow`, `finos_pulse_counters_on` (exist); `finos_sml_router_advisory`, `finos_sml_router_mode`, `finos_sml_js_router`, `finos_sml_samples`, `finos_categoriser_model`, `finos_pulse_bandit` (planned). Config knobs: `RAG_DOCTYPE_BOOST` (only if B16). Constant: `SML_MODE_CEILING`.

## Appendix B: Discrepancies between older documents and TRACKER found while writing this

| Where | Statement | Truth (TRACKER) | Action |
|---|---|---|---|
| `PLAN.md` section 1 | personalized "39/41 on the last run (38 before)" | 38 / 41 after audit pass 2; 39 was the earlier run (H17) | fixed in PLAN |
| `PLAN.md` W2 header | "decision GO (conditional)" | NO-GO for any automated gate (D8) | fixed in PLAN |
| `docs/RAG_PHASES.md` Phase 9 addendum, router / verifier bullet | "conditional GO on a better verifier" | superseded by NO-GO (D8); the bullet below it in the same file already says so | fixed in RAG_PHASES |
| `TRACKER.md` summary table | F row "6 done, 1 open (F7)" | F7 is DONE in the F table (F1-F7 done) | fixed in TRACKER (F row now 8 with F8) |
| `PLAN.md` W1 exit gate | "founder review of disagreements" | counters hold no text, so the review cannot happen (not a contradiction of TRACKER, a gap in the design) | raised as blocker N1 here; the PLAN line is left as is |
