# FIN-OS RAG — Integration Reference

> Version: 1.0 | Date: June 20, 2026
> How `rag-engine` (port 7476) wires into the existing FIN-OS platform without disrupting it.

---

## 1. Integration Map

| Existing system | Integration |
|---|---|
| `js/arya-sidebar-panel.js` | Gains 4 new entries in the AgentTools registry (see §2) |
| `arya-ai` backend (port 7475) | Makes HTTP calls to `rag-engine:7476` for any tool invocation requiring grounded answers |
| `document-ai/server.py` | Parsed documents are forwarded into `rag-engine`'s ingestion pipeline instead of (or in addition to) their current destination |
| `js/finos-context.js` | `window.FINOS_USER_CONTEXT` is read by `rag-engine` and injected into every generation prompt — no duplicate context-fetching logic |
| `js/arya-memory.js` | RAG query/answer pairs are written back as new episodic memories, so future Arya conversations can reference past RAG answers without re-querying |
| `voiceagent/agent.py` (port 8765) | Optional: voice transcripts can be routed through `rag-engine` instead of directly to Ollama, when the query is finance-factual rather than conversational |
| `chatbot/brain.py` (port 8000) | **Unchanged.** This serves a different purpose (QFT chat engine) and is not replaced by RAG |
| Supabase | Existing project reused — new tables `rag_documents`, `rag_feedback` added alongside existing `profiles`, `transactions`, etc. |

---

## 2. New Arya Agent Tools (4 additions)

Added to the AgentTools registry inside `js/arya-sidebar-panel.js`:

| Tool | Signature | Calls | Description |
|---|---|---|---|
| `rag_query` | `(question: string, filters?: object)` | `POST rag-engine:7476/api/query` | Full hybrid RAG pipeline → answer + citations |
| `rag_upload_doc` | `(file: File, doc_type: string)` | `POST rag-engine:7476/api/upload` | Upload + ingest a user document into their private namespace |
| `rag_search_regulations` | `(topic: string, authority?: string, date_from?: string)` | `POST rag-engine:7476/api/search-regulations` | Targeted search restricted to the regulatory namespace |
| `rag_explain_statement` | `(doc_id: string, text_snippet: string)` | `POST rag-engine:7476/api/explain` | Explain a specific sentence from a user's own uploaded document |

### Tool registration pattern (matches existing Arya tool conventions)

```javascript
// inside js/arya-sidebar-panel.js AgentTools registry
AgentTools.rag_query = async function(question, filters = {}) {
  const userId = window.FINOS_USER_CONTEXT?.user_id || null;
  const res = await fetch('http://localhost:7476/api/query', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${window.FINOS_USER_CONTEXT?.session_token || ''}`
    },
    body: JSON.stringify({ query: question, user_id: userId, filters, stream: true })
  });
  return streamSSEIntoBubble(res); // reuses existing streamFromOllama-style renderer
};
```

This mirrors the existing `streamFromOllama()` pattern already used for direct Ollama calls — `rag_query` is a drop-in alternative path, not a parallel UI system.

---

## 3. Routing Logic — When Arya Calls RAG vs. Direct Ollama

Arya should not route every message through the full RAG pipeline — that would add unnecessary latency to casual conversation. The router (`detectRagIntent()`, new function in `arya-sidebar-panel.js`) decides:

| Signal | Route to RAG |
|---|---|
| Question contains a regulation reference pattern (`Section \d+`, `SEBI`, `RBI`, `circular`) | Yes |
| Question references "my document", "my ITR", "my Form 16", "uploaded" | Yes (with `rag_upload_doc`/`rag_explain_statement`) |
| Question asks "is this still valid/current" | Yes (`rag_search_regulations`) |
| Casual chat, greetings, emotional support, page-navigation requests | No — stays on existing direct Ollama path |
| Calculator-related quick questions already covered by `calc-explainer.js` | No |

This keeps RAG's added latency (~1.5–3s) scoped only to questions that actually need grounding, while keeping Arya's existing snappy conversational flow untouched for everything else.

---

## 4. `document-ai` Integration

`document-ai/server.py` already parses uploaded documents (existing `document_ai_log` Supabase table). Two integration options, both supported:

1. **Forward parsed output** — after `document-ai` finishes OCR/parsing, it POSTs the extracted text to `rag-engine:7476/api/upload` instead of (or in addition to) its current storage path, so the same document becomes queryable via RAG without the user re-uploading.
2. **Direct upload** — `rag_upload_doc` tool can also call `document-ai`'s existing parser first if the file format needs OCR (scanned PDFs), then ingests the result.

Recommended: option 1, since `document-ai` already has the parsing pipeline — `rag-engine`'s own loaders (PyMuPDF, EasyOCR) become the fallback path only.

---

## 5. Frontend — `js/arya-rag-ui.js` (new file)

New module responsible for everything the RAG pipeline needs visually that existing Arya UI doesn't have:

| Function | Purpose |
|---|---|
| `renderSourceCards(citations)` | Clickable cards beneath an answer showing doc title, page, date |
| `renderFaithfulnessBadge(flaggedSentences)` | ⚠️ inline marker on any sentence that failed the NLI entailment check |
| `renderUploadWidget()` | Drag-and-drop file upload zone inside the Arya panel (new "Documents" sub-tab) |
| `renderFeedbackButtons(queryId)` | 👍/👎 buttons wired to `POST /api/feedback` |
| `streamSSEIntoBubble(response)` | SSE consumer — parses `event: token`/`citations`/`faithfulness`/`done` and updates the chat bubble incrementally |

This file is loaded alongside `arya-sidebar-panel.js`, following the same lazy-load convention used for `arya-roadmap.js` (`ensureRoadmapEngine()` pattern) — `ensureRagUI()` loads `arya-rag-ui.js` only the first time a RAG-routed tool is invoked.

---

## 6. New Admin Page — `html/rag-explorer.html`

A debug/admin page (not linked in main nav, accessed directly) for inspecting the knowledge base:
- Search box hitting `/api/query` directly with raw retrieval results (no generation) — useful for verifying retrieval quality during development
- Table view of `rag_documents` (via Supabase client) with re-index buttons per source
- `rag_feedback` review table — surfaces all thumbs-down entries for weekly QA (see [RAG_EVALUATION.md](RAG_EVALUATION.md))

Follows the existing 6-file CSS load order convention from [user-profile / design standards] — uses `design-tokens.css` → `base.css` → `theme.css` → `layout.css` → `components.css` → `interactions.css`.

---

## 7. Voice Agent Integration (optional, Phase 4+)

`voiceagent/agent.py` currently sends transcripts directly to Ollama (`qwen2.5:3b`/`qwen3:14b` per `_pick_ollama_model()`). To route finance-factual voice queries through RAG:

```python
# inside voiceagent/agent.py, after STT transcription
if detect_rag_intent(transcript):  # same heuristic as §3, ported to Python
    answer = requests.post("http://localhost:7476/api/query", json={
        "query": transcript, "user_id": session_user_id, "stream": False
    }).json()["answer"]
else:
    answer = existing_ollama_call(transcript)  # unchanged path
```

TTS (Edge Neural / Piper) consumes the RAG answer identically to any other Ollama response — no changes needed downstream of text generation.

---

## 8. What Does NOT Change

- `chatbot/brain.py` (port 8000) — separate QFT engine, untouched
- `alerts/alert-engine.py` — health score and alert logic, untouched
- Existing Supabase tables (`profiles`, `transactions`, `goals`, `holdings`, etc.) — only additive new tables
- Existing Arya conversational flow for non-factual queries — RAG is additive, not a replacement
- Vercel deployment — `rag-engine` is local-only, never deployed; static frontend deployment is unaffected
