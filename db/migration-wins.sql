-- ============================================================
-- Weekly Wins table — one row per (rep, week)
-- Stores all four form sections as JSONB columns.
-- Run in Supabase → SQL Editor → New query → Run
-- ============================================================

create table if not exists wins (
  id          bigserial primary key,
  rep_id      text not null,          -- 'cammy', 'farah', etc.
  week_index  int  not null,          -- numeric part of 'w1'..'w10'
  worked_on   jsonb not null default '[]'::jsonb,  -- [{task, why}]
  invisible   jsonb not null default '[]'::jsonb,  -- [{task, context}]
  big_win     jsonb not null default '{}'::jsonb,  -- {win, why}
  hype        jsonb not null default '[]'::jsonb,  -- [{source, quote}]
  updated_at  timestamptz not null default now(),
  updated_by  text,                   -- email of last editor
  unique (rep_id, week_index)
);

create index if not exists wins_rep_week_idx on wins (rep_id, week_index);

-- ── Row Level Security ────────────────────────────────────────────────────
-- SUPERSEDED (issue #11). This file originally created four "anyone can …"
-- policies with `using (true)` and no `TO` clause — i.e. PUBLIC-role,
-- unconditional read AND write on every rep's wins. They are intentionally
-- NOT created any more.
--
-- Why they are gone rather than merely dropped elsewhere: permissive RLS
-- policies OR together, so ONE surviving `using (true)` policy silently
-- defeats every scoped policy on the table. Leaving the create statements
-- here meant a partial or out-of-order deploy — re-running this file after
-- db/migration-team-rbac-rls.sql — would resurrect the leak with no error
-- and no visible symptom. db/migration-team-rbac-rls.sql also carries an
-- explicit `drop policy if exists` for each of these names (belt and
-- braces); this block is the braces.
--
-- Running this file alone now leaves public.wins with RLS enabled and NO
-- policies, which fails CLOSED (nobody but service_role can read or write).
-- That is the correct intermediate state. The real policies —
-- "team reads wins" plus the owner/manager/covering-admin write trio — are
-- created by db/migration-team-rbac-rls.sql, which must be applied after
-- db/migration-team-rbac-schema.sql. See README "Schema and Supabase
-- authority": applying these files to Supabase is a manual step.
alter table wins enable row level security;

-- ── Realtime ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table wins;
