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

  function getContainer() {
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
