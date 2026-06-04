# FIN-OS — Database Reference

> Version: 1.2 | Date: June 5, 2026  
> Supabase (Postgres) · Project: `oeapcyucnduhwpgxfknb`

---

## Overview

FIN-OS uses one Supabase project for all persistent storage.

| Group | Tables | Managed by |
|---|---|---|
| Core app | profiles, transactions, goals, holdings, budgets | Frontend |
| Alert engine | alerts, push_subscriptions, alert_preferences | `alerts/schema.sql` |
| Voice agent | agent_memories | `voiceagent/schema.sql` |

All tables have **Row Level Security (RLS)** enabled. Users access only their own data.  
`service_role` keys (backend `.env` only) bypass RLS.

---

## Core App Tables

### `profiles`

One row per user. Created by `html/onboarding.html` on first login.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | References `auth.users.id` |
| `full_name` | text | Display name |
| `email` | text | Email address |
| `age` | int | Age in years |
| `income_range` | text | e.g. `10L-15L`, `5L-10L` |
| `life_stage` | text | `student` / `early_career` / `growth` / `peak` / `pre_retirement` / `retirement` |
| `city` | text | City name |
| `financial_dna` | text | DNA type from `html/dna.html` assessment |
| `mindset` | text | e.g. `disciplined_saver`, `growth_seeker` |
| `interests` | jsonb | Array of selected topics |
| `has_home_loan` | bool | |
| `has_car_loan` | bool | |
| `has_credit_card_debt` | bool | |
| `has_sip` | bool | |
| `has_ppf` | bool | |
| `has_nps` | bool | |
| `has_term_insurance` | bool | |
| `has_health_insurance` | bool | |
| `emergency_fund_months` | numeric | Months of expenses in liquid savings |
| `fire_number` | numeric | FIRE target corpus (INR) |
| `fire_progress` | numeric | Current progress toward FIRE number |
| `monthly_savings` | numeric | Average monthly savings |
| `net_worth` | numeric | Total net worth (INR) |
| `sip_amount` | numeric | Monthly SIP amount (INR) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**RLS policy:**
```sql
CREATE POLICY "Users can CRUD own profile"
ON profiles FOR ALL
USING (auth.uid() = id);
```

---

### `transactions`

Income and expense entries.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → `auth.users` | |
| `amount` | numeric | Always positive |
| `type` | text | `income` or `expense` |
| `category` | text | `food` / `rent` / `salary` / `sip` / `emi` etc. |
| `note` | text | Optional description |
| `date` | date | Transaction date |
| `created_at` | timestamptz | |

---

### `goals`

Savings and investment goals.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `name` | text | e.g. "Emergency Fund", "House Down Payment" |
| `target_amount` | numeric | Goal target (INR) |
| `current_amount` | numeric | Current saved amount |
| `target_date` | date | Deadline |
| `category` | text | `emergency` / `house` / `education` / `retirement` / `travel` / `other` |
| `created_at` | timestamptz | |

---

### `holdings`

Investment holdings (manually entered or CSV-imported from Zerodha).

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `symbol` | text | NSE ticker e.g. `RELIANCE` |
| `name` | text | Company name |
| `quantity` | numeric | Units held |
| `avg_price` | numeric | Average buy price (INR) |
| `current_price` | numeric | Last known price |
| `current_value` | numeric | `quantity × current_price` |
| `gain_loss` | numeric | Unrealised P&L |
| `gain_loss_pct` | numeric | Unrealised P&L % |
| `asset_type` | text | `equity` / `mf` / `etf` / `gold` / `fd` / `crypto` |
| `purchase_date` | date | For XIRR calculation |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

### `budgets`

Monthly budget targets per category.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `category` | text | Budget category |
| `amount` | numeric | Monthly budget (INR) |
| `month` | date | First day of the budget month |
| `created_at` | timestamptz | |

---

## Alert Engine Tables (managed by `alerts/schema.sql`)

### `alerts`

Triggered alert history.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `rule_id` | text | Alert rule identifier e.g. `sip_missed` |
| `title` | text | Short alert title |
| `message` | text | Full alert message |
| `priority` | text | `info` / `warning` / `critical` |
| `triggered_at` | timestamptz | When the rule fired |
| `read_at` | timestamptz | Null until user reads it |
| `dismissed_at` | timestamptz | Null until user dismisses |

### `push_subscriptions`

Web Push VAPID subscriptions.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `endpoint` | text | Push endpoint URL |
| `p256dh` | text | Encryption key |
| `auth` | text | Auth secret |
| `created_at` | timestamptz | |

### `alert_preferences`

Per-rule opt-in/out per user.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `rule_id` | text | Alert rule identifier |
| `enabled` | bool | Default: true |
| `updated_at` | timestamptz | |

---

## Voice Agent Table (managed by `voiceagent/schema.sql`)

### `agent_memories`

Long-term memory facts extracted from voice conversations.

| Column | Type | Description |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `fact` | text | Extracted fact e.g. "User has home loan of 45L at 8.5% rate" |
| `category` | text | `income` / `loan` / `goal` / `investment` / `family` / `behaviour` |
| `confidence` | numeric | 0.0–1.0 extraction confidence |
| `source_session` | text | Session ID when extracted |
| `created_at` | timestamptz | |
| `last_used_at` | timestamptz | When last injected into context |

---

## RLS Policies

All user-data tables use the same pattern:

```sql
-- Allow users to read/write only their own rows
CREATE POLICY "user_owns_row"
ON <table> FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Service role bypasses RLS (used by Python backends)
-- No policy needed — service role is superuser
```

---

## Migrations

To add a new column:

```sql
-- Run in Supabase SQL Editor
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS new_column_name data_type DEFAULT default_value;
```

**Never run `DROP TABLE` or `TRUNCATE` without a Supabase backup.**

---

## Environment Variables

| Variable | Used by | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | React budget app | Public (browser-safe) |
| `VITE_SUPABASE_ANON_KEY` | React budget app | Public (browser-safe) |
| `SUPABASE_URL` | All Python backends | |
| `SUPABASE_SERVICE_ROLE_KEY` | All Python backends | **Never in browser code** |

Browser pages use the `anon` key from `js/supabase-config.js`. The `anon` key has restricted access via RLS; the `service_role` key bypasses all RLS and must only exist in backend `.env` files.
