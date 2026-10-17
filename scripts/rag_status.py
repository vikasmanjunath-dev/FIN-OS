#!/usr/bin/env python3
"""
Generate docs/RAG_STATUS.md — live RAG-engine facts computed from the running stack and the code.

Why this exists: the hand-written RAG docs lagged the code (counts, "not built" statuses). Rather
than hand-edit numbers again, run this script and trust its output.

Read-only by design: it only issues HTTP GETs to the engine health endpoint and Ollama, read-only
scroll/count calls to Qdrant (no vectors, small payload fields), and imports the benchmark modules
to count their questions (it never runs them). Any service that is down is reported as
'unreachable' and the script still exits 0.

Usage:  rag-engine/.venv/bin/python scripts/rag_status.py
"""
from __future__ import annotations

import ast
import json
import re
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
RAG = ROOT / "rag-engine"
OUT = ROOT / "docs" / "RAG_STATUS.md"

ENGINE = "http://localhost:7476"
QDRANT = "http://localhost:6333"
OLLAMA = "http://localhost:11434"
UNREACHABLE = "unreachable"


def _get(url: str, timeout: float = 5.0):
    with urlopen(Request(url), timeout=timeout) as r:
        return json.loads(r.read().decode())


def _post(url: str, body: dict, timeout: float = 15.0):
    req = Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def table(headers: list[str], rows: list[list]) -> str:
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join("---" for _ in headers) + "|"]
    for r in rows:
        out.append("| " + " | ".join(str(c) for c in r) + " |")
    return "\n".join(out)


# ── 1. Engine health ───────────────────────────────────────────────────────
def section_health() -> str:
    try:
        h = _get(f"{ENGINE}/api/health")
    except Exception:
        return f"Engine ({ENGINE}/api/health): **{UNREACHABLE}**"
    sched = h.get("scheduler") or {}
    jobs = (sched.get("next_runs") or {})
    lines = [
        f"- status: `{h.get('status')}` (ollama `{h.get('ollama')}`, qdrant `{h.get('qdrant')}`)",
        f"- collection_size: **{h.get('collection_size')}** points",
        f"- ingest workers running: **{h.get('ingest_workers_running')}**",
        f"- scheduler running: `{sched.get('running')}`, **{len(jobs)}** jobs",
    ]
    if jobs:
        lines += ["", table(["scheduler job", "next run"], [[k, v] for k, v in sorted(jobs.items())])]
    return "\n".join(lines)


# ── 2/3. Qdrant ────────────────────────────────────────────────────────────
def scroll_payloads() -> list[dict] | None:
    """All points, small payload fields only, no vectors. None if Qdrant is down."""
    try:
        import config  # noqa: PLC0415
        coll = config.COLLECTION_NAME
    except Exception:
        coll = "finos_chunks"
    fields = ["namespace", "doc_type", "regulator", "source_url", "page_key", "exchange"]
    out: list[dict] = []
    offset = None
    try:
        while True:
            body = {"limit": 500, "with_payload": {"include": fields}, "with_vector": False}
            if offset is not None:
                body["offset"] = offset
            res = _post(f"{QDRANT}/collections/{coll}/points/scroll", body)["result"]
            out.extend(p.get("payload") or {} for p in res["points"])
            offset = res.get("next_page_offset")
            if offset is None:
                break
    except Exception:
        return None
    return out


def section_qdrant(points: list[dict] | None) -> str:
    if points is None:
        return f"Qdrant ({QDRANT}): **{UNREACHABLE}**"
    by_type = Counter(p.get("doc_type") or "(none)" for p in points)
    by_ns = Counter(p.get("namespace") or "(none)" for p in points)
    parts = [f"Total points scrolled: **{len(points)}**", ""]
    parts.append("**By doc_type**\n\n" + table(["doc_type", "points"], [[k, v] for k, v in by_type.most_common()]))
    parts.append("**By namespace**\n\n" + table(["namespace", "points"], [[k, v] for k, v in by_ns.most_common()]))
    reg = [p for p in points if p.get("doc_type") == "regulation"]
    by_reg = Counter(p.get("regulator") or "(none)" for p in reg)
    by_host = Counter((urlparse(p.get("source_url") or "").netloc or "(none)") for p in reg)
    parts.append(f"**doc_type=regulation: {len(reg)} points, by regulator**\n\n"
                 + table(["regulator", "points"], [[k, v] for k, v in by_reg.most_common()]))
    parts.append("**doc_type=regulation, by source host**\n\n"
                 + table(["host", "points"], [[k, v] for k, v in by_host.most_common()]))
    for dt in ("corporate_filing",):
        sub = [p for p in points if p.get("doc_type") == dt]
        if sub:
            by_x = Counter(p.get("exchange") or "(none)" for p in sub)
            parts.append(f"**doc_type={dt}: {len(sub)} points, by exchange**\n\n"
                         + table(["exchange", "points"], [[k, v] for k, v in by_x.most_common()]))
    return "\n\n".join(parts)


def section_pages(points: list[dict] | None) -> str:
    files = sorted(p.stem for p in (ROOT / "html").glob("*.html"))
    head = f"html/*.html files: **{len(files)}**"
    if points is None:
        return head + f"\n\nIndexed page_key values: **{UNREACHABLE}** (Qdrant down)"
    keys = {p.get("page_key") for p in points if p.get("doc_type") == "finos_page" and p.get("page_key")}
    chunks = sum(1 for p in points if p.get("doc_type") == "finos_page")
    missing = [f for f in files if f not in keys]
    extra = sorted(k for k in keys if k not in set(files))
    lines = [
        head,
        f"Distinct page_key values indexed (doc_type=finos_page): **{len(keys)}** ({chunks} chunks)",
        f"NOT indexed: **{len(missing)}**",
    ]
    if missing:
        lines.append("\n" + ", ".join(f"`{m}`" for m in missing))
    if extra:
        lines.append(f"\nIndexed page_keys with no matching html file ({len(extra)}): " + ", ".join(f"`{m}`" for m in extra))
    return "\n".join(lines)


# ── 4. Benchmarks (import only, never run) ─────────────────────────────────
def section_benchmarks() -> str:
    sys.path.insert(0, str(RAG))
    sys.path.insert(0, str(RAG / "evaluation"))
    lines = []
    try:
        from evaluation import benchmark  # noqa: PLC0415
        qs = benchmark.QUESTIONS
        cats = Counter(q["category"] for q in qs)
        lines.append(f"**benchmark.py (public namespace): {len(qs)} questions**\n\n"
                     + table(["category", "questions"], [[k, v] for k, v in sorted(cats.items())]))
    except Exception as e:
        lines.append(f"benchmark.py: could not import ({type(e).__name__}: {e})")
    try:
        from evaluation import benchmark_personal  # noqa: PLC0415
        qs = benchmark_personal.build_questions()
        cats = Counter(q.get("category", "?") for q in qs)
        lines.append(f"**benchmark_personal.py (synthetic personas): {len(qs)} questions**\n\n"
                     + table(["category", "questions"], [[k, v] for k, v in sorted(cats.items())]))
    except Exception as e:
        lines.append(f"benchmark_personal.py: could not import ({type(e).__name__}: {e})")
    return "\n\n".join(lines)


# ── 5. Tests ────────────────────────────────────────────────────────────────
def _count_py_tests(path: Path) -> int:
    try:
        tree = ast.parse(path.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return 0
    n = 0
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test"):
            n += 1
    return n


def section_tests() -> str:
    rows = []
    for label, d in (("rag-engine/evaluation", RAG / "evaluation"), ("tests", ROOT / "tests")):
        files = sorted(d.glob("test_*.py"))
        rows.append([f"pytest files, {label}/", len(files), sum(_count_py_tests(f) for f in files)])
    js = sorted((ROOT / "tests").glob("*.test.js"))
    js_cases = 0
    for f in js:
        js_cases += len(re.findall(r"^\s*(?:test|it)\(", f.read_text(encoding="utf-8", errors="replace"), re.M))
    rows.append(["JS test files, tests/*.test.js", len(js), f"{js_cases} (test()/it() calls)"])
    return table(["kind", "files", "test functions"], rows)


# ── 6. Models / config ──────────────────────────────────────────────────────
def section_models() -> str:
    lines = []
    try:
        sys.path.insert(0, str(RAG))
        import config  # noqa: PLC0415
        rows = [[k, getattr(config, k, "(missing)")] for k in
                ("EMBED_MODEL", "GENERATION_MODEL", "UTILITY_MODEL", "EMBED_DIM", "CHUNK_SIZES", "PIPELINE_VERSION")]
        lines.append("Configured (rag-engine/config.py):\n\n" + table(["setting", "value"], [[k, f"`{v}`"] for k, v in rows]))
    except Exception as e:
        lines.append(f"config.py: could not import ({type(e).__name__}: {e})")
    try:
        tags = _get(f"{OLLAMA}/api/tags")
        rows = [[m["name"], f"{m.get('size', 0) / 1e9:.1f} GB", (m.get("details") or {}).get("parameter_size", ""),
                 (m.get("details") or {}).get("quantization_level", "")] for m in tags.get("models", [])]
        lines.append(f"Installed Ollama models ({OLLAMA}/api/tags):\n\n" + table(["model", "size", "params", "quant"], rows))
    except Exception:
        lines.append(f"Installed Ollama models ({OLLAMA}/api/tags): **{UNREACHABLE}**")
    return "\n\n".join(lines)


def safe(fn, *a) -> str:
    try:
        return fn(*a)
    except Exception as e:  # never let one section break the report
        return f"error computing section ({type(e).__name__}: {e})"


def main() -> int:
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    try:
        points = scroll_payloads()
    except Exception:
        points = None
    doc = [
        "# RAG Status",
        "",
        f"_as of {now}_",
        "",
        "> **GENERATED by scripts/rag_status.py — do not edit by hand.** "
        "Re-run `rag-engine/.venv/bin/python scripts/rag_status.py` to refresh.",
        "",
        "## 1. Engine health", "", safe(section_health), "",
        "## 2. Qdrant points", "", safe(section_qdrant, points), "",
        "## 3. FIN-OS pages indexed vs html files", "", safe(section_pages, points), "",
        "## 4. Benchmark sizes (counted, not run)", "", safe(section_benchmarks), "",
        "## 5. Test files", "", safe(section_tests), "",
        "## 6. Models and pipeline configuration", "", safe(section_models), "",
    ]
    text = "\n".join(doc)
    print(text)
    try:
        OUT.write_text(text, encoding="utf-8")
        print(f"\n[wrote {OUT}]")
    except Exception as e:
        print(f"\n[could not write {OUT}: {e}]")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # exit 0 even on unexpected failure
        print(f"rag_status.py: unexpected error: {type(e).__name__}: {e}")
        sys.exit(0)
