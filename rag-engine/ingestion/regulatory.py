"""
SEBI + RBI + IRDAI + PFRDA regulatory crawlers — see docs/RAG_PIPELINE.md Layer 1 and docs/RAG_PHASES.md Phase 3.

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


# ── IRDAI ─────────────────────────────────────────────────────────────────
# Investigated live July 17 2026:
#   Listing page https://irdai.gov.in/circulars returns a table with 6 columns.
#   Each row: td[2] = title (bilingual "Hindi / English"), td[4] = date, td[5] = PDF link(s).
#   PDFs with English filenames (no %E0%A4 URL-encoded Devanagari) download directly at
#   ~200-360KB and parse cleanly. Rows with only Hindi PDFs are downloaded anyway and
#   Devanagari lines are stripped (same pattern as RBI). Auth: none required.
_IRDAI_LISTING_URL = "https://irdai.gov.in/circulars"
_IRDAI_BASE = "https://irdai.gov.in"


def _extract_english_title(raw: str) -> str:
    """IRDAI titles are often 'Hindi / English Title'. Return the English part."""
    if "/" in raw:
        parts = raw.split("/", 1)
        english = parts[1].strip()
        # If the english part looks like real English (mostly ASCII), prefer it
        ascii_ratio = sum(1 for c in english if ord(c) < 128) / max(1, len(english))
        if ascii_ratio > 0.7:
            return english
    # Fallback: extract any ASCII-dominant substring after a separator
    return raw.strip()


def list_irdai_circulars(limit: int = 10) -> list[tuple[str, str]]:
    """Returns [(english_title, pdf_url), ...] from IRDAI's circular listing table."""
    try:
        resp = httpx.get(_IRDAI_LISTING_URL, timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"[regulatory] failed to fetch IRDAI listing: {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    seen: set[str] = set()
    results: list[tuple[str, str]] = []

    for tr in soup.find_all("tr")[1:]:
        tds = tr.find_all("td")
        if len(tds) < 6:
            continue

        raw_title = tds[2].get_text(" ", strip=True)
        title = _extract_english_title(raw_title)
        if not title:
            continue

        # td[5] contains PDF links; prefer English (no %E0%A4), fall back to any PDF
        pdf_links = [a["href"] for a in tds[5].find_all("a", href=True) if ".pdf" in a["href"].lower()]
        if not pdf_links:
            continue

        # Prefer an English-filename PDF; fall back to whatever is first
        english_pdfs = [u for u in pdf_links if "%E0%A4" not in u]
        pdf_url = (english_pdfs or pdf_links)[0]

        if pdf_url in seen:
            continue
        seen.add(pdf_url)
        results.append((title, pdf_url))
        if len(results) >= limit:
            break

    return results


def fetch_irdai_circular(title: str, pdf_url: str) -> CrawledCircular | None:
    """Downloads an IRDAI circular PDF and extracts text."""
    try:
        pdf_resp = httpx.get(pdf_url, timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS)
        pdf_resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"[regulatory] failed to download IRDAI PDF {pdf_url}: {e}")
        return None

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_resp.content)
        tmp_path = Path(tmp.name)

    try:
        doc = load_pdf(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    if not doc.text.strip():
        print(f"[regulatory] no extractable text in IRDAI PDF {pdf_url}")
        return None

    return CrawledCircular(
        title=title,
        detail_url=pdf_url,
        pdf_url=pdf_url,
        text=_strip_devanagari_lines(doc.text),
    )


def crawl_recent_irdai_circulars(limit: int = 10) -> list[CrawledCircular]:
    circulars = []
    for title, pdf_url in list_irdai_circulars(limit=limit):
        result = fetch_irdai_circular(title, pdf_url)
        if result:
            circulars.append(result)
    return circulars


# ── PFRDA ─────────────────────────────────────────────────────────────────
# Investigated live July 17 2026:
#   Listing page https://pfrda.org.in/regulatory-framework/circulars lists circular
#   titles as <a href="/en/web/pfrda/w/<slug>"> links (no direct PDF on listing page).
#   Each detail page at that slug has a single PDF link (text "PDF (<size>)").
#   No auth required; pages are ~500KB HTML but load and parse correctly.
_PFRDA_LISTING_URL = "https://pfrda.org.in/regulatory-framework/circulars"
_PFRDA_BASE = "https://pfrda.org.in"


def list_pfrda_circulars(limit: int = 10) -> list[tuple[str, str]]:
    """Returns [(title, detail_url), ...] from PFRDA's circular listing page."""
    try:
        resp = httpx.get(_PFRDA_LISTING_URL, timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS)
        resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"[regulatory] failed to fetch PFRDA listing: {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    seen: set[str] = set()
    results: list[tuple[str, str]] = []

    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "/en/web/pfrda/w/" not in href:
            continue
        full_url = href if href.startswith("http") else _PFRDA_BASE + href
        if full_url in seen:
            continue
        title = a.get_text(strip=True)
        if not title or len(title) < 10:
            continue
        seen.add(full_url)
        results.append((title, full_url))
        if len(results) >= limit:
            break

    return results


def fetch_pfrda_circular(title: str, detail_url: str) -> CrawledCircular | None:
    """Fetches a PFRDA detail page, finds the PDF link, downloads and extracts text."""
    try:
        detail_resp = httpx.get(detail_url, timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS)
        detail_resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"[regulatory] failed to fetch PFRDA detail {detail_url}: {e}")
        return None

    soup = BeautifulSoup(detail_resp.text, "html.parser")
    pdf_link = next(
        (a["href"] for a in soup.find_all("a", href=True) if ".pdf" in a["href"].lower()),
        None,
    )
    if not pdf_link:
        print(f"[regulatory] no PDF found on PFRDA detail page {detail_url}")
        return None

    pdf_url = pdf_link if pdf_link.startswith("http") else _PFRDA_BASE + pdf_link
    try:
        pdf_resp = httpx.get(pdf_url, timeout=_TIMEOUT, follow_redirects=True, headers=_HEADERS)
        pdf_resp.raise_for_status()
    except httpx.HTTPError as e:
        print(f"[regulatory] failed to download PFRDA PDF {pdf_url}: {e}")
        return None

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(pdf_resp.content)
        tmp_path = Path(tmp.name)

    try:
        doc = load_pdf(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    if not doc.text.strip():
        print(f"[regulatory] no extractable text in PFRDA PDF {pdf_url}")
        return None

    return CrawledCircular(
        title=title,
        detail_url=detail_url,
        pdf_url=pdf_url,
        text=_strip_devanagari_lines(doc.text),
    )


def crawl_recent_pfrda_circulars(limit: int = 10) -> list[CrawledCircular]:
    circulars = []
    for title, detail_url in list_pfrda_circulars(limit=limit):
        result = fetch_pfrda_circular(title, detail_url)
        if result:
            circulars.append(result)
    return circulars
