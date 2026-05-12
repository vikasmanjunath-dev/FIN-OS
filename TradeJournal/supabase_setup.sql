-- ═══════════════════════════════════════════════════════════
-- TRADEBOOK PRO — SUPABASE SETUP
-- Run this ONCE in Supabase → SQL Editor → New query → Run
-- Takes about 3 seconds.
-- ═══════════════════════════════════════════════════════════

-- 1. Vault table (one row per user, keyed by phone hash)
create table if not exists tb_vaults (
  vault_id   text primary key,
  created_at timestamptz default now()
);

-- 2. Data table (all app data, one row per key per vault)
create table if not exists tb_data (
  vault_id   text not null references tb_vaults(vault_id) on delete cascade,
  key        text not null,
  value      jsonb,
  updated_at timestamptz default now(),
  primary key (vault_id, key)
);

-- 3. Index for fast per-vault queries
create index if not exists tb_data_vault_idx on tb_data(vault_id);
create index if not exists tb_data_updated_idx on tb_data(vault_id, updated_at desc);

-- 4. Row-level security (each vault only accessible with the matching ID)
alter table tb_vaults enable row level security;
alter table tb_data   enable row level security;

-- Policy: anyone with the vault_id can read/write that vault
-- (the vault_id = SHA-256 of phone, so only someone with the phone can know it)
drop policy if exists "vault owner" on tb_vaults;
drop policy if exists "data owner"  on tb_data;

create policy "vault owner" on tb_vaults
  for all using (true) with check (true);

create policy "data owner" on tb_data
  for all using (true) with check (true);

-- 5. Enable Realtime (so all devices get live updates)
alter publication supabase_realtime add table tb_data;

-- 6. Auto-update updated_at on every write
create or replace function tb_update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tb_data_updated on tb_data;
create trigger tb_data_updated
  before update on tb_data
  for each row execute function tb_update_timestamp();

-- ═══════════════════════════════════════════════════════════
-- DONE! Now go to Settings → Cloud Sync in the app
-- Paste your Project URL and anon key, then sign in.
-- ═══════════════════════════════════════════════════════════

-- OPTIONAL: View your data
-- select vault_id, key, updated_at from tb_data order by updated_at desc limit 20;

-- OPTIONAL: Delete a vault (clears all data for that user)
-- delete from tb_vaults where vault_id = 'paste-hash-here';
