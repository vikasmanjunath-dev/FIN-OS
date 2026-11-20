"""Check sml/rules/figures.json against the files it cites, and look for places that disagree (ROADMAP D10, first slice).
    rag-engine/.venv/bin/python sml/tools/check_figures.py [--report sml/eval/figures_check.json]
1. anchors: every entry's source file must still contain its anchor sentence (tags, scripts and extra spaces ignored). A missing anchor = the page changed or the entry is wrong.
2. candidates: entries may carry `forbid_probe` / `stale_probe` regexes; every place in html/*.html, calculators/**/*.html or js/*.js (not tests) that matches is listed for a human
   (a CA) to confirm. A candidate is NOT a finding: narrative text about the old rates also matches. Nothing is edited.
Exit status 1 only when an anchor is missing."""
from __future__ import annotations
import argparse, glob, html, json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]


def plain(path):
    t = Path(path).read_text(encoding="utf-8", errors="ignore")
    if str(path).endswith(".html"):
        t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", t, flags=re.S)
        t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"\s+", " ", t)


def check(figs=ROOT / "sml" / "rules" / "figures.json"):
    data = json.loads(Path(figs).read_text(encoding="utf-8")); res = {"version": data["version"], "anchors": [], "candidates": []}
    cache = {}
    for e in data["entries"]:
        src = ROOT / e["source"]
        txt = cache.setdefault(src, plain(src) if src.exists() else None)
        ok = txt is not None and re.sub(r"\s+", " ", e["anchor"]) in txt
        res["anchors"].append({"id": e["id"], "source": e["source"], "ok": bool(ok)})
    files = [f for f in glob.glob(str(ROOT / "html" / "*.html")) + glob.glob(str(ROOT / "calculators" / "**" / "*.html"), recursive=True) + glob.glob(str(ROOT / "js" / "*.js"))]
    for e in data["entries"]:
        for kind in ("forbid_probe", "stale_probe"):
            if kind not in e: continue
            rx = re.compile(e[kind], re.I)
            for f in files:
                t = Path(f).read_text(encoding="utf-8", errors="ignore")
                for m in rx.finditer(t):
                    s = re.sub(r"\s+", " ", t[max(0, m.start() - 60): m.end() + 60])
                    res["candidates"].append({"entry": e["id"], "kind": kind, "file": str(Path(f).relative_to(ROOT)), "context": s[:240]})
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--report"); a = ap.parse_args()
    r = check()
    bad = [x for x in r["anchors"] if not x["ok"]]
    print(f"anchors: {len(r['anchors']) - len(bad)}/{len(r['anchors'])} found; candidates for a human to confirm: {len(r['candidates'])}")
    for x in bad: print("  MISSING anchor:", x["id"], x["source"])
    for c in r["candidates"]: print("  candidate", c["entry"], c["file"], "|", c["context"])
    if a.report: Path(a.report).write_text(json.dumps(r, indent=1, ensure_ascii=False))
    sys.exit(1 if bad else 0)
