-- ============================================================
-- RFC-164 · Team Briefs rep surface redesign
-- Migrations A + B. Apply by hand in the Supabase SQL editor.
-- Idempotent: safe to re-run.
--
-- Source: docs/RFC-164-team-briefs-rep-surface-redesign.md, Appendix A.
-- Function bodies are verbatim. The only additions are the four
-- `revoke all ... from public, anon, authenticated` statements in the
-- grants section — see the note there.
--
-- Nothing in this file reaches Supabase by being committed. Phases 5 and 6
-- of RFC-164 are blocked until Jeff confirms it has been applied.
-- ============================================================

-- ---- Migration A: done state -------------------------------

alter table public.team_brief_reads
  add column if not exists done_at timestamptz;

-- ---- Migration B: swept receipts + catch-up predicate -------

alter table public.team_brief_reads
  add column if not exists swept boolean not null default false;

-- Expiry-agnostic sibling of team_brief_accepts_interaction.
-- The catch-up sweep and late "mark done" both act on briefs whose
-- expires_at has already passed; the existing predicate refuses them.
create or replace function public.team_brief_accepts_catchup(p_brief_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_briefs b
    where b.id = p_brief_id
      and b.status = 'published'
      and b.publish_at <= now()
      and b.archived_at is null
  );
$$;

-- ---- Migration A: complete_team_brief ----------------------

create or replace function public.complete_team_brief(p_brief_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not public.team_brief_accepts_catchup(p_brief_id) then
    raise exception 'brief is not available' using errcode = '42501';
  end if;

  -- Membership is derived server-side; the caller cannot name a rep.
  insert into public.team_brief_reads (brief_id, auth_id, rep_id, read_at, done_at)
  select am.brief_id, am.auth_id, am.rep_id, now(), now()
  from public.team_brief_audience_members am
  where am.brief_id = p_brief_id
    and am.auth_id = v_uid
  on conflict (brief_id, rep_id)
    do update set done_at = coalesce(public.team_brief_reads.done_at, now());
end;
$$;

-- ---- Migration B: bulk catch-up acknowledgement -------------

create or replace function public.acknowledge_team_briefs_bulk(p_brief_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.team_brief_reads (brief_id, auth_id, rep_id, read_at, swept)
  select am.brief_id, am.auth_id, am.rep_id, now(), true
  from public.team_brief_audience_members am
  where am.auth_id = v_uid
    and am.brief_id = any(p_brief_ids)
    and public.team_brief_accepts_catchup(am.brief_id)
  on conflict (brief_id, rep_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---- Grants ------------------------------------------------
-- Mutation stays RPC-only; the tables remain select-only to authenticated.
--
-- ADDED beyond RFC-164 Appendix A: Postgres grants EXECUTE to PUBLIC on every
-- newly created function. Appendix A lists only the grants, so on a first
-- apply `anon` would also hold EXECUTE on all three. Every RPC in
-- db/migration-team-briefs.sql revokes first for exactly this reason; these
-- four statements restore that convention and change nothing else about the
-- grants Appendix A specifies.

revoke all on function public.team_brief_accepts_catchup(uuid)
  from public, anon, authenticated;
revoke all on function public.complete_team_brief(uuid)
  from public, anon, authenticated;
revoke all on function public.acknowledge_team_briefs_bulk(uuid[])
  from public, anon, authenticated;

-- NOTE for review: the sibling predicate team_brief_accepts_interaction(uuid)
-- is revoked from `authenticated` and never re-granted — the existing file
-- treats only *caller-bound* helpers (current_user_is_team_brief_member,
-- current_user_can_manage_team_brief) as safe to expose. accepts_catchup has
-- the same not-caller-bound shape, and both callers below are security
-- definer, so they do not need the grant. Appendix A grants it anyway; it is
-- reproduced here unchanged. Dropping this one line costs nothing and matches
-- the existing posture — Jeff's call before applying.
grant execute on function public.team_brief_accepts_catchup(uuid)      to authenticated;
grant execute on function public.complete_team_brief(uuid)             to authenticated;
grant execute on function public.acknowledge_team_briefs_bulk(uuid[])  to authenticated;

-- ---- Verify (RFC-164 §6 Phase 1 exit criteria) --------------
--   select column_name from information_schema.columns
--   where table_name = 'team_brief_reads';
-- Expect done_at and swept alongside brief_id, rep_id, auth_id, read_at.
