-- ============================================================
-- Attainment quarter finals — historical Target Board backend
-- Run ONCE in Supabase → SQL Editor (project: MIndtools Dashboard
-- = tvdizqryowracmtjdskv) BEFORE the sync's archive step first runs.
-- Idempotent: CREATE TABLE IF NOT EXISTS + drop-then-create policies.
--
-- One row per (rep, fy, quarter) holding that COMPLETED quarter's final
-- numbers, recomputed nightly from the closed-deals ledger by
-- agents/sf_attainment_sync.py :: archive_quarter_finals and UPSERTed on
-- (rep_id, fy, quarter). The first run after this migration backfills
-- 2026 Q1 + Q2 from the ledger (close-date windowed — no Salesforce
-- round-trip, and no dependence on nightly snapshot history, which
-- misses deals that close on quarter-end day).
--
-- The Target Board's quarter switcher offers ONLY quarters present in
-- this table — a past quarter with no archived rows simply isn't
-- offered, never fabricated from the live snapshot.
-- ============================================================

create table if not exists attainment_quarter_final (
  rep_id       text not null,                       -- matches REPS[].id
  fy           int  not null,                       -- e.g. 2026 (fiscal == calendar)
  quarter      int  not null check (quarter between 1 and 4),
  track        text not null check (track in ('newbiz','cs')),

  -- New Biz (null for CS): closed-won $ in the quarter + quarter quota.
  -- TARGETS ARE PINNED at first archive write: the sync recomputes the $
  -- figures nightly (late ledger corrections propagate) but carries forward
  -- the stored nb_target/ren_target of existing rows, so a later
  -- sales_targets.yaml edit (e.g. next year's quota reset) never rewrites a
  -- closed quarter's denominator. Correcting a closed quarter's target is a
  -- deliberate manual UPDATE here, not a yaml edit.
  nb_won       numeric,
  nb_target    numeric,                             -- annual / 4 (even proration)

  -- CS (null for NB): renewed $ vs the quarter's UNEVEN target; expansion
  -- (upsell + cross-sell) is activity only. ren_target null = no commission
  -- opportunity that quarter (the client renders "—", never a fake 0%).
  ren_renewed  numeric,
  ren_target   numeric,
  exp_won      numeric,

  archived_at  timestamptz not null default now(),  -- last recompute
  primary key (rep_id, fy, quarter)
);

-- ============================================================
-- RLS — TEAM-SHARED READ grain, matching attainment_snapshot in
-- migration-team-rbac-rls.sql (RFC-151): this is the same headline
-- leaderboard data, one quarter older. Writes: no policies — the nightly
-- sync writes via service_role (bypasses RLS); everyone else fails closed.
-- auth.uid() wrapped in (select ...) → initplan, evaluated once.
-- ============================================================
alter table attainment_quarter_final enable row level security;

drop policy if exists "team reads attainment_quarter_final"
  on public.attainment_quarter_final;

create policy "team reads attainment_quarter_final"
  on public.attainment_quarter_final for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.reps r
               join public.users u2 on u2.auth_id = (select auth.uid())
               join public.reps r2 on r2.rep_id = u2.rep_id
               where r.rep_id = attainment_quarter_final.rep_id
                 and r.team_id = r2.team_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = attainment_quarter_final.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );
