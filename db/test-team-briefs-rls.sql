-- ============================================================
-- RFC-163 TEAM BRIEFS — RLS/RPC VERIFICATION MATRIX
-- Run after db/migration-team-briefs.sql in Supabase SQL Editor.
--
-- The entire matrix is transactional and ends in ROLLBACK. It temporarily
-- normalizes Lara to a scoped team_admin and may move one rep in the registry
-- to prove frozen audience snapshots; none of those changes persist.
--
-- Live identities used (same established personas as RFC-151):
--   Jeff   manager             jeff.hamons@mindtools-kineo.com
--   Lara   scoped team_admin   lkidd@mindtools.com
--   Dwayne rep / CS US         dwayne.haskell@mindtools-kineo.com
-- ============================================================

begin;

create temp table _tb_test_state (
  key text primary key,
  id  uuid not null
);

-- ═══════════════════════ 1. Catalog/static security ═════════

do $$
declare
  v_expected text[] := array[
    'audience or manager reads team brief comments',
    'audience or manager reads team briefs',
    'self or manager reads team brief audience',
    'self or manager reads team brief reads'
  ];
  v_tables text[] := array[
    'team_briefs',
    'team_brief_audience_members',
    'team_brief_reads',
    'team_brief_comments'
  ];
  v_actual text[];
  v_missing text[];
  v_unexpected text[];
  v_unsecured text[];
begin
  select coalesce(array_agg(p.policyname order by p.policyname), array[]::text[])
    into v_actual
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = any (v_tables);

  select coalesce(array_agg(e order by e), array[]::text[])
    into v_missing
  from unnest(v_expected) e
  where not (e = any (v_actual));

  select coalesce(array_agg(a order by a), array[]::text[])
    into v_unexpected
  from unnest(v_actual) a
  where not (a = any (v_expected));

  if cardinality(v_missing) > 0 or cardinality(v_unexpected) > 0 then
    raise exception 'FAIL [policy inventory] missing=% unexpected=%',
      v_missing, v_unexpected;
  end if;

  select coalesce(array_agg(t order by t), array[]::text[])
    into v_unsecured
  from unnest(v_tables) t
  where not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = t
      and c.relkind = 'r'
      and c.relrowsecurity
  );

  if cardinality(v_unsecured) > 0 then
    raise exception 'FAIL [rowsecurity] missing/disabled=%', v_unsecured;
  end if;

  raise notice 'PASS [1] exact SELECT-only policy inventory; RLS on all four tables';
end
$$;

do $$
declare
  v_names text[] := array[
    'team_brief_scope_covers',
    'current_user_is_team_brief_member',
    'current_user_can_manage_team_brief',
    'team_brief_accepts_interaction',
    'publish_team_brief',
    'acknowledge_team_brief',
    'add_team_brief_comment',
    'archive_team_brief',
    'soft_delete_team_brief_comment'
  ];
  v_bad text[];
begin
  select coalesce(array_agg(p.proname order by p.proname), array[]::text[])
    into v_bad
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = any (v_names)
    and (
      not p.prosecdef
      or not exists (
        select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
        where cfg = 'search_path=""'
      )
      or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    );

  if cardinality(v_bad) > 0 then
    raise exception 'FAIL [function hardening] functions lacking SECURITY DEFINER, empty search_path, or anon lockout: %',
      v_bad;
  end if;

  if pg_catalog.has_function_privilege(
       'authenticated',
       'public.team_brief_scope_covers(uuid,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.team_brief_accepts_interaction(uuid)',
       'EXECUTE'
     )
  then
    raise exception 'FAIL [private helper ACL] authenticated can execute a private helper';
  end if;

  if not pg_catalog.has_function_privilege(
       'authenticated',
       'public.publish_team_brief(text,text,text,text,text,text,text,text,integer,timestamp with time zone,timestamp with time zone,boolean,boolean,boolean)',
       'EXECUTE'
     )
  then
    raise exception 'FAIL [RPC ACL] authenticated cannot execute publish_team_brief';
  end if;

  raise notice 'PASS [2] definer/search_path/function ACL hardening';
end
$$;

do $$
declare
  v_table text;
  v_direct_brief_fks integer;
begin
  foreach v_table in array array[
    'team_briefs',
    'team_brief_audience_members',
    'team_brief_reads',
    'team_brief_comments'
  ]
  loop
    if not pg_catalog.has_table_privilege(
      'authenticated', pg_catalog.format('public.%I', v_table), 'SELECT'
    ) then
      raise exception 'FAIL [table ACL] authenticated lacks SELECT on %', v_table;
    end if;
    if pg_catalog.has_table_privilege(
      'authenticated', pg_catalog.format('public.%I', v_table),
      'INSERT,UPDATE,DELETE'
    ) then
      raise exception 'FAIL [table ACL] authenticated has direct DML on %', v_table;
    end if;
  end loop;

  -- PostgREST needs one unambiguous direct team_briefs -> team_brief_reads
  -- relationship for the nested reads embed. The composite FK to audience
  -- remains separate and continues to enforce acknowledgement eligibility.
  select count(*) into v_direct_brief_fks
  from pg_catalog.pg_constraint c
  where c.contype = 'f'
    and c.conrelid = 'public.team_brief_reads'::regclass
    and c.confrelid = 'public.team_briefs'::regclass;

  if v_direct_brief_fks <> 1 then
    raise exception 'FAIL [reads embed FK] got % direct reads->briefs FKs, want exactly 1',
      v_direct_brief_fks;
  end if;

  raise notice 'PASS [3] SELECT-only table ACLs; unambiguous direct reads embed FK';
end
$$;

-- ═══════════════════════ 2. Persona setup ═══════════════════

do $$
declare
  v_jeff uuid;
  v_lara uuid;
  v_dwayne uuid;
begin
  select u.auth_id into strict v_jeff
  from public.users u
  where u.email = 'jeff.hamons@mindtools-kineo.com'
    and u.role = 'manager';

  select u.auth_id into strict v_lara
  from public.users u
  where u.email = 'lkidd@mindtools.com';

  select u.auth_id into strict v_dwayne
  from public.users u
  where u.email = 'dwayne.haskell@mindtools-kineo.com'
    and u.role = 'rep'
    and u.rep_id = 'dwayne';

  update public.users set role = 'team_admin' where auth_id = v_lara;
  insert into public.team_admins (auth_id, team_id, region)
  values (v_lara, 'cs', 'US')
  on conflict (auth_id, team_id, region) do nothing;
  -- Make whole-CS denial deterministic even after the future CS APAC setup.
  delete from public.team_admins
  where auth_id = v_lara and team_id = 'cs' and region = 'APAC';

  insert into _tb_test_state (key, id) values
    ('jeff', v_jeff),
    ('lara', v_lara),
    ('dwayne', v_dwayne);

  raise notice 'PASS [4] required live personas resolved; Lara normalized in-transaction';
end
$$;

-- ═══════════════════════ 3. Scoped publisher matrix ═════════

do $$
declare
  v_lara uuid := (select id from _tb_test_state where key = 'lara');
  v_brief uuid;
  v_team_denied boolean := false;
  v_sibling_denied boolean := false;
  v_region_denied boolean := false;
  v_all_denied boolean := false;
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_lara, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);

  v_brief := public.publish_team_brief(
    p_title => 'RFC163 scoped CS US',
    p_body => 'Scoped publisher success probe.',
    p_brief_type => 'fyi',
    p_audience_mode => 'team_region',
    p_timezone => 'America/Chicago',
    p_audience_team_id => 'cs',
    p_audience_region => 'US',
    p_display_rule => 'manual_clear'
  );

  begin
    perform public.publish_team_brief(
      p_title => 'RFC163 forbidden whole CS',
      p_body => 'Must fail without all three CS region scopes.',
      p_brief_type => 'fyi',
      p_audience_mode => 'team',
      p_timezone => 'America/Chicago',
      p_audience_team_id => 'cs',
      p_display_rule => 'manual_clear'
    );
  exception when insufficient_privilege then
    v_team_denied := true;
  end;

  begin
    perform public.publish_team_brief(
      p_title => 'RFC163 forbidden sibling region',
      p_body => 'Must fail outside the exact CS US scope.',
      p_brief_type => 'fyi',
      p_audience_mode => 'team_region',
      p_timezone => 'Australia/Sydney',
      p_audience_team_id => 'cs',
      p_audience_region => 'APAC',
      p_display_rule => 'manual_clear'
    );
  exception when insufficient_privilege then
    v_sibling_denied := true;
  end;

  begin
    perform public.publish_team_brief(
      p_title => 'RFC163 forbidden bare region',
      p_body => 'Bare region requires both teams.',
      p_brief_type => 'fyi',
      p_audience_mode => 'region',
      p_timezone => 'America/Chicago',
      p_audience_region => 'US',
      p_display_rule => 'manual_clear'
    );
  exception when insufficient_privilege then
    v_region_denied := true;
  end;

  begin
    perform public.publish_team_brief(
      p_title => 'RFC163 forbidden all sales',
      p_body => 'All Sales requires all six canonical scopes.',
      p_brief_type => 'fyi',
      p_audience_mode => 'sales_all',
      p_timezone => 'America/Chicago',
      p_display_rule => 'manual_clear'
    );
  exception when insufficient_privilege then
    v_all_denied := true;
  end;

  execute 'reset role';

  if not (v_team_denied and v_sibling_denied and v_region_denied and v_all_denied) then
    raise exception 'FAIL [scoped publisher] denials team=% sibling=% region=% all=%',
      v_team_denied, v_sibling_denied, v_region_denied, v_all_denied;
  end if;

  insert into _tb_test_state (key, id) values ('lara_brief', v_brief);
  raise notice 'PASS [5] exact team_region allowed; team/sibling/region/all denied';
exception when others then
  execute 'reset role';
  raise;
end
$$;

do $$
declare
  v_lara uuid := (select id from _tb_test_state where key = 'lara');
  v_denied boolean := false;
begin
  -- R1: scope rows remain, but changing the role label makes them inert.
  update public.users set role = 'rep' where auth_id = v_lara;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_lara, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);
  begin
    perform public.publish_team_brief(
      p_title => 'RFC163 R1 forbidden',
      p_body => 'Scope rows without team_admin role grant nothing.',
      p_brief_type => 'fyi',
      p_audience_mode => 'team_region',
      p_timezone => 'America/Chicago',
      p_audience_team_id => 'cs',
      p_audience_region => 'US',
      p_display_rule => 'manual_clear'
    );
  exception when insufficient_privilege then
    v_denied := true;
  end;
  execute 'reset role';

  update public.users set role = 'team_admin' where auth_id = v_lara;

  if not v_denied then
    raise exception 'FAIL [R1] scope rows granted publish while role was rep';
  end if;
  raise notice 'PASS [6] R1 role tie enforced';
exception when others then
  execute 'reset role';
  update public.users set role = 'team_admin' where auth_id = v_lara;
  raise;
end
$$;

-- ═══════════════════════ 4. Global publish/audience freeze ══

do $$
declare
  v_jeff uuid := (select id from _tb_test_state where key = 'jeff');
  v_brief uuid;
  v_expected integer;
  v_actual integer;
begin
  select count(*) into v_expected
  from public.users u
  join public.reps r on r.rep_id = u.rep_id
  where u.role = 'rep'
    and u.auth_id is not null
    and r.active
    and r.team_id = 'newbiz'
    and r.region = 'US';

  if v_expected = 0 then
    raise exception 'FAIL [fixture] no active seated BD US reps';
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_jeff, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);

  -- Along with the team_region probe below, these prove that the global
  -- manager can publish every MVP audience mode.
  perform public.publish_team_brief(
    p_title => 'RFC163 manager sales all',
    p_body => 'Global audience-mode probe.',
    p_brief_type => 'fyi',
    p_audience_mode => 'sales_all',
    p_timezone => 'America/Chicago',
    p_display_rule => 'manual_clear'
  );
  perform public.publish_team_brief(
    p_title => 'RFC163 manager region',
    p_body => 'Global audience-mode probe.',
    p_brief_type => 'fyi',
    p_audience_mode => 'region',
    p_timezone => 'America/Chicago',
    p_audience_region => 'US',
    p_display_rule => 'manual_clear'
  );
  perform public.publish_team_brief(
    p_title => 'RFC163 manager team',
    p_body => 'Global audience-mode probe.',
    p_brief_type => 'fyi',
    p_audience_mode => 'team',
    p_timezone => 'America/Chicago',
    p_audience_team_id => 'newbiz',
    p_display_rule => 'manual_clear'
  );

  v_brief := public.publish_team_brief(
    p_title => 'RFC163 frozen BD US',
    p_body => 'Audience expansion, read, and comment probe.',
    p_brief_type => 'action_required',
    p_audience_mode => 'team_region',
    p_timezone => 'America/Chicago',
    p_audience_team_id => 'newbiz',
    p_audience_region => 'US',
    p_display_rule => 'manual_clear',
    p_due_at => pg_catalog.statement_timestamp() + interval '2 days',
    p_require_ack => true,
    p_allow_comments => true,
    p_auto_escalate => true
  );

  execute 'reset role';

  select count(*) into v_actual
  from public.team_brief_audience_members am
  where am.brief_id = v_brief;

  if v_actual <> v_expected then
    raise exception 'FAIL [audience expansion] got %, want % active seated rep rows',
      v_actual, v_expected;
  end if;
  if exists (
    select 1
    from public.team_brief_audience_members am
    join public.users u on u.auth_id = am.auth_id
    where am.brief_id = v_brief
      and u.role <> 'rep'
  ) then
    raise exception 'FAIL [audience expansion] manager/admin entered denominator';
  end if;

  insert into _tb_test_state (key, id) values ('main_brief', v_brief);
  raise notice 'PASS [7] global manager published all four modes; team_region expansion exact';
exception when others then
  execute 'reset role';
  raise;
end
$$;

do $$
declare
  v_brief uuid := (select id from _tb_test_state where key = 'main_brief');
  v_member uuid;
  v_rep text;
  v_region text;
  v_before integer;
  v_after integer;
begin
  select am.auth_id, am.rep_id, am.region
    into strict v_member, v_rep, v_region
  from public.team_brief_audience_members am
  where am.brief_id = v_brief
  order by am.rep_id
  limit 1;

  select count(*) into v_before
  from public.team_brief_audience_members am
  where am.brief_id = v_brief;

  update public.reps
  set region = case when region = 'US' then 'EMEA' else 'US' end
  where rep_id = v_rep;

  select count(*) into v_after
  from public.team_brief_audience_members am
  where am.brief_id = v_brief;

  if v_after <> v_before
     or not exists (
       select 1
       from public.team_brief_audience_members am
       where am.brief_id = v_brief
         and am.auth_id = v_member
         and am.rep_id = v_rep
         and am.region = v_region
     )
  then
    raise exception 'FAIL [frozen audience] roster mutation changed materialized rows';
  end if;

  insert into _tb_test_state (key, id) values ('member', v_member);
  raise notice 'PASS [8] audience count and team/region snapshot remain frozen after roster mutation';
end
$$;

-- ═══════════════════════ 5. Read/comment visibility ═════════

do $$
declare
  v_brief uuid := (select id from _tb_test_state where key = 'main_brief');
  v_member uuid := (select id from _tb_test_state where key = 'member');
  v_first timestamptz;
  v_second timestamptz;
  v_count integer;
  v_comment uuid;
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_member, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);

  v_first := public.acknowledge_team_brief(v_brief);
  v_second := public.acknowledge_team_brief(v_brief);
  v_comment := public.add_team_brief_comment(v_brief, '  First comment; follow-ups are new rows.  ');

  -- Audience members see only their own denominator/read row.
  select count(*) into v_count
  from public.team_brief_audience_members am
  where am.brief_id = v_brief;
  if v_count <> 1 then
    raise exception 'FAIL [audience privacy] member sees % audience rows, want own row only', v_count;
  end if;

  execute 'reset role';

  if v_first is distinct from v_second then
    raise exception 'FAIL [ack idempotency] read_at changed: first=% second=%',
      v_first, v_second;
  end if;
  select count(*) into v_count
  from public.team_brief_reads r
  where r.brief_id = v_brief and r.auth_id = v_member;
  if v_count <> 1 then
    raise exception 'FAIL [ack idempotency] got % read rows, want 1', v_count;
  end if;
  if (select c.body from public.team_brief_comments c where c.id = v_comment)
     <> 'First comment; follow-ups are new rows.'
  then
    raise exception 'FAIL [comment trim] stored body was not trimmed';
  end if;

  insert into _tb_test_state (key, id) values ('comment', v_comment);
  raise notice 'PASS [9] explicit ack is idempotent; comment is trimmed and stored';
exception when others then
  execute 'reset role';
  raise;
end
$$;

do $$
declare
  v_brief uuid := (select id from _tb_test_state where key = 'main_brief');
  v_dwayne uuid := (select id from _tb_test_state where key = 'dwayne');
  v_count integer;
  v_comment_denied boolean := false;
  v_ack_denied boolean := false;
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_dwayne, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);

  select count(*) into v_count
  from public.team_briefs b
  where b.id = v_brief;
  if v_count <> 0 then
    raise exception 'FAIL [non-audience brief visibility] CS rep sees BD US brief';
  end if;

  select count(*) into v_count
  from public.team_brief_comments c
  where c.brief_id = v_brief;
  if v_count <> 0 then
    raise exception 'FAIL [comment visibility] non-audience rep sees comments';
  end if;

  begin
    perform public.add_team_brief_comment(v_brief, 'must be denied');
  exception when insufficient_privilege then
    v_comment_denied := true;
  end;
  begin
    perform public.acknowledge_team_brief(v_brief);
  exception when insufficient_privilege then
    v_ack_denied := true;
  end;

  execute 'reset role';

  if not v_comment_denied or not v_ack_denied then
    raise exception 'FAIL [non-audience write] comment_denied=% ack_denied=%',
      v_comment_denied, v_ack_denied;
  end if;
  raise notice 'PASS [10] non-audience sees nothing and cannot comment/ack';
exception when others then
  execute 'reset role';
  raise;
end
$$;

do $$
declare
  v_brief uuid := (select id from _tb_test_state where key = 'main_brief');
  v_first_member uuid := (select id from _tb_test_state where key = 'member');
  v_second_member uuid;
  v_comment uuid := (select id from _tb_test_state where key = 'comment');
  v_count integer;
begin
  select am.auth_id into v_second_member
  from public.team_brief_audience_members am
  where am.brief_id = v_brief
    and am.auth_id <> v_first_member
  order by am.rep_id
  limit 1;

  if v_second_member is null then
    raise notice 'SKIP [peer comment visibility] fixture has only one BD US audience member';
    return;
  end if;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_second_member, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);
  select count(*) into v_count
  from public.team_brief_comments c
  where c.id = v_comment;
  execute 'reset role';

  if v_count <> 1 then
    raise exception 'FAIL [peer comment visibility] second audience member sees % rows, want 1',
      v_count;
  end if;
  raise notice 'PASS [11] second audience member sees first member comment';
exception when others then
  execute 'reset role';
  raise;
end
$$;

do $$
declare
  v_brief uuid := (select id from _tb_test_state where key = 'main_brief');
  v_member uuid := (select id from _tb_test_state where key = 'member');
  v_comment uuid := (select id from _tb_test_state where key = 'comment');
  v_update_denied boolean := false;
  v_delete_denied boolean := false;
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_member, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);

  begin
    update public.team_brief_comments
    set body = 'rep edit must fail'
    where id = v_comment;
  exception when insufficient_privilege then
    v_update_denied := true;
  end;
  begin
    delete from public.team_brief_comments
    where id = v_comment;
  exception when insufficient_privilege then
    v_delete_denied := true;
  end;

  execute 'reset role';

  if not v_update_denied or not v_delete_denied then
    raise exception 'FAIL [rep comment immutability] update_denied=% delete_denied=%',
      v_update_denied, v_delete_denied;
  end if;
  raise notice 'PASS [12] rep direct comment UPDATE and DELETE are denied';
exception when others then
  execute 'reset role';
  raise;
end
$$;

-- ═══════════════════════ 6. Manager moderation/archive ══════

do $$
declare
  v_jeff uuid := (select id from _tb_test_state where key = 'jeff');
  v_brief uuid := (select id from _tb_test_state where key = 'main_brief');
  v_comment uuid := (select id from _tb_test_state where key = 'comment');
  v_deleted timestamptz;
  v_archived timestamptz;
  v_count integer;
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_jeff, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);

  select count(*) into v_count
  from public.team_brief_audience_members am
  where am.brief_id = v_brief;
  if v_count < 1 then
    raise exception 'FAIL [manager tracking visibility] manager cannot inspect denominator';
  end if;

  v_deleted := public.soft_delete_team_brief_comment(v_comment);
  v_archived := public.archive_team_brief(v_brief);

  execute 'reset role';

  if v_deleted is null or v_archived is null then
    raise exception 'FAIL [manager RPC] moderation/archive timestamp missing';
  end if;
  if not exists (
    select 1 from public.team_brief_comments c
    where c.id = v_comment
      and c.deleted_at = v_deleted
      and c.deleted_by_auth_id = v_jeff
  ) then
    raise exception 'FAIL [soft delete] comment was changed/deleted incorrectly';
  end if;
  if not exists (
    select 1 from public.team_briefs b
    where b.id = v_brief
      and b.status = 'archived'
      and b.archived_at = v_archived
  ) then
    raise exception 'FAIL [archive] brief did not enter archived state';
  end if;

  raise notice 'PASS [13] manager sees tracking data, soft-deletes, and archives';
exception when others then
  execute 'reset role';
  raise;
end
$$;

do $$
declare
  v_member uuid := (select id from _tb_test_state where key = 'member');
  v_comment uuid := (select id from _tb_test_state where key = 'comment');
  v_count integer;
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_member, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);

  select count(*) into v_count
  from public.team_brief_comments c
  where c.id = v_comment;

  execute 'reset role';

  if v_count <> 0 then
    raise exception 'FAIL [soft-delete visibility] audience member still sees deleted body';
  end if;
  raise notice 'PASS [14] soft-deleted comment hidden from audience member';
exception when others then
  execute 'reset role';
  raise;
end
$$;

-- ═══════════════════════ 7. Realtime membership ═════════════

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
        raise exception 'FAIL [realtime] public.% missing from supabase_realtime', v_table;
      end if;
    end loop;
  end if;
  raise notice 'PASS [15] realtime publication membership present (when publication exists)';
end
$$;

select 'RFC-163 TEAM BRIEFS: ALL RLS/RPC ASSERTIONS PASSED' as result;

rollback;
