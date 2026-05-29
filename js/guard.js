/**
 * guard.js — Auth Guard (DISABLED)
 * Login is no longer required. This file is kept as a stub so any page
 * that still loads it doesn't crash. All redirect logic has been removed.
 *
 * The logout helper is preserved so existing logoutBtn handlers still work.
 */

console.log('[FIN•OS] Auth guard disabled — running in guest mode.');

// Expose a no-op logout that just clears local cache and goes to home
window.logout = function () {
    try {
        ['finos_display_name', 'finos_financial_dna', 'finos_logged_in', 'finos_auth_method']
            .forEach(k => localStorage.removeItem(k));
    } catch (_) {}
    window.location.href = 'home.html';
};
