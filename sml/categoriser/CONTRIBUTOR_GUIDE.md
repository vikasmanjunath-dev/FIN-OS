# Help teach FIN-OS to sort your spending (10 minutes, one file)

**What this is.** FIN-OS sorts your transactions into 13 categories (Food & Dining, Groceries, Transport, Shopping, Bills & Utilities, Housing, EMI & Loans, Subscriptions, Health, Entertainment, Education, Travel, Other). Its current rules guess wrong on some merchants. To build something better we need real examples where **you** chose the right category. You will make one small file on your own computer and send it to the founder. **Nothing is sent by FIN-OS; you decide what goes in the file and whether to send it.**

## What the file contains (and what it never contains)
- **Contains, per transaction:** the shop/merchant words (with numbers blanked out), a money *range* (for example 100-500, never the exact amount), debit or credit, how it was paid (UPI, card, netbanking, cash, other), the category you picked, and a short label for you (like `p1`).
- **Never contains:** dates, exact amounts, names of accounts, phone numbers, e-mail addresses, UPI IDs, PAN or Aadhaar numbers, order or reference numbers. These are blanked or the whole line is dropped.
- **Only transactions where YOU set one of the 13 categories are included.** Lines that FIN-OS guessed, or that came from an import without a category, are skipped, because they are not your own answer. So before you export, please fix wrong categories in the app: that is the valuable part.

## Steps (on a computer; Chrome or Edge)
1. Open FIN-OS in the browser where you normally use it (your data lives in that browser) and go to any page.
2. Open the console: press **F12** (Mac: **Cmd + Option + J**), click the **Console** tab. If it says you must type "allow pasting", type exactly `allow pasting` and press Enter.
3. Paste these two lines, press Enter, and replace `p1` with the label the founder gave you:
   ```
   localStorage.setItem('finos_sml_rows','1'); await AryaSidebar.smlRows('p1')
   ```
   It shows the rows it would export and how many it skipped and why.
4. **Read the rows.** If any shop name contains a person's name or anything private, note it: you will delete that line in step 6.
5. Paste this line and press Enter. It copies the file text to your clipboard:
   ```
   copy(await AryaSidebar.smlRowsExport('p1'))
   ```
6. Open a plain text editor (Notepad, TextEdit in plain-text mode), paste, delete any line you do not want to share, and save the file as `rows_p1.jsonl`.
7. Switch the export off again by pasting: `localStorage.removeItem('finos_sml_rows')`
8. Send `rows_p1.jsonl` to the founder (WhatsApp or e-mail is fine).

## What happens next (founder)
```
rag-engine/.venv/bin/python sml/tools/categoriser/validate_rows.py rows_p1.jsonl rows_p2.jsonl ... --write-clean sml/data/incoming/categoriser_rows.jsonl
```
The checker rejects any line that still looks personal (phone, e-mail, UPI ID, PAN, Aadhaar-like, order or reference number, long digit run, date, extra field) and says which line and why, without printing the text. It also shows how many rows each category and each person has toward the 1,000 we need (from at least 3-5 people besides the founder). The old `js/finos-feedback.js` `redact()` is **not** used here: it has known leaks (docs/PENDING.md #14).

## If you change your mind
Delete the file. Nothing else was stored anywhere. Your FIN-OS data is unchanged by any of the steps.
