/**
 * FIN•OS Toast Notification System
 * Zero dependencies. Loaded via ui.js on every page.
 *
 * Usage:
 *   window.FiNOS.toast.show({ title: 'Saved', msg: 'Your changes were saved.', type: 'success' })
 *   window.FiNOS.toast.show({ title: 'Error', msg: 'Something went wrong.', type: 'error', duration: 6000 })
 *   window.FiNOS.toast.show({ title: 'Info', msg: 'Market opens at 9:15 AM.' })
 *
 * Types: 'success' | 'error' | 'warning' | 'info' (default: 'info')
 * duration: ms before auto-dismiss (default: 4000, 0 = sticky)
 */
(function () {
  'use strict';

  var ICONS = {
    success: '✅',
    error:   '❌',
    warning: '⚠️',
    info:    '💡',
  };

  var container = null;

  /* Self-contained styles — the old rules lived in css/_unused_css/states.css,
     which no page loads, so every toast rendered invisible. Injected here so
     toasts work on every page ui.js touches. Mobile: anchored to the TOP so
     they never collide with the bottom tab bar / FABs. */
  var STYLE_ID = 'finos-toast-styles';
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#finos-toast-container{position:fixed;bottom:24px;right:24px;z-index:999996;' +
        'display:flex;flex-direction:column;gap:10px;max-width:360px;' +
        'width:calc(100vw - 48px);pointer-events:none;}' +
      '.finos-toast{display:flex;align-items:flex-start;gap:10px;padding:14px 16px;' +
        'background:var(--bg-surface,#10131C);border:1px solid var(--border-medium,rgba(255,255,255,.12));' +
        'border-radius:14px;box-shadow:var(--shadow-4,0 8px 32px rgba(0,0,0,.4));pointer-events:all;' +
        'font-family:var(--font-sans,system-ui,sans-serif);font-size:.875rem;line-height:1.45;' +
        'color:var(--text-primary,#E8EAF0);position:relative;overflow:hidden;' +
        'animation:finosToastIn .28s cubic-bezier(.16,1,.3,1);}' +
      '.finos-toast.toast-out{opacity:0;transform:translateY(8px);transition:opacity .26s ease,transform .26s ease;}' +
      '.finos-toast__icon{font-size:16px;flex-shrink:0;}' +
      '.finos-toast__body{flex:1;min-width:0;}' +
      '.finos-toast__title{font-weight:700;}' +
      '.finos-toast__msg{color:var(--text-secondary,rgba(255,255,255,.65));margin-top:2px;}' +
      '.finos-toast__close{background:none;border:none;color:var(--text-muted,rgba(255,255,255,.5));' +
        'font-size:16px;cursor:pointer;padding:0 2px;line-height:1;flex-shrink:0;}' +
      '.finos-toast__close:hover{color:var(--text-primary,#fff);}' +
      '.finos-toast__progress{position:absolute;left:0;bottom:0;height:2px;width:100%;' +
        'background:var(--accent,#4F7CFF);transform-origin:left;' +
        'animation:finosToastProgress var(--toast-duration,4000ms) linear forwards;}' +
      '.finos-toast--success .finos-toast__progress{background:var(--color-success,#4ade80);}' +
      '.finos-toast--error .finos-toast__progress{background:var(--color-error,#f87171);}' +
      '.finos-toast--warning .finos-toast__progress{background:var(--color-warning,#fbbf24);}' +
      '@keyframes finosToastIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}' +
      '@keyframes finosToastProgress{from{transform:scaleX(1);}to{transform:scaleX(0);}}' +
      '@media (max-width:768px){#finos-toast-container{top:68px;bottom:auto;left:50%;right:auto;' +
        'transform:translateX(-50%);}}';
    document.head.appendChild(s);
  }

  function getContainer() {
    ensureStyles();
    if (container && document.body.contains(container)) return container;
    container = document.getElementById('finos-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'finos-toast-container';
      container.setAttribute('aria-live', 'polite');
      container.setAttribute('aria-atomic', 'false');
      container.setAttribute('role', 'log');
      document.body.appendChild(container);
    }
    return container;
  }

  function show(opts) {
    if (typeof opts === 'string') opts = { title: opts };
    var type     = opts.type     || 'info';
    var title    = opts.title    || '';
    var msg      = opts.msg      || opts.message || '';
    var duration = opts.duration !== undefined ? opts.duration : 4000;
    var icon     = opts.icon     || ICONS[type] || ICONS.info;

    var toast = document.createElement('div');
    toast.className = 'finos-toast finos-toast--' + type;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    if (duration > 0) {
      toast.style.setProperty('--toast-duration', duration + 'ms');
    }

    toast.innerHTML =
      '<span class="finos-toast__icon" aria-hidden="true">' + icon + '</span>' +
      '<div class="finos-toast__body">' +
        (title ? '<div class="finos-toast__title">' + _esc(title) + '</div>' : '') +
        (msg   ? '<div class="finos-toast__msg">'   + _esc(msg)   + '</div>' : '') +
      '</div>' +
      '<button class="finos-toast__close" aria-label="Dismiss notification">×</button>' +
      (duration > 0 ? '<div class="finos-toast__progress"></div>' : '');

    var closeBtn = toast.querySelector('.finos-toast__close');
    closeBtn.addEventListener('click', function () { dismiss(toast); });

    getContainer().appendChild(toast);

    if (duration > 0) {
      setTimeout(function () { dismiss(toast); }, duration);
    }

    return toast;
  }

  function dismiss(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('toast-out');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 280);
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ── Expose globally ── */
  window.FiNOS = window.FiNOS || {};
  window.FiNOS.toast = { show: show, dismiss: dismiss };

  /* ── Convenience shortcuts ── */
  window.FiNOS.toast.success = function (title, msg) { return show({ type: 'success', title: title, msg: msg }); };
  window.FiNOS.toast.error   = function (title, msg) { return show({ type: 'error',   title: title, msg: msg, duration: 6000 }); };
  window.FiNOS.toast.warning = function (title, msg) { return show({ type: 'warning', title: title, msg: msg, duration: 5000 }); };
  window.FiNOS.toast.info    = function (title, msg) { return show({ type: 'info',    title: title, msg: msg }); };

})();
