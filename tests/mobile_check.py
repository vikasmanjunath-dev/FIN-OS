#!/usr/bin/env python3
"""
Phone-width layout check: opens every page at 375×812 (touch UA) and reports
  • horizontal overflow  — the page scrolls sideways (document wider than the viewport)
  • offenders            — the widest elements poking past the right edge (so you know what to fix)
  • tiny tap targets     — visible buttons/links under 24×24 CSS px (WCAG 2.2 AA minimum)

  python3 tests/mobile_check.py                 # all pages
  python3 tests/mobile_check.py --only tax,home
  python3 tests/mobile_check.py --width 360
Exit 1 if any page overflows horizontally.
"""
import argparse
import collections
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
from smoke_pages import list_pages, static_server, ROOT  # noqa: E402

JS = """(vw) => {
  const de = document.documentElement;
  // Real test: can the user actually scroll sideways? (clipped decoration doesn't count)
  window.scrollTo(2000, 0);
  const over = window.scrollX > 0 ? Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0) - vw : 0;
  window.scrollTo(0, 0);
  const offenders = [];
  if (over > 1) {
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1 && getComputedStyle(el).position !== 'fixed') {
        // skip children of an element that itself scrolls/clips horizontally (carousels, tables in wrappers)
        let clipped = false;
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX; if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') { clipped = true; break; }
        }
        if (!clipped) offenders.push((el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : '')) + ' +' + Math.round(r.right - vw));
      }
    }
  }
  let tiny = 0;
  for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, [role=button]')) {
    let r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (el.type === 'checkbox' || el.type === 'radio') {                                   // tapped through its <label>: judge the bigger area
      const l = (el.labels && el.labels[0]) || el.closest('label');
      if (l) { const lr = l.getBoundingClientRect(); if (lr.width * lr.height > r.width * r.height) r = lr; }
    }
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (r.left >= vw || r.right <= 0 || r.bottom <= 0) continue;                          // off-screen (closed drawers, carousels)
    if (el.type === 'range') continue;                                                      // a slider's box is its track; the thumb is the target
    if (el.tagName === 'A' && el.closest('p, li, span') && !el.closest('nav') && r.height < 24 && r.width >= 24) continue;   // inline text links are exempt
    if (Math.round(r.width) < 24 || Math.round(r.height) < 24) tiny++;                      // sub-pixel layout: 23.99 is 24
  }
  return { over: Math.max(0, Math.round(over)), offenders: offenders.slice(0, 6), tiny };
}"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--width", type=int, default=375)
    a = ap.parse_args()
    pages = list_pages([s for s in a.only.split(",") if s])
    from playwright.sync_api import sync_playwright

    bad, tinys = [], []
    common = collections.Counter()
    with static_server() as base, sync_playwright() as pw:
        b = pw.chromium.launch(channel="chromium")
        ctx = b.new_context(viewport={"width": a.width, "height": 812}, is_mobile=True, has_touch=True, device_scale_factor=2)
        for p in pages:
            rel = p.relative_to(ROOT).as_posix()
            pg = ctx.new_page()
            try:
                pg.goto(f"{base}/{quote(rel)}", wait_until="domcontentloaded", timeout=20000)
                pg.wait_for_timeout(1500)
                r = pg.evaluate(JS, a.width)
                if r["over"] > 1:
                    bad.append((rel, r)); [common.update([o.split(" +")[0]]) for o in r["offenders"]]
                if r["tiny"] > 3:
                    tinys.append((rel, r["tiny"]))
            except Exception as e:  # noqa: BLE001
                print(f"  ! {rel}: {str(e)[:70]}")
            pg.close()
        b.close()
    print(f"{len(pages)} pages at {a.width}px: {len(bad)} overflow horizontally, {len(tinys)} have >3 tap targets under 24px")
    for rel, n in sorted(tinys, key=lambda x: -x[1]):
        print(f"  ◻ {rel}: {n} tap targets under 24px")
    for rel, r in sorted(bad, key=lambda x: -x[1]["over"]):
        print(f"  ↔ {rel}: +{r['over']}px  e.g. {', '.join(r['offenders'][:3])}")
    if common:
        print("most common offenders:", ", ".join(f"{k} ×{v}" for k, v in common.most_common(8)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
