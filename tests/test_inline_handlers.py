"""Every inline on*="fn()" handler in a rendered page must point at a function that exists.

Regression for modules that put a <script> inside an innerHTML template: the browser never runs such a script, so the
handler it defined was missing and every keystroke in that tool threw "x is not defined". Static greps cannot see this,
because the handlers only exist in the DOM after the modules render.
"""
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# Keywords/built-ins that can legitimately appear before "(" in a handler body.
KNOWN = ["if", "for", "while", "function", "return", "event", "alert", "confirm", "prompt", "setTimeout", "parseInt",
         "parseFloat", "String", "Number", "Math", "JSON", "Date", "Array", "Object"]

PROBE = """known => {
  const out = {};
  for (const el of document.querySelectorAll('*')) for (const a of el.attributes) {
    if (!/^on/.test(a.name)) continue;
    // drop quoted strings first: "rgba(0,0,0)" or 'scale(1.1)' inside a style assignment is not a call
    const code = a.value.replace(/'(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|`(?:[^`\\\\]|\\\\.)*`/g, "''");
    for (const m of code.matchAll(/(?<![\\w.$])([A-Za-z_$][\\w$]*)\\s*\\(/g)) {
      const n = m[1];
      if (known.includes(n) || typeof window[n] === 'function') continue;
      (out[n] = out[n] || new Set()).add(el.id || el.tagName.toLowerCase());
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].slice(0, 3)]));
}"""


# Known, deliberately-tracked gaps: (page, handler) -> why. Delete the entry when the feature is built or the button removed.
KNOWN_MISSING = {}


def _pages():
    pages = sorted(p.relative_to(ROOT).as_posix() for pat in ("html/*.html", "calculators/*/*.html") for p in ROOT.glob(pat))
    return pages + ["index.html"]


def test_no_inline_handler_points_at_a_missing_function():
    problems = {}
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        ctx = browser.new_context(viewport={"width": 1280, "height": 900})
        for rel in _pages():
            pg = ctx.new_page()
            try:
                pg.goto(f"{base}/{rel.replace(' ', '%20')}", wait_until="domcontentloaded", timeout=20000)
                pg.wait_for_timeout(1200)          # let the tracker modules render their panels
                missing = pg.evaluate(PROBE, KNOWN)
                missing = {n: w for n, w in missing.items() if (rel, n) not in KNOWN_MISSING}
                if missing:
                    problems[rel] = missing
            finally:
                pg.close()
        browser.close()
    assert not problems, "inline handlers with no function behind them:\n" + "\n".join(f"  {p}: {m}" for p, m in problems.items())
