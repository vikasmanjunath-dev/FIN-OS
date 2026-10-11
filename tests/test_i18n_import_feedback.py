"""Hindi for the Import statement page and the Feedback page, with the real translation engine in a real browser."""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402
from test_statement_import_ui import AA, HDFC, MORE  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AXE = os.path.join(ROOT, "node_modules", "axe-core", "axe.min.js")
HI = "localStorage.setItem('finos_lang', 'hi');"
WAIT_HI = "window.FinosI18n && FinosI18n.lang() === 'hi' && document.documentElement.lang === 'hi'"

# Visible text in the page body that has no Devanagari and is not a number: the strings a Hindi reader would still see in English.
LEFTOVERS = """(() => {
  const out = new Set(); const wrap = document.querySelector('.pv-wrap');
  const w = document.createTreeWalker(wrap, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement; if (!p || p.closest('script,style,[data-no-i18n],textarea,code')) continue;
    const t = n.nodeValue.replace(/\\s+/g, ' ').trim(); if (!t) continue;
    if (/[\\u0900-\\u097F]/.test(t) || /^[\\d\\s.,₹+−\\-:|/·%…]+$/.test(t)) continue;
    out.add(t);
  }
  wrap.querySelectorAll('[placeholder],[title],[aria-label]').forEach(e => ['placeholder', 'title', 'aria-label'].forEach(a => { const v = e.getAttribute(a); if (v && !/[\\u0900-\\u097F]/.test(v)) out.add('@' + a + ': ' + v); }));
  return [...out].filter(t => t !== 'CSV');
})()"""
RECORD = """(() => { window.__missing = new Set(); const t = FinosI18n.t.bind(FinosI18n); FinosI18n.t = (k, fb) => { if (FinosI18n._lookup(k) == null) window.__missing.add(k); return t(k, fb); }; })()"""


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, name, init="", lang="hi", width=1280, theme="dark"):
    base, browser = env
    ctx = browser.new_context(viewport={"width": width, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('finos-theme', '{theme}');" + (HI if lang == "hi" else "") + init)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{base}/html/{name}.html", wait_until="domcontentloaded")
    if lang == "hi":
        pg.wait_for_function(WAIT_HI, timeout=15000)
    return ctx, pg, errors


def upload(pg, content, name="statement.csv"):
    data = content.encode("utf-8") if isinstance(content, str) else content
    pg.set_input_files("#si-file", files=[{"name": name, "mimeType": "text/csv", "buffer": data}])
    pg.wait_for_function("document.querySelector('#si-preview').innerText.trim().length > 0")


def to_lang(pg, code):
    pg.evaluate(f"FinosI18n.setLang('{code}')")
    pg.wait_for_function(f"FinosI18n.lang() === '{code}'")
    pg.wait_for_timeout(250)


def body(pg):
    return pg.inner_text(".pv-wrap")


# ── Import statement page ─────────────────────────────────────────────────────────────────────────────────────────────

def test_import_page_is_in_hindi_before_and_after_a_file_is_chosen(env):
    ctx, pg, errors = open_page(env, "import-statement")
    pg.wait_for_timeout(400)
    assert pg.inner_text("h1.pv-title") == "बैंक स्टेटमेंट इम्पोर्ट करें"
    assert "फ़ाइल इसी डिवाइस पर पढ़ी जाती है और कभी अपलोड नहीं होती" in body(pg)
    assert "अभी तक कुछ इम्पोर्ट नहीं हुआ।" in body(pg)
    assert pg.evaluate(LEFTOVERS) == []
    upload(pg, MORE)
    text = body(pg)
    assert "3. जाँचें" in text and "पहले से मौजूद" in text and "आया पैसा" in text
    assert "2025-09-01 से 2025-09-06 तक" in text and "सबसे बड़ा ख़र्च:" in text
    assert "6 लेन-देन इम्पोर्ट करें" in pg.inner_text("#si-go") and "दूसरी फ़ाइल चुनें" in text
    assert pg.evaluate(LEFTOVERS) == []
    assert errors == []
    ctx.close()


def test_import_then_undo_speak_hindi_and_keep_the_numbers_right(env):
    ctx, pg, errors = open_page(env, "import-statement")
    upload(pg, HDFC)
    pg.click("#si-go")
    pg.wait_for_function("document.querySelector('#si-preview .si-note.good')")
    done = pg.inner_text("#si-preview")
    assert done.startswith("5 लेन-देन इम्पोर्ट हुए (2025-09-01 से 2025-09-05)।") and "मनी स्कोर और Future Loss" in done
    assert pg.inner_text("#si-status") == "इम्पोर्ट हो गया।"
    assert "5 लेन-देन · 2025-09-01 से 2025-09-05 तक" in pg.inner_text("#si-batches")
    assert pg.get_attribute("[data-undo]", "aria-label").startswith("2") and "5 लेन-देन का इम्पोर्ट पूर्ववत करें" in pg.get_attribute("[data-undo]", "aria-label")
    assert pg.evaluate(LEFTOVERS) == []
    pg.click("[data-undo]")
    pg.wait_for_function("document.querySelector('#si-status').innerText.startsWith('पूर्ववत')")
    assert pg.inner_text("#si-status") == "पूर्ववत हो गया। 5 लेन-देन हटाए गए।"
    assert "अभी तक कुछ इम्पोर्ट नहीं हुआ।" in pg.inner_text("#si-batches")
    assert errors == []
    ctx.close()


@pytest.mark.parametrize("content,name,expect", [
    ("%PDF-1.4 x", "s.csv", "यह PDF है।"),
    ("PK\x03\x04zzzz", "s.csv", "यह Excel फ़ाइल लगती है।"),
    ("hello\nworld", "s.csv", "यह बैंक स्टेटमेंट जैसी नहीं लगती।"),
    ("{\"encryptedFI\": 1}", "s.json", "यह डेटा अभी एन्क्रिप्टेड है।"),
    ("{\"a\": 1}", "s.json", "इस फ़ाइल में जमा-खाते का कोई लेन-देन नहीं मिला।"),
    ("{ not json", "s.json", "यह मान्य JSON नहीं है।"),
])
def test_files_that_cannot_be_imported_are_refused_in_hindi(env, content, name, expect):
    ctx, pg, errors = open_page(env, "import-statement")
    upload(pg, content, name)
    assert expect in pg.inner_text("#si-preview")
    assert pg.evaluate(LEFTOVERS) == []
    ctx.close()


def test_warnings_from_the_file_are_in_hindi_with_the_counts(env):
    ctx, pg, errors = open_page(env, "import-statement")
    bad = ("Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance\n"
           + "\n".join(f"0{i}/09/25,X{i},{i * 10}.00,,{99999 - i}.00" for i in range(1, 9))
           + "\n10/09/25,BALANCE B/F,,,5\n11/13/25,ZZ,5,,1\n")
    upload(pg, bad)
    text = pg.text_content("#si-preview")                               # includes the closed "skipped rows" list
    assert "इस फ़ाइल को जाँचें।" in text and "बैलेंस कॉलम पंक्ति-दर-पंक्ति नहीं जुड़ता।" in text
    assert "1 पंक्ति छोड़ी गई (नीचे देखें)।" in text and "पंक्ति 10: बैलेंस की पंक्ति" in text
    assert pg.evaluate(LEFTOVERS) == []
    aa = json.dumps({"type": "deposit", "transactions": {"transaction": [
        {"type": "DEBIT", "amount": "10", "transactionTimestamp": "2025-09-01T10:00:00", "narration": "A"},
        {"type": "BOGUS", "amount": "10", "transactionTimestamp": "2025-09-01T10:00:00", "narration": "B"}]}})
    upload(pg, aa, "aa.json")
    assert "1 लेन-देन छोड़ा गया (नीचे देखें)।" in pg.inner_text("#si-preview")
    assert pg.evaluate(LEFTOVERS) == []
    ctx.close()


def test_switching_language_redraws_the_import_page_and_back_restores_english_exactly(env):
    ctx, pg, errors = open_page(env, "import-statement")
    upload(pg, HDFC)
    pg.click("#si-go")
    pg.wait_for_function("document.querySelector('#si-preview .si-note.good')")
    upload(pg, MORE)                                                      # a fresh preview with one new row, plus history below
    pg.wait_for_selector("#si-go")
    hindi = body(pg)
    to_lang(pg, "en")
    english = body(pg)
    assert "Import 1 transaction" in english and "already here" in english.lower() and "5 transactions" in english   # labels are upper-cased by CSS
    assert not any("ऀ" <= ch <= "ॿ" for ch in pg.inner_text("#si-preview")), "the preview must be fully English again"
    to_lang(pg, "hi")
    assert body(pg) == hindi, "going back to Hindi must give the same page"
    # a fresh English load is the reference for what English must look like
    ctx2, fresh, _ = open_page(env, "import-statement", lang="en")
    fresh.evaluate("localStorage.setItem('finos_import_batches', %s); localStorage.setItem('finos_transactions', %s)" % (
        json.dumps(json.dumps(json.loads(pg.evaluate("localStorage.getItem('finos_import_batches')")))),
        json.dumps(json.dumps(json.loads(pg.evaluate("localStorage.getItem('finos_transactions')"))))))
    fresh.reload(wait_until="domcontentloaded")
    upload(fresh, MORE)
    fresh.wait_for_selector("#si-go")
    assert body(fresh) == english
    ctx.close(); ctx2.close()


# ── Feedback page ─────────────────────────────────────────────────────────────────────────────────────────────────────

def test_feedback_page_is_in_hindi_with_nothing_left_in_english(env):
    ctx, pg, errors = open_page(env, "feedback")
    pg.wait_for_timeout(500)
    text = body(pg)
    assert pg.inner_text("h1.pv-title") == "फ़ीडबैक"
    assert "FIN-OS आपके लिए कैसा काम कर रहा है?" in text and "टीम का इनबॉक्स" in text
    assert "बंद। इसे “प्राइवेसी और आपका डेटा” में बदलें।" in pg.inner_text("#fb-sharing")
    assert "गिनती बंद है" in text and "अभी कोई गिनती नहीं।" in text
    options = pg.locator("#fb-topic option").all_inner_texts()
    assert options[0] == "मनी स्कोर" and "कुछ और" in options and "Money Score" not in options
    assert pg.evaluate(LEFTOVERS) == []
    assert errors == []
    ctx.close()


def test_saving_feedback_in_hindi_lists_it_and_deleting_says_so_in_hindi(env):
    ctx, pg, errors = open_page(env, "feedback")
    pg.click("[data-r=up]")
    pg.fill(".fb-t", "बहुत अच्छा")
    pg.click("[data-save]")
    pg.wait_for_function("document.querySelectorAll('#fb-list [data-del]').length === 1")
    item = pg.inner_text("#fb-list")
    assert "मनी स्कोर" in item and "बहुत अच्छा" in item and "👍" in item
    assert "इसी डिवाइस पर सेव हो गया।" in pg.inner_text(".fb-out")
    assert "मनी स्कोर के बारे में" in pg.get_attribute("[data-del]", "aria-label") and "फ़ीडबैक मिटाएँ" in pg.get_attribute("[data-del]", "aria-label")
    assert pg.evaluate(LEFTOVERS) == []
    pg.click("[data-del]")
    assert pg.inner_text("#fb-status") == "मिटा दिया गया।"
    assert "अभी तक कुछ सेव नहीं हुआ।" in pg.inner_text("#fb-list")
    ctx.close()


def test_switching_language_on_the_feedback_page_keeps_what_was_typed(env):
    ctx, pg, errors = open_page(env, "feedback")
    pg.click("[data-r=down]")
    pg.fill(".fb-t", "typed words")
    pg.select_option("#fb-topic", "tax")
    to_lang(pg, "en")
    assert pg.input_value(".fb-t") == "typed words"
    assert pg.get_attribute("[data-r=down]", "aria-pressed") == "true"
    assert pg.input_value("#fb-topic") == "tax"
    assert pg.inner_text(".fb-q") == "How is FIN-OS working for you?" and pg.inner_text("[data-save]") == "Save feedback"
    assert pg.locator("#fb-topic option").first.inner_text() == "Money Score"
    assert "Counting is off" in body(pg)
    to_lang(pg, "hi")
    assert pg.input_value(".fb-t") == "typed words" and pg.inner_text("[data-save]") == "फ़ीडबैक सेव करें"
    assert pg.input_value("#fb-topic") == "tax"
    ctx.close()


def test_usage_counts_note_follows_the_choice_in_hindi(env):
    ctx, pg, errors = open_page(env, "feedback")
    pg.wait_for_timeout(300)
    assert pg.inner_text("#fb-usage-note").startswith("गिनती बंद है, इसलिए कुछ भी गिना नहीं जा रहा।")
    pg.evaluate("FinosPrivacy.consent.set('usage', true)")
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_function(WAIT_HI, timeout=15000)
    pg.wait_for_function("document.querySelector('#fb-usage-note').innerText.startsWith('गिनती चालू है।')")
    assert "बंद। " in pg.inner_text("#fb-sharing")                    # sharing feedback is its own choice and is still off
    assert pg.evaluate(LEFTOVERS) == []
    ctx.close()


# ── nothing is ever shown without a Hindi entry ───────────────────────────────────────────────────────────────────────

def test_no_template_is_requested_without_a_hindi_entry_across_every_state(env):
    missing = set()

    def drive(name, steps, init=""):
        ctx, pg, _ = open_page(env, name, init)
        pg.evaluate(RECORD)
        pg.evaluate("FinosI18n.setLang('hi')")
        steps(pg)
        missing.update(pg.evaluate("[...window.__missing]"))
        missing.update(t for t in pg.evaluate(LEFTOVERS))
        ctx.close()

    def imports(pg):
        for content, nm in [("%PDF-1", "a.csv"), ("PK\x03\x04", "a.csv"), ("", "a.csv"), ("hello\nworld", "a.csv"), ("{}", "a.json"), ("{\"encryptedFI\":1}", "a.json"), ("{bad", "a.json")]:
            upload_nowait(pg, content, nm)
        for content, nm in [(MORE, "m.csv"), (AA, "aa.json")]:
            upload_nowait(pg, content, nm)
            pg.wait_for_selector("#si-go")
        pg.click("#si-go"); pg.wait_for_selector("[data-undo]")
        pg.click("[data-undo]")
        upload_nowait(pg, HDFC, "h.csv"); pg.wait_for_selector("#si-go"); pg.click("#si-go")
        upload_nowait(pg, HDFC, "h.csv"); pg.wait_for_selector("#si-go")        # all duplicates
        pg.set_input_files("#si-file", files=[{"name": "big.csv", "mimeType": "text/csv", "buffer": b"x" * (5 * 1024 * 1024 + 10)}])
        pg.wait_for_timeout(300)
        bad = ("Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance\n" + "\n".join(f"0{i}/09/25,X{i},{i * 10}.00,,{99999 - i}.00" for i in range(1, 9))
               + "\n10/09/25,BALANCE B/F,,,5\n11/13/25,ZZ,5,,1\n12/09/25,BOTH,5,5,1\n13/09/25,NONE,,,1\nheader again,x,y,z,w\n")
        upload_nowait(pg, bad, "b.csv")
        pg.wait_for_timeout(300)

    def feedback(pg):
        pg.click("[data-save]")                                              # nothing picked yet
        pg.click("[data-r=up]"); pg.fill(".fb-t", "ok"); pg.click("[data-save]")
        pg.wait_for_function("document.querySelectorAll('#fb-list [data-del]').length === 1")
        pg.click("#fb-download"); pg.wait_for_timeout(150)
        pg.click("#fb-usage-clear"); pg.wait_for_timeout(100)
        pg.click("[data-del]")
        pg.click("#fb-clear")

    drive("import-statement", imports)
    drive("feedback", feedback)
    missing.discard("CSV")
    assert sorted(missing) == [], f"these English strings were shown without a Hindi entry: {sorted(missing)}"


def upload_nowait(pg, content, name):
    data = content.encode("utf-8") if isinstance(content, str) else content
    pg.set_input_files("#si-file", files=[{"name": name, "mimeType": "text/csv", "buffer": data}])
    pg.wait_for_timeout(250)


@pytest.mark.parametrize("theme", ["dark", "light"])
@pytest.mark.parametrize("name", ["import-statement", "feedback"])
def test_hindi_pages_pass_axe_and_fit_a_phone(env, name, theme):
    ctx, pg, errors = open_page(env, name, width=375, theme=theme)
    if name == "import-statement":
        upload(pg, MORE)
        pg.wait_for_selector("#si-go")
    else:
        pg.click("[data-r=up]"); pg.fill(".fb-t", "ठीक है"); pg.click("[data-save]")
        pg.wait_for_function("document.querySelectorAll('#fb-list [data-del]').length === 1")
    assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Hindi text overflows a phone"
    if os.path.exists(AXE):
        pg.add_script_tag(path=AXE)
        bad = pg.evaluate("axe.run('main', {runOnly: ['wcag2a', 'wcag2aa']}).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', ')))")
        assert bad == [], bad
    assert not errors
    ctx.close()
