# C13 on-device encoder: size budget sheet (T5.1, 2026-11-09)

**Parameter counts are from public model cards as I remember them, NOT re-checked or downloaded here; latency is NOT measured (needs reference phones, D7).** Sizes are arithmetic: params x bytes per weight (fp32 4, fp16 2, int8 1, int4 0.5), weights only (tokenizer and runtime extra, roughly +5-20 MB).
Existing gates: the browser TF-IDF router file is 743 KB gzipped (gate 1 MB). Any real encoder is 20-100x that, so it can only ship as an optional, lazily fetched, cached download behind a flag, not in the page bundle.

| Model | Params (M) | fp16 MB | int8 MB | int4 MB | Languages |
|---|---|---|---|---|---|
| bge-m3 (current server embedder) | 568 | 1136 | 568 | 284 | multilingual incl. Hindi |
| multilingual-e5-small | 118 | 236 | 118 | 59 | multilingual incl. Hindi |
| paraphrase-multilingual-MiniLM-L12-v2 | 118 | 236 | 118 | 59 | multilingual incl. Hindi |
| bge-small-en-v1.5 | 33 | 66 | 33 | 16 | English only |
| all-MiniLM-L6-v2 | 22.7 | 45 | 23 | 11 | English only |

## Reading it
- Hindi and Hinglish are most of the router's traffic, so the English-only rows are out for the blend. That leaves the two ~118M multilingual models: ~118 MB at int8, ~59 MB at int4, per person, once.
- bge-m3 on a phone (~570 MB at int8) is not realistic; the server keeps it.
- Retraining is required: the 0.5.1 embedding head was fitted on bge-m3 vectors, so a smaller encoder means a new head, a new sealed test set and a fresh F3 decision.
## What is still needed (blocked)
- F5: founder picks the topology (on-device first with server fallback is already the relayed decision).
- D7: reference phones to measure load time, ms per message and memory.
- F6/F8: permission to download candidate models and free memory to run a bake-off.

## Web check (2026-11-09, search results only, nothing downloaded)
- A Hugging Face model card for a trimmed multilingual-e5-small lists fp32 448 MB, fp16 120.7 MB, int8 112.8 MB. The trim removed embedding rows for scripts it does not serve, so it may not keep Devanagari; the standard Xenova build's quantised size was not in the listing. This agrees with the ~113-118 MB int8 estimate above; the fp32 figure (448 MB) is far above my "params x 4" only if the full 250k-token embedding table is counted, so treat fp32/fp16 columns as lower bounds.
- Sources: https://huggingface.co/Xenova/multilingual-e5-small, https://huggingface.co/efederici/multilingual-e5-small-int8-dynamic
