/**
 * Vault boot gate — must be the FIRST script in <head>.   (v1.0, ~1 KB)
 *
 * If the passcode lock is on and this tab hasn't been unlocked, stop the page right here and show the lock screen.
 * Stopping matters: otherwise every tracker script would run against empty storage and might write defaults or
 * sync "empty" data to the cloud. When the lock is off (the default), this does nothing and costs nothing.
 */
(function () {
  try {
    if (!localStorage.getItem('finos_vault_meta')) return;            // lock not enabled
    if (sessionStorage.getItem('finos_unlocked')) return;             // already unlocked in this tab
    var me = document.currentScript;
    var base = me && me.src ? me.src.replace(/[^/]*$/, '') : '../js/';
    var theme = localStorage.getItem('finos-theme') || 'dark';
    window.stop();                                                    // abort the parser: nothing after this script ever runs
    // (document.open()/write() is a no-op inside a parser-inserted script, so replace the DOM directly.)
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.innerHTML =
      '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>FIN\u2022OS \u2014 Locked</title>' +
      '<style>html,body{margin:0;background:#0b0d12;color:#f0f2f8;font-family:system-ui,-apple-system,sans-serif}' +
      '[data-theme="light"] body{background:#f5f7fb;color:#0b0d12}</style></head>' +
      '<body><div id="finos-lock-root"></div></body>';
    var s = document.createElement('script');
    s.src = base + 'finos-vault.js';
    document.body.appendChild(s);
  } catch (e) { /* never block the page because the gate itself failed */ }
})();
