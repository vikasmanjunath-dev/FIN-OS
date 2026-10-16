"""Regression run of tests/corrupt_json_fuzz.py: stored values of the wrong shape must not crash a page or blank it.

The full fuzz (every known finos_* key x 10 shapes x ~220 pages, ~15 min with 7 processes) is `python3 tests/corrupt_json_fuzz.py`.
This test runs the pages that actually crashed in the Oct 2026 run (plus the home/dashboard/settings entry points) with the
shapes that found them, in parallel, in well under two minutes.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

PAGES = [
    "html/home.html", "html/dashboard.html", "html/settings.html", "html/track-finances.html", "html/ppf-tracker.html",
    "html/goal-optimizer.html", "html/gold-tracker.html", "html/crypto-tracker.html", "html/fd-tracker.html",
    "html/insurance-hub.html", "html/document-ai.html", "html/trading-brain.html", "html/simulator-landing.html",
    "html/mindset-sim-hub.html", "html/train-mindset.html", "html/profile.html", "html/import-statement.html",
    "html/passive-income.html", "html/financial-calendar.html", "html/learn-crypto.html", "html/ca-advisor.html",
    "calculators/banking & fixed income/bond.html", "calculators/desi reality check/buyhouse.html",
    "calculators/investment & wealth/goalbased.html", "calculators/banking & fixed income/ppf.html", "index.html",
]


def test_wrong_shape_storage_does_not_crash_or_blank_pages():
    try:
        import playwright  # noqa: F401
    except ImportError:
        import pytest
        pytest.skip("playwright not installed")
    r = subprocess.run(
        [sys.executable, os.path.join(HERE, "corrupt_json_fuzz.py"), "--workers", "6",
         "--shapes", "obj,str,null,junk,trunc", "--only", ",".join(PAGES)],
        capture_output=True, text=True, timeout=600)
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    assert r.returncode == 0, "\n".join(lines[-40:])
