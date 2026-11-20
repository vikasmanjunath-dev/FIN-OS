# Future Loss ("Sync Future Loss" on System Leak)

The second button in the UPI Leakage Radar on `html/system-leak.html`. It answers one question: **if the money that leaks out every month had been invested instead, what would it be worth?**

| Piece | File |
|---|---|
| Core + panel UI (`FinosLeak`) | `js/finos-leak.js` |
| Button handler `syncLossData()`, radar fixes | `js/system-leak.js` |
| Panel styles (`.fl-*`) | `css/system-leak.css` |
| Tests | `tests/leak.test.js` (core), `tests/test_system_leak_ui.py` (browser) |

## Where the numbers come from

Never invented. The radar's own blips are hard-coded sample values, so they are only used as a clearly labelled **SAMPLE** when the user has no data.

- `finos_transactions`, read through `FinosBudget.normalize()` (it reconciles the four shapes that different features write). Only `expense` rows count. Income and SIP/saving never do.
- `finos_subscriptions_monthly`, written by the Subscription Tracker.

**Method.** Each category's spend over the last 90 days (or since the first logged expense, if that is later) is scaled to a month. Under 14 days of history is too thin to scale up, so only the tracker's subscription figure is used. Subscriptions use the larger of the tracker figure and the logged payments, never the sum.

**What counts as a leak.** Defaults are the discretionary categories: Food & Dining, Entertainment, Shopping, Subscriptions. Groceries, rent, EMIs and so on are needs and are off by default. The user can tick any category in or out; the choice is remembered.

**Future value.** Monthly amount invested at the start of each month, compounded monthly. This is the same convention as the SIP calculator (₹5,000 a month at 12% for 10 years is ₹11,61,695). The rate defaults to 12% a year and is editable (0–30%). It is an assumption, not a promise, and the panel says so. A slider shows what redirecting 0–100% of the leak (default 25%) would become in 20 years.

## Data written

`finos_leak_monthly`, `finos_leak_future_20y`, `finos_leak_synced_at` (the latest figures, for other tools to read), plus the user's choices `finos_leak_cats` and `finos_leak_rate`. Nothing is written in sample mode or when there is no data.

## Bugs fixed on the same page

- The radar's "monthly drain" added the same ₹1,389 on every sweep (about every 3.8 s) and kept appending to the log. Each sample leak is now counted once.
- A second click on "Initialize Deep Scan" stacked a second timer and a second set of blips. It is now ignored while scanning.
- The legacy UPI simulation looked for `#upi-dot-field`, which the page no longer has, and threw up to 40 errors whenever the sinkhole section scrolled into view. It now skips itself when the element is missing.
