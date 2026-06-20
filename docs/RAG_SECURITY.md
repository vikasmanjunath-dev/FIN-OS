# FIN-OS RAG — Security & Privacy Reference

> Version: 1.0 | Date: June 20, 2026

---

## 1. Threat Model

| Risk | Mitigation | Enforced at |
|---|---|---|
| User A retrieves User B's ITR/bank statement | Namespace pre-filter on every vector + keyword query | Qdrant payload filter + SQLite WHERE clause (query level, not post-filter) |
| PAN/Aadhaar/account numbers persisted in plaintext | `presidio-analyzer` + custom regex recognizers scrub before storage | `ingestion/pii.py`, runs before any chunk reaches Qdrant/SQLite/Supabase |
| Prompt injection via malicious content inside an uploaded PDF | Chunk content never interpolated directly into the system prompt — only into the clearly delimited `[RETRIEVED CONTEXT]` block, which the system prompt instructs the model to treat as data, not instructions | `generation/assembler.py` prompt template |
| Outdated regulation cited as current | Every doc carries `last_indexed_at` + `version`; conflict detector flags when ≥2 chunks for the same `regulation_ref` disagree | `retrieval/hybrid.py` + `/api/search-regulations` `superseded_versions_found` field |
| LLM hallucinates a fact not in any source | Post-generation NLI entailment check against cited chunks | `generation/faithfulness.py` |
| Private document content leaked to cloud fallback (Claude API) | Cloud fallback is hard-excluded from any query carrying a `namespace: user:{uuid}` filter — code-level check, not a config flag | `rag-engine/config.py` — `CLOUD_FALLBACK_NAMESPACES = ["public"]` |
| Unauthenticated user queries private namespace | `/api/query` requires `user_id` to match the Supabase JWT's `sub` claim; mismatch returns `403 namespace_violation` | FastAPI auth dependency in `server.py` |
| Raw uploaded files exposed via public URL | Supabase Storage bucket `rag-docs` is **not public**; access only via short-lived signed URLs generated per-request | Supabase Storage policy |

---

## 2. Namespace Isolation — Exact Mechanism

Every chunk, in every store, carries a `namespace` field set to either:
- `"public"` — readable by anyone
- `"user:{uuid}"` — readable only by that UUID

### At the Qdrant layer
```python
from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny

def namespace_filter(user_id: str | None):
    allowed = ["public"]
    if user_id:
        allowed.append(f"user:{user_id}")
    return Filter(must=[FieldCondition(key="namespace", match=MatchAny(any=allowed))])

# Applied INSIDE the search call, not after:
client.search(
    collection_name="finos_chunks",
    query_vector=query_embedding,
    query_filter=namespace_filter(user_id),
    limit=20,
)
```
Because the filter is passed to Qdrant's own search call, points outside the allowed namespace are never scored, never returned, and never present in the candidate list passed to the reranker. There is no step where a private chunk exists in application memory for a request it doesn't belong to.

### At the SQLite FTS5 layer
```sql
SELECT * FROM rag_bm25_index
WHERE content MATCH ? AND namespace IN ('public', ?)
ORDER BY bm25(rag_bm25_index) LIMIT 20;
```

### At the Supabase layer
Standard RLS, identical pattern to existing FIN-OS tables (`profiles`, `transactions`):
```sql
CREATE POLICY "namespace isolation" ON rag_documents
  USING (namespace = 'public' OR user_id = auth.uid());
```

---

## 3. PII Scrubbing Detail

Runs in `ingestion/pii.py`, before any chunk is persisted to any store.

| PII type | Detection | Replacement |
|---|---|---|
| PAN | Regex `[A-Z]{5}[0-9]{4}[A-Z]` + presidio `IN_PAN` recognizer | `<PAN>` |
| Aadhaar | 12-digit grouped sequences + presidio `IN_AADHAAR` recognizer | `<AADHAAR>` |
| Bank account number | 9–18 digit sequence within 5 tokens of "account"/"a/c"/"IFSC" | `<ACCOUNT_NO>` |
| Phone number | presidio `PHONE_NUMBER` (IN locale) | `<PHONE>` |
| Email | presidio `EMAIL_ADDRESS` | `<EMAIL>` |

Scrub intensity differs by source: **strict** for `user_doc` (ITR, Form 16, bank statements — these are expected to contain PII and every instance is masked), **light/defensive** for `regulation`/`news`/`finos_page` (PII is not expected; the pass exists only to catch accidental inclusion, e.g. a name in a news article quote, which is intentionally NOT masked since it's public reporting — only structured identifiers like PAN/Aadhaar/account numbers are masked regardless of source).

The original (unscrubbed) file is retained in Supabase Storage (private bucket, signed URL access only) for the user's own reference — only the **indexed, retrievable chunks** are scrubbed. This means the user can still view their original Form 16, but RAG-generated answers never echo back their raw PAN/Aadhaar/account number even if asked directly.

---

## 4. Authentication Flow

```
Browser (Supabase session) 
   │  Authorization: Bearer <jwt>
   ▼
rag-engine FastAPI
   │  verify_jwt(token) → extract `sub` (user_id)
   │  if request.user_id != token.sub → 403 namespace_violation
   ▼
Proceed with namespace_filter(user_id=token.sub)
```

`rag-engine` does not maintain its own user/session store — it validates the same Supabase JWT already issued by `js/auth.js`, reusing the existing auth infrastructure rather than introducing a second auth system.

---

## 5. Data Retention & Deletion

| Data | Retention | Deletion path |
|---|---|---|
| User-uploaded raw files | Until user deletes | `DELETE FROM rag_documents WHERE id = ?` cascades to Supabase Storage object removal |
| Indexed chunks (Qdrant + SQLite) | Until source document deleted or superseded | Background job removes orphaned chunks (`doc_id` no longer in `rag_documents`) nightly |
| `rag_feedback` | Indefinite (used for evaluation) | User can request deletion via existing account-deletion flow (cascades via FK) |
| Redis query cache | 1 hour TTL | Automatic expiry |

Account deletion (existing FIN-OS flow) must be extended to cascade into `rag_documents`, `rag_feedback`, and a Qdrant `delete` call filtered by `namespace = user:{uuid}` — this is a required addition during Phase 4 implementation, not optional.

---

## 6. What This Does NOT Protect Against

Documented honestly so it isn't assumed to be covered:
- **Local machine compromise** — if the Mac itself is compromised, all local models/data are accessible like any other local file; this system assumes the development/runtime machine itself is trusted
- **Supabase project-level breach** — RLS protects against application-layer access, not a compromised `service_role` key; the existing FIN-OS warning ("never duplicate the anon key, never expose service_role") applies equally to the new tables
- **Side-channel inference from response timing** — not addressed; out of scope for a solo-dev local system
