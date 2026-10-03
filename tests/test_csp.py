"""Production CSP regression: representative pages (incl. ones that were silently broken on Vercel) must load without violations.
The full crawl is `python3 tests/csp_check.py` (~10 min)."""
import os
import subprocess
import sys

import pytest

pytest.importorskip("playwright.sync_api")
HERE = os.path.dirname(os.path.abspath(__file__))
SUBSET = "investor-mindset,html/simulator-guide,trading-simulator,html/home.html,html/dashboard.html,html/settings.html,html/net-worth.html,html/tax.html,index.html,login.html"


def test_production_csp_has_no_violations_on_key_pages():
    r = subprocess.run([sys.executable, os.path.join(HERE, "csp_check.py"), "--only", SUBSET], capture_output=True, text=True, timeout=300)
    if "Executable doesn't exist" in r.stdout + r.stderr or "channel" in r.stderr and "not found" in r.stderr:
        pytest.skip("Chromium unavailable")
    assert r.returncode == 0, r.stdout[-1500:]
