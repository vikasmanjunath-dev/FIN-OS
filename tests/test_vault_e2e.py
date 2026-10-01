"""Passcode lock, end to end in a real browser: the page really stops, data really leaves storage, and comes back."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

PASS = "correct horse battery"
DATA = {"finos_net_worth": "4321000", "finos_display_name": "Asha K", "finos_goals": '[{"name":"Car","target":900000}]'}


@pytest.fixture()
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        ctx = browser.new_context()
        yield base, ctx
        browser.close()


def seed_and_enable(page, base):
    page.goto(f"{base}/html/settings.html", wait_until="domcontentloaded")
    page.wait_for_function("window.FinosVault")
    page.evaluate("(d) => { for (const k in d) localStorage.setItem(k, d[k]); }", DATA)
    page.evaluate("(p) => FinosVault.enable(p)", PASS)
    assert page.evaluate("FinosVault.isEnabled() && FinosVault.isUnlocked()")


def storage(page):
    return page.evaluate("Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))")


def test_lock_wipes_storage_and_halts_the_page(env):
    base, ctx = env
    page = ctx.new_page()
    seed_and_enable(page, base)
    page.evaluate("FinosVault.lock()")
    page.reload(wait_until="commit")
    page.wait_for_selector("#fl-form")
    assert "Locked" in page.title()
    s = storage(page)
    assert not any(k in s for k in DATA), list(s)                       # no financial plaintext in localStorage
    assert "finos_vault" in s and "4321000" not in s["finos_vault"] and "Asha" not in s["finos_vault"]
    assert page.evaluate("typeof window.AryaSidebar") == "undefined"    # the page's own scripts never ran
    assert "Asha" not in page.inner_text("body") and "4321000" not in page.inner_text("body")


def test_wrong_passcode_then_right_passcode_restores_everything(env):
    base, ctx = env
    page = ctx.new_page()
    seed_and_enable(page, base)
    page.evaluate("FinosVault.lock()")
    page.reload(wait_until="commit"); page.wait_for_selector("#fl-form")
    page.fill("#fl-pass", "not the passcode"); page.click("#fl-go")
    page.wait_for_function("document.getElementById('fl-err').textContent.includes('Wrong passcode')", timeout=15000)
    assert "finos_net_worth" not in storage(page)
    page.fill("#fl-pass", PASS); page.click("#fl-go")
    page.wait_for_selector("#fl-form", state="detached", timeout=20000)    # page reloaded into the real app
    page.wait_for_function("window.FinosVault && FinosVault.isUnlocked()", timeout=15000)
    s = storage(page)
    for k, v in DATA.items():
        assert s[k] == v, k


def test_navigating_within_an_unlocked_tab_does_not_ask_again(env):
    base, ctx = env
    page = ctx.new_page()
    seed_and_enable(page, base)
    page.evaluate("FinosVault.lock()"); page.reload(wait_until="commit"); page.wait_for_selector("#fl-form")
    page.fill("#fl-pass", PASS); page.click("#fl-go")
    page.wait_for_selector("#fl-form", state="detached", timeout=20000)
    page.goto(f"{base}/html/dashboard.html", wait_until="domcontentloaded")
    page.wait_for_timeout(800)
    assert page.query_selector("#fl-form") is None
    assert "Dashboard" in page.title()
    page.goto(f"{base}/calculators/investment%20%26%20wealth/sip.html", wait_until="domcontentloaded")
    assert page.query_selector("#fl-form") is None


def test_a_new_tab_must_unlock_and_calculators_are_gated_too(env):
    base, ctx = env
    a = ctx.new_page()
    seed_and_enable(a, base)
    a.evaluate("FinosVault.lock()")
    b = ctx.new_page()                                                  # fresh tab: no session flag
    b.goto(f"{base}/calculators/investment%20%26%20wealth/sip.html", wait_until="commit")
    b.wait_for_selector("#fl-form")                                     # a calculator can't write defaults over locked data
    assert "finos_net_worth" not in storage(b)


def test_locking_in_one_tab_locks_the_others(env):
    base, ctx = env
    a = ctx.new_page(); seed_and_enable(a, base)
    b = ctx.new_page()                                                   # fresh tab → lock screen, even though A is unlocked
    b.goto(f"{base}/html/settings.html", wait_until="commit")
    b.wait_for_selector("#fl-form")
    b.fill("#fl-pass", PASS); b.click("#fl-go")                          # unlock B through the real UI
    b.wait_for_selector("#fl-form", state="detached", timeout=20000)
    b.wait_for_function("window.FinosVault && FinosVault.isUnlocked()", timeout=15000)
    b.wait_for_timeout(500)                                              # pwa-init arms the cross-tab listener on load
    b.evaluate("FinosVault.startIdleLock(10)")
    a.evaluate("FinosVault.lock()")                                      # A locks → B must follow
    b.wait_for_selector("#fl-form", timeout=15000)
    assert "finos_net_worth" not in storage(b)


def test_idle_auto_lock(env):
    base, ctx = env
    page = ctx.new_page()
    seed_and_enable(page, base)
    page.evaluate("FinosVault.startIdleLock(0.05)")                      # 3 seconds
    page.wait_for_selector("#fl-form", timeout=15000)
    assert "finos_net_worth" not in storage(page)


def test_forgot_passcode_erase_path_leaves_a_clean_working_app(env):
    base, ctx = env
    page = ctx.new_page()
    seed_and_enable(page, base)
    page.evaluate("FinosVault.lock()"); page.reload(wait_until="commit"); page.wait_for_selector("#fl-form")
    page.on("dialog", lambda d: d.accept())
    page.click("#fl-forgot")
    page.wait_for_selector("#fl-form", state="detached", timeout=15000)
    s = storage(page)
    assert "finos_vault" not in s and "finos_vault_meta" not in s and "finos_net_worth" not in s
    page.wait_for_timeout(500)
    assert page.query_selector("#fl-form") is None


def test_lock_off_is_a_no_op_for_everyone_else(env):
    base, ctx = env
    page = ctx.new_page()
    page.goto(f"{base}/html/dashboard.html", wait_until="domcontentloaded")
    page.wait_for_timeout(600)
    assert page.query_selector("#fl-form") is None and "Dashboard" in page.title()
    assert page.evaluate("typeof window.FinosVault") == "undefined"    # module isn't even downloaded when the lock is off
