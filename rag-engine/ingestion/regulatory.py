"""
SEBI + RBI regulatory crawlers — see docs/RAG_PIPELINE.md Layer 1 and docs/RAG_PHASES.md Phase 3.

SEBI — investigated and confirmed working against the live site (June 20, 2026):
  - Listing page (HTML) lists circular detail pages as plain <a href> links
    matching '/legal/circulars/' — no JS rendering needed.
  - Each detail page embeds the actual circular body as a PDF inside an
    <iframe src="...?file=<pdf_url>">, not as inline HTML text.
  - The PDF downloads and parses cleanly with ingestion/loaders.load_pdf()
    (verified: extracted 2756 chars of real circular text from a live PDF).

RBI — investigated and confirmed working against the live site (June 20, 2026):
  - Listing page (https://www.rbi.org.in/Scripts/NotificationUser.aspx) lists
    each notification as a <tr> containing an <a class="link2"> with the real
    title (linking to a detail page we don't need) AND a sibling <a> whose
    href is a direct PDF link — no intermediate page fetch required, simpler
    than SEBI's pattern. Verified: 58 real notification rows matched on the
    live listing page in one fetch.

AMFI's FAQ/knowledge-center URLs guessed during investigation 404'd and the
correct ones were not found in this session — not implemented.

No APScheduler daily job (the original Phase 3 plan) — these are manual
POST /api/ingest/{sebi-circulars,rbi-notifications} triggers instead. A solo
local tool doesn't benefit much from an unattended scheduler that nobody is
present to debug if it silently breaks against a site structure change.
"""
from __future__ import annotations
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

import httpx
from bs4 import BeautifulSoup

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ingestion.loaders import load_pdf

_LISTING_URL = "https://www.sebi.gov.in/sebiweb/home/HomeAction.do?doListing=yes&sid=1&ssid=7&smid=0"
_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
_TIMEOUT = httpx.Timeout(20.0)
_HEADERS = {"User-Agent": _USER_AGENT}

# RBI documents have bilingual Hindi+English headers/boilerplate. Found via a real
# embedding failure: mxbai-embed-large has a 512-token limit, and the chunker's
# token estimate (len(words)/0.75, calibrated for English) badly underestimates
# Devanagari script — a 2413-char chunk that looked fine by char count exceeded
# 512 tokens and got a 400 from Ollama's /api/embed ("input length exceeds the
# context length"). FIN-OS's RAG corpus is English-only by convention (see
# docs/RAG_KNOWLEDGE_BASE.md), and RBI's English text is the legally authoritative
# version anyway, so stripping Devanagari lines is correct, not just a workaround.
_DEVANAGARI_LINE = re.compile(r"^[\sऀ-ॿ।०-९\d.,()/-]*[ऀ-ॿ][\sऀ-ॿ।०-९\w.,()/-]*$")


def _strip_devanagari_lines(text: str) -> str:
    kept = [line for line in text.split("\n") if not _DEVANAGARI_LINE.match(line)]
    return "\n".join(kept)


@dataclass
class CrawledCircular:
    title: str
    detail_url: str
    pdf_url: str
    text: str


def list_circular_urls(limit: int = 10) -> list[tuple[str, str]]:
    """Returns [(title, detail_url), ...] for the most recent circulars on the listing page."""
    resp = httpx.get(_LISTING_URL, timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    seen: set[str] = set()
    results: list[tuple[str, str]] = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "/legal/circulars/" not in href or href in seen:
            continue
        seen.add(href)
        title = a.get_text(strip=True)
        if title:
            results.append((title, href))
        if len(results) >= limit:
            break
    return results


def _extract_pdf_url(detail_html: str) -> str | None:
    soup = BeautifulSoup(detail_html, "html.parser")
    iframe = soup.find("iframe")
    if not iframe or not iframe.get("src"):
        return None
    match = re.search(r"file=(https?://\S+\.pdf)", iframe["src"])
    return match.group(1) if match else None


def fetch_circular(title: str, detail_url: str) -> CrawledCircular | None:
    """Fetches a single circular's detail page, follows the embedded PDF, extracts text."""
    try:
        detail_resp = httpx.get(detail_url, timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS)
        detail_resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"[regulatory] failed to fetch detail page {detail_url}: {e}")
        return None

    pdf_url = _extract_pdf_url(detail_resp.text)
    if not pdf_url:
        print(f"[regulatory] no PDF iframe found on {detail_url}")
        return None

    try:
        pdf_resp = httpx.get(pdf_url, timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS)
        pdf_resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"[regulatory] failed to download PDF {pdf_url}: {e}")
        return None

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_resp.content)
        tmp_path = Path(tmp.name)

    try:
        doc = load_pdf(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    if not doc.text.strip():
        print(f"[regulatory] no extractable text in PDF {pdf_url}")
        return None

    return CrawledCircular(title=title, detail_url=detail_url, pdf_url=pdf_url, text=_strip_devanagari_lines(doc.text))


def crawl_recent_circulars(limit: int = 10) -> list[CrawledCircular]:
    circulars = []
    for title, detail_url in list_circular_urls(limit=limit):
        result = fetch_circular(title, detail_url)
        if result:
            circulars.append(result)
    return circulars


# ── RBI ──────────────────────────────────────────────────────────────────
_RBI_LISTING_URL = "https://www.rbi.org.in/Scripts/NotificationUser.aspx"


def list_rbi_notifications(limit: int = 10) -> list[tuple[str, str]]:
    """Returns [(title, pdf_url), ...] — RBI's listing gives the PDF URL directly,
    no detail-page fetch needed (unlike SEBI)."""
    resp = httpx.get(_RBI_LISTING_URL, timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    seen: set[str] = set()
    results: list[tuple[str, str]] = []
    for tr in soup.find_all("tr"):
        title_a = tr.find("a", class_="link2")
        pdf_a = tr.find("a", href=lambda h: h and ".pdf" in h.lower())
        if not title_a or not pdf_a:
            continue
        pdf_url = pdf_a["href"]
        if pdf_url in seen:
            continue
        seen.add(pdf_url)
        title = title_a.get_text(strip=True)
        if title:
            results.append((title, pdf_url))
        if len(results) >= limit:
            break
    return results


def fetch_rbi_notification(title: str, pdf_url: str) -> CrawledCircular | None:
    """Downloads an RBI notification PDF directly and extracts text."""
    try:
        pdf_resp = httpx.get(pdf_url, timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS)
        pdf_resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"[regulatory] failed to download RBI PDF {pdf_url}: {e}")
        return None

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_resp.content)
        tmp_path = Path(tmp.name)

    try:
        doc = load_pdf(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    if not doc.text.strip():
        print(f"[regulatory] no extractable text in RBI PDF {pdf_url}")
        return None

    # No separate detail page for RBI — pdf_url doubles as detail_url for citation purposes.
    return CrawledCircular(title=title, detail_url=pdf_url, pdf_url=pdf_url, text=_strip_devanagari_lines(doc.text))


def crawl_recent_rbi_notifications(limit: int = 10) -> list[CrawledCircular]:
    notifications = []
    for title, pdf_url in list_rbi_notifications(limit=limit):
        result = fetch_rbi_notification(title, pdf_url)
        if result:
            notifications.append(result)
    return notifications
