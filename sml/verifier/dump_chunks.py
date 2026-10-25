"""Read-only scroll of Qdrant -> sml/verifier/chunks_cache.jsonl (finos_page + regulation, public)."""
import json, urllib.request, pathlib
URL="http://localhost:6333/collections/finos_chunks/points/scroll"
out=pathlib.Path(__file__).parent/"chunks_cache.jsonl"
off=None; rows=[]
while True:
    body={"limit":256,"with_payload":True,"with_vector":False}
    if off: body["offset"]=off
    r=json.load(urllib.request.urlopen(urllib.request.Request(URL,json.dumps(body).encode(),{"content-type":"application/json"})))["result"]
    for p in r["points"]:
        pl=p["payload"]
        if pl.get("namespace")=="public" and pl.get("doc_type") in ("finos_page","regulation"):
            rows.append({"id":p["id"],"text":pl.get("text",""),"doc_type":pl["doc_type"],"page_key":pl.get("source_url") or pl.get("doc_title") or p["id"],"title":pl.get("doc_title","")})
    off=r.get("next_page_offset")
    if not off: break
rows.sort(key=lambda x:x["id"])
out.write_text("\n".join(json.dumps(x,ensure_ascii=False) for x in rows))
import collections
print(len(rows),collections.Counter(x["doc_type"] for x in rows),len({x["page_key"] for x in rows}))
