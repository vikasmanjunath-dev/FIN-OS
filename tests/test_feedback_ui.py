"""The feedback loop in a real browser: saved on the device first, redacted before storage, and nothing leaves without BOTH the person's
consent and a configured inbox. Usage counting downloads and records nothing unless the person opted in."""
import datetime
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AXE = os.path.join(ROOT, "node_modules", "axe-core", "axe.min.js")
INBOX = "https://inbox.example/feedback"


def consent_script(*ids):
    rec = {i: {"granted": True, "at": "2026-10-04T00:00:00.000Z", "v": 1} for i in ids}
    return f"localStorage.setItem('finos_consents', {json.dumps(json.dumps(rec))});"


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, name="feedback", init="", width=1280, theme="dark", requests=None):
    base, browser = env
    ctx = browser.new_context(viewport={"width": width, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('finos-theme', '{theme}');" + init)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    if requests is not None:
        pg.on("request", lambda r: requests.append(r))
    pg.goto(f"{base}/html/{name}.html", wait_until="domcontentloaded")
    pg.wait_for_selector("h1")
    return ctx, pg, errors


def log(pg):
    return json.loads(pg.evaluate("localStorage.getItem('finos_feedback_log') || '[]'"))


def give(pg, rating="up", comment="", topic=None):
    if topic:
        pg.select_option("#fb-topic", topic)
    if rating:
        pg.click(f".fb-card [data-r='{rating}']")
    if comment:
        pg.fill(".fb-t", comment)
    pg.click("[data-save]")


ALLOWED_HOSTS = ("127.0.0.1", "localhost", "[::1]", "fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com")


def external(requests, base):
    """Requests to anywhere that is not the app itself, the user's own machine, or the documented page-asset hosts."""
    from urllib.parse import urlparse
    out = []
    for r in requests:
        if r.url.startswith("data:") or r.url.startswith(base):
            continue
        host = urlparse(r.url).hostname or ""
        if host in ALLOWED_HOSTS:
            continue
        out.append(r.url)
    return out


def test_feedback_is_redacted_before_it_is_stored_and_saved_on_the_device(env):
    ctx, pg, errors = open_page(env)
    assert pg.locator("#fb-topic option").count() == 8
    give(pg, "up", "Salary ₹90,000, mail me a@b.com. The slab note was clear. Ref 12345678.", topic="tax")
    pg.wait_for_function("document.querySelector('.fb-out').innerText.length > 0")
    saved = log(pg)
    assert len(saved) == 1
    assert saved[0]["comment"] == "Salary [amount], mail me [email]. The slab note was clear. Ref [number]."
    assert (saved[0]["topic"], saved[0]["rating"], saved[0]["page"]) == ("tax", "up", "html/feedback.html")
    assert set(saved[0]) == {"day", "page", "topic", "rating", "comment"}                   # no id, no device, no timestamp finer than a day
    assert "₹90,000" not in pg.evaluate("localStorage.getItem('finos_feedback_log')")
    assert "Salary [amount]" in pg.inner_text("#fb-list")
    assert pg.input_value(".fb-t") == ""
    assert not errors
    ctx.close()


def test_nothing_is_sent_without_consent_even_if_an_inbox_exists(env):
    reqs = []
    ctx, pg, errors = open_page(env, requests=reqs)
    posted = []
    pg.route(INBOX, lambda route: (posted.append(route.request), route.fulfill(status=200, body="ok")))
    pg.evaluate(f"FinosFeedback.configure({{endpoint: '{INBOX}'}})")
    give(pg, "down", "not clear")
    pg.wait_for_function("document.querySelector('.fb-out').innerText.includes('Nothing was sent')")
    assert "turn that on in Privacy" in pg.inner_text(".fb-out")
    assert posted == []
    assert external(reqs, env[0]) == []
    ctx.close()


def test_nothing_is_sent_with_consent_when_no_inbox_is_set_up_which_is_todays_state(env):
    reqs = []
    ctx, pg, errors = open_page(env, init=consent_script("feedback"), requests=reqs)
    assert pg.evaluate("FinosFeedback.CONFIG.endpoint") is None
    give(pg, "up", "good")
    pg.wait_for_function("document.querySelector('.fb-out').innerText.includes('inbox')")
    assert "has not set up an inbox yet" in pg.inner_text(".fb-out")
    assert external(reqs, env[0]) == []
    assert "Not set up yet" in pg.inner_text("#fb-sharing") and "On." in pg.inner_text("#fb-sharing")
    ctx.close()


def test_with_consent_and_an_inbox_exactly_one_redacted_post_is_made_and_nothing_else(env):
    ctx, pg, errors = open_page(env, init=consent_script("feedback"))
    posted = []
    pg.route(INBOX, lambda route: (posted.append(route.request), route.fulfill(status=200, body="ok", headers={"access-control-allow-origin": "*"})))
    pg.evaluate(f"FinosFeedback.configure({{endpoint: '{INBOX}'}})")
    give(pg, "down", "my pan ABCDE1234F and ₹5 lakh", topic="money-score")
    pg.wait_for_function("document.querySelector('.fb-out').innerText.includes('Sent')")
    assert len(posted) == 1
    req = posted[0]
    body = json.loads(req.post_data)
    assert set(body) == {"app", "kind", "v", "generatedAt", "feedback", "usage"}
    assert body["usage"] is None                                                           # usage was never consented to
    assert body["feedback"][0]["comment"] == "my pan [id] and [amount]"
    assert "ABCDE1234F" not in req.post_data and "lakh" not in req.post_data
    assert "cookie" not in {k.lower() for k in req.headers} and "referer" not in {k.lower() for k in req.headers}
    ctx.close()


def test_withdrawing_consent_stops_sending_immediately(env):
    ctx, pg, errors = open_page(env, init=consent_script("feedback"))
    posted = []
    pg.route(INBOX, lambda route: (posted.append(route.request), route.fulfill(status=200, body="ok", headers={"access-control-allow-origin": "*"})))
    pg.evaluate(f"FinosFeedback.configure({{endpoint: '{INBOX}'}}); FinosPrivacy.consent.set('feedback', false)")
    give(pg, "up", "hello")
    pg.wait_for_function("document.querySelector('.fb-out').innerText.includes('Nothing was sent')")
    assert posted == []
    ctx.close()


def test_an_empty_save_is_refused_with_guidance_and_the_buttons_report_their_state(env):
    ctx, pg, errors = open_page(env)
    pg.click("[data-save]")
    assert "Pick Yes or Not really" in pg.inner_text(".fb-out")
    assert log(pg) == []
    pg.click(".fb-card [data-r='up']")
    assert pg.get_attribute(".fb-card [data-r='up']", "aria-pressed") == "true"
    pg.click(".fb-card [data-r='down']")
    assert pg.get_attribute(".fb-card [data-r='up']", "aria-pressed") == "false" and pg.get_attribute(".fb-card [data-r='down']", "aria-pressed") == "true"
    pg.click(".fb-card [data-r='down']")                                                   # click again to clear
    assert pg.get_attribute(".fb-card [data-r='down']", "aria-pressed") == "false"
    ctx.close()


def test_delete_one_delete_all_and_download_a_clean_report(env):
    ctx, pg, errors = open_page(env)
    for text in ("first", "second ₹7,00,000", "third"):
        give(pg, "up", text)
        pg.wait_for_function("document.querySelector('.fb-out').innerText.length > 0")
    assert len(log(pg)) == 3
    pg.click("[data-del='0']")
    assert [e["comment"] for e in log(pg)] == ["second [amount]", "third"]
    with pg.expect_download() as dl:
        pg.click("#fb-download")
    assert dl.value.suggested_filename == f"finos-feedback-{datetime.date.today().isoformat()}.json"
    report = json.loads(open(dl.value.path()).read())
    assert (report["app"], report["kind"], report["v"]) == ("FIN-OS", "feedback-report", 1)
    assert [e["comment"] for e in report["feedback"]] == ["second [amount]", "third"]
    assert "7,00,000" not in json.dumps(report)
    pg.click("#fb-clear")
    assert log(pg) == [] and "Nothing saved yet" in pg.inner_text("#fb-list")
    ctx.close()


def test_hostile_text_is_stored_and_shown_as_plain_text(env):
    ctx, pg, errors = open_page(env)
    give(pg, "up", "<img src=x onerror=window.__p=1><script>window.__p=2</script>")
    pg.wait_for_function("document.querySelector('.fb-out').innerText.length > 0")
    assert pg.evaluate("window.__p") is None
    assert "<img" in pg.inner_text("#fb-list")                                              # visible as text, not interpreted
    assert pg.locator("#fb-list img").count() == 0
    assert not errors
    ctx.close()


def test_corrupt_storage_does_not_break_the_page(env):
    ctx, pg, errors = open_page(env, init="localStorage.setItem('finos_feedback_log', '{bad'); localStorage.setItem('finos_usage', '[[');")
    assert "Nothing saved yet" in pg.inner_text("#fb-list") and "No counts yet" in pg.inner_text("#fb-usage")
    give(pg, "up", "still works")
    pg.wait_for_function("document.querySelector('.fb-out').innerText.length > 0")
    assert len(log(pg)) == 1
    assert not errors
    ctx.close()


# ── usage counts: opt-in, on the device, and free for everyone else ────────────────────────────────────────
def test_without_opt_in_no_counting_code_is_even_downloaded(env):
    reqs = []
    ctx, pg, errors = open_page(env, name="tax", requests=reqs)
    pg.wait_for_timeout(1500)
    assert not any("finos-feedback.js" in r.url or "finos-privacy.js" in r.url for r in reqs)
    assert pg.evaluate("localStorage.getItem('finos_usage')") is None
    ctx.close()


def test_with_opt_in_page_opens_are_counted_by_path_only_and_never_leave(env):
    reqs = []
    ctx, pg, errors = open_page(env, name="tax", init=consent_script("usage"), requests=reqs)
    pg.wait_for_function("localStorage.getItem('finos_usage')")
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_function("JSON.parse(localStorage.getItem('finos_usage')).days[Object.keys(JSON.parse(localStorage.getItem('finos_usage')).days)[0]]['html/tax.html'] >= 2")
    usage = json.loads(pg.evaluate("localStorage.getItem('finos_usage')"))
    today = datetime.date.today().isoformat()
    assert usage["days"][today] == {"html/tax.html": 2}                                    # a path and a count, nothing else
    assert external(reqs, env[0]) == []
    pg.goto(f"{env[0]}/html/feedback.html")
    pg.wait_for_selector("#fb-usage .pv-item")
    assert "Counting is on" in pg.inner_text("#fb-usage-note") and "2" in pg.inner_text("#fb-usage") and "html/tax.html" in pg.inner_text("#fb-usage")
    pg.click("#fb-usage-clear")
    assert "No counts yet" in pg.inner_text("#fb-usage")
    ctx.close()


def test_the_money_score_result_asks_whether_it_felt_right_and_saves_the_answer(env):
    base, browser = env
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/money-score.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#ms-form")
    for k, v in {"age": 30, "monthlyIncome": 100000, "monthlyExpenses": 70000}.items():
        pg.fill(f"#ms-{k}", str(v))
    pg.click("#ms-calc")
    pg.wait_for_selector("#ms-feedback .fb-card")
    assert "Did your Money Score feel right?" in pg.inner_text("#ms-feedback")
    pg.click("#ms-feedback [data-r='down']")
    pg.fill("#ms-feedback .fb-t", "The wealth pillar felt harsh")
    pg.click("#ms-feedback [data-save]")
    pg.wait_for_function("document.querySelector('#ms-feedback .fb-out').innerText.includes('Saved on this device')")
    saved = log(pg)
    assert saved[-1]["topic"] == "money-score" and saved[-1]["page"] == "html/money-score.html" and saved[-1]["rating"] == "down"
    assert not errors
    ctx.close()


def test_settings_links_to_the_feedback_page(env):
    base, browser = env
    ctx = browser.new_context()
    pg = ctx.new_page()
    pg.goto(f"{base}/html/settings.html", wait_until="domcontentloaded")
    assert pg.locator("a[href='feedback.html']").count() >= 1
    assert pg.request.get(f"{base}/html/feedback.html").status == 200
    ctx.close()


@pytest.mark.parametrize("theme", ["dark", "light"])
def test_feedback_page_fits_a_phone_and_passes_axe(env, theme):
    ctx, pg, errors = open_page(env, width=375, theme=theme, init=consent_script("usage"))
    give(pg, "up", "checking layout")
    pg.wait_for_function("document.querySelector('.fb-out').innerText.length > 0")
    assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "overflows a phone"
    if os.path.exists(AXE):
        pg.add_script_tag(path=AXE)
        bad = pg.evaluate("axe.run('main', {runOnly: ['wcag2a', 'wcag2aa']}).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', ')))")
        assert bad == [], bad
    assert not errors
    ctx.close()
