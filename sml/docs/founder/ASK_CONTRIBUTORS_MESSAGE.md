# Message to send to 3-5 friends (draft, 2026-11-10)

Real rows can only come from real people, so this is for you to send. I have not contacted anyone.

## English
Hi <name>, I'm building FIN-OS, a money app for India, and I'd like your help for 10 minutes. It sorts spending into 13 categories (food, transport, bills, EMI...). To make that sorting accurate I need examples of how real people label their own transactions.

You press two buttons and get ONE small file. It has only shop words with numbers blanked out, a money range (like 100-500, never the exact amount), debit or credit, and how it was paid. It never has dates, names, phone numbers, UPI IDs, PAN, Aadhaar, account or order numbers. You can open the file and read every line before you send it, and you can say no at any point.

The steps are in the attached one-page guide (CONTRIBUTOR_GUIDE.md). Your label is <p1/p2/...>. Send me the file when you're happy with it. Thank you!

## Hinglish
Hi <name>, main FIN-OS bana raha hoon, India ke liye ek money app. Mujhe 10 minute ki help chahiye. App kharche ko 13 category mein baantta hai (khana, travel, bills, EMI...). Ise sahi karne ke liye mujhe real logon ke apni category chunne ke examples chahiye.

Tumhe do step karke ek chhoti file milegi. Usme sirf shop ke words (numbers hata ke), paise ka range (jaise 100-500, exact amount kabhi nahi), debit ya credit, aur payment ka tareeka hoga. Date, naam, phone number, UPI ID, PAN, Aadhaar, account ya order number kabhi nahi. File bhejne se pehle tum har line padh sakte ho, aur kabhi bhi mana kar sakte ho.

Steps attached guide (CONTRIBUTOR_GUIDE.md) mein hain. Tumhara label <p1/p2/...> hai. Khush ho to file mujhe bhej do. Thanks!

## When files come back (you run this; reads files only, sends nothing)
```bash
rag-engine/.venv/bin/python sml/tools/categoriser/validate_rows.py rows_p1.jsonl rows_p2.jsonl --write-clean clean.jsonl
```
It rejects any personal-looking line and counts rows toward the 1,000 target. Then tell me and I run the categoriser harness (Gate C) on `clean.jsonl`.
