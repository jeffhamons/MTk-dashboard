-- ============================================================
-- cs_deal_book_final — deal-level quarter-final archive (RFC-158 A7)
-- Run ONCE in Supabase → SQL Editor (project: MIndtools Dashboard
-- = tvdizqryowracmtjdskv) BEFORE the sync's deal-level archive step
-- first runs. Idempotent: CREATE TABLE IF NOT EXISTS + drop-then-create
-- policy.
--
-- Mirrors attainment_quarter_final (migration-attainment-quarter-final.sql)
-- but for DEAL LISTS instead of aggregates: one immutable-shaped row per
-- CS renewal/expansion deal that closed in a COMPLETED quarter, recomputed
-- nightly from the closed-deals ledger by
-- agents/sf_attainment_sync.py :: archive_deal_book_finals and UPSERTed
-- on (rep_id, fy, quarter, kind, account, close_date). The current
-- quarter stays live via the replace_table renewal_book / expansion_book
-- feeds; completed quarters become read-only detail here.
--
-- Naming decision: a single unified table with a `kind` column
-- ('renewal' | 'expansion') mirrors how attainment_quarter_final unifies
-- NB+CS with a `track` column — the codebase's archive tables are unified,
-- while feed tables are split by deal type.
--
-- No FKs to judgment tables (RFC-158 A4).
-- ============================================================

create table if not exists cs_deal_book_final (
  id           bigint generated always as identity primary key,
  rep_id       text not null,                       -- matches REPS[].id
  fy           int  not null,                       -- e.g. 2026 (fiscal == calendar)
  quarter      int  not null check (quarter between 1 and 4),
  kind         text not null check (kind in ('renewal', 'expansion')),

  account      text not null,
  amount       numeric not null,                    -- deal ARR / TCV
  close_date   date not null,
  product      text,                                -- nullable (decision-6 upstream)

  archived_at  timestamptz not null default now(),  -- last recompute
  unique (rep_id, fy, quarter, kind, account, close_date)
);

create index if not exists cdbf_rep_qtr_idx
  on cs_deal_book_final (rep_id, fy, quarter);
create index if not exists cdbf_kind_idx
  on cs_deal_book_final (kind);

-- ============================================================
-- RLS — team-shared read grain, matching attainment_quarter_final
-- in migration-attainment-quarter-final.sql. Writes: no policies — the
-- nightly sync writes via service_role (bypasses RLS); everyone else
-- fails closed.
-- ============================================================
alter table cs_deal_book_final enable row level security;

drop policy if exists "authenticated read cs_deal_book_final"
  on public.cs_deal_book_final;

create policy "authenticated read cs_deal_book_final"
  on public.cs_deal_book_final for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.reps r
               join public.users u2 on u2.auth_id = (select auth.uid())
               join public.reps r2 on r2.rep_id = u2.rep_id
               where r.rep_id = cs_deal_book_final.rep_id
                 and r.team_id = r2.team_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = cs_deal_book_final.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );
