/**
 * FIN•OS Async Utilities
 * Provides consistent error handling, loading states, and retry logic
 * for all async operations across the app.
 *
 * Usage:
 *   // Wrap any container with a loading skeleton while fetching
 *   const data = await FiNOS.async.load(containerEl, () => fetchSomeData());
 *
 *   // Safe fetch with timeout + error toast
 *   const json = await FiNOS.async.fetchJSON('/api/data', { timeout: 5000 });
 *
 *   // Render an error state inside a container
 *   FiNOS.async.renderError(containerEl, 'Could not load data', onRetry);
 *
 *   // Render an empty state
 *   FiNOS.async.renderEmpty(containerEl, 'No transactions yet', 'Start by adding one.');
 */
(function () {
  'use strict';

  /* ── Skeleton HTML builders ── */
  function skeletonCard(lines) {
    lines = lines || 3;
    var html = '<div class="skel-card-body">';
    html += '<div class="skeleton skel-title skel-w-3-4"></div>';
    for (var i = 0; i < lines; i++) {
      var w = i % 2 === 0 ? 'skel-w-full' : 'skel-w-3-4';
      html += '<div class="skeleton skel-text ' + w + '"></div>';
    }
    html += '</div>';
    return html;
  }

  function skeletonList(rows) {
    rows = rows || 4;
    var html = '<div style="display:flex;flex-direction:column;gap:12px;">';
    for (var i = 0; i < rows; i++) {
      html += '<div style="display:flex;align-items:center;gap:12px;">';
      html += '<div class="skeleton skel-avatar"></div>';
      html += '<div style="flex:1;display:flex;flex-direction:column;gap:6px;">';
      html += '<div class="skeleton skel-text skel-w-3-4"></div>';
      html += '<div class="skeleton skel-text-sm skel-w-1-2"></div>';
      html += '</div></div>';
    }
    html += '</div>';
    return html;
  }

  /* ── Render helpers ── */
  function renderError(el, title, onRetry) {
    if (!el) return;
    title = title || 'Something went wrong';
    var retryBtn = onRetry
      ? '<button class="error-state__retry" data-retry>↻ Try again</button>'
      : '';
    el.innerHTML =
      '<div class="error-state">' +
        '<div class="error-state__icon">⚠️</div>' +
        '<p class="error-state__title">' + _esc(title) + '</p>' +
        '<p class="error-state__desc">Check your connection and try again.</p>' +
        retryBtn +
      '</div>';
    if (onRetry) {
      var btn = el.querySelector('[data-retry]');
      if (btn) btn.addEventListener('click', onRetry);
    }
  }

  function renderEmpty(el, title, desc) {
    if (!el) return;
    el.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-state__icon">📭</div>' +
        '<p class="empty-state__title">' + _esc(title || 'Nothing here yet') + '</p>' +
        (desc ? '<p class="empty-state__desc">' + _esc(desc) + '</p>' : '') +
      '</div>';
  }

  function renderLoading(el, type) {
    if (!el) return;
    if (type === 'list') {
      el.innerHTML = skeletonList(4);
    } else if (type === 'chart') {
      el.innerHTML = '<div class="skeleton skel-chart skel-w-full"></div>';
    } else {
      el.innerHTML = skeletonCard(3);
    }
  }

  /* ── High-level loader: shows skeleton, runs fn, renders result or error ── */
  async function load(el, asyncFn, opts) {
    opts = opts || {};
    var skeletonType = opts.skeletonType || 'card';
    var showToastOnError = opts.toast !== false;

    if (el) renderLoading(el, skeletonType);

    try {
      var result = await asyncFn();
      return result;
    } catch (err) {
      var msg = (err && err.message) ? err.message : 'Unknown error';
      if (el) {
        renderError(el, opts.errorTitle || 'Could not load data', opts.onRetry || null);
      }
      if (showToastOnError && window.FiNOS && window.FiNOS.toast) {
        window.FiNOS.toast.error(opts.errorTitle || 'Load failed', msg);
      }
      console.warn('[FIN-OS] async.load error:', err);
      return null;
    }
  }

  /* ── Safe fetch with timeout and automatic JSON parse ── */
  async function fetchJSON(url, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 10000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;

    if (controller) {
      timer = setTimeout(function () { controller.abort(); }, timeout);
    }

    try {
      var fetchOpts = Object.assign({}, opts);
      if (controller) fetchOpts.signal = controller.signal;
      delete fetchOpts.timeout;

      var res = await fetch(url, fetchOpts);
      if (!res.ok) {
        throw new Error('HTTP ' + res.status + ': ' + res.statusText);
      }
      return await res.json();
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('Request timed out after ' + (timeout / 1000) + 's');
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ── Retry wrapper ── */
  async function withRetry(asyncFn, maxRetries, delayMs) {
    maxRetries = maxRetries || 3;
    delayMs    = delayMs    || 1000;
    var attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await asyncFn();
      } catch (err) {
        attempt++;
        if (attempt >= maxRetries) throw err;
        await new Promise(function (r) { setTimeout(r, delayMs * attempt); });
      }
    }
  }

  /* ── Global unhandled promise error handler ── */
  window.addEventListener('unhandledrejection', function (e) {
    var msg = (e.reason && e.reason.message) ? e.reason.message : String(e.reason || 'Unknown error');
    // Don't surface benign errors (network offline, AbortError, supabase auth)
    var ignore = ['AbortError', 'NetworkError', 'Failed to fetch',
                  'Load failed', 'The Internet connection appears to be offline',
                  'JWT', 'PGRST', 'Auth session missing'];
    if (ignore.some(function (s) { return msg.indexOf(s) !== -1; })) return;

    console.warn('[FIN-OS] Unhandled promise rejection:', e.reason);
    if (window.FiNOS && window.FiNOS.toast) {
      window.FiNOS.toast.error('Unexpected error', msg.slice(0, 120));
    }
    e.preventDefault(); // Prevent browser console error flood
  });

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── Expose globally ── */
  window.FiNOS = window.FiNOS || {};
  window.FiNOS.async = {
    load:          load,
    fetchJSON:     fetchJSON,
    withRetry:     withRetry,
    renderError:   renderError,
    renderEmpty:   renderEmpty,
    renderLoading: renderLoading,
    skeletonCard:  skeletonCard,
    skeletonList:  skeletonList,
  };

})();
