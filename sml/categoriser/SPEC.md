# Transaction categoriser: spec and evaluation protocol (ROADMAP I1)

Status: harness and rule baseline only. No model is trained. Gains cannot be claimed on synthetic rows (the rules would label them); real rows come from founder decision F1.

## What is being replaced / measured
`CATEGORY_RULES` in `js/finos-budget.js` (first regex that matches wins, default "Other") mapping a transaction description to one of 13 categories: Food & Dining, Groceries, Transport, Shopping, Bills & Utilities, Housing, EMI & Loans, Subscriptions, Health, Entertainment, Education, Travel, Other. Everything non-expense (income, saving, transfer) is decided elsewhere (`kind` in `normalize`) and is out of scope here.

## Row format (one JSON object per line)
```
{"description": "SWIGGY ORDER 8812", "amount_bucket": "100-500", "direction": "debit", "channel": "upi", "category": "Food & Dining", "source": "founder"}
```
- `description`: already redacted (no names, phone numbers, account or card numbers, UPI handles, e-mail). Merchant words stay. A description that still looks personal is rejected by the harness checks below.
- `amount_bucket`: one of `<100`, `100-500`, `500-2000`, `2000-10000`, `10000+` (never the exact amount).
- `direction`: `debit` or `credit`. `channel`: `upi`, `card`, `netbanking`, `cash`, `other`.
- `category`: the PERSON's own correct category, one of the 13 names. `source`: who supplied the rows (a label such as `founder`, `p2`); used to split by person.
- Optional `merchant_key`: a normalised merchant token, used only to keep the same merchant out of both train and test.

## Evaluation protocol
1. Split by person AND merchant: a held-out row's `source` and `merchant_key` never appear in training (a model that memorised merchants would otherwise look perfect).
2. Report: accuracy over covered rows, coverage (share of rows where the system commits to a category instead of "Other"/abstains), the accuracy of "Other" rows (true "Other" share), per-category precision / recall / F1, confusion pairs, and a 95% bootstrap interval. Paired bootstrap against the rules on the same rows.
3. Gate C: accuracy >= 0.90 at coverage >= 85% on >= 300 held-out rows from people not in training, no loss against the rules on rows where a rule fires.
4. Abstain: below confidence 0.55 a future model says "Other / ask the user" instead of guessing (never auto-recategorise silently).
5. Synthetic fixtures are for plumbing tests only and the harness prints that on any run that uses one (`source` starting with `synthetic`).

## Privacy checks run by the harness before any row is used
Reject rows whose description contains: 10+ digits in a run (account/card/phone), an e-mail address, a UPI handle (`name@bank`), a PAN (`AAAAA9999A`), an Aadhaar-like 12-digit group, or any non-ASCII digit. The check is deliberately stricter than the feedback module's `redact()`, which is known to leak UPI handles, spaced digits and non-ASCII digits (docs/PENDING.md #14).

## Commands
```
rag-engine/.venv/bin/python sml/categoriser/harness.py --rows path/to/rows.jsonl [--json out.json]
rag-engine/.venv/bin/python sml/categoriser/harness.py --rows sml/categoriser/fixtures/plumbing.jsonl     # plumbing check only
```
