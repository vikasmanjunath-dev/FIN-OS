# Statement import (and the Account Aggregator status)

Live Account Aggregator (AA) connections are **off**. Real AA access needs a registered Financial Information User and a signed, encrypted request flow, and FIN-OS has no provider partnership. The old `js/finos-aa.js` called invented endpoints, put the user's key in a URL, and after 3 seconds always injected random "demo" transactions into the real ledger. It is now gated (`LIVE_ENABLED = false`), and people bring their data in with a file instead.

| Piece | File |
|---|---|
| Parser, categoriser, merge and undo (`FinosStatement`) | `js/finos-statement-import.js` (reuses `FinosImport.parseCSV/toNumber` and `FinosBudget.canonicalCategory`) |
| The page | `html/import-statement.html`, linked from Settings → Data & Privacy, the AA dashboard and search |
| AA safety changes | `js/finos-aa.js` |
| Tests | `tests/statement-import.test.js` (24), `tests/test_statement_import_ui.py` (21), `tests/test_aa_safety.py` (8), two guards in `tests/privacy.test.js` |

## What it reads

- **Bank CSV.** The header row is found anywhere in the first 30 lines (banks put account details above it). Separate withdrawal/debit and deposit/credit columns, or one amount column with a Dr/Cr column, a `Dr`/`Cr` suffix, or a negative sign. Comma, semicolon or tab delimiters, BOM, quoted commas, ₹ and thousands separators. Dates are day-first (`03/04/2025`, `03-Apr-25`, `2025-04-03`) unless the file proves month-first, and every date is checked against the real calendar. Layouts modelled on HDFC, ICICI and SBI exports.
- **AA JSON** (ReBIT deposit schema, already decrypted). Any wrapper a provider uses, any key case, several accounts. Other account types are ignored with a note. Still-encrypted data is reported as such. The date part of `transactionTimestamp` is used as written, so a 23:30 IST payment stays on that day.
- Not supported: PDF and Excel files (it says so and how to export a CSV), password-protected files, files over 5 MB.

## What it will not do

- **Never guess.** A row without a valid date or exactly one clear amount is skipped, and each skipped row is listed with its reason.
- **Check itself.** If the file has a running balance, it verifies the balance adds up row by row (oldest-first or newest-first). If not, the preview warns that a row may be missing or misread.
- **Never read identity.** Account numbers, holder names, PAN, mobile and IFSC are not read into the output (a test feeds them in and checks they never appear in the page or storage).
- **Never touch the network.** A test scans the source for `fetch`, XHR, beacons, WebSockets and script injection, and the browser tests assert there is no POST and no request to anywhere unexpected during a full import and undo.

## How it lands in the ledger

`toLedger` writes the shape the rest of FIN-OS reads in `finos_transactions`: `{ id, type:'credit'|'debit', amount, desc, category, date, src:'import', batch }`. The date is noon UTC so no timezone can move it to another day. Credits are `Income`; debits are categorised with `FinosBudget.canonicalCategory` after payment-app names (PhonePe, Paytm, GPay, BHIM, "paid via", UPI) are removed, because "PhonePe" would otherwise read as a phone bill. Budgets, Money Score prefill (spending and EMIs), Future Loss and PULSE then see the data with no further wiring.

## Safe to repeat, safe to undo

`mergeLedger` is duplicate-aware. Re-importing a file adds nothing, and an overlapping statement adds only the new rows. Two genuinely identical payments on one day (two ₹10 teas) are both kept, because duplicates are counted: if the ledger already holds two, the first two in the file are the duplicates. Records of other shapes (quick capture, manual entries) are never matched or changed. `finos_import_batches` (last 20, no file names) lists each import; **Undo** removes exactly that batch (`src:'import'` and its batch id) and nothing else.

## The AA module now

- `LIVE_ENABLED = false`: no provider host is contacted, even with a stored key or an old "active" consent. `tests/privacy.test.js` fails if this flag and the privacy registry's claim ("does not connect to them today") ever disagree, so turning it on forces the notice to be updated first.
- Demo Mode is a preview only. It saves nothing, so it can no longer fabricate transactions or overwrite real mutual-fund holdings.
- People who used the old Demo Mode get a one-click **Remove the sample data** notice. It only offers this where a `demo_consent_*` record exists, only removes records that match the fixed demo descriptions and fund names, leaves anything else alone, and never acts without the button.

## Not done

A real AA integration (needs a registered provider partnership, then a backend to hold credentials and decrypt); PDF statements; mutual-fund and other AA data types; credit-card statements (layouts differ; add them as tests-first fixtures); inter-account transfer detection (a transfer between two of your own accounts counts as spending once and income once).
