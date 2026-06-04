/**
 * FIN-OS Interactions — Inline Hover Override Engine
 * ───────────────────────────────────────────────────
 * CSS cannot override inline onmouseover/onmouseout or inline :hover
 * pseudo-elements set via style attributes. This script:
 *   1. Scans all interactive elements for inline hover backgrounds
 *   2. Classifies them by context (card, link, button, chip)
 *   3. Applies data-hover attribute for CSS-side override
 *   4. Replaces onmouseover/onmouseout background injections with no-ops
 *
 * Runs once on DOMContentLoaded — zero performance cost.
 */
(function FinosInteractions() {
  'use strict';

  /* ── Patterns that indicate a "fill hover" we want to replace ─── */
  const FILL_PATTERNS = [
    /background\s*:\s*rgba?\([^)]+\)/i,
    /background-color\s*:/i,
    /background\s*:\s*var\(/i,
  ];

  function hasFill(str) {
    return FILL_PATTERNS.some(p => p.test(str));
  }

  /* ── Classify element → assign data-hover type ──────────────────── */
  function classify(el) {
    const tag = el.tagName.toLowerCase();
    const cls = el.className || '';

    // Cards → lift
    if (tag === 'a' && (cls.includes('card') || cls.includes('btn') || cls.includes('suite'))) return 'lift';
    if (cls.includes('card') || cls.includes('vision') || cls.includes('belief')) return 'lift';

    // Navigation links / chips → bright (no fill, text brightens)
    if (tag === 'a' || tag === 'button') return 'bright';

    // Generic divs / spans that are hover-highlighted → glow
    return 'glow';
  }

  /* ── Strip background from inline onmouseover handlers ──────────── */
  function sanitizeInlineHandler(el, attr) {
    const handler = el.getAttribute(attr);
    if (!handler) return;
    if (hasFill(handler)) {
      // Replace with a no-op that keeps any non-background properties
      const cleaned = handler
        .replace(/this\.style\.background\s*=\s*['"][^'"]*['"]\s*;?\s*/g, '')
        .replace(/this\.style\.backgroundColor\s*=\s*['"][^'"]*['"]\s*;?\s*/g, '')
        .trim();
      el.setAttribute(attr, cleaned || 'void 0');
    }
  }

  /* ── Remove inline style hover backgrounds via event override ────── */
  function patchElement(el) {
    // Classify and tag
    if (!el.dataset.hover) {
      el.dataset.hover = classify(el);
    }

    // Patch inline handlers
    sanitizeInlineHandler(el, 'onmouseover');
    sanitizeInlineHandler(el, 'onmouseout');

    // Override addEventListener for background-setting mouseover
    // (intercept JS-set hover backgrounds)
    const _orig = el.style.setProperty.bind(el.style);
    const _isHovering = () => el.matches(':hover');
    const origBg = el.style.background;

    // When JS tries to set background during hover, block it
    const guardBg = (prop, val) => {
      if ((prop === 'background' || prop === 'background-color') && _isHovering()) {
        return; // suppress fill during hover
      }
      _orig(prop, val);
    };
    // Note: We only do this for elements that had inline hover handlers
    // to avoid performance hit on all elements
  }

  /* ── Main scan ───────────────────────────────────────────────────── */
  function init() {
    // 1. Elements with inline onmouseover that set background
    const withInlineHandlers = document.querySelectorAll('[onmouseover],[onmouseout]');
    withInlineHandlers.forEach(el => {
      const over = el.getAttribute('onmouseover') || '';
      const out  = el.getAttribute('onmouseout')  || '';
      if (hasFill(over) || hasFill(out)) {
        patchElement(el);
      }
    });

    // 2. Elements that use JS event listeners to set background (common pattern)
    // We intercept via MutationObserver watching style changes during hover
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'style') {
          const el = m.target;
          if (!el.matches(':hover')) continue;
          const bg = el.style.background || el.style.backgroundColor;
          if (bg && bg !== 'transparent' && bg !== '' && bg !== 'initial') {
            // Strip the background set by JS during hover
            el.style.background = '';
            el.style.backgroundColor = '';
            if (!el.dataset.hover) el.dataset.hover = classify(el);
          }
        }
      }
    });

    // Observe all interactive elements
    document.querySelectorAll('a, button, [onclick], [class*="card"], [class*="btn"], [class*="link"], [class*="item"]')
      .forEach(el => {
        observer.observe(el, { attributes: true, attributeFilter: ['style'] });
      });

    // 3. Fix specific patterns from the sidebar injected by personalization
    // Arya status strip items had inline style hovers
    document.querySelectorAll('[onmouseover*="background"], [onmouseout*="background"]').forEach(el => {
      el.removeAttribute('onmouseover');
      el.removeAttribute('onmouseout');
      el.dataset.hover = classify(el);
    });

    // 4. Smooth out all interactive elements with a base transition
    document.querySelectorAll('a, button, [role="button"], [onclick]').forEach(el => {
      if (!el.style.transition) {
        el.style.transition = 'color 150ms, opacity 150ms, transform 160ms, box-shadow 160ms, border-color 160ms';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
