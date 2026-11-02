# Topology and reference devices (F5): what to decide and what the build did

## The decision
Blueprint D1 recommends **A: on-device-first hybrid**: small models run in the browser or app; the Mac-hosted rag-engine stays the heavy path for retrieval answers; an optional hosted tier only after counsel (F7). The alternative **B: server-only** keeps everything on the Mac and protects only the founder's own machine.

## Why it matters now (measured)
- The site is static (Vercel). rag-engine runs only on the founder's Mac, so an "active router guard" through `/api/route` protects the founder and nobody else.
- The browser can run the TF-IDF half of the router today: `js/sml/tfidf-router.js` agrees with Python to 0.0003, 0.022 ms per message, weights 743 KB gzipped (TRACKER J1). It is NOT good enough as a guard yet: its false alarms are 6-12% on the sealed sets (C18, C19).
- Embedding models in the browser (transformers.js / ONNX) are the next step and need devices to measure.

## What to answer
1. **Approve A in one line** (or say B). Default if no answer: server path only, nothing for other users.
2. **Reference devices:** 3-5 phones, one low, one mid, one high end, Android and iOS, borrowed or bought. The build session cannot do this part; tell it which models you have.
3. Whether a **download of a small encoder (about 20-120 MB)** on first use is acceptable to users (data and consent).

## What the build will do once you answer
J2 static delivery of model files (versioned path, SHA-256 manifest, service-worker caching, a `finos-privacy.js` FLOWS entry); an encoder benchmark on your phones (cold start, memory, time to first result); a TF-IDF head trained for the false-alarm target and scored on a new sealed set before any guard is switched on.
