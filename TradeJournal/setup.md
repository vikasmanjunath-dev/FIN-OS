# TradeBook Pro — Cloud Sync Setup Guide

## What you need
- A free Supabase account (supabase.com)
- 5 minutes

---

## Step 1 — Create a Supabase Project

1. Go to **https://supabase.com** and sign up (free)
2. Click **"New project"**
3. Name it anything (e.g. `tradebook-pro`)
4. Set a database password (save it somewhere safe)
5. Choose the region closest to you → **Create project**

---

## Step 2 — Run the Setup SQL

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Paste the following SQL and click **"Run"**:

```sql
create table if not exists tb_vaults (
  vault_id  text primary key,
  created_at timestamptz default now()
);

create table if not exists tb_data (
  vault_id  text not null references tb_vaults(vault_id) on delete cascade,
  key       text not null,
  value     jsonb,
  updated_at timestamptz default now(),
  primary key (vault_id, key)
);

create index if not exists tb_data_vault on tb_data(vault_id);

alter table tb_vaults enable row level security;
alter table tb_data   enable row level security;

create policy "vault owner" on tb_vaults for all using (true) with check (true);
create policy "data owner"  on tb_data   for all using (true) with check (true);

alter publication supabase_realtime add table tb_data;
```

---

## Step 3 — Get Your API Credentials

1. In your project, click **"Project Settings"** → **"API"**
2. Copy two values:
   - **Project URL** — looks like `https://abcdefghijk.supabase.co`
   - **anon / public key** — a long JWT string starting with `eyJ...`

---

## Step 4 — Connect in the App

1. Open TradeBook Pro → **Settings** page → **Cloud Sync** section
2. Paste your **Project URL** and **Anon Key**
3. Click **Connect**
4. Enter your phone number as the sync password
5. Done! The sync indicator in Settings will turn green.

---

## How the Password System Works

| Action | What happens |
|--------|-------------|
| Enter phone number | Hashed with **PBKDF2-SHA256 (100,000 iterations)** in-browser — never sent in plaintext |
| Hash becomes vault ID | All data stored under that vault in Supabase |
| Same phone, different device | Same vault ID → same data → real-time sync |
| Different phone | Different hash → completely separate vault |
| Close browser | Session ends. Re-enter phone next time. |
| First login after upgrade | Automatically migrates data from legacy SHA-256 vault to PBKDF2 vault |

**Your phone number is never stored or transmitted.** Only its PBKDF2 hash is used as a database key. PBKDF2 with 100,000 iterations makes brute-force ~100,000× harder than plain SHA-256.

---

## Multi-Device Usage

1. Open the app on Device A → enter phone → start trading
2. Open the app on Device B → enter **same phone number** → automatically syncs all data
3. Log a trade on Device A → appears on Device B within ~1 second

---

## Data Stored Per Vault

- All trades (`tradebook_trades`)
- Settings (`tradebook_settings`)
- Trading rules, custom tags, challenges
- Mood journal, audit trail, snapshots
- Themes, XP badges

---

## Privacy

- Your phone number is never transmitted — only its PBKDF2 hash (100,000 iterations)
- Data is stored in **your own** Supabase project (you own it)
- You can delete your data anytime from the Supabase table editor
- Supabase free tier: 500MB storage, unlimited API calls — more than enough

---

## Troubleshooting

**"Connection error" when connecting**
→ Check that your Project URL starts with `https://` and ends with `.supabase.co`

**"Invalid API key" error**
→ Make sure you copied the **anon/public** key, not the service_role key

**Data not syncing between devices**
→ Make sure both devices use the exact same phone number (no spaces)

**"sync failed" toast appears**
→ Usually a temporary network issue — data is saved locally and will sync on reconnect

---

*TradeBook Pro Sync — built on Supabase (free PostgreSQL + Realtime)*
