-- ============================================================
-- RFC-163 — Team Briefs MVP
-- Target: Supabase project tvdizqryowracmtjdskv.
-- Requires: migration-team-rbac-schema.sql.
--
-- Security model:
--   * All writes are RPC-only. Authenticated users receive SELECT grants only.
--   * publish_team_brief validates the caller's full canonical scope and
--     materializes the active, seated rep audience in the same transaction.
--   * audience membership is immutable after publish.
--   * RLS reads are caller-as-audience-member OR current manager/admin scope.
--   * SECURITY DEFINER functions have an empty search_path and fully-qualified
--     object references. PUBLIC/anon execution is explicitly revoked.
--
-- MVP deliberately has no drafts, scheduled publishing, named-person
-- targeting, rich-text comments, or rep comment edit/delete.
-- ============================================================

-- ═══════════════════════ 1. Tables ═══════════════════════════

create table if not exists public.team_briefs (
  id                    uuid        primary key default gen_random_uuid(),
  title                 text        not null,
  body                  text        not null,
  brief_type            text        not null,
  audience_mode         text        not null,
  audience_region       text,
  audience_team_id      text,
  author_auth_id        uuid        not null,
  author_rep_id         text,
  author_email          text        not null,
  status                text        not null default 'published',
  publish_at            timestamptz not null default now(),
  expires_at            timestamptz,
  timezone              text        not null,
  display_rule          text        not null,
  display_days          integer,
  due_at                timestamptz,
  require_ack           boolean     not null default true,
  allow_comments        boolean     not null default true,
  auto_escalate         boolean     not null default false,
  archived_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint team_briefs_title_check check (
    title = btrim(title) and char_length(title) between 1 and 160
  ),
  constraint team_briefs_body_check check (
    body = btrim(body) and char_length(body) between 1 and 10000
  ),
  constraint team_briefs_author_email_check check (
    author_email = btrim(author_email) and char_length(author_email) between 3 and 320
  ),
  constraint team_briefs_type_check check (
    brief_type in ('morning_message', 'fyi', 'reminder', 'action_required')
  ),
  constraint team_briefs_status_check check (
    status in ('published', 'archived')
  ),
  constraint team_briefs_audience_mode_check check (
    audience_mode in ('sales_all', 'region', 'team', 'team_region')
  ),
  constraint team_briefs_audience_region_check check (
    audience_region is null or audience_region in ('US', 'EMEA', 'APAC')
  ),
  constraint team_briefs_audience_team_check check (
    audience_team_id is null or audience_team_id in ('newbiz', 'cs')
  ),
  constraint team_briefs_audience_shape_check check (
    (audience_mode = 'sales_all'   and audience_team_id is null     and audience_region is null)
    or
    (audience_mode = 'region'      and audience_team_id is null     and audience_region is not null)
    or
    (audience_mode = 'team'        and audience_team_id is not null and audience_region is null)
    or
    (audience_mode = 'team_region' and audience_team_id is not null and audience_region is not null)
  ),
  constraint team_briefs_timezone_check check (
    timezone in ('America/Chicago', 'Europe/London', 'Australia/Sydney')
  ),
  constraint team_briefs_regional_timezone_check check (
    audience_mode not in ('region', 'team_region')
    or timezone = case audience_region
      when 'US'   then 'America/Chicago'
      when 'EMEA' then 'Europe/London'
      when 'APAC' then 'Australia/Sydney'
    end
  ),
  constraint team_briefs_display_rule_check check (
    display_rule in (
      'today_only', 'for_days', 'until_acknowledged', 'until_date',
      'until_due_or_acknowledged', 'manual_clear'
    )
  ),
  constraint team_briefs_display_shape_check check (
    (display_rule = 'today_only' and display_days is null and expires_at is not null)
    or
    (display_rule = 'for_days' and display_days between 1 and 365 and expires_at is not null)
    or
    (display_rule = 'until_acknowledged' and display_days is null)
    or
    (display_rule = 'until_date' and display_days is null and expires_at is not null)
    or
    (display_rule = 'until_due_or_acknowledged' and display_days is null and due_at is not null)
    or
    (display_rule = 'manual_clear' and display_days is null)
  ),
  constraint team_briefs_expiry_check check (
    expires_at is null or expires_at > publish_at
  ),
  constraint team_briefs_escalation_check check (
    not auto_escalate or due_at is not null
  ),
  constraint team_briefs_archive_shape_check check (
    (status = 'published' and archived_at is null)
    or (status = 'archived' and archived_at is not null)
  ),
  constraint team_briefs_timestamps_check check (
    updated_at >= created_at
  )
);

create index if not exists team_briefs_lifecycle_idx
  on public.team_briefs (status, publish_at desc, expires_at, due_at);

create table if not exists public.team_brief_audience_members (
  brief_id   uuid        not null references public.team_briefs(id) on delete cascade,
  auth_id    uuid        not null,
  rep_id     text        not null,
  team_id    text        not null,
  region     text        not null,
  due_at     timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (brief_id, auth_id),
  constraint team_brief_audience_one_seat_per_rep unique (brief_id, rep_id),
  constraint team_brief_audience_team_check check (team_id in ('newbiz', 'cs')),
  constraint team_brief_audience_region_check check (region in ('US', 'EMEA', 'APAC'))
);

create index if not exists team_brief_audience_auth_idx
  on public.team_brief_audience_members (auth_id, brief_id);

create table if not exists public.team_brief_reads (
  brief_id uuid        not null,
  auth_id  uuid        not null,
  read_at  timestamptz not null default now(),
  primary key (brief_id, auth_id),
  constraint team_brief_reads_brief_fk
    foreign key (brief_id)
    references public.team_briefs (id)
    on delete cascade,
  constraint team_brief_reads_audience_fk
    foreign key (brief_id, auth_id)
    references public.team_brief_audience_members (brief_id, auth_id)
    on delete cascade
);

create index if not exists team_brief_reads_auth_idx
  on public.team_brief_reads (auth_id, brief_id);

create table if not exists public.team_brief_comments (
  id                 uuid        primary key default gen_random_uuid(),
  brief_id           uuid        not null references public.team_briefs(id) on delete cascade,
  auth_id            uuid        not null,
  rep_id             text,
  body               text        not null,
  created_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by_auth_id uuid,
  constraint team_brief_comments_body_check check (
    body = btrim(body) and char_length(body) between 1 and 2000
  ),
  constraint team_brief_comments_delete_shape_check check (
    (deleted_at is null and deleted_by_auth_id is null)
    or (deleted_at is not null and deleted_by_auth_id is not null)
  )
);

create index if not exists team_brief_comments_brief_created_idx
  on public.team_brief_comments (brief_id, created_at);

-- ═══════════════════════ 2. Scope/read helpers ═══════════════

-- Private helper. The role tie is inside this function so no caller can treat
-- a team_admins row as authority after users.role changes.
create or replace function public.team_brief_scope_covers(
  p_auth_id uuid,
  p_audience_mode text,
  p_audience_team_id text,
  p_audience_region text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_audience_mode
      when 'team_region' then exists (
        select 1
        from public.team_admins ta
        where ta.auth_id = p_auth_id
          and ta.team_id = p_audience_team_id
          and ta.region = p_audience_region
      )
      when 'team' then (
        select count(*) = 3
        from public.team_admins ta
        where ta.auth_id = p_auth_id
          and ta.team_id = p_audience_team_id
          and ta.region in ('US', 'EMEA', 'APAC')
      )
      when 'region' then (
        select count(*) = 2
        from public.team_admins ta
        where ta.auth_id = p_auth_id
          and ta.team_id in ('newbiz', 'cs')
          and ta.region = p_audience_region
      )
      when 'sales_all' then (
        select count(*) = 6
        from public.team_admins ta
        where ta.auth_id = p_auth_id
          and ta.team_id in ('newbiz', 'cs')
          and ta.region in ('US', 'EMEA', 'APAC')
      )
      else false
    end
    from public.users u
    where u.auth_id = p_auth_id
      and u.role = 'team_admin'
  ), false);
$$;

create or replace function public.current_user_is_team_brief_member(p_brief_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_brief_audience_members am
    where am.brief_id = p_brief_id
      and am.auth_id = (select auth.uid())
  );
$$;

create or replace function public.current_user_can_manage_team_brief(p_brief_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_briefs b
    join public.users u on u.auth_id = (select auth.uid())
    where b.id = p_brief_id
      and (
        u.role = 'manager'
        or (
          u.role = 'team_admin'
          and public.team_brief_scope_covers(
            u.auth_id, b.audience_mode, b.audience_team_id, b.audience_region
          )
        )
      )
  );
$$;

-- Private helper shared by acknowledgement and comment RPCs.
create or replace function public.team_brief_accepts_interaction(p_brief_id uuid)
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
      and b.publish_at <= pg_catalog.statement_timestamp()
      and (b.expires_at is null or b.expires_at > pg_catalog.statement_timestamp())
  );
$$;

-- ═══════════════════════ 3. Write RPCs ══════════════════════

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

  -- Frozen denominator: current active reps who have a dashboard identity and
  -- whose platform role is rep. Managers/team_admins never enter read counts.
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

  return v_brief_id;
end;
$$;

create or replace function public.acknowledge_team_brief(p_brief_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_read_at timestamptz;
begin
  if v_uid is null
     or not public.current_user_is_team_brief_member(p_brief_id)
     or not public.team_brief_accepts_interaction(p_brief_id)
  then
    raise exception 'brief is not available for acknowledgement'
      using errcode = '42501';
  end if;

  insert into public.team_brief_reads (brief_id, auth_id, read_at)
  values (p_brief_id, v_uid, pg_catalog.statement_timestamp())
  on conflict (brief_id, auth_id) do nothing;

  select r.read_at into v_read_at
  from public.team_brief_reads r
  where r.brief_id = p_brief_id and r.auth_id = v_uid;

  return v_read_at;
end;
$$;

create or replace function public.add_team_brief_comment(
  p_brief_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_rep_id     text;
  v_comment_id uuid;
  v_body       text := pg_catalog.btrim(p_body);
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select u.rep_id into v_rep_id
  from public.users u
  where u.auth_id = v_uid;

  if not found then
    raise exception 'dashboard membership required' using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_body) < 1 or pg_catalog.char_length(v_body) > 2000 then
    raise exception 'comment must contain 1 to 2000 characters'
      using errcode = '22023';
  end if;

  if not (
    public.current_user_is_team_brief_member(p_brief_id)
    or public.current_user_can_manage_team_brief(p_brief_id)
  ) then
    raise exception 'commenter is outside the brief audience/scope'
      using errcode = '42501';
  end if;

  if not public.team_brief_accepts_interaction(p_brief_id)
     or not exists (
       select 1 from public.team_briefs b
       where b.id = p_brief_id and b.allow_comments
     )
  then
    raise exception 'brief is not open for comments' using errcode = '42501';
  end if;

  insert into public.team_brief_comments (
    brief_id, auth_id, rep_id, body, created_at
  ) values (
    p_brief_id, v_uid, v_rep_id, v_body, pg_catalog.statement_timestamp()
  )
  returning id into v_comment_id;

  return v_comment_id;
end;
$$;

create or replace function public.archive_team_brief(p_brief_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_archived_at timestamptz;
begin
  if not public.current_user_can_manage_team_brief(p_brief_id) then
    raise exception 'manager scope does not cover brief' using errcode = '42501';
  end if;

  update public.team_briefs b
  set status = 'archived',
      archived_at = coalesce(b.archived_at, pg_catalog.statement_timestamp()),
      updated_at = case
        when b.status = 'archived' then b.updated_at
        else pg_catalog.statement_timestamp()
      end
  where b.id = p_brief_id
  returning b.archived_at into v_archived_at;

  if not found then
    raise exception 'brief not found' using errcode = 'P0002';
  end if;

  return v_archived_at;
end;
$$;

create or replace function public.soft_delete_team_brief_comment(p_comment_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_brief_id   uuid;
  v_deleted_at timestamptz;
begin
  select c.brief_id into v_brief_id
  from public.team_brief_comments c
  where c.id = p_comment_id;

  if v_brief_id is null then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;

  if not public.current_user_can_manage_team_brief(v_brief_id) then
    raise exception 'manager scope does not cover comment brief'
      using errcode = '42501';
  end if;

  update public.team_brief_comments c
  set deleted_at = coalesce(c.deleted_at, pg_catalog.statement_timestamp()),
      deleted_by_auth_id = coalesce(c.deleted_by_auth_id, v_uid)
  where c.id = p_comment_id
  returning c.deleted_at into v_deleted_at;

  return v_deleted_at;
end;
$$;

-- ═══════════════════════ 4. RLS and privileges ══════════════

alter table public.team_briefs                 enable row level security;
alter table public.team_brief_audience_members enable row level security;
alter table public.team_brief_reads             enable row level security;
alter table public.team_brief_comments          enable row level security;

drop policy if exists "audience or manager reads team briefs" on public.team_briefs;
create policy "audience or manager reads team briefs"
  on public.team_briefs for select to authenticated
  using (
    public.current_user_is_team_brief_member(id)
    or public.current_user_can_manage_team_brief(id)
  );

drop policy if exists "self or manager reads team brief audience" on public.team_brief_audience_members;
create policy "self or manager reads team brief audience"
  on public.team_brief_audience_members for select to authenticated
  using (
    auth_id = (select auth.uid())
    or public.current_user_can_manage_team_brief(brief_id)
  );

drop policy if exists "self or manager reads team brief reads" on public.team_brief_reads;
create policy "self or manager reads team brief reads"
  on public.team_brief_reads for select to authenticated
  using (
    auth_id = (select auth.uid())
    or public.current_user_can_manage_team_brief(brief_id)
  );

drop policy if exists "audience or manager reads team brief comments" on public.team_brief_comments;
create policy "audience or manager reads team brief comments"
  on public.team_brief_comments for select to authenticated
  using (
    public.current_user_can_manage_team_brief(brief_id)
    or (
      deleted_at is null
      and public.current_user_is_team_brief_member(brief_id)
    )
  );

-- Remove any default Supabase table privileges, then expose SELECT only.
revoke all on table
  public.team_briefs,
  public.team_brief_audience_members,
  public.team_brief_reads,
  public.team_brief_comments
from public, anon, authenticated;

grant select on table
  public.team_briefs,
  public.team_brief_audience_members,
  public.team_brief_reads,
  public.team_brief_comments
to authenticated;

-- Private functions accept arbitrary identity or bypass table RLS: never expose.
revoke all on function public.team_brief_scope_covers(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.team_brief_accepts_interaction(uuid)
  from public, anon, authenticated;

-- Caller-bound helpers are safe for policies/client diagnostics.
revoke all on function public.current_user_is_team_brief_member(uuid)
  from public, anon, authenticated;
revoke all on function public.current_user_can_manage_team_brief(uuid)
  from public, anon, authenticated;
grant execute on function public.current_user_is_team_brief_member(uuid)
  to authenticated;
grant execute on function public.current_user_can_manage_team_brief(uuid)
  to authenticated;

-- RPC-only mutation surface.
revoke all on function public.publish_team_brief(
  text, text, text, text, text, text, text, text, integer,
  timestamptz, timestamptz, boolean, boolean, boolean
) from public, anon, authenticated;
revoke all on function public.acknowledge_team_brief(uuid)
  from public, anon, authenticated;
revoke all on function public.add_team_brief_comment(uuid, text)
  from public, anon, authenticated;
revoke all on function public.archive_team_brief(uuid)
  from public, anon, authenticated;
revoke all on function public.soft_delete_team_brief_comment(uuid)
  from public, anon, authenticated;

grant execute on function public.publish_team_brief(
  text, text, text, text, text, text, text, text, integer,
  timestamptz, timestamptz, boolean, boolean, boolean
) to authenticated;
grant execute on function public.acknowledge_team_brief(uuid)
  to authenticated;
grant execute on function public.add_team_brief_comment(uuid, text)
  to authenticated;
grant execute on function public.archive_team_brief(uuid)
  to authenticated;
grant execute on function public.soft_delete_team_brief_comment(uuid)
  to authenticated;

-- ═══════════════════════ 5. Realtime ════════════════════════

-- Supabase's publication exists in the target project. Guard both publication
-- and membership so the migration remains safe to re-run.
do $$
declare
  v_table text;
begin
  if exists (
    select 1 from pg_catalog.pg_publication p
    where p.pubname = 'supabase_realtime'
  ) then
    foreach v_table in array array[
      'team_briefs',
      'team_brief_audience_members',
      'team_brief_reads',
      'team_brief_comments'
    ]
    loop
      if not exists (
        select 1
        from pg_catalog.pg_publication_tables pt
        where pt.pubname = 'supabase_realtime'
          and pt.schemaname = 'public'
          and pt.tablename = v_table
      ) then
        execute pg_catalog.format(
          'alter publication supabase_realtime add table public.%I',
          v_table
        );
      end if;
    end loop;
  end if;
end
$$;
