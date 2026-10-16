"""Unit tests for generation.prompt.select_window (offline; no models, no network).
Added Oct 15 2026 — see the docstring there for why the first-500-chars rule was replaced."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from generation.prompt import select_window, build_context_block, build_prompt, _MAX_CHUNK_CHARS


def _long_chunk(answer: str, at: int, total: int = 1200) -> str:
    filler = "Gold is a commodity that many investors consider for diversification and inflation cover. "
    text = (filler * 20)[:total]
    return text[:at] + answer + text[at + len(answer):]


def test_short_chunk_is_returned_untouched():
    t = "SGB pays 2.5% interest."
    assert select_window(t, "what does SGB pay") == t


def test_answer_beyond_500_chars_is_brought_into_view():
    answer = " Sovereign Gold Bonds are issued by RBI on behalf of the Government. "
    t = _long_chunk(answer, at=800)
    assert "issued by RBI" not in t[:_MAX_CHUNK_CHARS]           # the old rule would have lost it
    w = select_window(t, "Who issues Sovereign Gold Bonds in India?")
    assert "issued by RBI" in w
    assert len(w) <= _MAX_CHUNK_CHARS + 1                          # +1 for the leading ellipsis


def test_no_usable_query_terms_falls_back_to_chunk_opening():
    t = _long_chunk(" RBI issues SGBs. ", at=800)
    assert select_window(t, "what is the of") == t[:_MAX_CHUNK_CHARS]


def test_window_never_cuts_a_word_in_half_at_its_start():
    t = _long_chunk(" LTCG rate is 12.5% after 24 months. ", at=900)
    w = select_window(t, "LTCG rate 24 months")
    assert w.startswith("…")
    assert not w[1:2].isspace() and (w[1:].split(" ")[0] in t)


def test_build_prompt_uses_query_aware_context():
    chunk = {"payload": {"doc_title": "Commodity", "text": _long_chunk(" issued by RBI on behalf of the Government ", 900)}}
    p = build_prompt("Who issues Sovereign Gold Bonds?", [chunk])
    assert "issued by RBI" in p
