"""Fails if any budgeted page's JavaScript weight grows past tests/perf_budget.json (critical = before DOMContentLoaded; total = within 3 s)."""
import os
import subprocess
import sys

import pytest

pytest.importorskip("playwright.sync_api")
HERE = os.path.dirname(os.path.abspath(__file__))


def test_js_weight_within_budget():
    r = subprocess.run([sys.executable, os.path.join(HERE, "perf_budget.py")], capture_output=True, text=True, timeout=400)
    if "Executable doesn't exist" in r.stdout + r.stderr:
        pytest.skip("Chromium unavailable")
    assert r.returncode == 0, r.stdout[-2000:]
