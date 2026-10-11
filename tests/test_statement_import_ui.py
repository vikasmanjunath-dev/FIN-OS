"""html/import-statement.html: a bank statement file in, a preview, an import you can undo, and nothing ever uploaded."""
import json
import os
import sys
from urllib.parse import urlparse

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
pw_api = pytest.importorskip("playwright.sync_api")
from smoke_pages import static_server  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AXE = os.path.join(ROOT, "node_modules", "axe-core", "axe.min.js")
ALLOWED = ("127.0.0.1", "localhost", "[::1]", "fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com", "unpkg.com")

HDFC = "\r\n".join([
    "Account Branch :BANGALORE", "Customer ID :12345678", "",
    "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
    '01/09/25,"UPI-ZOMATO-ORDER 123,FOOD",0000412345,01/09/25,450.00,,49550.00',
    "02/09/25,NEFT CR-ACME CORP-SALARY SEP,N123456789,02/09/25,,90000.00,139550.00",
    "03/09/25,UPI-RAHUL S-PAID VIA PHONEPE,0000987654,03/09/25,1200.00,,138350.00",
    "03/09/25,ATM WDL SBI MG ROAD,000111,03/09/25,5000.00,,133350.00",
    "05/09/25,EMI HDFC HOME LOAN 7890,000222,05/09/25,25000.00,,108350.00",
])
MORE = HDFC + "\r\n06/09/25,UPI-CHAI,0000333,06/09/25,40.00,,108310.00"
AA = json.dumps({"type": "deposit", "profile": {"holders": {"holder": [{"name": "PRIVATE NAME", "pan": "ABCDE1234F"}]}}, "summary": {"ifscCode": "HDFC0001"},
                 "transactions": {"transaction": [{"type": "DEBIT", "amount": "450.00", "transactionTimestamp": "2025-09-01T23:30:00.000+05:30", "narration": "UPI/ZOMATO", "txnId": "T1"},
                                                  {"type": "CREDIT", "amount": "90000.00", "transactionTimestamp": "2025-09-02T10:00:00.000+05:30", "narration": "SALARY"}]}})


@pytest.fixture(scope="module")
def env():
    with static_server() as base, pw_api.sync_playwright() as pw:
        try:
            browser = pw.chromium.launch(channel="chromium")
        except Exception as e:  # noqa: BLE001
            pytest.skip(f"Chromium unavailable: {e}")
        yield base, browser
        browser.close()


def open_page(env, init="", width=1280, theme="dark", requests=None):
    base, browser = env
    ctx = browser.new_context(viewport={"width": width, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('finos-theme', '{theme}');" + init)
    pg = ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    if requests is not None:
        pg.on("request", lambda r: requests.append(r))
    pg.goto(f"{base}/html/import-statement.html", wait_until="domcontentloaded")
    pg.wait_for_selector("#si-file", state="attached")
    return ctx, pg, errors


def upload(pg, content, name="statement.csv"):
    data = content.encode("utf-8") if isinstance(content, str) else content
    pg.set_input_files("#si-file", files=[{"name": name, "mimeType": "text/csv", "buffer": data}])


def ls(pg, key):
    return pg.evaluate(f"localStorage.getItem({json.dumps(key)})")


def ledger(pg):
    return json.loads(ls(pg, "finos_transactions") or "[]")


def stat(pg, label):
    return pg.locator(".si-sum div").filter(has_text=label).locator("b").inner_text()


def test_a_statement_is_previewed_with_exact_numbers_before_anything_is_saved(env):
    ctx, pg, errors = open_page(env)
    assert "Nothing imported yet" in pg.inner_text("#si-batches")
    upload(pg, HDFC)
    pg.wait_for_selector("#si-go")
    assert [stat(pg, "Found"), stat(pg, "New"), stat(pg, "Already here"), stat(pg, "Skipped")] == ["5", "5", "0", "0"]
    assert stat(pg, "Money in") == "₹90,000" and stat(pg, "Money out") == "₹31,650"
    text = pg.inner_text("#si-preview")
    assert "2025-09-01" in text and "2025-09-05" in text
    assert "balance column adds up" in text
    assert "EMI & Loans ₹25,000" in text
    assert pg.inner_text("#si-go") == "Import 5 transactions"
    row = pg.locator(".si-table tbody tr").filter(has_text="PHONEPE")
    assert "Other" in row.inner_text() and "Bills" not in row.inner_text()           # PhonePe is how it was paid, not a phone bill
    assert ls(pg, "finos_transactions") is None                                       # nothing saved yet
    assert not errors
    ctx.close()


def test_import_saves_tagged_transactions_logs_the_batch_and_other_parts_of_the_app_read_them(env):
    ctx, pg, errors = open_page(env)
    upload(pg, HDFC)
    pg.click("#si-go")
    pg.wait_for_selector(".si-note.good")
    saved = ledger(pg)
    assert len(saved) == 5 and all(t["src"] == "import" and t["batch"] == saved[0]["batch"] for t in saved)
    assert saved[0] == {"id": f"{saved[0]['batch']}_0", "type": "debit", "amount": 450, "desc": "UPI-ZOMATO-ORDER 123,FOOD", "category": "Food & Dining",
                        "date": "2025-09-01T12:00:00.000Z", "src": "import", "batch": saved[0]["batch"]}
    log = json.loads(ls(pg, "finos_import_batches"))
    assert len(log) == 1 and log[0]["count"] == 5 and (log[0]["from"], log[0]["to"]) == ("2025-09-01", "2025-09-05") and set(log[0]) == {"id", "at", "count", "from", "to", "format"}
    assert "5 transactions" in pg.inner_text("#si-batches")
    # the budget layer reads the import as income and expenses in the right month
    got = pg.evaluate("(() => { const t = FinosBudget.normalizeAll(JSON.parse(localStorage.getItem('finos_transactions'))); const s = FinosBudget.monthSpend(t, '2025-09'); return {n: t.length, kinds: t.map(x => x.kind), total: s.total}; })()")
    assert got == {"n": 5, "kinds": ["expense", "income", "expense", "expense", "expense"], "total": 31650}
    assert not errors
    ctx.close()


def test_importing_the_same_file_again_adds_nothing_and_an_overlapping_file_adds_only_the_new_rows(env):
    ctx, pg, errors = open_page(env)
    upload(pg, HDFC)
    pg.click("#si-go")
    pg.wait_for_selector(".si-note.good")
    upload(pg, HDFC)
    pg.wait_for_selector("#si-go")
    assert [stat(pg, "New"), stat(pg, "Already here")] == ["0", "5"]
    assert pg.is_disabled("#si-go") and "Nothing new to import" in pg.inner_text("#si-go") and "already in FIN-OS" in pg.inner_text("#si-preview")
    assert len(ledger(pg)) == 5 and len(json.loads(ls(pg, "finos_import_batches"))) == 1
    upload(pg, MORE, name="more.csv")
    pg.wait_for_function("document.querySelector('#si-go') && document.querySelector('#si-go').innerText.startsWith('Import 1 ')")
    assert [stat(pg, "New"), stat(pg, "Already here")] == ["1", "5"]
    pg.click("#si-go")
    pg.wait_for_selector(".si-note.good")
    assert len(ledger(pg)) == 6 and ledger(pg)[-1]["desc"] == "UPI-CHAI"
    ctx.close()


def test_undo_removes_exactly_that_import_and_leaves_the_persons_own_transactions(env):
    mine = [{"id": "m1", "type": "debit", "amount": 99, "desc": "manual entry", "date": "2025-09-09", "category": "Other", "source": "manual"},
            {"amount": 200, "category": "need_food", "type": "need_food", "label": "lunch", "date": "2025-09-10"}]
    ctx, pg, errors = open_page(env, init="if (!sessionStorage.getItem('s')) { localStorage.setItem('finos_transactions', " + json.dumps(json.dumps(mine)) + "); sessionStorage.setItem('s', '1'); }")
    upload(pg, HDFC)
    pg.click("#si-go")
    pg.wait_for_selector(".si-note.good")
    assert len(ledger(pg)) == 7
    pg.click("[data-undo]")
    assert ledger(pg) == mine                                                           # the person's records are exactly as they were
    assert json.loads(ls(pg, "finos_import_batches")) == []
    assert "Removed 5 transactions" in pg.inner_text("#si-status") and "Nothing imported yet" in pg.inner_text("#si-batches")
    assert not errors
    ctx.close()


@pytest.mark.parametrize("content,name,expect", [
    (b"%PDF-1.7\n%\xe2\xe3\xcf\xd3 binary", "stmt.pdf", "That is a PDF"),
    (b"PK\x03\x04\x14\x00 zipped excel", "stmt.xlsx", "Excel file"),
    ("", "empty.csv", "The file is empty"),
    ("Name,Age\nA,3\nB,4", "people.csv", "does not look like a bank statement"),
    ("Date,Narration,Debit,Credit\nnot a date,x,,", "bad.csv", "no readable transactions"),
    ('{"hello": 1}', "x.json", "could not find any deposit-account"),
    ('{"Payload":[{"data":[{"encryptedFI":"abc=="}]}]}', "enc.json", "still encrypted"),
    ("{broken", "broken.json", "not valid JSON"),
])
def test_files_that_cannot_be_imported_say_why_and_change_nothing(env, content, name, expect):
    ctx, pg, errors = open_page(env)
    upload(pg, content, name)
    pg.wait_for_selector("#si-preview .si-note.warn")
    assert expect in pg.inner_text("#si-preview")
    assert pg.locator("#si-go").count() == 0
    assert ls(pg, "finos_transactions") is None and ls(pg, "finos_import_batches") is None
    assert not errors
    ctx.close()


def test_a_file_far_too_large_to_be_a_statement_is_refused(env):
    ctx, pg, errors = open_page(env)
    upload(pg, b"Date,Narration,Debit\n" + b"x" * (5 * 1024 * 1024 + 10))
    pg.wait_for_selector("#si-preview .si-note.warn")
    assert "over 5 MB" in pg.inner_text("#si-preview") and ls(pg, "finos_transactions") is None
    ctx.close()


def test_account_aggregator_json_is_imported_without_reading_personal_fields(env):
    ctx, pg, errors = open_page(env)
    upload(pg, AA, "aa.json")
    pg.wait_for_selector("#si-go")
    assert "Account Aggregator data" in pg.inner_text("#si-preview") and stat(pg, "Found") == "2"
    assert "PRIVATE NAME" not in pg.content() and "ABCDE1234F" not in pg.content()
    pg.click("#si-go")
    pg.wait_for_selector(".si-note.good")
    stored = ls(pg, "finos_transactions")
    assert "PRIVATE NAME" not in stored and "ABCDE1234F" not in stored and "HDFC0001" not in stored
    assert [t["date"] for t in ledger(pg)] == ["2025-09-01T12:00:00.000Z", "2025-09-02T12:00:00.000Z"]      # 23:30 IST stayed on 1 September
    ctx.close()


def test_a_file_whose_balances_do_not_add_up_is_called_out_before_import(env):
    rows = ["Date,Narration,Debit,Credit,Balance"]
    bal = 10000
    for i in range(1, 9):
        bal -= 100
        rows.append(f"0{i}/10/2025,Spend {i},100,,{bal}")
    del rows[4:6]                                                                        # two rows missing from the middle
    ctx, pg, errors = open_page(env)
    upload(pg, "\n".join(rows))
    pg.wait_for_selector("#si-go")
    alert = pg.locator("#si-preview [role=alert]")
    assert alert.count() == 1 and "Check this file" in alert.inner_text() and "does not add up" in alert.inner_text()
    ctx.close()


def test_hostile_text_in_a_description_is_shown_as_plain_text(env):
    ctx, pg, errors = open_page(env)
    upload(pg, "Date,Narration,Debit,Credit\n01/10/2025,\"<img src=x onerror=window.__p=1><script>window.__p=2</script>\",10,\n")
    pg.wait_for_selector("#si-go")
    assert pg.evaluate("window.__p") is None
    assert pg.locator("#si-preview img").count() == 0 and "<img" in pg.inner_text("#si-preview")
    ctx.close()


def test_if_the_browser_cannot_save_nothing_is_imported_and_no_batch_is_logged(env):
    boom = "const _s = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'finos_transactions') throw new Error('quota'); return _s.apply(this, arguments); };"
    ctx, pg, errors = open_page(env, init=boom)
    upload(pg, HDFC)
    pg.click("#si-go")
    pg.wait_for_function("document.getElementById('si-status').innerText.includes('Nothing was imported')")
    assert ls(pg, "finos_import_batches") is None and ls(pg, "finos_transactions") is None
    assert not errors
    ctx.close()


def test_the_file_is_never_uploaded_no_post_and_no_request_to_anywhere_unexpected(env):
    reqs = []
    ctx, pg, errors = open_page(env, requests=reqs)
    upload(pg, HDFC)
    pg.click("#si-go")
    pg.wait_for_selector(".si-note.good")
    pg.click("[data-undo]")
    pg.wait_for_timeout(500)
    assert [r.url for r in reqs if r.method not in ("GET", "HEAD", "OPTIONS")] == []
    base = env[0]
    stray = [r.url for r in reqs if not r.url.startswith(base) and not r.url.startswith("data:") and (urlparse(r.url).hostname or "") not in ALLOWED]
    assert stray == [], stray
    sent = " ".join((r.post_data or "") for r in reqs)
    assert "ZOMATO" not in sent and "SALARY" not in sent
    ctx.close()


def test_settings_links_to_the_importer_and_the_aa_notice_points_at_it(env):
    base, browser = env
    ctx = browser.new_context()
    pg = ctx.new_page()
    pg.goto(f"{base}/html/settings.html", wait_until="domcontentloaded")
    assert pg.locator("a[href='import-statement.html']").count() >= 1
    assert pg.request.get(f"{base}/html/import-statement.html").status == 200
    ctx.close()


@pytest.mark.parametrize("theme", ["dark", "light"])
def test_preview_fits_a_phone_and_passes_axe(env, theme):
    ctx, pg, errors = open_page(env, width=375, theme=theme)
    upload(pg, HDFC)
    pg.wait_for_selector("#si-go")
    assert pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "preview overflows a phone"
    if os.path.exists(AXE):
        pg.add_script_tag(path=AXE)
        bad = pg.evaluate("axe.run('main', {runOnly: ['wcag2a', 'wcag2aa']}).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).join(', ')))")
        assert bad == [], bad
    assert not errors
    ctx.close()
