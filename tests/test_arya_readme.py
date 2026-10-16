"""arya-ai/README.md must list every route server.py serves (the market-data pass added several that were never documented)."""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def routes():
    src = open(os.path.join(ROOT, "arya-ai", "server.py"), encoding="utf-8").read()
    return sorted(set(re.findall(r'@app\.(?:get|post|websocket)\("([^"]+)"', src)))


def test_every_route_is_in_the_readme():
    readme = open(os.path.join(ROOT, "arya-ai", "README.md"), encoding="utf-8").read()
    missing = []
    for path in routes():
        shown = re.sub(r"\{[^}]+\}", "{", path)           # /api/quote/{symbol} -> /api/quote/{
        if path == "/":
            continue
        if path.startswith("/api/kite/"):
            # documented as one grouped row: `/api/kite/status`, `/login`, ...
            if "/api/kite/status" in readme and ("`/" + path.rsplit("/", 1)[1] + "`") in readme:
                continue
        norm_readme = re.sub(r"\{[^}]+\}", "{", readme)
        if shown not in norm_readme:
            missing.append(path)
    assert not missing, f"undocumented routes: {missing}"


def test_readme_does_not_claim_rbi_rates_or_mcx_prices():
    readme = open(os.path.join(ROOT, "arya-ai", "README.md"), encoding="utf-8").read()
    assert "RBI all have free" not in readme
    assert "Gold, silver, crude, FX rates" not in readme, "/api/commodities has no FX; FX is /api/fx"
