#!/usr/bin/env python3
"""
FIN-OS static audit — zero dependencies (stdlib only; `node` optional for JS syntax).

Checks (each returns a list of human-readable problems; empty list == pass):
  tokens   Pages must load design-tokens.css/theme.css in canonical order and must
           not re-declare the shared theme tokens in a local :root / [data-theme] block.
  links    Local href/src in every HTML file must resolve to a real file.
  search   Every page in html/ and calculators/ must be reachable from js/finos-search.js.
  js       `node --check` on every js/*.js and every inline <script> (skipped if no node).
  ids      No duplicate id="" attributes within a page.
  routes   Every vercel.json rewrite/redirect destination file exists.
  secrets  No API keys / private keys / service_role JWTs in browser-shipped files.

Usage:
  python3 tests/static_audit.py            # run all, exit 1 on failures
  python3 tests/static_audit.py tokens     # run one check
  python3 tests/static_audit.py --json     # machine-readable output
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
CANONICAL_ORDER = ["design-tokens.css", "base.css", "layout.css", "components.css", "theme.css", "interactions.css"]
# Names that design-tokens.css owns — a local re-declaration shadows the real theme.
SHARED_TOKENS = ["--text-primary", "--text-secondary", "--bg-main", "--bg-surface", "--card-shadow"]
# Pages that are deliberately self-contained (own design system / sub-apps / redirects).
TOKEN_EXEMPT_DIRS = {"Porfolio Analyser", "TradeJournal", "News1", "voiceagent", "_archive", "node_modules", "mobile", "docs"}
SKIP_DIRS = {"node_modules", ".venv", "__pycache__", "_archive", ".git", "dist", "output"}  # output = generated reports

LINK_RE = re.compile(r'<(?:a|link|script|img|source|iframe)\b[^>]*?\b(?:href|src)\s*=\s*["\']([^"\']+)["\']', re.I)
LINK_TAG_RE = re.compile(r'<link\b[^>]*>', re.I)
HREF_RE = re.compile(r'href\s*=\s*["\']([^"\']+)["\']', re.I)
SCRIPT_RE = re.compile(r'<script\b([^>]*)>(.*?)</script>', re.I | re.S)
ID_RE = re.compile(r'\sid\s*=\s*["\']([^"\']+)["\']', re.I)
STYLE_BLOCK_RE = re.compile(r'<style\b[^>]*>(.*?)</style>', re.I | re.S)


def html_files():
    for p in sorted(ROOT.rglob("*.html")):
        if any(part in SKIP_DIRS for part in p.relative_to(ROOT).parts) or p.name.startswith("."):
            continue  # skip vendored/generated dirs and editor/sync temp files
        if p.exists():
            yield p


def rel(p):
    return str(p.relative_to(ROOT))


def read(p):
    return p.read_text(encoding="utf-8", errors="replace")


# ── tokens ────────────────────────────────────────────────────────────────────
def check_tokens():
    problems = []
    for p in html_files():
        parts = p.relative_to(ROOT).parts
        if parts[0] in TOKEN_EXEMPT_DIRS:
            continue
        src = read(p)
        if "http-equiv=\"refresh\"" in src.lower() and len(src) < 3000:
            continue  # redirect stub
        hrefs = [m.group(1) for tag in LINK_TAG_RE.findall(src) for m in [HREF_RE.search(tag)] if m]
        css = [h.split("?")[0].split("/")[-1] for h in hrefs if h.split("?")[0].endswith(".css")]
        order = [c for c in css if c in CANONICAL_ORDER]
        if "theme.css" not in css and "design-tokens.css" not in css:
            problems.append(f"{rel(p)}: loads neither design-tokens.css nor theme.css")
        # relative order must follow the canonical sequence
        idx = [CANONICAL_ORDER.index(c) for c in order]
        if idx != sorted(idx):
            problems.append(f"{rel(p)}: CSS load order {order} violates canonical {CANONICAL_ORDER}")
        # shadow tokens in an inline <style> :root / [data-theme] block
        for block in STYLE_BLOCK_RE.findall(src):
            for sel in re.finditer(r'(:root|\[data-theme[^\]]*\])\s*\{([^}]*)\}', block):
                declared = [t for t in SHARED_TOKENS if re.search(re.escape(t) + r'\s*:', sel.group(2))]
                if declared:
                    problems.append(f"{rel(p)}: local {sel.group(1)} block re-declares shared tokens {declared}")
                    break
    return problems


# ── links ─────────────────────────────────────────────────────────────────────
def _is_local(url):
    return not re.match(r'^(?:[a-z][a-z0-9+.-]*:|//|#|\{|\$|<|\+)', url, re.I) and "${" not in url and "{{" not in url


def check_links():
    problems = []
    for p in html_files():
        src = read(p)
        src = re.sub(r'<!--.*?-->', '', src, flags=re.S)
        if rel(p).startswith("News1/"):
            continue  # Vite source, only valid through its dev server
        src = re.sub(r'<[^>]*\bonerror\s*=[^>]*>', '', src, flags=re.I)  # has its own fallback
        for url in LINK_RE.findall(src):
            if not _is_local(url) or url.strip() in ("", "/"):
                continue
            path = unquote(url.split("#")[0].split("?")[0])
            if not path:
                continue
            target = (ROOT / path.lstrip("/")) if path.startswith("/") else (p.parent / path)
            try:
                target = target.resolve()
            except OSError:
                continue
            if not target.exists():
                problems.append(f"{rel(p)}: broken local reference -> {url}")
    return problems


# ── search index coverage ─────────────────────────────────────────────────────
def search_index_urls():
    src = read(ROOT / "js" / "finos-search.js")
    urls = set()
    for u in re.findall(r"url\s*:\s*['\"]([^'\"]+)['\"]", src):
        urls.add(Path(u.split("#")[0].split("?")[0]).as_posix().replace("../", ""))
    return urls


# Pages intentionally not searchable: detail drill-downs, stubs, onboarding steps, redirects.
SEARCH_EXEMPT = re.compile(r'(detail\.html$|^html/(readme|onboarding|start|login|chat|not-money)\.html$)')


def check_search():
    indexed = search_index_urls()
    problems = []
    for p in html_files():
        r = rel(p)
        if r.split("/")[0] not in ("html", "calculators"):
            continue
        if SEARCH_EXEMPT.search(r):
            continue
        src = read(p)
        if 'http-equiv="refresh"' in src.lower() and len(src) < 3000:
            continue  # redirect stub; target is what must be indexed
        if r not in indexed:
            problems.append(f"{r}: not reachable from js/finos-search.js INDEX")
    return problems


# ── js syntax ────────────────────────────────────────────────────────────────
def check_js():
    node = shutil.which("node")
    if not node:
        return []
    problems = []

    def syntax(code_path, label):
        r = subprocess.run([node, "--check", str(code_path)], capture_output=True, text=True)
        if r.returncode != 0:
            first = next((l for l in r.stderr.splitlines() if "Error" in l), r.stderr.strip()[:200])
            problems.append(f"{label}: {first}")

    for p in sorted((ROOT / "js").glob("*.js")):
        syntax(p, rel(p))
    with tempfile.TemporaryDirectory() as tmp:
        for p in html_files():
            for i, (attrs, body) in enumerate(SCRIPT_RE.findall(read(p))):
                if "src=" in attrs.lower() or not body.strip():
                    continue
                if re.search(r'type\s*=\s*["\'](?!module|text/javascript|application/javascript)', attrs, re.I):
                    continue  # json / templates / importmaps
                is_module = re.search(r'type\s*=\s*["\']module', attrs, re.I)
                f = Path(tmp) / f"inline_{i}.{'mjs' if is_module else 'js'}"
                f.write_text(body, encoding="utf-8")
                syntax(f, f"{rel(p)} <script #{i}>")
    return problems


# ── secrets in shipped code ──────────────────────────────────────────────────
SECRET_PATTERNS = [
    ("AWS access key",      re.compile(r'\bAKIA[0-9A-Z]{16}\b')),
    ("Google API key",      re.compile(r'\bAIza[0-9A-Za-z_\-]{35}\b')),
    ("OpenAI/Anthropic key", re.compile(r'\bsk-(?:ant-|proj-)?[A-Za-z0-9_\-]{32,}\b')),
    ("OpenRouter key",      re.compile(r'\bsk-or-v1-[A-Za-z0-9]{32,}\b')),
    ("Slack token",         re.compile(r'\bxox[baprs]-[A-Za-z0-9-]{10,}\b')),
    ("GitHub token",        re.compile(r'\bgh[pousr]_[A-Za-z0-9]{36,}\b')),
    ("Private key block",   re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')),
    ("Stripe live key",     re.compile(r'\b[sr]k_live_[0-9A-Za-z]{20,}\b')),
]
JWT = re.compile(r'\beyJ[A-Za-z0-9_\-]{10,}\.(eyJ[A-Za-z0-9_\-]{10,})\.[A-Za-z0-9_\-]{10,}')
SECRET_SCAN_DIRS = ("html", "js", "css", "calculators", "chatbot")


def check_secrets():
    """No credentials in files that ship to the browser. Supabase *anon* keys are public by design (RLS protects data);
    a service_role JWT is not, so decode every JWT and fail on role=service_role."""
    import base64
    problems = []
    files = [ROOT / "index.html", ROOT / "login.html"]
    for d in SECRET_SCAN_DIRS:
        files += [p for p in (ROOT / d).rglob("*") if p.suffix in (".js", ".html", ".css", ".json") and p.is_file()]
    for p in files:
        if not p.exists() or any(part in SKIP_DIRS for part in p.parts):
            continue
        text = read(p)
        for name, rx in SECRET_PATTERNS:
            if rx.search(text):
                problems.append(f"{rel(p)}: looks like a {name}")
        for m in JWT.finditer(text):
            try:
                payload = json.loads(base64.urlsafe_b64decode(m.group(1) + "=" * (-len(m.group(1)) % 4)))
            except Exception:  # noqa: BLE001
                continue
            if payload.get("role") == "service_role":
                problems.append(f"{rel(p)}: contains a Supabase service_role key (must never ship to the browser)")
    return problems


# ── duplicate ids ─────────────────────────────────────────────────────────────
def check_ids():
    problems = []
    for p in html_files():
        src = re.sub(r'<script\b.*?</script>', '', read(p), flags=re.I | re.S)
        src = re.sub(r'<!--.*?-->', '', src, flags=re.S)
        dups = [k for k, v in Counter(ID_RE.findall(src)).items() if v > 1 and "${" not in k]
        if dups:
            problems.append(f"{rel(p)}: duplicate ids {dups[:5]}")
    return problems


# ── vercel routes ────────────────────────────────────────────────────────────
def check_routes():
    cfg = json.loads(read(ROOT / "vercel.json"))
    problems = []
    routes = {r.get("source") for k in ("rewrites", "redirects") for r in cfg.get(k, [])}
    for kind in ("rewrites", "redirects"):
        for r in cfg.get(kind, []):
            dest = r.get("destination", "")
            if re.match(r'^(?:[a-z]+:)?//', dest) or ":" in dest.split("/")[1:2] + [""] or "(" in dest:
                continue  # external URL or pattern-based destination
            if dest in routes:
                continue  # chains into another route
            if not (ROOT / unquote(dest.split("?")[0].lstrip("/"))).exists():
                problems.append(f"vercel.json {kind}: {r.get('source')} -> {dest} (file does not exist)")
    return problems


CHECKS = {"tokens": check_tokens, "links": check_links, "search": check_search, "js": check_js, "ids": check_ids, "routes": check_routes, "secrets": check_secrets}


def main(argv):
    as_json = "--json" in argv
    names = [a for a in argv if a in CHECKS] or list(CHECKS)
    results = {n: CHECKS[n]() for n in names}
    if as_json:
        print(json.dumps(results, indent=2))
    else:
        for n, probs in results.items():
            print(f"[{'PASS' if not probs else 'FAIL'}] {n}: {len(probs)} problem(s)")
            for line in probs[:60]:
                print("   ", line)
            if len(probs) > 60:
                print(f"    … and {len(probs) - 60} more")
    return 1 if any(results.values()) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
