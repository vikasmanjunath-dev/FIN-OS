"""Build the LOCAL review page for the 40 draft Hindi / Hinglish golden questions (TRACKER B23).
    rag-engine/.venv/bin/python sml/eval/golden/review_page.py            # needs the rag-engine server (live bge-m3 pipeline) for the top-5
Writes sml/eval/golden/review/index.html: one self-contained file (data inline, no network code). For each question it shows the gold chunk and the top-5 chunks the live
pipeline retrieved; the reviewer marks the QUESTION as  correct (a natural question the gold chunk really answers) / wrong gold (the gold chunk does not answer it) /
bad question (unclear, unnatural, not answerable), and may tick retrieved chunks that ALSO answer it. Verdicts are kept in this browser (localStorage) and can be downloaded
as JSON; nothing is sent anywhere. The build fills in NO verdicts. Re-score with rescore_review.py."""
from __future__ import annotations
import html, json, re, sqlite3, sys, urllib.request
from pathlib import Path
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
norm = lambda s: re.sub(r"\s+", " ", s or "").strip().lower()


def load_draft():
    return [json.loads(l) for f in sorted(HERE.glob("draft_hi_*.jsonl")) for l in f.read_text(encoding="utf-8").splitlines() if l.strip()]


def corpus():
    con = sqlite3.connect(ROOT / "rag-engine" / "rag_bm25.db")
    return [(json.loads(pj).get("doc_title"), json.loads(pj).get("text") or t) for t, pj in con.execute("select text,payload_json from chunks_fts where namespace='public'")]


def retrieve(q, base="http://127.0.0.1:7476", k=5):
    req = urllib.request.Request(base + "/api/retrieve", data=json.dumps({"query": q, "top_k": k}).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())["chunks"]


def build_data(items=None, chunks=None, retriever=retrieve):
    items = items if items is not None else load_draft(); chunks = chunks if chunks is not None else corpus(); out = []
    for it in items:
        a = norm(it["gold_anchor"]); gold = next(((d, t) for d, t in chunks if a in norm(t)), (None, ""))
        got = retriever(it["question"])
        out.append({"id": it["id"], "lang": it.get("lang", ""), "category": it.get("category", ""), "question": it["question"], "gold_anchor": it["gold_anchor"], "must_contain": it.get("must_contain", []),
                    "gold_title": gold[0], "gold_text": gold[1],
                    "retrieved": [{"title": c.get("doc_title", ""), "text": c.get("text", ""), "has_anchor": a in norm(c.get("text", ""))} for c in got]})
    return out


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Golden set review</title>
<style>
:root{--bg:#fff;--fg:#1b1f24;--mut:#5b6573;--line:#d6dbe1;--card:#f6f8fa;--ok:#1a7f37;--bad:#cf222e;--warn:#9a6700;--acc:#0969da}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--mut:#9aa7b4;--line:#30363d;--card:#161b22;--ok:#3fb950;--bad:#f85149;--warn:#d29922;--acc:#58a6ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}
main{max-width:920px;margin:0 auto;padding:16px}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;z-index:2}
h1{font-size:1.15rem;margin:0 0 4px} .mut{color:var(--mut);font-size:.9rem}
.item{border:1px solid var(--line);border-radius:10px;margin:16px 0;padding:14px;background:var(--card)}
.q{font-size:1.15rem;font-weight:600;margin:6px 0 10px} .tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:0 8px;font-size:.78rem;color:var(--mut);margin-right:6px}
.chunk{border:1px solid var(--line);border-radius:8px;padding:8px 10px;margin:8px 0;background:var(--bg);white-space:pre-wrap;word-break:break-word;font-size:.92rem}
.chunk.hit{border-color:var(--ok)} .chunk b{color:var(--acc)} mark{background:rgba(210,153,34,.35);color:inherit}
details{margin:8px 0} summary{cursor:pointer;color:var(--acc)} label{margin-right:14px;display:inline-flex;gap:6px;align-items:center;min-height:32px}
textarea{width:100%;box-sizing:border-box;min-height:44px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:6px}
button{background:var(--acc);color:#fff;border:0;border-radius:8px;padding:8px 14px;font-size:1rem;cursor:pointer} button.sec{background:transparent;color:var(--acc);border:1px solid var(--acc)}
.done{border-color:var(--ok)}
</style></head><body>
<header><h1>Review the draft Hindi / Hinglish golden questions</h1>
<div class="mut"><span id="prog">0 of 0 reviewed</span> &middot; saved in this browser only &middot; nothing is sent anywhere &middot; <button id="dl" class="sec">Download verdicts (JSON)</button>
<input id="who" placeholder="your name or initials" style="margin-left:8px;padding:6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg)"></div></header>
<main><p class="mut">For each question, read the gold chunk (the English passage the question was written from) and mark the QUESTION: <b>correct</b> = a natural question that the gold chunk really answers;
<b>wrong gold</b> = the gold chunk does not answer it; <b>bad question</b> = unclear, unnatural or not answerable. If a retrieved chunk below also answers it, tick it. Do not guess: leave it unmarked if unsure.</p>
<div id="items"></div></main>
<script id="data" type="application/json">__DATA__</script>
<script>
(function(){
var KEY='finos_golden_review_v1', data=JSON.parse(document.getElementById('data').textContent), st={who:'',items:{}};
try{var s=JSON.parse(localStorage.getItem(KEY)||'null'); if(s&&s.items) st=s;}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(st));}catch(e){} prog();}
function prog(){var n=0;data.forEach(function(d){if(st.items[d.id]&&st.items[d.id].verdict)n++;}); document.getElementById('prog').textContent=n+' of '+data.length+' reviewed';}
function esc(t){var e=document.createElement('div');e.textContent=t==null?'':String(t);return e.innerHTML;}
function hl(text,anchor){var t=esc(text),a=esc(anchor);var i=t.toLowerCase().indexOf(a.toLowerCase());return i<0?t:t.slice(0,i)+'<mark>'+t.slice(i,i+a.length)+'</mark>'+t.slice(i+a.length);}
var root=document.getElementById('items');
data.forEach(function(d,idx){
  var v=st.items[d.id]||{}; var box=document.createElement('section'); box.className='item'+(v.verdict?' done':'');
  var h='<div><span class="tag">'+esc(d.id)+'</span><span class="tag">'+esc(d.lang)+'</span><span class="tag">'+esc(d.category)+'</span></div><div class="q" lang="hi">'+esc(d.question)+'</div>';
  h+='<details><summary>Gold chunk: '+esc(d.gold_title||'(not found in the index)')+'</summary><div class="chunk">'+hl(d.gold_text,d.gold_anchor)+'</div></details>';
  h+='<details open><summary>Top-5 retrieved by the live pipeline</summary>';
  d.retrieved.forEach(function(c,i){h+='<div class="chunk'+(c.has_anchor?' hit':'')+'"><b>#'+(i+1)+'</b> '+esc(c.title)+(c.has_anchor?' &middot; contains the gold sentence':'')+'<br>'+hl(c.text,d.gold_anchor)+'<br><label><input type="checkbox" data-also="'+i+'"'+((v.also_answers||[]).indexOf(i)>=0?' checked':'')+'> this chunk also answers the question</label></div>';});
  h+='</details><div role="radiogroup" aria-label="verdict for '+esc(d.id)+'">';
  [['correct','correct'],['wrong_gold','wrong gold chunk'],['bad_question','bad question']].forEach(function(o){h+='<label><input type="radio" name="v'+idx+'" value="'+o[0]+'"'+(v.verdict===o[0]?' checked':'')+'> '+o[1]+'</label>';});
  h+='</div><textarea placeholder="note (optional)" aria-label="note">'+esc(v.note||'')+'</textarea>';
  box.innerHTML=h; root.appendChild(box);
  function upd(){var cur=st.items[d.id]||{}; var r=box.querySelector('input[type=radio]:checked'); cur.verdict=r?r.value:''; cur.also_answers=[].slice.call(box.querySelectorAll('input[data-also]:checked')).map(function(x){return +x.getAttribute('data-also');}); cur.note=box.querySelector('textarea').value; st.items[d.id]=cur; box.className='item'+(cur.verdict?' done':''); save();}
  box.addEventListener('change',upd); box.querySelector('textarea').addEventListener('input',upd);
});
document.getElementById('who').value=st.who||''; document.getElementById('who').addEventListener('input',function(e){st.who=e.target.value.replace(/[^\\w .-]/g,'').slice(0,30); save();});
document.getElementById('dl').addEventListener('click',function(){
  var out={schema:'finos-golden-review/1',reviewer:st.who||'',reviewed_at:new Date().toISOString().slice(0,10),items:{}};
  data.forEach(function(d){var v=st.items[d.id]; if(v&&v.verdict) out.items[d.id]={verdict:v.verdict,also_answers:v.also_answers||[],note:v.note||''};});
  var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,1)],{type:'application/json'})); a.download='golden_review_verdicts.json'; a.click();
});
prog();
})();
</script></body></html>"""


def render(data):
    return PAGE.replace("__DATA__", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))


if __name__ == "__main__":
    data = build_data()
    out = HERE / "review" / "index.html"; out.parent.mkdir(exist_ok=True); out.write_text(render(data), encoding="utf-8")
    print(f"wrote {out} with {len(data)} questions ({out.stat().st_size // 1024} KB); gold chunk found for {sum(1 for d in data if d['gold_title'])}; top-5 contains the gold sentence for {sum(1 for d in data if any(c['has_anchor'] for c in d['retrieved']))}")
