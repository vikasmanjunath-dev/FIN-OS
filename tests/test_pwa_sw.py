"""
Service-worker integration test (real Chromium + real sw.js):

  1. SW installs & activates, precaches core assets.
  2. JS/CSS are served stale-while-revalidate (cached copy refreshed in the background).
  3. A `periodicsync` event (fired through the DevTools protocol) reads the reminder snapshot the page
     mirrored into IndexedDB, shows notifications for what is due soon, and records what it announced.
  4. The worker never creates the 'finos' database itself (that would break the page's own upgrade).

    python3 -m pytest tests/test_pwa_sw.py -q
"""
import datetime as dt
import os
import sys
import time

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

REGISTER_JS = """async () => {
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  return reg.scope;
}"""

SEED_IDB_JS = """async (events) => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('finos', 1);
    r.onupgradeneeded = () => ['transactions', 'journal', 'documents', 'snapshots'].forEach(n => r.result.createObjectStore(n, { keyPath: 'id' }));
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  await new Promise((res) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put({ id: 'upcoming-reminders', updatedAt: Date.now(), events, seen: {} });
    tx.oncomplete = res;
  });
  db.close();
}"""

READ_SNAP_JS = """async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('finos'); r.onsuccess = () => res(r.result); });
  const v = await new Promise((res) => { const q = db.transaction('snapshots').objectStore('snapshots').get('upcoming-reminders'); q.onsuccess = () => res(q.result); });
  db.close(); return v;
}"""


def iso(days):
    d = dt.date.today() + dt.timedelta(days=days)
    return d.isoformat()


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")       # new headless: the legacy shell always reports Notification.permission='denied'
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        ctx = browser.new_context()
        ctx.grant_permissions(["notifications"], origin=base)
        page = ctx.new_page()
        page.goto(f"{base}/assets/icons/icon-512.svg")           # a tiny same-origin document to host the worker
        yield base, ctx, page
        browser.close()


def test_sw_installs_and_precaches(env):
    base, ctx, page = env
    scope = page.evaluate(REGISTER_JS)
    assert scope.rstrip("/") == base.rstrip("/")
    names = page.evaluate("async () => (await caches.keys())")
    assert any(n.startswith("finos-") for n in names), names
    cached = page.evaluate("""async () => {
        const c = await caches.open((await caches.keys()).find(k => k.startsWith('finos-')));
        return (await c.keys()).map(r => new URL(r.url).pathname);
    }""")
    assert "/js/ui.js" in cached and "/assets/icons/icon-192.png" in cached, cached[:10]


def test_js_is_stale_while_revalidate(env):
    base, ctx, page = env
    # first request is cached, second returns the cached copy immediately while refreshing in the background
    page.evaluate("async () => { await fetch('/js/finos-format.js'); }")
    time.sleep(0.3)
    inside = page.evaluate("""async () => {
        const c = await caches.open((await caches.keys()).find(k => k.startsWith('finos-')));
        return !!(await c.match('/js/finos-format.js'));
    }""")
    assert inside
    body = page.evaluate("async () => (await (await fetch('/js/finos-format.js')).text()).slice(0, 40)")
    assert "FIN-OS formatting" in body or "FIN" in body


def test_periodicsync_fires_due_reminders_and_remembers_them(env):
    base, ctx, page = env
    events = [
        {"type": "sip", "date": iso(1), "title": "Parag Parikh Flexi Cap", "sub": "₹10K/mo debit"},   # SIP lead = 1 day → due
        {"type": "tax", "date": iso(5), "title": "Advance Tax Q3 (FY 2026-27)", "sub": "75% due."},    # tax lead = 7 days → due
        {"type": "goal", "date": iso(40), "title": "Car", "sub": ""},                                   # goal lead = 14 days → not yet
    ]
    page.evaluate(SEED_IDB_JS, events)

    cdp = ctx.new_cdp_session(page)
    regs = []
    cdp.on("ServiceWorker.workerRegistrationUpdated", lambda e: regs.extend(e.get("registrations", [])))
    cdp.send("ServiceWorker.enable")
    page.wait_for_timeout(500)                                            # pumps Playwright's event loop so CDP events arrive
    reg_id = next(r["registrationId"] for r in regs if r["scopeURL"].rstrip("/") == base.rstrip("/"))
    cdp.send("ServiceWorker.dispatchPeriodicSyncEvent", {"origin": base, "registrationId": reg_id, "tag": "finos-reminders"})

    titles = []
    for _ in range(30):                                                   # worker is async: poll up to ~6 s
        titles = page.evaluate("async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => n.title)")
        if len(titles) >= 2:
            break
        page.wait_for_timeout(200)
    assert any("SIP: Parag Parikh Flexi Cap — tomorrow" in t for t in titles), titles
    assert any("Tax: Advance Tax Q3" in t for t in titles), titles
    assert not any("Car" in t for t in titles), titles

    snap = page.evaluate(READ_SNAP_JS)
    assert len(snap["seen"]) == 2, snap["seen"]                           # remembered so it won't repeat today


def test_worker_does_not_create_the_database_when_the_page_never_did(env):
    base, ctx, page = env
    page.evaluate("async () => new Promise(r => { const q = indexedDB.deleteDatabase('finos'); q.onsuccess = q.onerror = q.onblocked = () => r(); })")
    cdp = ctx.new_cdp_session(page)
    regs = []
    cdp.on("ServiceWorker.workerRegistrationUpdated", lambda e: regs.extend(e.get("registrations", [])))
    cdp.send("ServiceWorker.enable")
    page.wait_for_timeout(500)                                            # pumps Playwright's event loop so CDP events arrive
    reg_id = next(r["registrationId"] for r in regs if r["scopeURL"].rstrip("/") == base.rstrip("/"))
    cdp.send("ServiceWorker.dispatchPeriodicSyncEvent", {"origin": base, "registrationId": reg_id, "tag": "finos-reminders"})
    page.wait_for_timeout(1000)
    dbs = page.evaluate("async () => (await indexedDB.databases()).map(d => d.name)")
    assert "finos" not in dbs, dbs


def test_offline_navigation_serves_cache_or_friendly_fallback(env):
    """Uses http://finos.localhost:PORT — a secure context that is NOT in pwa-init.js's dev-host list, so the app's own
    production registration path runs (on localhost/127.0.0.1 pwa-init deliberately unregisters the worker)."""
    base, first_ctx, _ = env
    host_base = base.replace("127.0.0.1", "finos.localhost")            # Chromium resolves *.localhost to loopback by itself
    ctx = first_ctx.browser.new_context()
    page = ctx.new_page()
    page.goto(f"{host_base}/html/home.html", wait_until="domcontentloaded")
    page.wait_for_function("navigator.serviceWorker.getRegistration().then(r => !!(r && r.active))", timeout=15000)
    page.reload(wait_until="domcontentloaded")                         # now controlled by the worker
    page.wait_for_function("!!navigator.serviceWorker.controller", timeout=15000)
    ctx.set_offline(True)
    page.goto(f"{host_base}/html/home.html", wait_until="domcontentloaded")
    assert "FIN" in page.title(), page.title()                         # served from the worker's cache
    page.goto(f"{host_base}/html/never-visited.html", wait_until="domcontentloaded")
    assert "Offline" in page.title(), page.title()                     # friendly fallback, not a browser error page
    ctx.close()
