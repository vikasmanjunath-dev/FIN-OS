"""Copy the live Qdrant collection into a SECOND collection embedded with another model (TRACKER B14 / ROADMAP B21). The live collection is only read.
    RAG_EMBED_MODEL=bge-m3 RAG_COLLECTION=finos_chunks_bge_m3 rag-engine/.venv/bin/python sml/tools/build_alt_index.py [--source finos_chunks]
Same point ids and payloads, so the shared BM25 index (sqlite FTS, keyed by point id) fuses with the new vectors unchanged. Documents are embedded raw (no prefix).
Then start a server with the same two environment variables to test the full pipeline; the live server and collection are not touched."""
import argparse, os, sys, time
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "rag-engine"))
import config  # noqa: E402
from embedding.encoder import embed_batch  # noqa: E402
from storage import qdrant_store  # noqa: E402

ap = argparse.ArgumentParser(); ap.add_argument("--source", default="finos_chunks"); a = ap.parse_args()
if config.COLLECTION_NAME == a.source:
    sys.exit(f"refusing: RAG_COLLECTION is the source collection ({a.source}); set RAG_COLLECTION to a new name")
client = qdrant_store.get_client()
qdrant_store.ensure_collection()
ids, payloads, offset = [], [], None
while True:
    pts, offset = client.scroll(a.source, limit=256, offset=offset, with_payload=True, with_vectors=False)
    ids += [str(p.id) for p in pts]; payloads += [p.payload for p in pts]
    if offset is None: break
print(f"read {len(ids)} points from {a.source}; embedding with {config.EMBED_MODEL} into {config.COLLECTION_NAME}", flush=True)
t = time.time(); done = 0
for i in range(0, len(ids), 64):
    vecs = embed_batch([p.get("text", "") for p in payloads[i:i + 64]])
    qdrant_store.upsert_chunks(vecs, payloads[i:i + 64], ids[i:i + 64]); done += len(vecs)
    if (i // 64) % 8 == 0: print(done, "/", len(ids), flush=True)
print("done", done, "points in", round(time.time() - t), "s; collection size", client.count(config.COLLECTION_NAME).count)
