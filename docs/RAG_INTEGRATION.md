# FIN-OS RAG — Integration Reference

> Version: 2.0 | Date: June 20, 2026 — rewritten after actually reading `js/arya-sidebar-panel.js` (7,241 lines); the original version below was written speculatively during planning and got the core architecture wrong in one important way (see §1).
> How `rag-engine` (port 7476) wires into the existing FIN-OS platform without disrupting it.
> **Status: built and verified live in a browser**, June 20, 2026 — see [RAG_PHASES.md](RAG_PHASES.md) Phase 4 for the full verification log.

---

## 1. Integration Map — corrected

**The original plan assumed one chat path that calls tools through an `AgentTools` registry.** That registry genuinely exists (34 tools, confirmed real) — the planning got that part right. What it missed: **there are two separate interaction paths in `arya-sidebar-panel.js`, and only one of them uses the tool registry at all.**

| Path | Function | Uses `AgentTools`? | How RAG was wired in |
|---|---|---|---|
| **Main Chat tab** | `sendMessage()` → `streamFromOllama()` | **No.** Single direct Ollama call per message. Pre-fetches context (macro news, etc.) and injects into that one call's system prompt — same pattern `fetchMacroNews()` already used. | New `detectRagIntent()` + `fetchRagContext()`, mirroring `fetchMacroNews()` exactly. Calls the new lightweight `POST /api/retrieve` (no generation) and injects results as `ragSection` in the system prompt. |
| **Agent tab** | `AryaAgentRunner.run()` | **Yes.** A real ReAct loop (Reason → `TOOL_CALL` → Observe → repeat, max 6 steps) using `AgentTools.schema`/`execute()`. | Two new entries added directly to the existing registry: `rag_query`, `rag_search_regulations`. Each calls `POST /api/query` (full generation) and returns a formatted string, exactly like every other tool. |

Both paths talk to `rag-engine` directly over HTTP from the browser — there is no proxy through `arya-ai` (port 7475). That was also a planning assumption that turned out unnecessary: `rag-engine` just needed its own CORS middleware (added, mirrors `arya-ai/server.py`'s existing dev-open config) and the frontend calls it directly.

| Existing system | Integration | Status |
|---|---|---|
| `js/arya-sidebar-panel.js` | Two new helper functions (`ragAPI`, `detectRagIntent`, `fetchRagContext`) + 2 new `AgentTools` entries | ✅ Built |
| `rag-engine` CORS | `CORSMiddleware`, `allow_origins=["*"]`, mirrors `arya-ai/server.py` | ✅ Built |
| `arya-ai` backend (port 7475) | **Not used as a proxy.** Frontend calls rag-engine (7476) directly | N/A — corrected assumption |
| `document-ai/server.py` | Forwards parsed documents into `rag-engine`'s ingestion pipeline | ❌ Not built |
| `js/finos-context.js` | `window.FINOS_USER_CONTEXT` injected into RAG prompts | ❌ Not built — main chat's `buildUserContext()` still runs independently of the RAG context block |
| `js/arya-memory.js` | RAG query/answer pairs written back as episodic memories | ❌ Not built |
| `voiceagent/agent.py` (port 8765) | Route finance-factual voice queries through RAG | ❌ Not built |
| `chatbot/brain.py` (port 8000) | **Unchanged**, as planned | ✅ Confirmed untouched |
| Supabase | New tables `rag_documents`, `rag_feedback` | ❌ Not built — schema written (`rag-engine/schema.sql`) but not applied, see [RAG_PHASES.md](RAG_PHASES.md) Phase 1 |

---

## 2. Main Chat Tab — Context Injection (built)

`sendMessage()` (the function behind every message typed in the primary Chat tab) already pre-fetches macro news non-blocking with a timeout and injects it into the system prompt. RAG grounding follows the identical shape:

```javascript
// inside js/arya-sidebar-panel.js, near fetchMacroNews()
const _RAG_INTENT_RE = /\b(section\s?\d|circular|notification|sebi|rbi|amfi|regulation|regulatory|kcc|kisan credit|directions?,?\s*20\d\d|rule\b|act\b|compliance|directive)\b/i;

function detectRagIntent(userText) {
  return _RAG_INTENT_RE.test(userText || '');
}

async function fetchRagContext(userText) {
  try {
    // 4500ms, not 2500ms — measured retrieve+rerank baseline is 1.1-2.5s on this
    // M5 (docs/RAG_HARDWARE.md §4), and this call runs concurrently with the main
    // chat's own Ollama generate call, contending for the same GPU. 2.5s aborted
    // consistently in real browser testing even with otherwise-idle models.
    const d = await ragAPI('/api/retrieve', { query: userText, top_k: 3, stream: false }, 4500);
    if (d.error || !Array.isArray(d.chunks) || !d.chunks.length) return '';
    return d.chunks.map(c => `[${c.doc_title}]\n${c.text}`).join('\n\n');
  } catch { return ''; }
}
```

Wired into `sendMessage()` right next to the existing news fetch:

```javascript
let ragLines = '';
if (!isAutoInsight && detectRagIntent(userText)) {
  ragLines = await Promise.race([
    fetchRagContext(userText),
    new Promise(r => setTimeout(() => r(''), 4500))
  ]);
}
const ragSection = ragLines
  ? `\n\nGROUNDING CONTEXT FROM SEBI/RBI REGULATIONS (cite the source document by name inline — do not invent regulation details not present here):\n${ragLines}`
  : '';
```

**Why no generation call to `/api/query` here:** the main chat already makes exactly one Ollama call per message (`qwen3:14b`, via `streamFromOllama()`). Running a second full RAG generation (rag-engine's own `qwen3:8b` call) would mean two LLM calls per message — wasteful and slower on this hardware. `POST /api/retrieve` (new, built in this phase) returns only the ranked chunks, no generation, so the *existing* chat call does the synthesis, citing source titles inline per the prompt instruction above.

**Verified live:** `window.AryaSidebar.ask('What is the RBI Kisan Credit Card scheme notification about?')` — confirmed via browser network tab that `POST /api/retrieve` fires, and the resulting chat response became visibly more specific once that call succeeded (vs. a generic fallback answer on a timed-out attempt).

**Real limitation found:** under concurrent GPU load (the main chat's `qwen3:14b` call and the retrieve's `mxbai-embed-large` call running at the same time — confirmed via `ps eww` to be separate `ollama runner` subprocesses contending for the same M5 GPU), the retrieve call can still time out even at 4.5s. This degrades gracefully — chat continues without grounding context, no user-facing error — but means the auto-injection is best-effort, not guaranteed, especially on the first message after a cold start (reranker not yet loaded into `rag-engine`'s process memory).

---

## 3. Agent Tab — New Tools (built)

Added directly to the existing `AgentTools.schema` array and `execute()` switch — same shape as all 32 pre-existing tools (`{name, desc, args}` schema entry; `execute()` case returns a plain string):

```javascript
// schema additions
{ name: 'rag_query', desc: 'Ask a question grounded in indexed SEBI/RBI regulations + FIN-OS docs, with cited answer — REAL retrieved text, not guesses', args: { query: 'the question to answer' } },
{ name: 'rag_search_regulations', desc: 'Search ONLY SEBI/RBI regulatory text (no FIN-OS content) — use for "what does the circular/notification say" questions', args: { query: 'regulation topic or keyword' } },

// execute() cases
case 'rag_query': {
  const d = await ragAPI('/api/query', { query: args.query, stream: false, top_k: 3 }, 20000);
  if (d.error) return `RAG lookup failed (is rag-engine running on :7476?): ${d.error}`;
  const cites = (d.citations || []).map((c, i) => `  [${i+1}] ${c.doc_title}${c.source_path ? ' — ' + c.source_path : ''}`);
  return `${d.answer}${cites.length ? '\n\nSources:\n' + cites.join('\n') : ''}`;
}

case 'rag_search_regulations': {
  const d = await ragAPI('/api/query', { query: args.query, stream: false, top_k: 3, doc_type: 'regulation' }, 20000);
  if (d.error) return `Regulation search failed: ${d.error}`;
  if (!d.citations?.length) return `No indexed SEBI/RBI regulation matched "${args.query}". Only a small sample of circulars/notifications is indexed so far.`;
  const cites = d.citations.map((c, i) => `  [${i+1}] ${c.doc_title}${c.source_path ? ' — ' + c.source_path : ''}`);
  return `${d.answer}\n\nSources:\n${cites.join('\n')}`;
}
```

`rag_search_regulations` is genuinely distinct from `rag_query`, not a same-results rename — `doc_type: 'regulation'` is a real filter, added to `storage/qdrant_store.py` and `storage/sqlite_fts.py` in this phase specifically so this tool would do something different. Verified: an unfiltered query against "insurance" returned a mix of `finos_page` and `regulation` chunks; the same query with the filter returned `regulation` chunks only.

**Why no `rag_upload_doc`/`rag_explain_statement` yet:** `/api/upload` exists (Phase 3) but wiring a file-picker into the Agent tab's text-based tool-call loop needs its own UI work (the ReAct loop's `TOOL_CALL` format is plain JSON text — there's no file-attachment mechanism in that flow yet). Deferred, not forgotten.

**Verified live**, both tools, via direct console calls against the real backend:
```javascript
await window.AryaSidebar.tools.execute('rag_query', { query: 'What is the Kisan Credit Card scheme?' })
await window.AryaSidebar.tools.execute('rag_search_regulations', { query: 'mutual fund nomination' })
```
Both returned correctly-cited, real answers — see [RAG_PHASES.md](RAG_PHASES.md) Phase 4 for the captured output.

---

## 4. `document-ai` Integration (still not built)

`document-ai/server.py` already parses uploaded documents (existing `document_ai_log` Supabase table). Two integration options, both still just plans:

1. **Forward parsed output** — after `document-ai` finishes OCR/parsing, it POSTs the extracted text to `rag-engine:7476/api/upload` instead of (or in addition to) its current storage path.
2. **Direct upload** — the (not-yet-built) `rag_upload_doc` tool calls `document-ai`'s existing parser first if the file format needs OCR, then ingests the result.

Recommended: option 1, since `document-ai` already has the parsing pipeline — `rag-engine`'s own loaders (PyMuPDF) would become the fallback path only. Not implemented this pass.

---

## 5. Frontend Rendering — no new UI file needed

**The original plan called for a new `js/arya-rag-ui.js` with `renderSourceCards()`, `renderFaithfulnessBadge()`, an SSE consumer, etc. None of that was built, and it turned out not to be needed:** every existing `AgentTools` entry (all 34 of them) returns a plain string that gets fed back into the ReAct loop's text history, or — for the main chat path — gets folded into one Ollama call's output and rendered through the *existing* `richText()` highlighter. Citations render as a plain "Sources:" list appended to the tool's returned string, exactly matching how e.g. `search_web` already lists its result URLs. This is consistent with the project's existing convention (plain text + light highlighting, no bespoke card components per feature) rather than a gap.

If source cards or a faithfulness badge are wanted later, that's a real, scoped addition — but it's not blocking anything that exists today.

---

## 6. New Admin Page — `html/rag-explorer.html` (still not built)

A debug/admin page (not linked in main nav) for inspecting the knowledge base — search box hitting `/api/query` directly, a table view of indexed documents, a `rag_feedback` review table. Still just a plan; not built this pass. Lower priority now that the real integration points (tasks above) are live and individually testable via the browser console.

---

## 7. Voice Agent Integration (still not built)

`voiceagent/agent.py` currently sends transcripts directly to Ollama. To route finance-factual voice queries through RAG, the same `detectRagIntent()` heuristic would need a Python port and a call to `rag-engine:7476/api/query`. Not implemented this pass.

---

## 8. What Does NOT Change

- `chatbot/brain.py` (port 8000) — separate QFT engine, untouched
- `alerts/alert-engine.py` — health score and alert logic, untouched
- Existing Supabase tables (`profiles`, `transactions`, `goals`, `holdings`, etc.) — only additive new tables, and those aren't even applied yet
- Existing Arya conversational flow for non-RAG-triggered queries — entirely unaffected; `detectRagIntent()` returning `false` means zero behavior change from before this phase
- Vercel deployment — `rag-engine` is local-only, never deployed; static frontend deployment is unaffected
- `arya-ai` backend (port 7475) — not touched; the frontend calls rag-engine directly instead of proxying through it, contrary to the original plan
