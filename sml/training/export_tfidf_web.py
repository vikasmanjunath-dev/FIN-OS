"""Write the browser file for the TF-IDF head of a router version and a parity fixture for the JS port (ROADMAP J1).
    rag-engine/.venv/bin/python sml/training/export_tfidf_web.py 0.5.1
Outputs: js/sml/models/tfidf-router-<ver>.web.json  (vocab, idf rounded to 5 decimals, coef rounded to 4 decimals; the file the browser downloads; generated, git-ignored until the founder decides to ship it)
         sml/tests/js/fixtures/tfidf_parity_<ver>.json (320 texts + the Python reference probabilities; tracked, small)
         sml/tests/js/fixtures/tfidf_decisions_<ver>.json (intent index, guard flag at the on-device threshold and risk mass for EVERY row of natural_test and test_v2..v8; tracked, small)
The reference is sml/runtime/tfidf_head.py, which matches scikit-learn to 3e-8. Rounding the coefficients moves a probability by <= 0.0005 and no decision."""
import gzip, json, random, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sml" / "runtime"))
from tfidf_head import TfidfHead  # noqa: E402

ver = sys.argv[1] if len(sys.argv) > 1 else "0.5.1"
d = ROOT / "sml" / "models" / "router" / ver
h = TfidfHead.load(d)
j = json.loads((d / "tfidf_head.json").read_text())
web = {"schema": "finos-tfidf-head/1", "version": ver, "classes": h.classes, "n_word": h.nw,
       "vocab_word": j["vocab_word"], "vocab_char": j["vocab_char"],
       "idf_word": [round(x, 5) for x in j["idf_word"]], "idf_char": [round(x, 5) for x in j["idf_char"]],
       "coef": [[round(float(x), 4) for x in row] for row in h.coef], "intercept": [round(float(x), 4) for x in h.b]}
raw = json.dumps(web, ensure_ascii=False, separators=(",", ":")).encode()
OUTW = ROOT / "js" / "sml" / "models"; OUTW.mkdir(parents=True, exist_ok=True); (OUTW / f"tfidf-router-{ver}.web.json").write_bytes(raw)
print({"raw_bytes": len(raw), "gzip_bytes": len(gzip.compress(raw, 9))})

texts = []
for p in sorted((ROOT / "sml" / "data").glob("*.jsonl")):
    texts += [json.loads(l)["text"] for l in p.read_text().splitlines() if l.strip()]
rnd = random.Random(5); rnd.shuffle(texts)
edge = ["", "   ", "a", "ok", "हिंदी", "बेनामी संपत्ति कैसे खरीदें", "mera EMI kitna hai???", "tab\tseparated\nlines", "😀 market 😀😀", "x" * 600, "UPPER lower MiXeD",
        "naïve café", "1,25,000 ₹ per month", "see ya_there __init__", "İstanbul İ", "ﬁnance ﬂow", "१२३ पैसे", "कृपया  बताइए", "no break space", "a-b c_d e.f"]
sample = edge + texts[:300]
fx = {"version": ver, "classes": h.classes, "rows": [{"text": t, "p": [round(float(x), 6) for x in h.proba(t)]} for t in sample]}
out = ROOT / "sml" / "tests" / "js" / "fixtures"; out.mkdir(parents=True, exist_ok=True)
(out / f"tfidf_parity_{ver}.json").write_text(json.dumps(fx, ensure_ascii=False))
print("fixture rows", len(sample))

# decisions for every held-out row, at the on-device guard threshold (C18: thr 0.10 chosen on dev with the pre-refit head)
THR = 0.10
hi = [h.classes.index(c) for c in ("advice_seeking", "evasion_request")]
dec = {"version": ver, "guard_mass": THR, "classes": h.classes, "files": {}}
for name in ("natural_test", "test_v2", "test_v3", "test_v4", "test_v5", "test_v6", "test_v7", "test_v8"):
    p = ROOT / "sml" / "data" / f"{name}.jsonl"
    if not p.exists(): continue
    rows = []
    for l in p.read_text(encoding="utf-8").splitlines():
        if not l.strip(): continue
        pr = h.proba(json.loads(l)["text"]); k = int(pr.argmax()); mass = float(pr[hi].sum())
        rows.append([k, int(k in hi or mass >= THR), round(mass, 4)])
    dec["files"][name] = rows
(out / f"tfidf_decisions_{ver}.json").write_text(json.dumps(dec))
print("decision rows", sum(len(v) for v in dec["files"].values()))
