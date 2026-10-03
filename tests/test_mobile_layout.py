"""Phone-width regression: no page may scroll sideways at 375px. The full crawl is `python3 tests/mobile_check.py`."""
import os
import subprocess
import sys

import pytest

pytest.importorskip("playwright.sync_api")
HERE = os.path.dirname(os.path.abspath(__file__))
SUBSET = ("html/insight-debt,html/insight-sip,html/onboarding,html/life-goals-planner,html/home.html,html/dashboard.html,html/net-worth,"
          "html/budget-forecast,html/settings.html,html/tax.html,html/track-finances,html/trading-simulator,investment & wealth/sip.html,index.html,login.html")


def test_no_horizontal_overflow_on_key_pages_at_375px():
    r = subprocess.run([sys.executable, os.path.join(HERE, "mobile_check.py"), "--only", SUBSET], capture_output=True, text=True, timeout=300)
    if "Executable doesn't exist" in r.stdout + r.stderr:
        pytest.skip("Chromium unavailable")
    assert r.returncode == 0, r.stdout[-1500:]
