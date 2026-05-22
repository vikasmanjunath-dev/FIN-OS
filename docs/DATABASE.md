# FIN-OS — Database Reference

> Supabase (Postgres) · Project: `oeapcyucnduhwpgxfknb`

---

## Overview

FIN-OS uses a single Supabase project for all persistent storage. Tables are split into three groups:

- **Core app tables** — profiles, transactions, goals, holdings, budgets (managed by the frontend)
- **Alert engine tables** — alerts, push_subscriptions, alert_preferences (managed by `alerts/schema.sql`)
- **Voice agent table** — agent_memories (managed by `voiceagent/schema.sql`)

All tables have Row Level Security (RLS) enabled. Users can only access their own data. Service-role keys (used in backend `.env` files) bypass RLS.

---

## Core App Tables

These tables are created via Supabase Dashboard or managed by the frontend. They extend `auth.users`.

### `profiles`

One row per user. Created on first login via the onboarding flow.

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` PK | References `auth.users.id` |
| `full_name` | `text` | Display name |
| `email` | `text` | Email address |
| `age` | `int` | Age in years (used by voice agent profile card) |
| `income_range` | `text` | e.g., `10L-15L`, `5L-10L` |
| `life_stage` | `text` | `student`, `early_career`, `growth`, `peak`, `pre_retirement`, `retirement` |
| `city` | `text` | City name |
| `financial_dna` | `text` | DNA type from `dna.html` assessment |
| `mindset` | `text` | e.g., `disciplined_saver`, `growth_seeker` |
| `interests` | `jsonb` | Array of selected topics |
| `has_home_loan` | `bool` | |
| `has_car_loan` | `bool` | |
| `has_credit_card_debt` | `bool` | |
| `has_sip` | `bool` | |
| `has_ppf` | `bool` | |
| `has_nps` | `bool` | |
| `has_term_insurance` | `bool` | |
| `has_health_insurance` | `bool` | |
| `emergency_fund_months` | `numeric` | Months of expenses in liquid savings |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

### `transactions`

Expense and income entries.

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK → `auth.users` | |
| `amount` | `numeric` | Always positive |
| `type` | `text` | `income` or `expense` |
| `category` | `text` | e.g., `food`, `rent`, `salary`, `sip` |
| `note` | `text` | Optional description |
| `date` | `date` | Transaction date |
| `created_at` | `timestamptz` | |

### `goals`

Savings and investment goals.

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | |
| `name` | `text` | e.g., "Emergency Fund", "House Down Payment" |
| `target_amount` | `numeric` | Goal target in INR |
| `current_amount` | `numeric` | Current saved amount |
| `target_date` | `date` | Goal deadline |
| `category` | `text` | `emergency`, `house`, `education`, `retirement`, `travel`, `other` |
| `created_at` | `timestamptz` | |

### `holdings`

Investment portfolio.

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | |
| `symbol` | `text` | e.g., `RELIANCE.NS`, `NIFTYBEES` |
| `asset_type` | `text` | `equity`, `mf`, `etf`, `crypto`, `gold`, `fd` |
| `quantity` | `numeric` | Units held |
| `avg_price` | `numeric` | Average buy price |
| `current_price` | `numeric` | Latest price |
| `updated_at` | `timestamptz` | |

### `budgets`

Monthly category budgets.

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | |
| `month` | `int` | 1–12 |
| `year` | `int` | e.g., 2026 |
| `category` | `text` | Category name |
| `limit_amount` | `numeric` | Budget cap for category |

---

## Alert Engine Tables

Run `alerts/schema.sql` in Supabase SQL Editor to create these.

### `alerts`

One row per generated alert.

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | |
| `rule_id` | `text` | e.g., `sip_missed`, `market_drop` |
| `title` | `text` | Short alert headline |
| `message` | `text` | Full alert message (1–2 sentences) |
| `priority` | `text` | `critical`, `warning`, `info`, `celebration` |
| `read` | `bool` | Default false |
| `action_url` | `text` | Optional deep-link URL |
| `metadata` | `jsonb` | Rule-specific extra data |
| `created_at` | `timestamptz` | |

### `push_subscriptions`

Web Push device registrations.

| Column | Type | Description |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK | |
| `endpoint` | `text` UNIQUE | Push endpoint URL |
| `p256dh` | `text` | ECDH public key |
| `auth_key` | `text` | Auth secret |
| `created_at` | `timestamptz` | |

### `alert_preferences`

Per-user rule on/off settings.

| Column | Type | Description |
|---|---|---|
| `user_id` | `uuid` | Composite PK |
| `rule_id` | `text` | Composite PK |
| `enabled` | `bool` | Default true |
| `channels` | `jsonb` | `{"in_app": true, "push": true}` |

---

## Voice Agent Table

Run `voiceagent/schema.sql` in Supabase SQL Editor to create this.

### `agent_memories`

One row per user — persistent voice agent memory.

| Column | Type | Description |
|---|---|---|
| `user_id` | `uuid` PK | References `auth.users.id` |
| `profile` | `jsonb` | Extracted facts: name, income, city, goals, debts, family |
| `summary` | `text` | LLM-generated session summary (~120 words) |
| `mem_items` | `jsonb` | Last 20 conversation turns (role + content) |
| `total_sessions` | `int` | Incremented on each session |
| `total_messages` | `int` | Cumulative message count |
| `first_seen` | `timestamptz` | First session timestamp |
| `last_seen` | `timestamptz` | Most recent session timestamp |
| `updated_at` | `timestamptz` | Auto-updated by trigger |

**Profile JSONB structure:**
```json
{
  "name": "Rahul",
  "income": "₹12L/yr",
  "income_num": 1200000,
  "city": "Bangalore",
  "life_stage": "growth",
  "goals": {
    "house": true,
    "fire": false,
    "business": false,
    "abroad": false
  },
  "debts": {
    "home_loan_emi": true,
    "car_loan": false,
    "credit_card_debt": false
  },
  "family": {
    "married": true,
    "has_kids": false,
    "single": false,
    "dependent_parents": true
  }
}
```

---

## RLS Policies

All tables have the same basic pattern:

```sql
-- Users read their own data
CREATE POLICY "user_read_own"
  ON <table> FOR SELECT
  USING (auth.uid() = user_id);

-- Users write their own data
CREATE POLICY "user_write_own"
  ON <table> FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users update their own data
CREATE POLICY "user_update_own"
  ON <table> FOR UPDATE
  USING (auth.uid() = user_id);
```

**Service role key** (`SUPABASE_SERVICE_KEY` in backend `.env`) bypasses all RLS policies. Use it in server-side Python only, never in browser code.

---

## Supabase Realtime

Two tables must have Realtime enabled for live features to work:

```
Supabase Dashboard → Database → Replication
```

Toggle ON:
- `alerts` — powers the alert bell real-time badge in `finos-alerts.js`
- `alert_preferences` — pushes preference changes to open browser tabs

---

## Running Migrations

1. Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/oeapcyucnduhwpgxfknb/sql/new)
2. Paste and run in order:
   ```
   1. alerts/schema.sql
   2. voiceagent/schema.sql
   ```

Both scripts are idempotent — they use `DROP TABLE IF EXISTS` / `CREATE OR REPLACE` so they can be re-run safely.

---

## Environment Variables

### Voice Agent (`voiceagent/.env`)
```
SUPABASE_URL=https://oeapcyucnduhwpgxfknb.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...   # service_role key — Settings → API
```

### Alert Engine (`alerts/.env`)
```
SUPABASE_URL=https://oeapcyucnduhwpgxfknb.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...   # service_role key
SUPABASE_ANON_KEY=eyJhbG...      # anon/public key — Settings → API
VAPID_PRIVATE_KEY=...
VAPID_PUBLIC_KEY=...
```

### Frontend (browser — `js/auth.js`, `js/finos-context.js`)
```javascript
const SUPABASE_URL  = "https://oeapcyucnduhwpgxfknb.supabase.co";
const SUPABASE_ANON = "eyJhbG...";   // anon/public key only — safe in browser
```

The anon key is safe in browser code — it is constrained by RLS policies. Never put the service_role key in any browser-visible file.
