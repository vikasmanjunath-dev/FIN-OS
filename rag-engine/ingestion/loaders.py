"""
Document loaders — Phase 1 scope: HTML (FIN-OS pages) + PDF.
See docs/RAG_PIPELINE.md Layer 1.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path

import fitz  # PyMuPDF
from bs4 import BeautifulSoup

# Tags that are boilerplate on every FIN-OS page (sidebar nav, topbar, footer)
# and must not pollute the indexed content — verified against html/budget-forecast.html.
_BOILERPLATE_TAGS = ["script", "style", "nav", "aside", "footer", "header", "noscript"]


@dataclass
class LoadedDocument:
    text: str
    title: str
    source_path: str
    metadata: dict = field(default_factory=dict)


def load_html(path: Path) -> LoadedDocument:
    """Extract clean body text from a FIN-OS HTML page, stripping nav/sidebar boilerplate."""
    raw = path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(raw, "html.parser")

    title_tag = soup.title
    title = title_tag.string.strip() if title_tag and title_tag.string else path.stem

    for tag in soup(_BOILERPLATE_TAGS):
        tag.decompose()

    body = soup.body or soup
    text = body.get_text(separator=" ", strip=True)
    # Collapse repeated whitespace left over from stripped tags
    text = " ".join(text.split())

    return LoadedDocument(
        text=text,
        title=title,
        source_path=str(path),
        metadata={"page_key": path.stem},
    )


def load_pdf(path: Path) -> LoadedDocument:
    """Extract text from a PDF, page by page, joined with page-break markers."""
    doc = fitz.open(path)
    pages_text = []
    for page_num, page in enumerate(doc, start=1):
        page_text = page.get_text("text").strip()
        if page_text:
            pages_text.append(f"[PAGE {page_num}]\n{page_text}")
    doc.close()

    full_text = "\n\n".join(pages_text)
    title = path.stem

    if len(full_text.strip()) < 50 * max(1, len(pages_text)):
        # Very little extractable text relative to page count — likely scanned.
        # OCR fallback (EasyOCR) is Phase 3 scope per docs/RAG_PIPELINE.md; flag it here.
        title = f"{title} [LOW_TEXT_DENSITY — OCR_NEEDED]"

    return LoadedDocument(
        text=full_text,
        title=title,
        source_path=str(path),
        metadata={"page_count": len(pages_text)},
    )


def load_finos_pages(html_dir: Path) -> list[LoadedDocument]:
    """Load every .html page in the FIN-OS html/ directory."""
    docs = []
    for path in sorted(html_dir.glob("*.html")):
        try:
            docs.append(load_html(path))
        except Exception as e:
            print(f"[loaders] failed to load {path.name}: {e}")
    return docs
