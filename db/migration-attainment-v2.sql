-- ============================================================
-- Attainment V2 — Target Board + My Number backend
-- Run ONCE in Supabase → SQL Editor (project: MIndtools Dashboard
-- = tvdizqryowracmtjdskv) BEFORE the V2 sync writes / the V2
-- frontend deploys.
--
-- Adds quarterly-CS columns to attainment_snapshot and creates the
-- three detail tables the Target Board / My Number read directly.
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS.
--
-- Model note: CS renewal attainment is measured against the
-- QUARTER's UNEVEN target (cs_quarterly_targets), NOT annual/4.
-- See agents/sf_attainment_sync.py and the 2026 comp letters.
-- ============================================================

-- ── 1. attainment_snapshot: new V2 columns ──────────────────
-- New Biz explicit period targets (even today; column allows uneven later).
alter table attainment_snapshot add column if not exists nb_qtd_target  numeric;
alter table attainment_snapshot add column if not exists nb_mtd_target  numeric;

-- CS renewal vs the quarter's target ($ pair + the headline % is ren_qtd_pct).
alter table attainment_snapshot add column if not exists ren_qtd_target   numeric;
alter table attainment_snapshot add column if not exists ren_qtd_renewed  numeric;
-- CS MTD/YTD carry $ renewed as activity (no monthly/annual target → no %).
alter table attainment_snapshot add column if not exists ren_mtd_renewed  numeric;
alter table attainment_snapshot add column if not exists ren_ytd_renewed  numeric;

-- Expansion as activity % (null until an expansion target exists).
alter table attainment_snapshot add column if not exists exp_mtd_pct  numeric;
alter table attainment_snapshot add column if not exists exp_qtd_pct  numeric;
alter table attainment_snapshot add column if not exists exp_ytd_pct  numeric;

-- ── 2. cs_quarterly_targets — the real, uneven CS targets ────
-- Canonical source is config/sales_targets.yaml; the nightly sync UPSERTs
-- this table each run so the dashboard ramp strip can read the four quarters.
create table if not exists cs_quarterly_targets (
  rep_id   text    not null,                       -- matches REPS[].id (dwayne, meri)
  fy       int     not null,                        -- e.g. 2026
  quarter  int     not null check (quarter between 1 and 4),
  target   numeric not null,                        -- USD renewal target for that quarter
  primary key (rep_id, fy, quarter)
);

-- ── 3. closed_won_deals — New Business deal stack ───────────
create table if not exists closed_won_deals (
  id         bigint generated always as identity primary key,
  rep_id     text not null,                          -- cammy, brenda, farah
  account    text not null,
  amount     numeric not null,                       -- ARR / TCV closed-won
  close_date date not null,
  synced_at  timestamptz not null default now()
);
create index if not exists cwd_rep_date_idx on closed_won_deals (rep_id, close_date);

-- ── 4. renewal_book — CS renewal book (renewed/open/churn) ───
-- V2 ships RENEWED rows only (from the Closed-Won ledger). open/churn arrive
-- with a renewals-pipeline feed in a follow-on.
create table if not exists renewal_book (
  id            bigint generated always as identity primary key,
  rep_id        text not null,                       -- dwayne, meri
  account       text not null,
  arr           numeric not null,                    -- renewal ARR
  due_date      date not null,                       -- when it's up for renewal (sets the quarter)
  status        text not null check (status in ('renewed','open','churn')),
  renewed_date  date,                                -- when it actually closed (renewed only)
  synced_at     timestamptz not null default now()
);
create index if not exists rb_rep_due_idx on renewal_book (rep_id, due_date);

-- ── 5. RLS — team-visible board: any authenticated user can read.
-- Writes use the service key (bypasses RLS); no write policy needed.
alter table cs_quarterly_targets enable row level security;
alter table closed_won_deals     enable row level security;
alter table renewal_book         enable row level security;

drop policy if exists "authenticated read cs_quarterly_targets" on cs_quarterly_targets;
create policy "authenticated read cs_quarterly_targets"
  on cs_quarterly_targets for select to authenticated using (true);

drop policy if exists "authenticated read closed_won_deals" on closed_won_deals;
create policy "authenticated read closed_won_deals"
  on closed_won_deals for select to authenticated using (true);

drop policy if exists "authenticated read renewal_book" on renewal_book;
create policy "authenticated read renewal_book"
  on renewal_book for select to authenticated using (true);
