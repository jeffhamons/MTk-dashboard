-- ============================================================
-- Team Briefs · publish-time skip visibility
-- Apply by hand in the Supabase SQL editor. Idempotent:
-- `create table if not exists` plus `create or replace`, so a re-run after a
-- partial apply is safe.
--
-- Nothing in this file reaches Supabase by being committed. See README
-- "Schema and Supabase authority".
--
-- ── Why ─────────────────────────────────────────────────────
-- `publish_team_brief` expands the audience with
--   `where u.role = 'rep' and u.auth_id is not null and r.active`
-- and then raises only if the result is empty ENTIRELY:
--   `if v_audience_size = 0 then raise exception 'audience has no active seated reps'`
--
-- A PARTIAL miss returns a brief id and a green result. Nobody is told, at
-- either end: the manager sees a successful publish, and the unreached rep
-- sees "You're caught up on Team Briefs.", which is what a quiet week looks
-- like too. This file makes that visible at the moment it happens.
--
-- ── What counts as a miss (read this before widening it) ────
-- Only reps who HAVE a dashboard account and were skipped anyway:
--   * an account whose role is not 'rep'
--   * an invited account that has never completed a sign-in (auth_id null)
--
-- A rep with NO `public.users` row is deliberately not recorded. That is
-- indistinguishable from "not a dashboard user", and it is the normal state
-- for people on the roster who do not use the dashboard — every CS rep
-- outside the US, as of 2026-07-28, and that is expected rather than a gap.
-- Recording them would fire this warning on every single publish and train
-- the reader to ignore it, which is exactly the failure mode this exists to
-- prevent. Same reasoning as inactive reps below.
--
-- If someone later wants the absent-account case surfaced too, the honest way
-- is an explicit roster flag for "should receive briefs" — not inferring
-- intent from a missing row.
-- ============================================================

-- ---- The record --------------------------------------------
--
-- One row per rep that publish expansion targeted and dropped. This is an
-- audit record of reality, so it deliberately carries NO check constraints on
-- team_id or region: a drifted live roster (issue #4369, the unapplied upsert
-- at db/migration-team-rbac-rls.sql:619) may hold a 'ZA' region that the
-- audience table's own constraint would reject. Refusing to record bad data is
-- how the bad data stays invisible.

create table if not exists public.team_brief_audience_skips (
  brief_id   uuid        not null references public.team_briefs(id) on delete cascade,
  rep_id     text        not null,
  name       text        not null,
  team_id    text        not null,
  region     text        not null,
  reason     text        not null,
  created_at timestamptz not null default now(),
  primary key (brief_id, rep_id)
);

create index if not exists team_brief_audience_skips_rep_idx
  on public.team_brief_audience_skips (rep_id, brief_id);

-- ---- publish_team_brief, with the skip recorded -------------
--
-- Signature and return type are unchanged, so this is a `create or replace`
-- that preserves existing grants and needs no change to how the client calls
-- it. The composer reads the skip rows back by brief id after a successful
-- publish. Everything above the marked block is byte-identical to
-- db/migration-team-briefs.sql.
--
-- Scope of what gets recorded: active reps that MATCH the audience target,
-- HOLD a dashboard account, and were skipped anyway. That is the surprising
-- case — a rep the manager reasonably believes was reached.
--
-- Three classes are deliberately NOT recorded:
--   * Reps with no `public.users` row — see the header. Expected, not a gap.
--   * Inactive reps — an intended exclusion documented in RFC-163; recording
--     them would bury the signal under brenda and stuart on every publish.
--   * A rep who holds an account but has no `public.reps` row at all: with no
--     roster row there is no team or region to test the audience target
--     against, so there is no way to know the brief was aimed at them.
--     Query 1 of db/audit-team-briefs-reachability.sql covers that case.

create or replace function public.publish_team_brief(
  p_title text,
  p_body text,
  p_brief_type text,
  p_audience_mode text,
  p_timezone text,
  p_audience_team_id text default null,
  p_audience_region text default null,
  p_display_rule text default 'manual_clear',
  p_display_days integer default null,
  p_expires_at timestamptz default null,
  p_due_at timestamptz default null,
  p_require_ack boolean default true,
  p_allow_comments boolean default true,
  p_auto_escalate boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_role         text;
  v_rep_id       text;
  v_email        text;
  v_brief_id     uuid;
  v_publish_at   timestamptz := pg_catalog.statement_timestamp();
  v_expires_at   timestamptz;
  v_audience_size integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select u.role, u.rep_id, u.email
    into v_role, v_rep_id, v_email
  from public.users u
  where u.auth_id = v_uid
  for share;

  if v_role is null then
    raise exception 'dashboard membership required' using errcode = '42501';
  end if;

  if v_role <> 'manager' then
    -- Hold the caller's current scope rows through commit so a concurrent
    -- provisioning delete cannot race the authorization check and publish.
    perform 1
    from public.team_admins ta
    where ta.auth_id = v_uid
    for share;

    if not public.team_brief_scope_covers(
      v_uid, p_audience_mode, p_audience_team_id, p_audience_region
    ) then
      raise exception 'publisher scope does not fully cover audience'
        using errcode = '42501';
    end if;
  end if;

  -- Convert visibility presets into concrete instants in the selected
  -- operational timezone. Region/team-region timezone correctness is also
  -- enforced by the table constraint.
  case p_display_rule
    when 'today_only' then
      v_expires_at :=
        (
          pg_catalog.date_trunc('day', v_publish_at at time zone p_timezone)
          + pg_catalog.make_interval(days => 1)
        ) at time zone p_timezone;
    when 'for_days' then
      if p_display_days is null or p_display_days < 1 or p_display_days > 365 then
        raise exception 'for_days requires display_days between 1 and 365'
          using errcode = '22023';
      end if;
      v_expires_at :=
        (
          pg_catalog.date_trunc('day', v_publish_at at time zone p_timezone)
          + pg_catalog.make_interval(days => p_display_days)
        ) at time zone p_timezone;
    when 'until_date' then
      if p_expires_at is null then
        raise exception 'until_date requires expires_at' using errcode = '22023';
      end if;
      v_expires_at := p_expires_at;
    when 'until_due_or_acknowledged' then
      if p_due_at is null then
        raise exception 'until_due_or_acknowledged requires due_at'
          using errcode = '22023';
      end if;
      v_expires_at := coalesce(p_expires_at, p_due_at);
    when 'until_acknowledged', 'manual_clear' then
      v_expires_at := p_expires_at;
    else
      raise exception 'invalid display_rule: %', p_display_rule using errcode = '22023';
  end case;

  insert into public.team_briefs (
    title, body, brief_type,
    audience_mode, audience_team_id, audience_region,
    author_auth_id, author_rep_id, author_email,
    status, publish_at, expires_at, timezone,
    display_rule, display_days, due_at,
    require_ack, allow_comments, auto_escalate,
    created_at, updated_at
  ) values (
    pg_catalog.btrim(p_title), pg_catalog.btrim(p_body), p_brief_type,
    p_audience_mode, p_audience_team_id, p_audience_region,
    v_uid, v_rep_id, pg_catalog.btrim(v_email),
    'published', v_publish_at, v_expires_at, p_timezone,
    p_display_rule,
    case when p_display_rule = 'for_days' then p_display_days else null end,
    p_due_at,
    p_require_ack, p_allow_comments, p_auto_escalate,
    v_publish_at, v_publish_at
  )
  returning id into v_brief_id;

  -- Frozen access rows: every working auth identity for each current active
  -- seated rep. Reporting counts distinct rep_id values, so intentional
  -- aliases do not inflate the denominator. Managers/team_admins never enter.
  insert into public.team_brief_audience_members (
    brief_id, auth_id, rep_id, team_id, region, due_at, expires_at, created_at
  )
  select
    v_brief_id, u.auth_id, u.rep_id, r.team_id, r.region,
    p_due_at, v_expires_at, v_publish_at
  from public.users u
  join public.reps r on r.rep_id = u.rep_id
  where u.role = 'rep'
    and u.auth_id is not null
    and r.active
    and (
      p_audience_mode = 'sales_all'
      or (p_audience_mode = 'region' and r.region = p_audience_region)
      or (p_audience_mode = 'team' and r.team_id = p_audience_team_id)
      or (
        p_audience_mode = 'team_region'
        and r.team_id = p_audience_team_id
        and r.region = p_audience_region
      )
    );

  get diagnostics v_audience_size = row_count;
  if v_audience_size = 0 then
    raise exception 'audience has no active seated reps' using errcode = '22023';
  end if;

  -- ══ ADDED: the same target set, restricted to active reps the expansion
  -- above could not seat. Written inside the publish transaction, so a skip is
  -- recorded exactly when it happens or not at all.
  insert into public.team_brief_audience_skips (
    brief_id, rep_id, name, team_id, region, reason, created_at
  )
  select
    v_brief_id, r.rep_id, r.name, r.team_id, r.region,
    case
      when u.auth_id is null then 'invited but never signed in'
      -- coalesce because users_role_check is `role = any(array[...])`, which a
      -- NULL role passes; a bare concat would yield NULL and trip the
      -- `reason text not null` on this table.
      else 'account role is ' || coalesce(u.role, 'unset') || ', not rep'
    end,
    v_publish_at
  from public.reps r
  -- INNER join, not LEFT: a rep with no account at all is not recorded. See
  -- the header — that is the normal state for roster members who do not use
  -- the dashboard, and warning about it every publish would make the warning
  -- worthless.
  join public.users u on u.rep_id = r.rep_id
  where r.active
    and (
      p_audience_mode = 'sales_all'
      or (p_audience_mode = 'region' and r.region = p_audience_region)
      or (p_audience_mode = 'team' and r.team_id = p_audience_team_id)
      or (
        p_audience_mode = 'team_region'
        and r.team_id = p_audience_team_id
        and r.region = p_audience_region
      )
    )
    and not exists (
      select 1 from public.team_brief_audience_members am
      where am.brief_id = v_brief_id and am.rep_id = r.rep_id
    )
  -- A rep with several unusable identities yields several candidate rows; the
  -- conflict clause keeps one. Which reason survives is arbitrary in that case,
  -- and every one of them is true.
  on conflict (brief_id, rep_id) do nothing;

  return v_brief_id;
end;
$$;

-- ---- RLS and privileges -------------------------------------
--
-- A skip row names a rep who did not receive a brief. That is roster
-- information about someone else, so it is manager-scoped only: reps read
-- nothing from this table, not even rows naming themselves. Mutation stays
-- RPC-only like every other Team Briefs table.

alter table public.team_brief_audience_skips enable row level security;

drop policy if exists "manager reads team brief audience skips"
  on public.team_brief_audience_skips;
create policy "manager reads team brief audience skips"
  on public.team_brief_audience_skips for select to authenticated
  using (public.current_user_can_manage_team_brief(brief_id));

revoke all on table public.team_brief_audience_skips
  from public, anon, authenticated;
grant select on table public.team_brief_audience_skips
  to authenticated;

-- `create or replace` preserves the existing grants on publish_team_brief.
-- Re-issued anyway so this file is correct when applied on its own.
revoke all on function public.publish_team_brief(
  text, text, text, text, text, text, text, text, integer,
  timestamptz, timestamptz, boolean, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.publish_team_brief(
  text, text, text, text, text, text, text, text, integer,
  timestamptz, timestamptz, boolean, boolean, boolean
) to authenticated;
