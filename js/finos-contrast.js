/**
 * FIN-OS contrast healer — light-theme text safety net.   (v1.0)
 *
 * Most of FIN-OS was designed dark-first: components inject their own CSS with neon accents and white-alpha text.
 * In light theme that text lands on pale surfaces at 1.0–3:1 contrast (often invisible). Fixing every component's CSS is the
 * right long-term answer; this closes the gap now, everywhere, including UI that scripts render later.
 *
 * What it does (light theme only):
 *   for each visible text element whose colour fails WCAG AA (4.5:1) against its real, opaque background,
 *   set an inline colour with the SAME HUE but adjusted lightness (greys/whites become #556070).
 *   If the text sits under CSS opacity (very common for "secondary" text: opacity .4–.7), the opacity is part of the maths — a
 *   colour that passes on paper still fails once it is half-transparent. We first try a colour that passes at that opacity;
 *   if none can (e.g. opacity .4), the nearest opacity-bearing element is raised just enough. Reverted exactly in dark theme.
 * What it never does:
 *   • touch elements over gradients / images / transparent-unknown backgrounds (can't know the real contrast)
 *   • touch gradient-clipped text, SVG, inputs' placeholder, or anything inside [data-no-contrast]
 *   • persist: switching to dark removes every adjustment it made, restoring the original inline colour exactly
 *
 *   FinosContrast.heal(root?)      one pass (idle-chunked on big pages)   → number of fixes
 *   FinosContrast.revert(root?)    undo all
 *   FinosContrast.start()          auto: heal in light theme, revert in dark, follow theme toggles and new DOM
 * Pure colour helpers (parse/contrast/adjust) are exported for tests.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FinosContrast = api; if (root.document) api.start(); }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const TARGET = 4.5;
  const MIN_OPACITY = 0.5;                // below this the text is decorative or mid-fade, never healed
  const MAX_OPACITY_BUMP = 0.35;          // never raise opacity by more than this (colour-only fix is applied instead)
  const AIM = 0.15;                       // corrections aim slightly above TARGET so rgb() rounding can't land at 4.49
  const MARK = 'data-fc-orig';            // original inline colour (value + priority) so revert is exact
  const OPMARK = 'data-fc-op';            // original inline opacity (value + priority) of an element whose opacity we raised

  /* ── colour maths ─────────────────────────────────────────────────── */
  function parse(c) {
    const m = String(c || '').match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/);
    if (!m) return null;
    let a = m[4] === undefined ? 1 : (String(m[4]).endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  const chan = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  function contrast(a, b) { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

  function toHsl({ r, g, b }) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
    if (mx !== mn) {
      const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
    }
    return { h, s, l };
  }
  function fromHsl({ h, s, l }) {
    const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    if (s === 0) { const v = l * 255; return { r: v, g: v, b: v, a: 1 }; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return { r: f(p, q, h + 1 / 3) * 255, g: f(p, q, h) * 255, b: f(p, q, h - 1 / 3) * 255, a: 1 };
  }
  const css = (c) => `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;

  /**
   * Return a colour close to `fg` that reaches `target` on the opaque `bg`, or null if `fg` already passes.
   * Same hue; lightness moves away from the background. Near-greys snap to a calm slate (#556070 / #cbd2de).
   */
  function adjust(fg, bg, target) {
    target = target || TARGET;
    const base = fg.a < 1 ? over(fg, bg) : fg;
    if (contrast(base, bg) >= target) return null;
    const need = target + AIM;
    const bgLight = lum(bg) > 0.35;
    const hsl = toHsl(base);
    const chroma = (Math.max(base.r, base.g, base.b) - Math.min(base.r, base.g, base.b)) / 255;
    if (chroma < 0.12) {                                  // chroma, not HSL saturation (which explodes near white)                                   // white / grey text: use the design system's muted slate
      const slate = bgLight ? { r: 0x55, g: 0x60, b: 0x70, a: 1 } : { r: 0xcb, g: 0xd2, b: 0xde, a: 1 };
      if (contrast(slate, bg) >= need) return slate;
    }
    let lo = bgLight ? 0.05 : hsl.l, hi = bgLight ? hsl.l : 0.97, best = null;
    for (let i = 0; i < 18; i++) {                        // binary search the lightness closest to the original that passes
      const mid = (lo + hi) / 2;
      const cand = fromHsl({ h: hsl.h, s: Math.min(1, hsl.s * (bgLight ? 1 : 0.9)), l: mid });
      if (contrast(cand, bg) >= need) { best = cand; if (bgLight) lo = mid; else hi = mid; }
      else if (bgLight) hi = mid; else lo = mid;
    }
    return best || (bgLight ? { r: 0x1f, g: 0x24, b: 0x2e, a: 1 } : { r: 0xf5, g: 0xf7, b: 0xfa, a: 1 });
  }

  /**
   * Like adjust(), but for text that is rendered under CSS `opacity` (0–1, the product over the element and its ancestors).
   * Returns null if it already passes, else { color, opacity } where `opacity` is the TOTAL effective opacity needed
   * (== `op` when a colour change alone is enough, higher when it isn't).
   */
  function adjustWithOpacity(fg, bg, op, target) {
    target = target || TARGET;
    op = Math.max(0, Math.min(1, op));
    if (op >= 0.999) { const c = adjust(fg, bg, target); return c ? { color: c, opacity: 1 } : null; }
    const seen = (c, o) => over({ r: c.r, g: c.g, b: c.b, a: (c.a === undefined ? 1 : c.a) * o }, bg);
    if (contrast(seen(fg, op), bg) >= target) return null;
    const need = target + AIM;
    const bgLight = lum(bg) > 0.35;
    const base = fg.a < 1 ? over(fg, bg) : fg;
    const hsl = toHsl(base);
    const extreme = bgLight ? { r: 0x1f, g: 0x24, b: 0x2e, a: 1 } : { r: 0xf5, g: 0xf7, b: 0xfa, a: 1 };
    // 1) keep the hue, move lightness away from the background until the *rendered* colour passes
    let lo = bgLight ? 0.03 : hsl.l, hi = bgLight ? hsl.l : 0.99, best = null;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      const cand = fromHsl({ h: hsl.h, s: Math.min(1, hsl.s * (bgLight ? 1 : 0.9)), l: mid });
      if (contrast(seen(cand, op), bg) >= need) { best = cand; if (bgLight) lo = mid; else hi = mid; }
      else if (bgLight) hi = mid; else lo = mid;
    }
    if (best) return { color: best, opacity: op };
    // 2) no colour is dark/light enough at this opacity: use the extreme colour and raise opacity just enough
    let a = op, b = 1, got = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (a + b) / 2;
      if (contrast(seen(extreme, mid), bg) >= need) { got = mid; b = mid; } else a = mid;
    }
    return { color: extreme, opacity: got };
  }

  /* ── DOM ─────────────────────────────────────────────────────────── */
  /** Mean colour of a CSS gradient's stops (rgb/rgba/#hex only). null if any stop is something we can't read (var(), url(), named…). */
  function gradientColour(img) {
    if (!/gradient\(/.test(img) || /url\(/.test(img)) return null;
    const stops = img.match(/rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g);
    if (!stops || !stops.length) return null;
    // every colour-looking token must be a stop we parsed; a gradient using var()/named colours isn't estimable
    if (/var\(|\b(?:red|blue|green|white|black|gray|grey|transparent|currentcolor)\b/i.test(img.replace(/rgba?\([^)]*\)/g, ''))) return null;
    const cols = stops.map((t) => {
      if (t[0] !== '#') return parse(t);
      let h = t.slice(1); if (h.length <= 4) h = h.split('').map((c) => c + c).join('');
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    });
    if (cols.some((c) => !c)) return null;
    const n = cols.length;
    return { r: cols.reduce((t, c) => t + c.r, 0) / n, g: cols.reduce((t, c) => t + c.g, 0) / n, b: cols.reduce((t, c) => t + c.b, 0) / n, a: cols.reduce((t, c) => t + c.a, 0) / n };
  }

  function opaqueBackground(el) {
    // Walk up compositing translucent layers. Returns null when the real backdrop can't be known (photo/url or unreadable gradient).
    const layers = [];
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = root.getComputedStyle(e);
      const img = cs.backgroundImage;
      let opaque = false;
      if (img && img !== 'none') {
        const g = gradientColour(img);
        if (!g) return null;
        layers.push(g); if (g.a >= 1) opaque = true;
      }
      const c = parse(cs.backgroundColor);
      if (!opaque && c && c.a > 0) { layers.push(c); if (c.a >= 1) opaque = true; }
      if (opaque) break;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };          // page canvas
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }

  const SKIP = /^(SCRIPT|STYLE|NOSCRIPT|SVG|CANVAS|TEXTAREA|INPUT|SELECT|OPTION|IMG|VIDEO|IFRAME|CODE|PRE)$/i;

  function visible(el, cs) {
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.25) return false;   // (own opacity only; the chain check in healElement is stricter)
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  }

  /**
   * Product of `opacity` over the element and its ancestors, the nearest element that actually sets one (< 1), and whether any
   * element in that chain is animated (an opacity transition or a running animation). Animated opacity means a reveal / fade
   * effect: the current value is a transient state, so we must not freeze it with an inline override.
   */
  function opacityChain(el) {
    let op = 1, holder = null, animated = false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const cs = root.getComputedStyle(e);
      const o = parseFloat(cs.opacity);
      if (o < 1) {
        op *= o; if (!holder) holder = { el: e, o };
        const props = String(cs.transitionProperty || ''), dur = String(cs.transitionDuration || '');
        if (/\b(opacity|all)\b/.test(props) && /[1-9]/.test(dur.replace(/0(\.0+)?m?s/g, ''))) animated = true;
        if (e.getAnimations && e.getAnimations().length) animated = true;
      }
    }
    return { op, holder, animated };
  }

  function healElement(el) {
    if (el.hasAttribute(MARK) || el.hasAttribute(OPMARK)) return false;   // already adjusted (revert first to re-evaluate)
    const cs = root.getComputedStyle(el);
    if (!visible(el, cs)) return false;
    if ((cs.webkitBackgroundClip || cs.backgroundClip) === 'text') return false;
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.1) return false;
    const bg = opaqueBackground(el);
    if (!bg) return false;
    const { op, holder, animated } = opacityChain(el);
    if (animated) return false;                            // reveal / fade effect: opacity is a transient state, leave it alone
    if (op < MIN_OPACITY) return false;                    // effectively hidden or a pre-reveal start state, not text to read
    const fix = adjustWithOpacity(fg, bg, op);
    if (!fix) return false;
    el.setAttribute(MARK, el.style.getPropertyValue('color') + '|' + el.style.getPropertyPriority('color'));
    el.style.setProperty('color', css(fix.color), 'important');
    if (holder && fix.opacity > op + 0.005 && fix.opacity - op <= MAX_OPACITY_BUMP) {   // small nudges only; a big jump is design intent
      const target = Math.min(1, holder.o * fix.opacity / op);
      const h = holder.el;
      if (!h.hasAttribute(OPMARK)) h.setAttribute(OPMARK, h.style.getPropertyValue('opacity') + '|' + h.style.getPropertyPriority('opacity'));
      if (target > parseFloat(h.style.getPropertyValue('opacity') || '0') || !h.style.getPropertyValue('opacity')) h.style.setProperty('opacity', String(+target.toFixed(3)), 'important');
    }
    return true;
  }

  function textElements(scope) {
    const doc = root.document, out = [], seen = new Set();
    const w = doc.createTreeWalker(scope, root.NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeValue.trim().length < 1) continue;
      const el = n.parentElement;
      if (!el || seen.has(el) || SKIP.test(el.tagName) || el.closest('[data-no-contrast]') || el.closest('svg')) continue;
      seen.add(el); out.push(el);
    }
    return out;
  }

  function isLight() { return root.document.documentElement.getAttribute('data-theme') === 'light'; }

  function heal(scope) {
    const doc = root.document;
    if (!doc || !doc.body) return 0;
    const els = textElements(scope || doc.body);
    let fixed = 0, i = 0;
    const CHUNK = 400;
    return new Promise((resolve) => {
      const step = () => {
        if (!isLight()) return resolve(fixed);              // theme flipped mid-pass
        const end = Math.min(i + CHUNK, els.length);
        for (; i < end; i++) { try { if (healElement(els[i])) fixed++; } catch (_) { /* detached node */ } }
        if (i < els.length) (root.requestIdleCallback ? root.requestIdleCallback(step, { timeout: 200 }) : setTimeout(step, 16));
        else resolve(fixed);
      };
      step();
    });
  }

  function revert(scope) {
    const doc = root.document; if (!doc) return 0;
    let n = 0;
    (scope || doc).querySelectorAll('[' + OPMARK + ']').forEach((el) => {
      const [val, prio] = (el.getAttribute(OPMARK) || '|').split('|');
      if (val) el.style.setProperty('opacity', val, prio || ''); else el.style.removeProperty('opacity');
      el.removeAttribute(OPMARK);
      if (!el.getAttribute('style')) el.removeAttribute('style');
    });
    (scope || doc).querySelectorAll('[' + MARK + ']').forEach((el) => {
      const [val, prio] = (el.getAttribute(MARK) || '|').split('|');
      if (val) el.style.setProperty('color', val, prio || ''); else el.style.removeProperty('color');
      el.removeAttribute(MARK);
      if (!el.getAttribute('style')) el.removeAttribute('style');
      n++;
    });
    return n;
  }

  let started = false, timer = null;
  function start() {
    if (started || !root.document) return;
    started = true;
    const run = () => { if (isLight()) heal(); else revert(); };
    const go = () => {
      setTimeout(run, 400);                                // after first render + script-built UI
      if (!root.MutationObserver) return;
      const pending = new Set();
      new root.MutationObserver((muts) => {
        if (muts.some((m) => m.type === 'attributes')) {            // theme toggled
          pending.clear(); revert();
          if (isLight()) { clearTimeout(timer); timer = setTimeout(run, 120); }
          return;
        }
        if (!isLight()) return;
        muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1 && !n.hasAttribute(MARK)) pending.add(n); }));
        if (!pending.size) return;
        clearTimeout(timer);
        timer = setTimeout(() => { const roots = Array.from(pending); pending.clear(); roots.forEach((r) => { if (r.isConnected) heal(r); }); }, 300);   // only the new subtrees
      }).observe(root.document.documentElement, { attributes: true, attributeFilter: ['data-theme'], childList: true, subtree: true });
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', go); else go();
  }

  return { parse, contrast, adjust, adjustWithOpacity, over, heal, revert, start, lum, gradientColour, _css: css };
});
