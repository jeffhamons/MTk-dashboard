-- ============================================================
-- expansion_book — CS expansion deal feed (RFC-158 Phase 2, OQ4)
-- Run ONCE in Supabase → SQL Editor (project: MIndtools Dashboard
-- = tvdizqryowracmtjdskv) BEFORE the nightly sync first writes.
-- Idempotent: CREATE TABLE IF NOT EXISTS + drop-then-create policy.
--
-- Mirrors renewal_book in migration-attainment-v2.sql: a sync-written
-- (replace_table) feed table carrying the current quarter's expansion
-- deals (Upsell + Expansion + folded unknown-type-on-CS-rep). Written
-- nightly by agents/sf_attainment_sync.py :: build_expansion_book +
-- replace_table('expansion_book', ...). Completed quarters are
-- archived in cs_deal_book_final (migration-deal-book-final.sql); the
-- current quarter stays live here and is full-replaced each night.
--
-- No FKs to judgment tables (RFC-158 A4): account-name cross-reference
-- is best-effort, display-only.
-- ============================================================

create table if not exists expansion_book (
  id          bigint generated always as identity primary key,
  rep_id      text not null,                       -- dwayne, meri, lara, ...
  account     text not null,
  amount      numeric not null,                    -- expansion ARR / TCV closed-won
  close_date  date not null,
  product     text,                                -- nullable (ledger carries no product yet; decision-6 upstream)
  synced_at   timestamptz not null default now()
);
create index if not exists eb_rep_date_idx on expansion_book (rep_id, close_date);

-- ============================================================
-- RLS — team-shared read grain, matching renewal_book /
-- closed_won_deals in migration-attainment-v2.sql. Writes use the
-- service key (bypasses RLS); no write policy needed.
-- ============================================================
alter table expansion_book enable row level security;

drop policy if exists "authenticated read expansion_book" on expansion_book;
create policy "authenticated read expansion_book"
  on expansion_book for select to authenticated using (true);
