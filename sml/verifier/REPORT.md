# W2 verifier data and baseline (2026-10-25)

Question: is the engine's NLI faithfulness guard good enough as a "not supported" gate, and is a fine-tuned verifier worth building? Gate (blueprint 9.5): precision >= 0.90 and recall >= 0.80 for the decision "not supported".

## Method
- `dump_chunks.py`: read-only Qdrant scroll of `finos_chunks` (no vectors), public namespace, `doc_type` in {finos_page, regulation}: 1,036 chunks, 155 page keys (148 after dropping chunks under 150 chars). Cached in `chunks_cache.jsonl` so the generator is deterministic and offline.
- `gen_claims.py` (seed 20261025). Evidence = first 600 chars of a chunk, markup stripped. Claims:
  - **entailed**: an extractive sentence (8-60 words) lying fully inside the evidence window.
  - **contradicted**: a sentence from the evidence with ONE change: `number` (percent, rupee, year, section/clause, years, other; x2, x0.5, x0.75, x1.25-1.5, +-1..5 for years/sections; the new value never appears in the evidence), `polarity` (allowed/not allowed, increase/decrease, higher/lower, before/after, old/new regime, eligible/ineligible, ...) or `negation` (" not" after the first auxiliary). Only sentences where a change was applied are kept; the change is recorded.
  - **unsupported**: a sentence from a different page and the same split, Jaccard of content words with the evidence < 0.1 and <= 3 shared content words.
- **Split by source page, 70/30 by usable sentences.** A first split by page still leaked: the same sentence exists on several mirrored pages (the KCC master direction etc.) and 20+ test claims also occurred in train. Pages that share any sentence are now one group (union-find) and the split is by group. A pytest guards this.
- Classes trimmed to equal size inside each split (seeded).
- Files: `train.jsonl`, `test.jsonl` (fields: evidence, claim, label, change_type, change, source_sentence, page_key, chunk_id, claim_page_key), `MANIFEST.json` (counts and sha256).

## Data (target was ~1,200 per class; the pool allows 742 train + 192 test = 934)
The number of distinct sentences that can be perturbed in 600-char windows of 1,036 chunks is the limit, not the seed.

| split | pages | entailed | contradicted | unsupported | contradicted by change |
|---|---|---|---|---|---|
| train | 97 | 742 | 742 | 742 | number 294, negation 355, polarity 93 |
| test | 51 | 192 | 192 | 192 | number 63, negation 94, polarity 35 |

Number changes by type in test: percent/rupee 22, other kinds (year, section, years, plain) 41. The test set is small: a proportion near 0.8 has a 95% interval of about +-6 points on 192 rows.

## Hand check of labels (I judged, rows sampled at random)
- Version 1 of the generator, 60 rows: about 4 questionable or wrong (garbled number such as "2,626" from a comma bug, list-numbering digits, "will not they fly", year changed to 4046).
- Version 2, 60 rows: 1 wrong ("you should not build" in a sentence that already contained "doesn't").
- Final generator (current files), 60 fresh rows (seed 99): **0 wrong**. A few contradictions are ungrammatical ("purported to have not been taken" was removed by a rule; "can not be" remains) but are false against the evidence. Fixes after rounds 1 and 2: list/page/zero-padded numbers are never perturbed, sentence-initial numbers skipped, years always typed as year, negation skipped when the sentence already has n't/not or the aux is followed by a pronoun/determiner, chunk-start fragments and "Rs."-style cut sentences dropped.
- This checks the label, not whether a real model would ever write such a claim.

## Baseline results (test.jsonl, 576 rows)
Engine guard replicated exactly: `generation.faithfulness._get_model()` (cross-encoder/nli-deberta-v3-base, MPS, `id2label` read from config), input (premise = evidence, hypothesis = claim), argmax over the 3 logits, a sentence is supported only if the label is `entailment`. Decision "not supported" = anything else.
Numeric detector: `SmlNumericCheck.check(claim, [evidence]).unmatched.length > 0` (`numeric_baseline.js`). Combined = flag if either flags. Raw output: `baseline_results.json`.

**Headline: decision "not supported" (positives = contradicted + unsupported, negatives = entailed)**

| detector | precision | recall | F1 | entailed claims falsely flagged |
|---|---|---|---|---|
| NLI guard alone | **0.761** | 0.971 | 0.854 | 117/192 = 61% |
| numeric alone | 1.000 | 0.130 | 0.230 | 0/192 |
| combined (OR) | **0.761** | 0.971 | 0.854 | 61% |
| gate | >= 0.90 | >= 0.80 | | |

Precision misses by 0.14, recall passes. Precision 0.90 at this class mix needs the false-flag rate on entailed claims at or below about 21% (now 61%). Precision depends on the mix: here 2/3 of rows are positives. At a realistic 20% share of unsupported claims the same detector would have precision of about 0.30.

**NLI guard, 3-way mapping (entailment -> entailed, contradiction -> contradicted, neutral -> unsupported)**

| class | precision | recall | F1 | n |
|---|---|---|---|---|
| entailed | 0.872 | 0.391 | 0.540 | 192 |
| contradicted | 0.705 | 0.797 | 0.748 | 192 |
| unsupported | 0.524 | 0.745 | 0.615 | 192 |

Confusion (rows = true, cols = predicted entailed / contradicted / unsupported): entailed 75 / 21 / 96; contradicted 5 / 153 / 34; unsupported 6 / 43 / 143.

The dominant failure is that the guard calls verbatim sentences from the evidence "neutral" or "contradiction" (61% of the time, on text that is literally in the premise). This matches the Phase 5 finding (domain register and long, noisy premises: OCR text, tables, Devanagari fragments).

**Recall of "not supported" by sub-population**

| group | n | NLI | numeric | combined |
|---|---|---|---|---|
| unsupported | 192 | 0.969 | 0.130 | 0.969 |
| contradicted, all | 192 | 0.974 | 0.130 | 0.974 |
| - number | 63 | 0.984 | 0.397 | 0.984 |
| - number, percent or rupee | 22 | 1.000 | 0.955 | 1.000 |
| - number, other kinds | 41 | 0.976 | 0.098 | 0.976 |
| - polarity | 35 | 0.886 | 0 | 0.886 |
| - negation | 94 | 1.000 | 0 | 1.000 |

The numeric checker is a precise tool with a narrow scope: it verifies only money and percent (by design; years, sections and small counts are not verified), and flags 95% of those changes with zero false positives, but it cannot see polarity or negation. It adds nothing on top of the NLI guard here because the NLI guard already flags almost everything. Its value is as the low-false-positive layer if the NLI false-flag rate is fixed.

## GO / NO-GO on fine-tuning a verifier: GO (conditional, staged)
Why go: the combined baseline misses the precision gate by 0.14, and the whole gap is the false-flag rate on supported claims (61%), which is a calibration and domain problem a domain-tuned cross-encoder normally closes; recall has headroom (0.97 vs 0.80) to trade for precision. The failure is not a hard semantic one (the claims are in the evidence).

Do these before, or alongside, the fine-tune because they are cheap and may close part of the gap without training (not tested here): (1) premise = the best-matching sentence window instead of 600 chars of noisy chunk; (2) decide on `entailment logit - max(other logits)` with a threshold tuned on a validation split instead of argmax; (3) a substring/high-overlap shortcut is NOT acceptable as a result, it only works on extractive data.

Do not trust a fine-tune measured on this data alone. A model can reach the gate here by learning "claim is a copy of the evidence". Needed data:
1. Paraphrased entailed claims (a local LLM rewrites the sentences, a human spot-checks 100-200) and real model-written answers from the benchmark runs with labels from the founder: at least 300 labelled real claims as the gate set, never used for training.
2. 3-5k synthetic training pairs (this generator, with paraphrase added), plus hard negatives (right topic, wrong figure, from a different page of the same topic).

Compute: DeBERTa-v3-base is 184M parameters; full fine-tune with AdamW in fp32 needs roughly 6-8 GB plus activations at batch 8, sequence 256. On this 24 GB Mac the machine is swapping (about 0.3 GB free during my runs, with Ollama, Qdrant and the engine resident), so a base fine-tune is realistic only in a quiet window with Ollama paused, or with `nli-deberta-v3-small`/xsmall, frozen embeddings or LoRA. Rough estimate (not measured): 3k pairs x 3 epochs is tens of minutes on MPS. I did not attempt any training.

## Limitations
- Synthetic and extractive: the entailed claims are copies; real generations paraphrase, merge and abstract, so every number above is for an easier task than production. Real precision/recall of the current guard are unknown; the 61% false-flag rate on verbatim text suggests it is not better on real answers.
- Contradictions are single mechanical edits; real hallucinations are fuzzier. Numbers that coincide with another figure in the evidence were excluded, which makes the numeric detector look better than it would be.
- Unsupported claims are lexically distant by construction (Jaccard < 0.1); real unsupported claims are usually on-topic, so that class is far easier here than in practice.
- 600-char windows; the engine passes whole chunks.
- Test set is 192 per class, from 51 pages (mostly a few long regulations and FIN-OS pages); intervals are about +-6 points. Corpus is also noisy (OCR, Hindi fragments, UI text).
- Hand check is one reviewer (me), 60 rows on the final version, and it checks label correctness only.
- Only the NLI guard's argmax decision was recorded; logits were not kept, so threshold tuning could not be evaluated post hoc.

## W2.4 results (2026-10-25): two cheap changes, no fine-tuning
Code: `experiments.py` (seed 20261025, offline except the NLI model; logits cached in `nli_logits_cache.json`), results: `experiments_results.json`, new data: `para_test.jsonl`, `para_val.jsonl`. Same model and loader as the engine (nli-deberta-v3-base, MPS, batches of 8, one process, freed afterwards), 6,696 pairs. Engine and Qdrant untouched.

### What was tested
- **(a) Premise selection.** Evidence split into sentences; ranked by IDF-weighted content-word overlap with the claim (BM25-style, mild length norm). Premise = `full` (current: the whole 600-char window), `top1`, `top1_nbr` (best sentence plus the one before and after), `top2`.
- **(b) Margin.** Keep all 3 logits, softmax, `supported` iff `P(ent) - max(P(con), P(neu)) >= tau`. Tau is chosen on a **validation split carved from train.jsonl by page group** (875 rows, 37 pages, disjoint from the remaining 1,351 train rows and from test; shared-sentence pages kept together). Because val is about 3:1 positives and test is 2:1, val precision is re-weighted to a 2:1 mix. Primary rule: tau with the best re-weighted F1 on val. I first tried "highest recall with val precision >= 0.90" (the gate edge): it put tau on the boundary and test precision for top1 fell to 0.880, so I switched to the F1 rule. That switch was made after seeing test numbers; both rows are in the table and the JSON. Test was never used to pick any tau.
- **Paraphrased entailed (harder subset).** Deterministic rule-based light paraphrase of entailed claims: move a leading/trailing if/when/although clause, front a trailing dated phrase, ~40 synonym swaps (shall->will, additional->extra, approximately->about, regarding, ...), contractions, drop filler (also, very, just-type words kept out because they change meaning). Only 49 of the 192 test entailed rows can be paraphrased by these rules (numbers must be unchanged, the claim must differ from the evidence), so the set is **139 rows = 49 from test pages + 90 from train-fit pages** (pages outside val and test; never used to pick tau). Reported mix: the 384 test positives + the 139 paraphrased entailed (precision there is on that mix; the cleaner number is the entailed false-flag rate). On the 49 test-page rows alone the numbers move by under 0.03 (in the JSON as `paraphrased_test_pages_only`).
- **Hand check of 40 paraphrased rows** (random, seed 2026, final file): **0 flatly wrong** (label still entailed). 8 of 40 are weaker rather than wrong: "shall" became "will" in a legal obligation, which loses the obligation sense but a reader would still call the claim supported by the evidence. Two earlier versions of the rules failed this check and were fixed (dropping "generally"/"just" changed meaning; benefit->advantage broke a verb; a moved "by averaging ..." phrase changed the subject; clause moves across sentence boundaries). One reviewer, me.

### Test results: decision "not supported", positives = contradicted + unsupported (gate P >= 0.90, R >= 0.80)
| premise | rule | extractive P | R | entailed falsely flagged | paraphrased P | R | falsely flagged |
|---|---|---|---|---|---|---|---|
| full (engine today) | argmax | 0.761 | 0.971 | 60.9% | 0.865 | 0.971 | 41.7% |
| full | margin, tau=-0.064 | 0.761 | 0.969 | 60.9% | 0.865 | 0.969 | 41.7% |
| top1 | argmax | 0.997 | 0.969 | 0.5% | 1.000 | 0.969 | 0.0% |
| **top1** | **margin, tau=-0.416 (val F1)** | **0.997** | **0.948** | **0.5%** | **1.000** | **0.948** | **0.0%** |
| top1 | margin, tau=0.933 (gate-edge rule) | 0.880 | 0.995 | 27.1% | 0.995 | 0.995 | 1.4% |
| top1_nbr | margin, tau=-0.366 | 0.858 | 0.971 | 32.3% | 0.921 | 0.971 | 23.0% |
| top2 | margin, tau=-0.260 | 0.909 | 0.969 | 19.3% | 0.976 | 0.969 | 6.5% |
| top2 | argmax | 0.904 | 0.979 | 20.8% | 0.977 | 0.979 | 6.5% |

Margin alone on the full premise does nothing useful: the full-window false-flag rate stays at 44-61% for any tau that keeps recall >= 0.8, because the NLI model is confidently wrong on the noisy window (a tau that reaches P 0.906 on test cuts recall to 0.20). Premise selection is what moves the numbers; the margin only fine-tunes the operating point.

**Precision-recall points of the best variant (top1), margin threshold on test**
| tau | extractive P | R | paraphrased P | R |
|---|---|---|---|---|
| -0.9 | 0.997 | 0.880 | 1.000 | 0.880 |
| -0.5 | 0.997 | 0.945 | 1.000 | 0.945 |
| 0.0 | 0.997 | 0.969 | 1.000 | 0.969 |
| 0.5 | 0.992 | 0.974 | 1.000 | 0.974 |
| 0.9 | 0.925 | 0.995 | 0.997 | 0.995 |
| 0.99 | 0.689 | 1.000 | 0.879 | 1.000 |
The same 6 points for full, top1_nbr and top2 are in `experiments_results.json`. A threshold on P(entailment) instead of the margin gives the same picture (top1: P 0.997 / R 0.956 at 0.230).

### Combination with the numeric detector (flag if either flags)
top1 + margin: extractive P 0.997 / R 0.953 (was 0.948), paraphrased 1.000 / 0.953. top2: R 0.971 (was 0.969). Full premise: no change. The numeric layer adds +0.005 recall at no precision cost; it is a safety net for money/percent changes, not a driver.

### Honesty: how much of this is the extractive bias
- The selector picks the exact source sentence for 192/192 extractive entailed rows and 139/139 paraphrased ones. For extractive rows the premise then contains the claim verbatim, and for contradicted rows it contains the original sentence with one change, so NLI sees a near-identical pair. This is the flattering case the task warned about and it is almost certainly why top1 is so strong.
- The paraphrased subset did **not** break it, but my paraphrases are light (word swaps, clause order). They keep >80% of the words, so overlap ranking still finds the sentence. They are not a stand-in for real abstractive answers that merge two sentences, drop details or reorder a table row. Paraphrased results are slightly better than extractive only because the paraphrased mix has fewer entailed rows and the entailed false-flag rate is the figure to compare (0.0% vs 0.5%).
- The unsupported class is still lexically distant by construction (Jaccard < 0.1), so top1 will always have a weak best sentence there and say "neutral". Real unsupported claims are on-topic and will find a plausible-looking best sentence.
- top1 is fragile in another way: a claim that needs two sentences (a figure in one, a condition in another) cannot be entailed from one sentence. top2 pays about 0.09 of precision for that robustness on this data (0.909 vs 0.997), which is also a hint that precision falls once the premise holds distractor sentences.
- Sentences come from a regex split of 600-char windows; engine chunks are longer, and OCR/table/Hindi text has no sentence boundaries, so on real chunks the selector will sometimes return a fragment or the whole chunk.
- Test is 192 per class (about +-6 points per proportion); the paraphrase set is 139.

### GO / NO-GO on fine-tuning a verifier given the best cheap variant: NO-GO for now (defer, do not drop)
Gate status on synthetic data: **met** by top1 + margin (P 0.997 / R 0.948 extractive; P 1.000 / R 0.948 paraphrased) and by top2 on precision only marginally (0.909 / 0.969). The W2.3 conditional GO assumed the cheap changes might not be enough; they are, here, at zero training cost.
Reasons not to fine-tune yet:
1. The synthetic set can no longer discriminate. A fine-tune would score about the same as top1 (both near the ceiling) so it cannot show benefit, and a model trained on this data can learn "claim is a copy of one sentence".
2. The remaining uncertainty is real-claim behaviour (abstractive claims, on-topic unsupported claims, multi-sentence support, noisy chunks). Only real labelled claims answer that, and they are needed for either path.
3. Fine-tuning needs a quiet window (6-8 GB free, Ollama paused); the engine change is small and testable.
Next steps in order: (1) W2.5 label >= 300 real claims from benchmark answers (founder; mix of supported, number-wrong, polarity-wrong, on-topic unsupported, multi-sentence) as the gate set; (2) in the engine, behind a flag, select the best 1-2 sentences per claim and decide on the margin (needs a code change under rag-engine/, which this task could not touch); re-measure on the real set; (3) GO to fine-tune (LoRA or deberta-small, with paraphrased + hard negatives + real training claims) only if the real-claim precision stays under 0.90 or top2 is needed and drops it, otherwise keep the cheap path. Still not enough on its own: top1 must also be checked against false-pass risk on real contradictions that restate part of a sentence.

## W2.5 results: REAL claims (2026-10-26)

Data: 241 sentences from the engine's own answers to the 112 public benchmark questions (`capture_real.py`), each with the exact three context windows the generator saw. Two independent blind labelers per sentence (labels_A*, labels_B*): 3-class agreement 92.9%, kappa 0.769, supported-vs-not agreement 93.4%. On the 224 agreed rows: 190 supported, 26 unsupported, 8 contradicted (base rate of "not supported" is only 15%). Note: several windows end mid-figure (the generator sees ~500 chars), so a few judgements depended on the neighbouring snippet.

| Variant (NLI deberta-v3-base) | precision | recall | supported claims falsely flagged |
|---|---|---|---|
| whole context, argmax | 0.165 | 0.941 | 85% |
| best sentence (top1) + margin tau (-0.416, tuned on synthetic) | 0.171 | 0.882 | 76% |
| top2 + tau | 0.181 | 0.853 | 69% |

Gate is precision >= 0.90, recall >= 0.80. **Not met by a wide margin, and the synthetic result did not transfer** (0.997 / 0.948 on synthetic). Real answers are abstractive: they merge facts from several sentences and rephrase them, which the off-the-shelf NLI model (trained on short everyday sentence pairs) mostly calls not-entailed. Premise selection and a margin threshold cannot fix that. Consequences: (1) do not wire this guard as a gate or filter; (2) fine-tuning on the synthetic set is NO-GO (it would learn copy detection); (3) the real set (224 agreed rows, 34 not-supported) is too small to train on but is the right test set. Next candidate: an LLM judge with the evidence in context (W2.6).

### W2.6-W2.8: LLM judges, co-location, combinations (2026-10-26/27). Agreed real rows: 224 (34 not supported). Gate: P >= 0.90, R >= 0.80.
| Verifier | precision | recall | latency per claim | note |
|---|---|---|---|---|
| NLI deberta, best sentence + tau | 0.171 | 0.882 | ~0.1 s | flags 76% of correct sentences |
| qwen3:8b one word | 0.727 | 0.235 | 0.4 s | calls 229/241 supported |
| qwen3:14b one word | 0.875 | 0.206 | 0.8 s | very precise, very lenient |
| gemma3:12b one word | 0.647 | 0.324 | 2.5 s | different family, same leniency |
| qwen3:8b decomposition | 0.417 | 0.294 | 4.2 s | worse than one word |
| **qwen3:14b decomposition** | 0.682 | **0.441** | 13.5 s | best single judge |
| number co-location (no model) | <= 0.20 | <= 0.21 | ~0 | only 38% of non-supported claims contain a checkable number |
| 14b decomposition OR gemma | 0.625 | 0.588 | ~16 s | best balance |
| 2 of 3 (14b decomp, gemma, 14b one word) | 0.900 | 0.265 | ~17 s | 1 false alarm in 190 supported |

**Decision (D8): NO-GO for any automated verifier as a gate or filter.** No option comes near P 0.90 / R 0.80 on real answers, and the generator itself does not improve with a larger model (qwen3:14b 96/112 vs 95-96). What exists and is safe: the deterministic numeric check (catches numbers absent from the sources, never a false alarm). Possible later, not built: an opt-in "double-check this answer" button using the 2-of-3 judge combination (precision 0.90, recall 0.27, about 17 s, asynchronous) as an advisory flag only. The way to move recall is data: a founder-labelled set of at least 300 real claims (F4) to train or calibrate on; today there are only 34 positives.
