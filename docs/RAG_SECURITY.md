# FIN-OS RAG — Security & Privacy Reference

> Version: 1.3 | Date: June 20, 2026
> **Status:** Namespace isolation (§2) is built and verified twice over — once manually in Phase 3/4, and now via a real, passing, self-cleaning pytest (`evaluation/test_namespace_isolation.py`, 3 tests, see [RAG_EVALUATION.md](RAG_EVALUATION.md) §6). PII scrubbing (§3) is built and verified, including a real false-positive bug found and fixed. Authentication (§4) is built (Phase 3), verified with real rejection tests against the live Supabase project. The faithfulness guard (new, §1) is built but has a measured domain-reliability gap — see [RAG_PHASES.md](RAG_PHASES.md) Phase 5. The threat-model row below for "outdated regulation" and "cloud fallback" describe **designs that were never built** — corrected from earlier drafts of this doc that implied otherwise.

---

## 1. Threat Model

| Risk | Mitigation | Status |
|---|---|---|
| User A retrieves User B's ITR/bank statement | Namespace pre-filter on every vector + keyword query, applied at the query level (not post-filter) | ✅ Built and verified by a real pytest — see §2 |
| PAN/Aadhaar/account numbers persisted in plaintext | `presidio-analyzer` + custom regex recognizers scrub before storage | ✅ Built — `ingestion/pii.py`, runs before any chunk reaches Qdrant/SQLite |
| Prompt injection via malicious content inside an uploaded PDF | Chunk content interpolated only into a clearly delimited context block, never as raw instructions | ✅ Built — `generation/prompt.py`'s `RETRIEVED CONTEXT` block; not separately adversarially tested |
| Outdated regulation cited as current | — | ❌ **Not built.** No `version`/conflict-detection mechanism exists; this row described a design, not a built feature, in earlier drafts of this doc |
| LLM hallucinates a fact not in any source | Post-generation NLI entailment check against cited chunks | 🟡 Built (`generation/faithfulness.py`, Phase 5), but with a **measured reliability gap** on Indian regulatory/financial text specifically — see [RAG_PHASES.md](RAG_PHASES.md) Phase 5. Treat as a noisy signal, not a guarantee. |
| Private document content leaked to a cloud LLM | — | ❌ **Not built.** No cloud fallback exists in the actual code at all (no Claude API call anywhere in `rag-engine`) — this risk doesn't currently apply, but also isn't "mitigated by design," it's just absent |
| Unauthenticated user queries private namespace | Any request claiming a `user_id` must carry a Supabase access token verified against `/auth/v1/user`; mismatch → `403 namespace_violation` | ✅ Built (Phase 3) — see §4. Note: verification is a live REST call to Supabase, not local JWT decoding |
| Raw uploaded files exposed via public URL | — | ❌ **Not built** — no Supabase Storage integration exists; uploaded files are processed in a temp file and discarded, never persisted as a retrievable raw file at all |

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

### At the SQLite FTS5 layer — actual table name is `chunks_fts`, not `rag_bm25_index`
```sql
-- storage/sqlite_fts.py search() — real query, parameterized (not string-interpolated)
SELECT point_id, payload_json, bm25(chunks_fts) AS score
FROM chunks_fts
WHERE chunks_fts MATCH ? AND namespace IN ({placeholders})
ORDER BY score LIMIT ?;
```

### At the Supabase layer — ❌ not applicable, schema not built
The RLS policy below is the planned design from `rag-engine/schema.sql` (written, not applied — see [RAG_KNOWLEDGE_BASE.md](RAG_KNOWLEDGE_BASE.md) §3). It currently protects nothing because the table doesn't exist. Today, the **only** namespace enforcement that's real is the Qdrant + SQLite layer above, which is sufficient for everything currently built (no Supabase-stored RAG metadata exists yet to protect).
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

## 4. Authentication Flow — ✅ Built (Phase 3, June 20, 2026)

**Built differently than originally planned.** The original design called for local JWT decoding (`verify_jwt(token) → extract sub`), which needs the Supabase JWT signing secret. The actual implementation (`storage/auth.py`) instead calls Supabase's own `/auth/v1/user` REST endpoint — simpler, needs only the anon key (already public, see `js/supabase-config.js`), and Supabase itself handles expiry/revocation:

```
Browser (Supabase session)
   │  Authorization: Bearer <access_token>
   ▼
rag-engine FastAPI (storage/auth.py)
   │  GET {SUPABASE_URL}/auth/v1/user
   │    headers: Authorization: Bearer <token>, apikey: <anon_key>
   │  Supabase returns 200 + {"id": "..."} if valid, 401 if not
   │  if response.id != request.user_id → 403 namespace_violation
   ▼
Proceed with namespace_filter(user_id=verified_id)
```

`rag-engine` does not maintain its own user/session store — it validates the same Supabase session already issued by `js/auth.js`, reusing the existing auth infrastructure rather than introducing a second auth system. A 60-second in-process cache avoids hitting Supabase on every request from the same session (latency only, not a security boundary).

**Verified with real tests against the live Supabase project:** a missing token and a garbage token are both correctly rejected with `403 namespace_violation`. **Not yet verified:** the positive path (a real, valid, logged-in user successfully accessing their own namespace) — this needs a live browser session token, which wasn't fabricated for testing without asking first. See [RAG_PHASES.md](RAG_PHASES.md) Phase 3 for detail. Wired into `/api/query`, `/api/search`, and `/api/upload`.

---

## 5. Data Retention & Deletion

| Data | Retention | Deletion path | Status |
|---|---|---|---|
| User-uploaded raw files | **None** — never persisted at all (see above: temp file deleted immediately after parsing) | N/A | ✅ Actually simpler than planned — there's no raw file to delete |
| Indexed chunks (Qdrant + SQLite) | Indefinite — no expiry, no cleanup job | None exists | ❌ Not built — `delete_by_doc_type()` exists and is used for idempotent re-ingestion, but there's no per-user "delete all my data" path yet |
| `rag_feedback` | N/A | N/A | ❌ Table doesn't exist |
| Redis query cache | 1 hour TTL | Automatic expiry | ✅ Built, real |

**Account deletion does not yet cascade into RAG data.** If a FIN-OS user deletes their account today, any chunks they uploaded under `namespace: user:{uuid}` remain in Qdrant/SQLite indefinitely — there is no hook from the existing account-deletion flow into `delete_by_doc_type()` or an equivalent per-user purge. This is a real, currently-open gap, not a "Phase 4 requirement" that got met — Phase 4 happened (Arya integration) and this was not part of it. Needs a `delete_by_namespace(user_id)` function (not built) wired into account deletion before this matters in practice — i.e., before real users have real private documents.

---

## 6. What This Does NOT Protect Against

Documented honestly so it isn't assumed to be covered:
- **Local machine compromise** — if the Mac itself is compromised, all local models/data are accessible like any other local file; this system assumes the development/runtime machine itself is trusted
- **Supabase project-level breach** — RLS protects against application-layer access, not a compromised `service_role` key; the existing FIN-OS warning ("never duplicate the anon key, never expose service_role") applies equally to the new tables
- **Side-channel inference from response timing** — not addressed; out of scope for a solo-dev local system
