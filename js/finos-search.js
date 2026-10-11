/**
 * FIN-OS Global Smart Search
 * Injects next to #themeToggle on every page. Zero dependencies.
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════
     SEARCH INDEX — every page, feature, calculator, tool
  ═══════════════════════════════════════════════════════ */
  /* The page index lives in js/finos-search-index.js and loads the first time search is opened, so its ~50 KB is not on every
     page's critical path. The file sits next to this one (same ?v= for cache-busting). */
  const SELF = document.currentScript && document.currentScript.src;
  const INDEX_SRC = SELF ? SELF.replace(/finos-search\.js/, 'finos-search-index.js') : '../js/finos-search-index.js';
  let INDEX = window.FinosSearchIndex || null;
  let indexLoading = null;
  function loadIndex() {
    if (INDEX) return Promise.resolve(INDEX);
    if (window.FinosSearchIndex) { INDEX = window.FinosSearchIndex; return Promise.resolve(INDEX); }
    if (indexLoading) return indexLoading;
    indexLoading = new Promise(resolve => {
      const s = document.createElement('script');
      s.src = INDEX_SRC;
      s.onload = () => { INDEX = window.FinosSearchIndex || []; resolve(INDEX); };
      s.onerror = () => { indexLoading = null; s.remove(); resolve(null); };          // offline or blocked: try again next time it opens
      document.head.appendChild(s);
    });
    return indexLoading;
  }

  /* ═══════════════════════════════════════════════════════
     SMART SEARCH — fuzzy scoring
  ═══════════════════════════════════════════════════════ */
  function score(item, q) {
    const ql = q.toLowerCase().trim();
    if (!ql) return 0;
    const tl = item.title.toLowerCase();
    const dl = item.desc.toLowerCase();
    const tags = item.tags.join(' ');
    let s = 0;
    if (tl === ql)           s += 100;
    if (tl.startsWith(ql))  s += 60;
    if (tl.includes(ql))    s += 40;
    if (dl.includes(ql))    s += 20;
    if (tags.includes(ql))  s += 15;
    // partial word matching
    ql.split(' ').forEach(word => {
      if (word.length < 2) return;
      if (tl.includes(word))  s += 10;
      if (tags.includes(word)) s += 5;
      if (dl.includes(word))   s += 3;
    });
    return s;
  }

  function search(q) {
    if (!q || q.trim().length < 1 || !INDEX) return [];
    return INDEX
      .map(item => ({ ...item, _score: score(item, q) }))
      .filter(x => x._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 8);
  }

  /* ═══════════════════════════════════════════════════════
     INJECT CSS
  ═══════════════════════════════════════════════════════ */
  const css = `
  #fs-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    margin-right: 10px;
    vertical-align: middle;
  }
  #fs-toggle {
    background: rgba(255,255,255,.07);
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 10px;
    width: 36px; height: 36px;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: rgba(255,255,255,.7);
    transition: all .18s;
    outline: none;
    flex-shrink: 0;
  }
  #fs-toggle:hover {
    background: rgba(0,212,255,.15);
    border-color: rgba(0,212,255,.4);
    color: #00d4ff;
  }
  #fs-toggle svg { width:16px; height:16px; fill:currentColor; }

  #fs-bar {
    position: fixed;
    top: 0; right: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    background: #13151f;
    border: 1.5px solid rgba(0,212,255,.35);
    border-radius: 12px;
    padding: 0 10px 0 12px;
    height: 38px;
    width: 0;
    overflow: hidden;
    opacity: 0;
    transition: width .28s cubic-bezier(.4,0,.2,1), opacity .2s, border-color .2s;
    box-shadow: 0 4px 24px rgba(0,0,0,.4), 0 0 0 1px rgba(0,212,255,.08);
    pointer-events: none;
    white-space: nowrap;
    z-index: 99997;
  }
  #fs-bar.active {
    width: min(380px, 70vw);
    opacity: 1;
    pointer-events: all;
  }
  #fs-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #fff;
    font-size: 13.5px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    min-width: 0;
    caret-color: #00d4ff;
  }
  #fs-input::placeholder { color: rgba(255,255,255,0.58); }
  #fs-clear {
    background: none; border: none; cursor: pointer;
    color: rgba(255,255,255,0.58); font-size: 14px;
    padding: 0; line-height:1;
    display: none;
    transition: color .15s;
    flex-shrink:0;
  }
  #fs-clear.show { display: block; }
  #fs-clear:hover { color: rgba(255,255,255,.8); }

  #fs-dropdown {
    position: fixed;
    top: 60px;
    right: 0;
    width: min(420px, 92vw);
    background: #0f1117;
    border: 1px solid rgba(0,212,255,.18);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,.7), 0 0 0 1px rgba(0,212,255,.06);
    display: none;
    z-index: 99999;
    max-height: 480px;
    overflow-y: auto;
  }
  #fs-dropdown.show { display: block; }
  #fs-dropdown::-webkit-scrollbar { width: 4px; }
  #fs-dropdown::-webkit-scrollbar-track { background: transparent; }
  #fs-dropdown::-webkit-scrollbar-thumb { background: rgba(0,212,255,.2); border-radius: 2px; }

  .fs-empty {
    padding: 22px 18px;
    text-align: center;
    color: rgba(255,255,255,0.58);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
  }
  .fs-cat-label {
    padding: 10px 16px 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.2px;
    color: rgba(0,212,255,.6);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    text-transform: uppercase;
  }
  .fs-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    cursor: pointer;
    text-decoration: none;
    transition: background .12s;
    border-bottom: 1px solid rgba(255,255,255,.04);
  }
  .fs-item:last-child { border-bottom: none; }
  .fs-item:hover, .fs-item.focused {
    background: rgba(0,212,255,.08);
  }
  .fs-item-icon {
    width: 32px; height: 32px;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }
  .cat-Pages       .fs-item-icon { background: rgba(123,47,247,.2); }
  .cat-Calculators .fs-item-icon { background: rgba(0,212,255,.15); }
  .cat-Learning    .fs-item-icon { background: rgba(0,255,150,.12); }
  .cat-Trackers    .fs-item-icon { background: rgba(245,158,11,.15); }
  .fs-item-body { flex: 1; min-width: 0; }
  .fs-item-title {
    font-size: 13.5px;
    font-weight: 600;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fs-item-desc {
    font-size: 11.5px;
    color: rgba(255,255,255,0.58);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
  }
  .fs-item-arrow {
    color: rgba(255,255,255,0.58);
    font-size: 13px;
    flex-shrink: 0;
    transition: color .12s, transform .12s;
  }
  .fs-item:hover .fs-item-arrow, .fs-item.focused .fs-item-arrow {
    color: #00d4ff;
    transform: translateX(2px);
  }
  .fs-highlight { color: #00d4ff; }

  .fs-footer {
    padding: 8px 16px;
    border-top: 1px solid rgba(255,255,255,.06);
    display: flex;
    gap: 14px;
    font-size: 10.5px;
    color: rgba(255,255,255,0.58);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  .fs-footer kbd {
    background: rgba(255,255,255,.08);
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 10px;
    font-family: inherit;
    color: rgba(255,255,255,0.58);
    border: 1px solid rgba(255,255,255,.1);
  }

  @media (max-width: 600px) {
    #fs-bar.active { width: min(300px, 80vw); }
  }

  /* ══════════════════════════════════════════════════════════
     LIGHT MODE OVERRIDES
     Dual selectors: [data-theme="light"] (FIN-OS global system)
     AND body.light-theme (stock-dashboard / legacy pages)
     Both trigger from !important rules so order doesn't matter.
  ══════════════════════════════════════════════════════════ */

  /* ── Search toggle button ── */
  [data-theme="light"] #fs-toggle,
  body.light-theme #fs-toggle {
    background: rgba(0,0,0,.07) !important;
    border: 1px solid rgba(0,0,0,.20) !important;
    color: #0B0D12 !important;
    box-shadow: 0 1px 4px rgba(0,0,0,.08) !important;
  }
  [data-theme="light"] #fs-toggle:hover,
  body.light-theme #fs-toggle:hover {
    background: rgba(79,124,255,.12) !important;
    border-color: rgba(79,124,255,.45) !important;
    color: #4F7CFF !important;
    box-shadow: 0 2px 8px rgba(79,124,255,.15) !important;
  }
  [data-theme="light"] #fs-toggle svg path,
  body.light-theme #fs-toggle svg path {
    stroke: currentColor !important;
  }

  /* ── Expanded search bar ── */
  [data-theme="light"] #fs-bar,
  body.light-theme #fs-bar {
    background: #ffffff !important;
    border-color: rgba(0,100,255,.40) !important;
    box-shadow: 0 4px 24px rgba(0,0,0,.12), 0 0 0 1px rgba(0,100,255,.08) !important;
    color: #0050ff !important;
  }
  [data-theme="light"] #fs-input,
  body.light-theme #fs-input {
    background: transparent !important;
    border: none !important;
    color: #111827 !important;
    caret-color: #0050ff !important;
    box-shadow: none !important;
  }
  [data-theme="light"] #fs-input::placeholder,
  body.light-theme #fs-input::placeholder {
    color: rgba(0,0,0,.35) !important;
  }
  [data-theme="light"] #fs-bar svg path,
  body.light-theme #fs-bar svg path {
    stroke: #0050ff !important;
  }
  [data-theme="light"] #fs-clear,
  body.light-theme #fs-clear {
    color: rgba(0,0,0,.35) !important;
  }
  [data-theme="light"] #fs-clear:hover,
  body.light-theme #fs-clear:hover {
    color: rgba(0,0,0,.75) !important;
  }

  /* ── Results dropdown ── */
  [data-theme="light"] #fs-dropdown,
  body.light-theme #fs-dropdown {
    background: #ffffff !important;
    border-color: rgba(0,0,0,.10) !important;
    box-shadow: 0 20px 60px rgba(0,0,0,.12), 0 0 0 1px rgba(0,0,0,.06) !important;
  }
  [data-theme="light"] #fs-dropdown::-webkit-scrollbar-thumb,
  body.light-theme #fs-dropdown::-webkit-scrollbar-thumb {
    background: rgba(0,100,255,.2);
  }
  [data-theme="light"] .fs-empty,
  body.light-theme .fs-empty {
    color: rgba(0,0,0,.40);
  }
  [data-theme="light"] .fs-cat-label,
  body.light-theme .fs-cat-label {
    color: rgba(0,80,200,.7);
  }
  [data-theme="light"] .fs-item,
  body.light-theme .fs-item {
    border-bottom-color: rgba(0,0,0,.05);
  }
  [data-theme="light"] .fs-item:hover,
  [data-theme="light"] .fs-item.focused,
  body.light-theme .fs-item:hover,
  body.light-theme .fs-item.focused {
    background: rgba(0,100,255,.06);
  }
  [data-theme="light"] .cat-Pages       .fs-item-icon,
  body.light-theme    .cat-Pages        .fs-item-icon { background: rgba(123,47,247,.12); }
  [data-theme="light"] .cat-Calculators .fs-item-icon,
  body.light-theme    .cat-Calculators  .fs-item-icon { background: rgba(0,100,255,.10); }
  [data-theme="light"] .cat-Learning    .fs-item-icon,
  body.light-theme    .cat-Learning     .fs-item-icon { background: rgba(0,160,80,.10);  }
  [data-theme="light"] .cat-Trackers    .fs-item-icon,
  body.light-theme    .cat-Trackers     .fs-item-icon { background: rgba(217,119,6,.12);  }
  [data-theme="light"] .fs-item-title,
  body.light-theme .fs-item-title {
    color: #111827;
  }
  [data-theme="light"] .fs-item-desc,
  body.light-theme .fs-item-desc {
    color: rgba(0,0,0,.45);
  }
  [data-theme="light"] .fs-item-arrow,
  body.light-theme .fs-item-arrow {
    color: rgba(0,0,0,.22);
  }
  [data-theme="light"] .fs-item:hover .fs-item-arrow,
  [data-theme="light"] .fs-item.focused .fs-item-arrow,
  body.light-theme .fs-item:hover .fs-item-arrow,
  body.light-theme .fs-item.focused .fs-item-arrow {
    color: #0050ff;
  }
  [data-theme="light"] .fs-highlight,
  body.light-theme .fs-highlight {
    color: #0050ff;
  }
  [data-theme="light"] .fs-footer,
  body.light-theme .fs-footer {
    border-top-color: rgba(0,0,0,.08);
    color: rgba(0,0,0,.30);
  }
  [data-theme="light"] .fs-footer kbd,
  body.light-theme .fs-footer kbd {
    background: rgba(0,0,0,.06);
    border-color: rgba(0,0,0,.12);
    color: rgba(0,0,0,.45);
  }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ═══════════════════════════════════════════════════════
     BUILD DOM
  ═══════════════════════════════════════════════════════ */
  const CAT_ICONS = { Pages: '🗂️', Calculators: '🧮', Learning: '📚', Trackers: '📌' };

  const wrap = document.createElement('div');
  wrap.id = 'fs-wrap';
  wrap.innerHTML = `
    <button id="fs-toggle" aria-label="Search" title="Search (/)">
      <svg viewBox="0 0 24 24"><path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>
    </button>
    <div id="fs-bar">
      <svg id="fs-bar-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;opacity:.6"><path d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      <input id="fs-input" type="text" placeholder="Search pages, calculators, topics…" autocomplete="off" spellcheck="false"/>
      <button id="fs-clear" aria-label="Clear">✕</button>
    </div>
    <div id="fs-dropdown" role="listbox" aria-label="Search results"></div>
  `;

  /* ───────────────────────────────────────────────────────────
     INJECT — smart multi-selector placement
     Priority order:
       1. #themeToggle found → wrap it + search + bell in #finos-header-actions
          group so they stay RIGHT-ALIGNED together (prevents middle-floating
          caused by justify-content:space-between on .header-flex).
       2. #floatThemeBtn found → shared #finos-fixed-controls fixed bar to its left.
       3. Known safe flex containers (no nav, no bare header — avoids sidebar
          and ticker-topbar injection).
       4. Fixed top-right fallback.
  ─────────────────────────────────────────────────────────── */
  function inject() {
    // 1a. Theme toggle is position:fixed (calculators, detail pages): wrapping it would leave the
    //     search/bell stranded in normal flow at the top-left of the content. Use the shared fixed
    //     bar instead, vertically centred on the toggle and sitting to its left.
    const toggle = document.getElementById('themeToggle');
    if (toggle && toggle.parentNode && getComputedStyle(toggle).position === 'fixed') {
      let bar = document.getElementById('finos-fixed-controls');
      if (!bar) {
        const r = toggle.getBoundingClientRect();
        bar = document.createElement('div');
        bar.id = 'finos-fixed-controls';
        bar.style.cssText = `position:fixed;top:${Math.round(r.top + r.height / 2)}px;transform:translateY(-50%);right:${Math.round(innerWidth - r.left + 8)}px;z-index:9900;display:flex;align-items:center;gap:8px;`;
        document.body.appendChild(bar);
      }
      bar.prepend(wrap);  // search goes leftmost
      return;
    }

    // 1. Standard pages: bundle search + bell + theme in one right-side group
    if (toggle && toggle.parentNode) {
      let group = document.getElementById('finos-header-actions');
      if (!group) {
        group = document.createElement('div');
        group.id = 'finos-header-actions';
        group.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';
        // Replace themeToggle's slot with the group, move toggle inside
        toggle.parentNode.insertBefore(group, toggle);
        group.appendChild(toggle);
      }
      group.prepend(wrap);  // search goes leftmost inside the group
      return;
    }

    // 2. Pages with a floating fixed theme button (#floatThemeBtn):
    //    create / reuse a shared controls bar to the left of it
    const floatBtn = document.getElementById('floatThemeBtn');
    if (floatBtn) {
      let bar = document.getElementById('finos-fixed-controls');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'finos-fixed-controls';
        bar.style.cssText = 'position:fixed;top:14px;right:62px;z-index:9900;display:flex;align-items:center;gap:8px;';
        document.body.appendChild(bar);
      }
      bar.prepend(wrap);  // search goes leftmost
      return;
    }

    // 3. Safe named containers only (nav & bare header excluded)
    const containerSelectors = [
      '.header-flex',
      '.nav-actions',
      '.nav-right',
      '.topbar-r',
      '.navbar-right',
    ];
    for (const sel of containerSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const cs = window.getComputedStyle(el);
        if (cs.display === 'flex' || cs.display === 'inline-flex') {
          el.appendChild(wrap);
        } else {
          wrap.style.cssText = 'position:absolute;top:50%;right:16px;transform:translateY(-50%);z-index:9000;';
          el.style.position = el.style.position || 'relative';
          el.appendChild(wrap);
        }
        return;
      }
    }

    // 4. Final fallback: fixed top-right corner
    wrap.style.cssText = 'position:fixed;top:14px;right:16px;z-index:9900;';
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

  /* ═══════════════════════════════════════════════════════
     LOGIC
  ═══════════════════════════════════════════════════════ */
  let isOpen = false;
  let focusIdx = -1;
  let currentResults = [];

  const bar      = () => document.getElementById('fs-bar');
  const input    = () => document.getElementById('fs-input');
  const dropdown = () => document.getElementById('fs-dropdown');
  const clearBtn = () => document.getElementById('fs-clear');
  const togBtn   = () => document.getElementById('fs-toggle');

  function openSearch() {
    if (isOpen) return;
    isOpen = true;
    loadIndex();                                    // start fetching now so results are ready by the first keystroke

    // Anchor bar flush to the right edge of themeToggle, vertically centred on fs-toggle
    const fsToggleEl  = document.getElementById('fs-toggle');
    const themeToggle = document.getElementById('themeToggle');
    const fsRect    = fsToggleEl.getBoundingClientRect();
    const anchor    = themeToggle ? themeToggle.getBoundingClientRect() : fsRect;
    const b  = bar();
    const dd = dropdown();
    const rightOffset = window.innerWidth - anchor.right;
    const barTop = fsRect.top + (fsRect.height - 38) / 2;
    b.style.top   = barTop + 'px';
    b.style.right = rightOffset + 'px';
    dd.style.top  = (anchor.bottom + 8) + 'px';
    dd.style.right = rightOffset + 'px';

    b.classList.add('active');
    setTimeout(() => input().focus(), 250);
    document.addEventListener('mousedown', onOutsideClick);
  }

  function closeSearch() {
    if (!isOpen) return;
    isOpen = false;
    bar().classList.remove('active');
    dropdown().classList.remove('show');
    input().value = '';
    clearBtn().classList.remove('show');
    focusIdx = -1;
    currentResults = [];
    document.removeEventListener('mousedown', onOutsideClick);
  }

  function onOutsideClick(e) {
    if (!wrap.contains(e.target)) closeSearch();
  }

  function _escHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function highlight(text, q) {
    if (!q || !text) return _escHtml(text || '');
    const safeText = _escHtml(text);
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safeText.replace(new RegExp(`(${esc})`, 'gi'),
      '<span class="fs-highlight">$1</span>');
  }

  function renderResults(q) {
    const dd = dropdown();
    currentResults = search(q);
    focusIdx = -1;

    if (!q.trim()) { dd.classList.remove('show'); return; }

    if (!INDEX) {                                   // first use: fetch the index, then draw the results for whatever is typed by then
      dd.innerHTML = '<div class="fs-empty">Loading search…</div>';
      dd.classList.add('show');
      loadIndex().then(ok => { const i = input(); if (ok && i && i.value === q) renderResults(q); else if (!ok && i && i.value === q) dd.innerHTML = '<div class="fs-empty">Search could not load. Check your connection and try again.</div>'; });
      return;
    }

    if (!currentResults.length) {
      dd.innerHTML = `<div class="fs-empty">No results for "<strong>${_escHtml(q)}</strong>" — try a different keyword</div>`;
      dd.classList.add('show');
      return;
    }

    // Group by category
    const groups = {};
    currentResults.forEach(r => {
      if (!groups[r.cat]) groups[r.cat] = [];
      groups[r.cat].push(r);
    });

    let html = '';
    Object.entries(groups).forEach(([cat, items]) => {
      html += `<div class="fs-cat-label cat-${cat}">${CAT_ICONS[cat] || ''} ${cat}</div>`;
      items.forEach((item, i) => {
        const globalIdx = currentResults.indexOf(item);
        html += `
          <a class="fs-item cat-${cat}" href="${item.url}" role="option" data-idx="${globalIdx}">
            <div class="fs-item-icon">${CAT_ICONS[cat] || '📄'}</div>
            <div class="fs-item-body">
              <div class="fs-item-title">${highlight(item.title, q)}</div>
              <div class="fs-item-desc">${item.desc}</div>
            </div>
            <span class="fs-item-arrow">→</span>
          </a>`;
      });
    });

    html += `<div class="fs-footer">
      <span><kbd>↑↓</kbd> navigate</span>
      <span><kbd>↵</kbd> open</span>
      <span><kbd>Esc</kbd> close</span>
    </div>`;
    dd.innerHTML = html;
    dd.classList.add('show');
  }

  function updateFocus() {
    dropdown().querySelectorAll('.fs-item').forEach((el, i) => {
      el.classList.toggle('focused', i === focusIdx);
      if (i === focusIdx) el.scrollIntoView({ block: 'nearest' });
    });
  }

  /* Events */
  document.addEventListener('DOMContentLoaded', () => {
    const tb = togBtn(), inp = input(), cl = clearBtn();

    tb.addEventListener('click', () => isOpen ? closeSearch() : openSearch());

    inp.addEventListener('input', () => {
      const q = inp.value;
      cl.classList.toggle('show', q.length > 0);
      renderResults(q);
    });

    inp.addEventListener('keydown', e => {
      const items = dropdown().querySelectorAll('.fs-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusIdx = Math.min(focusIdx + 1, items.length - 1);
        updateFocus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusIdx = Math.max(focusIdx - 1, 0);
        updateFocus();
      } else if (e.key === 'Enter') {
        if (focusIdx >= 0 && items[focusIdx]) {
          items[focusIdx].click();
        } else if (currentResults.length) {
          window.location.href = currentResults[0].url;
        }
      } else if (e.key === 'Escape') {
        closeSearch();
      }
    });

    cl.addEventListener('click', () => {
      inp.value = '';
      cl.classList.remove('show');
      dropdown().classList.remove('show');
      inp.focus();
      currentResults = [];
    });

    // Global shortcut: press / to open search
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        isOpen ? closeSearch() : openSearch();
      }
    });
  });

})();
