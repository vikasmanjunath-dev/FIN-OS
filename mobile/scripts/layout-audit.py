#!/usr/bin/env python3
"""Layout audit of the phone app in the Expo web preview at a large text scale and a narrow screen.

    npx expo start --web --port 8191            # in mobile/  (a FRESH server: a stale one serves the 404 page for new routes)
    BASE=http://localhost:8191 python3 mobile/scripts/layout-audit.py                 # every route, 200% text, 320 px wide
    TEXT_SCALE=1 VIEW_W=430 python3 mobile/scripts/layout-audit.py /pulse /alerts      # any combination, any routes

What it simulates: the phone's "font size" setting. Native text is multiplied by the system font scale while boxes with a fixed
height are not, which is what makes text clip. The page here gets the same treatment: every font-size / line-height declared in a
stylesheet or a style attribute is multiplied by TEXT_SCALE (default 2), widths and fixed heights stay as the app set them.

Per screen it reports (and draws a red / orange outline around, in the screenshot saved to $LAYOUT_SHOTS) the things a person notices:
  hscroll   the page is wider than the screen, or visible content sticks out of the right edge (outside a horizontal scroller)
  clipped   text cut off by an ancestor with overflow:hidden, or a line-clamped / ellipsized text that is shorter than its content
  small     tappable controls under 44 x 44 CSS px (Apple HIG 44 pt; Android asks 48 dp)
  overlap   two pieces of text whose painted boxes overlap by more than 25% of the smaller one
  safe      text or controls inside the top SAFE_TOP / bottom SAFE_BOTTOM px at rest: on a phone with a notch / Dynamic Island / home
            indicator that area belongs to the system (web has no safe-area insets, so this is a position check, not a render check)
A screen that is the "Unmatched Route" page, or that has almost no text, is a FAILURE (it proves nothing).
Exit code 1 when anything is found, or any screen did not load.
"""
import os, sys, re, json
import importlib.util
from playwright.sync_api import sync_playwright

_spec = importlib.util.spec_from_file_location('smoke_routes', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'smoke-routes.py'))
_smoke = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_smoke)

BASE = os.environ.get('BASE', 'http://localhost:8082')
SHOTS = os.environ.get('LAYOUT_SHOTS', '/tmp/layout-audit')
MODE = os.environ.get('THEME', 'dark')
POPULATED = os.environ.get('POPULATED') == '1'
TEXT_SCALE = float(os.environ.get('TEXT_SCALE', '2'))
VIEW_W = int(os.environ.get('VIEW_W', '320'))
VIEW_H = int(os.environ.get('VIEW_H', '700'))
SAFE_TOP = int(os.environ.get('SAFE_TOP', '47'))
SAFE_BOTTOM = int(os.environ.get('SAFE_BOTTOM', '34'))
MIN_TARGET = 44
ROUTES = sys.argv[1:] or _smoke.routes()

SCALE_JS = """
(() => {
  const K = %(k)s; if (K === 1) return;
  const done = new WeakSet();
  const scaleRule = rule => {
    if (done.has(rule)) return; done.add(rule);
    if (rule.cssRules && !rule.style) { for (const r of rule.cssRules) scaleRule(r); return; }
    const st = rule.style; if (!st) return;
    for (const p of ['font-size', 'line-height']) {
      const v = st.getPropertyValue(p);
      const m = v && v.match(/^(-?[0-9.]+)px$/);
      if (m) st.setProperty(p, (parseFloat(m[1]) * K) + 'px', st.getPropertyPriority(p));
    }
  };
  const sweep = () => {
    for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) scaleRule(r); } catch (e) {} }
    for (const el of document.querySelectorAll('[style]')) {
      if (el.dataset.fsDone === el.getAttribute('style')) continue;
      for (const p of ['fontSize', 'lineHeight']) {
        const v = el.style[p]; const m = v && v.match(/^(-?[0-9.]+)px$/);
        if (m) el.style[p] = (parseFloat(m[1]) * K) + 'px';
      }
      el.dataset.fsDone = el.getAttribute('style');
    }
  };
  const orig = CSSStyleSheet.prototype.insertRule;
  CSSStyleSheet.prototype.insertRule = function (text, idx) { const i = orig.call(this, text, idx); try { scaleRule(this.cssRules[i]); } catch (e) {} return i; };
  setInterval(sweep, 150);
})();
"""

AUDIT_JS = r"""
({minTarget, safeTop, safeBottom}) => {
  const W = window.innerWidth, H = window.innerHeight;
  const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const label = el => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.getAttribute('role') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 48);
  const isScroller = (el, axis) => { const cs = getComputedStyle(el); const o = axis === 'x' ? cs.overflowX : cs.overflowY; return o === 'auto' || o === 'scroll'; };
  const out = { hscroll: [], clipped: [], small: [], overlap: [], safe: [] };
  const mark = (el, kind) => { el.setAttribute('data-audit', kind); };

  // hscroll
  const de = document.documentElement;
  if (de.scrollWidth > W + 1) out.hscroll.push({ what: 'document wider than screen', scrollWidth: de.scrollWidth, width: W });
  const inHScroller = el => { for (let e = el.parentElement; e; e = e.parentElement) { if (isScroller(e, 'x') && e.scrollWidth > e.clientWidth + 1) return true; } return false; };
  const textEls = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while (n = walker.nextNode()) {
    const t = n.textContent.replace(/\s+/g, ' ').trim(); if (!t) continue;
    const el = n.parentElement; if (!el || !vis(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
    if (!rects.length) continue;
    textEls.push({ el, t, rects, n });
  }
  const seenH = new Set();
  for (const { el, t, rects } of textEls) {
    const maxR = Math.max(...rects.map(r => r.right));
    if (maxR > W + 1 && !inHScroller(el)) { const k = t.slice(0, 30); if (!seenH.has(k)) { seenH.add(k); out.hscroll.push({ what: 'text past the right edge', text: t.slice(0, 40), right: Math.round(maxR), width: W }); mark(el, 'hscroll'); } }
  }

  // clipped by overflow:hidden ancestors (up to the nearest scroller)
  const seenC = new Set();
  for (const { el, t, rects } of textEls) {
    const tr = { left: Math.min(...rects.map(r => r.left)), right: Math.max(...rects.map(r => r.right)), top: Math.min(...rects.map(r => r.top)), bottom: Math.max(...rects.map(r => r.bottom)) };
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (isScroller(a, 'y') && isScroller(a, 'x')) break;
      const hidX = cs.overflowX === 'hidden' || cs.overflowX === 'clip', hidY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      if (!hidX && !hidY) continue;
      const ar = a.getBoundingClientRect(); if (ar.width === 0) continue;
      const cutX = hidX && !isScroller(a, 'x') && (tr.right > ar.right + 1.5 || tr.left < ar.left - 1.5);
      const cutY = hidY && !isScroller(a, 'y') && (tr.bottom > ar.bottom + 1.5 || tr.top < ar.top - 1.5);
      if ((cutX && ar.right <= W + 2) || cutY) {
        // ignore: the ancestor is the page root (clips to the screen, handled by hscroll) or a scroller body
        if (a === document.documentElement) break;
        const k = t.slice(0, 30) + '|' + (cutX ? 'x' : 'y');
        if (!seenC.has(k)) { seenC.add(k); out.clipped.push({ text: t.slice(0, 50), axis: cutX ? 'x' : 'y', text_box: [Math.round(tr.left), Math.round(tr.top), Math.round(tr.right), Math.round(tr.bottom)], clip_box: [Math.round(ar.left), Math.round(ar.top), Math.round(ar.right), Math.round(ar.bottom)] }); mark(el, 'clipped'); }
        break;
      }
    }
    // own box: line-clamp / ellipsis that dropped content
    const cs = getComputedStyle(el);
    const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
    if ((cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) || (clamp && el.scrollHeight > el.clientHeight + 1)) {
      const k = 'ell|' + t.slice(0, 30);
      if (!seenC.has(k)) { seenC.add(k); out.clipped.push({ text: t.slice(0, 50), axis: 'ellipsis', note: 'text shortened with ... (numberOfLines): content hidden at this size' }); mark(el, 'clipped'); }
    }
  }

  // small targets
  const sel = '[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],[role=radio],[role=menuitem],button,a[href],input,textarea,select,[tabindex="0"]';
  const seenS = new Set();
  for (const el of document.querySelectorAll(sel)) {
    if (!vis(el)) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    if (el.getAttribute('aria-disabled') === 'true' && false) continue;
    const r = el.getBoundingClientRect();
    if (r.width < minTarget - 0.5 || r.height < minTarget - 0.5) {
      const nested = el.querySelector(sel);                  // a wrapper around real controls is not itself the target
      if (nested && nested !== el) continue;
      const host = el.parentElement && el.parentElement.closest(sel);   // a picture inside a bigger control (a Switch inside a tappable row) is not the target either
      if (host) { const hr = host.getBoundingClientRect(); if (hr.width >= minTarget - 0.5 && hr.height >= minTarget - 0.5) continue; }
      const k = label(el) + '|' + Math.round(r.width) + 'x' + Math.round(r.height);
      if (!seenS.has(k)) { seenS.add(k); out.small.push({ label: label(el), w: Math.round(r.width), h: Math.round(r.height), role: el.getAttribute('role') || el.tagName.toLowerCase() }); mark(el, 'small'); }
    }
  }

  // overlap of text
  const items = textEls.map(o => ({ ...o, box: { left: Math.min(...o.rects.map(r => r.left)), right: Math.max(...o.rects.map(r => r.right)), top: Math.min(...o.rects.map(r => r.top)), bottom: Math.max(...o.rects.map(r => r.bottom)) } }));
  const seenO = new Set();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ix = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
      const iy = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
      if (ix <= 1 || iy <= 1) continue;
      // use per-line rects so a wrapped paragraph's bounding box does not collide with a neighbour it does not touch
      let hit = false;
      for (const ra of a.rects) for (const rb of b.rects) {
        const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (x > 1 && y > 1 && (x * y) / Math.min(ra.width * ra.height, rb.width * rb.height) > 0.25) hit = true;
      }
      if (!hit) continue;
      const k = a.t.slice(0, 20) + '|' + b.t.slice(0, 20);
      if (!seenO.has(k)) { seenO.add(k); out.overlap.push({ a: a.t.slice(0, 40), b: b.t.slice(0, 40) }); mark(a.el, 'overlap'); mark(b.el, 'overlap'); }
    }
  }

  // safe-area bands (position check at rest)
  const seenF = new Set();
  const scrollTop0 = !document.scrollingElement || document.scrollingElement.scrollTop === 0;
  for (const { el, t, rects } of textEls) {
    const top = Math.min(...rects.map(r => r.top)), bottom = Math.max(...rects.map(r => r.bottom));
    if (top < safeTop - 0.5 && bottom > 0) { const k = 'T' + t.slice(0, 30); if (!seenF.has(k)) { seenF.add(k); out.safe.push({ band: 'top', text: t.slice(0, 40), y: Math.round(top) }); mark(el, 'safe'); } }
    if (bottom > H - safeBottom + 0.5 && top < H) { const k = 'B' + t.slice(0, 30); if (!seenF.has(k)) { seenF.add(k); out.safe.push({ band: 'bottom', text: t.slice(0, 40), y: Math.round(bottom) }); mark(el, 'safe'); } }
  }
  return out;
}
"""

OUTLINE_CSS = """
[data-audit=hscroll],[data-audit=clipped],[data-audit=overlap]{outline:2px solid #ff1744 !important;outline-offset:-1px}
[data-audit=small]{outline:2px dashed #ff9100 !important;outline-offset:-1px}
[data-audit=safe]{outline:2px dotted #d500f9 !important}
"""

KINDS = ('hscroll', 'clipped', 'overlap', 'small', 'safe')


def main():
    os.makedirs(SHOTS, exist_ok=True)
    results = {}
    not_loaded = []
    with sync_playwright() as pw:
        b = pw.chromium.launch(channel='chromium')
        ctx = b.new_context(viewport={'width': VIEW_W, 'height': VIEW_H})
        init = f"localStorage.setItem('finos_theme_mobile','{MODE}');"
        if POPULATED:
            for k, v in _smoke.populated().items():
                init += f"localStorage.setItem({k!r},{json.dumps(v if isinstance(v, str) else json.dumps(v))});"
        ctx.add_init_script(init)
        ctx.add_init_script(SCALE_JS % {'k': TEXT_SCALE})
        ctx.route(re.compile(r'^https?://(?!localhost|127\.0\.0\.1).*'), lambda r: r.abort())
        pg = ctx.new_page()
        for r in ROUTES:
            try:
                pg.goto(BASE + r, wait_until='domcontentloaded'); pg.wait_for_timeout(2600)
                text = pg.inner_text('body')
            except Exception as e:  # noqa: BLE001
                print(r, 'NAVIGATION FAILED', str(e)[:100]); not_loaded.append(r); continue
            if _smoke.UNMATCHED.search(text) or len(text.strip()) < 15:
                print(r, 'NOT A REAL SCREEN (404 / empty): nothing checked'); not_loaded.append(r); continue
            res = pg.evaluate(AUDIT_JS, {'minTarget': MIN_TARGET, 'safeTop': SAFE_TOP, 'safeBottom': SAFE_BOTTOM})
            results[r] = res
            counts = {k: len(res[k]) for k in KINDS}
            print(r, ' '.join(f'{k}={v}' for k, v in counts.items()))
            if any(counts[k] for k in KINDS if k != 'safe') or counts['safe']:
                pg.add_style_tag(content=OUTLINE_CSS)
                pg.screenshot(path=os.path.join(SHOTS, r.strip('/').replace('/', '_') + '.png'))
        b.close()
    with open(os.path.join(SHOTS, 'results.json'), 'w') as f:
        json.dump({'text_scale': TEXT_SCALE, 'view_w': VIEW_W, 'mode': MODE, 'populated': POPULATED, 'results': results, 'not_loaded': not_loaded}, f, indent=1)
    tot = {k: sum(len(v[k]) for v in results.values()) for k in KINDS}
    print(f'{len(results)} screens audited at text x{TEXT_SCALE}, {VIEW_W} px wide ({MODE}, {"populated" if POPULATED else "empty"}); not loaded: {len(not_loaded)}')
    print('TOTAL', tot)
    return 1 if (any(tot.values()) or not_loaded) else 0


if __name__ == '__main__':
    sys.exit(main())
