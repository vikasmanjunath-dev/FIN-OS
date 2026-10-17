"""Regression tests for ingestion.chunker (offline). Added Oct 15 2026.

chunk_text used to loop forever when a sentence was too large to fit next to the overlap window:
it flushed the same overlap-only chunk on every pass. It hung the PFRDA ingestion job for 600 s
(twice) and grew memory without bound. Every test runs under a 10-second alarm so a regression
fails fast instead of hanging the suite."""
import signal
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from ingestion.chunker import chunk_text, _MAX_CHUNK_CHARS


@pytest.fixture(autouse=True)
def _alarm():
    def boom(*_):
        raise TimeoutError("chunk_text did not terminate")
    old = signal.signal(signal.SIGALRM, boom)
    signal.alarm(10)
    yield
    signal.alarm(0)
    signal.signal(signal.SIGALRM, old)


def test_giant_unpunctuated_sentence_after_short_one_terminates():
    text = "Short intro sentence here. " + ("circular clause " * 700)      # ~1,400 tokens, no full stop
    chunks = chunk_text(text, size_tokens=400, overlap_tokens=80)
    assert chunks and all(len(c.text) <= _MAX_CHUNK_CHARS for c in chunks)
    assert len(chunks) < 50                                                   # bounded, not runaway


def test_sentence_exactly_filling_the_window_with_overlap_terminates():
    s1 = " ".join(["alpha"] * 20) + "."                                       # fits the overlap budget
    s2 = " ".join(["beta"] * 330) + "."                                       # needs ~440 tokens > size-overlap
    chunks = chunk_text(f"{s1} {s2} {s1}", size_tokens=400, overlap_tokens=80)
    assert 1 <= len(chunks) < 20


def test_normal_prose_still_chunks_with_overlap():
    sents = [f"Sentence number {i} talks about section 80C and the deduction limit." for i in range(120)]
    chunks = chunk_text(" ".join(sents), size_tokens=100, overlap_tokens=30)
    assert len(chunks) > 3
    # overlap preserved: the last sentence of a chunk reappears at the start of the next
    last_of_first = chunks[0].text.split(". ")[-1][:30]
    assert last_of_first in chunks[1].text


def test_empty_and_whitespace_input():
    assert chunk_text("", 100, 20) == []
    assert chunk_text("   \n  ", 100, 20) == []
