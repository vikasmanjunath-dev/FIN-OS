/**
 * FIN-OS accessibility helper — gives unlabeled form controls and dialogs an accessible name.   (v1.0)
 *
 * Many pages show a visible label next to a control without associating the two (e.g. "Monthly Investment"
 * above a slider + number box, or a settings row whose toggle sits in a different element than its text).
 * Sighted users can tell; screen-reader users hear "edit text, blank". This fills the gap from the DOM itself:
 *
 *   • a control with no accessible name takes the text of the nearest visible label in its row/group
 *     (sliders get " (slider)", the second control in a group gets " (value)")
 *   • overlays that behave as dialogs get role="dialog", aria-modal and a name from their heading
 *   • <canvas> charts get role="img" and the nearest heading as their name
 *   • a "Skip to main content" link is added as the first focusable element
 *   • runs once on load and again (debounced) when UI is rendered later by scripts
 *
 * It never overrides an existing aria-label / aria-labelledby / <label for>, never touches hidden or
 * button-like inputs, and is safe to load more than once.  Prefer fixing markup at the source for new UI;
 * this is the safety net for the ~100 existing pages.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.FinosA11y = api;
    if (root.document) api.start();
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const CONTROLS = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]),select,textarea';
  const GROUPS = '.input-group,.setting-row,.form-group,.field,.fg,.tc-field,.tc-row,.form-row,.control-row';

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  function hasName(el) {
    if (clean(el.getAttribute('aria-label')) || clean(el.getAttribute('aria-labelledby'))) return true;
    const labels = el.labels ? Array.from(el.labels) : [];
    return labels.some((l) => clean(l.textContent).length > 0);
  }

  function visibleLabelFor(el) {
    const scope = el.closest(GROUPS);
    if (scope) {
      const cands = scope.querySelectorAll('.label-group label, label, legend, .label');
      for (const l of cands) {
        if (l.contains(el)) continue;
        const t = clean(l.textContent);
        if (t) return { text: t, scope };
      }
    }
    for (let p = el.previousElementSibling; p; p = p.previousElementSibling) {          // <label>Name</label><input>
      if (p.tagName === 'LABEL' && clean(p.textContent)) return { text: clean(p.textContent), scope };
    }
    const alt = clean(el.getAttribute('placeholder')) || clean(el.getAttribute('title'));
    return alt ? { text: alt, scope } : null;
  }

  function labelControls(rootEl) {
    let n = 0;
    (rootEl || root.document).querySelectorAll(CONTROLS).forEach((el) => {
      if (hasName(el) || el.type === 'file' && el.hidden) return;
      const found = visibleLabelFor(el);
      if (!found) return;
      let text = found.text;
      if (el.type === 'range') text += ' (slider)';
      else if (found.scope && el.type === 'number' && found.scope.querySelector('input[type=range]')) text += ' (value)';
      el.setAttribute('aria-label', text);
      n++;
    });
    return n;
  }

  function nameDialogs(rootEl) {
    let n = 0;
    (rootEl || root.document).querySelectorAll('[id$="modal-overlay"],[id$="-modal"],.modal-overlay,.modal').forEach((el) => {
      const role = el.getAttribute('role');
      if ((role && role !== 'dialog' && role !== 'alertdialog') || el.getAttribute('aria-hidden') === 'true') return;
      if (clean(el.getAttribute('aria-label')) || clean(el.getAttribute('aria-labelledby'))) return;
      const heading = el.querySelector('h1,h2,h3,[class*="title"]');
      el.setAttribute('role', role || 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', heading && clean(heading.textContent) ? clean(heading.textContent) : 'Dialog');
      n++;
    });
    return n;
  }

  /* Chart.js / canvas charts are invisible to assistive tech. Give each one an image role and the nearest heading as its name. */
  function nameCharts(rootEl) {
    let n = 0;
    (rootEl || root.document).querySelectorAll('canvas:not([role]):not([aria-label]):not([aria-hidden])').forEach((c) => {
      const card = c.closest('section,article,.card,.chart-card,.impact-card,[class*="card"],[class*="panel"]') || c.parentElement;
      const h = card && card.querySelector('h1,h2,h3,h4,[class*="title"]');
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', (h && clean(h.textContent)) ? 'Chart: ' + clean(h.textContent) : 'Chart');
      n++;
    });
    return n;
  }

  /* Keyboard users shouldn't have to tab through the whole sidebar on every page. */
  function addSkipLink() {
    const d = root.document;
    if (!d.body || d.getElementById('finos-skip-link')) return false;
    const main = d.querySelector('main, .main, [role="main"]');
    if (!main) return false;
    if (!main.id) main.id = 'finos-main';
    if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
    const a = d.createElement('a');
    a.id = 'finos-skip-link';
    a.href = '#' + main.id;
    a.textContent = 'Skip to main content';
    a.style.cssText = 'position:fixed;left:8px;top:-60px;z-index:2147483647;padding:10px 16px;border-radius:10px;background:#4f7cff;color:#fff;font:600 14px system-ui,sans-serif;text-decoration:none;transition:top .15s;';
    a.addEventListener('focus', () => { a.style.top = '8px'; });
    a.addEventListener('blur', () => { a.style.top = '-60px'; });
    a.addEventListener('click', (e) => { e.preventDefault(); main.focus(); main.scrollIntoView({ block: 'start' }); a.blur(); });
    d.body.insertBefore(a, d.body.firstChild);
    return true;
  }

  function run(rootEl) { return { controls: labelControls(rootEl), dialogs: nameDialogs(rootEl), charts: nameCharts(rootEl), skip: addSkipLink() }; }

  let started = false;
  function start() {
    if (started || !root.document) return;
    started = true;
    const go = () => {
      run();
      if (!root.MutationObserver || !root.document.body) return;
      let t = null;
      new root.MutationObserver(() => { clearTimeout(t); t = setTimeout(run, 400); })
        .observe(root.document.body, { childList: true, subtree: true });
    };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', go);
    else go();
  }

  return { run, labelControls, nameDialogs, nameCharts, addSkipLink, start };
});
