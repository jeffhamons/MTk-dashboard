-- ============================================================
-- Attainment snapshot table — one row per (rep, sync)
-- New row per day; UI reads latest per rep_id.
-- History accumulates for Phase 2 sparklines.
-- Run in Supabase → SQL Editor → New query → Run
-- ============================================================

create table if not exists attainment_snapshot (
  id                bigint generated always as identity primary key,
  synced_at         timestamptz not null default now(),

  -- Rep identifier — matches REPS[].id in src/data-model.js
  rep_id            text not null,

  -- New Biz fields (null for CS reps)
  nb_mtd_won        numeric,    -- closed-won $ month to date
  nb_qtd_won        numeric,    -- closed-won $ quarter to date
  nb_ytd_won        numeric,    -- closed-won $ year to date
  nb_annual_target  numeric,    -- annual quota $

  -- CS fields (null for New Biz reps)
  ren_mtd_pct       numeric,    -- renewal attainment % MTD  (0–150+)
  ren_qtd_pct       numeric,    -- renewal attainment % QTD
  ren_ytd_pct       numeric,    -- renewal attainment % YTD
  exp_mtd_won       numeric,    -- expansion closed-won $ MTD
  exp_qtd_won       numeric,    -- expansion closed-won $ QTD
  exp_ytd_won       numeric,    -- expansion closed-won $ YTD
  exp_annual_target numeric     -- expansion annual target $
);

-- Index for "latest per rep" queries
create index if not exists attainment_snapshot_rep_synced_idx
  on attainment_snapshot (rep_id, synced_at desc);

-- ============================================================
-- RLS — all authenticated users can read; writes use service key
-- ============================================================
alter table attainment_snapshot enable row level security;

drop policy if exists "authenticated users can read attainment"
  on attainment_snapshot;

create policy "authenticated users can read attainment"
  on attainment_snapshot for select
  to authenticated
  using (true);
