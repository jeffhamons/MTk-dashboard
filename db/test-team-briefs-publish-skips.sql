-- ============================================================
-- TEAM BRIEFS — PUBLISH SKIP RECORDING VERIFICATION
-- Run after db/migration-team-briefs-publish-skips.sql in the Supabase SQL
-- Editor, as a privileged operator.
--
-- The whole file is transactional and ends in ROLLBACK. It publishes probe
-- briefs and temporarily changes Dwayne's role to force a publish-time skip.
-- None of it persists.
--
-- Live identities used (same personas as db/test-team-briefs-rls.sql):
--   Jeff   manager   jeff.hamons@mindtools-kineo.com
--   Dwayne rep/CS US dwayne.haskell@mindtools-kineo.com
--
-- Every block raises on failure and emits a PASS notice otherwise, so a run
-- that reaches the final ROLLBACK with no exception is a pass.
-- ============================================================

begin;

-- ═══════════════════════ 1. Catalog/static security ═════════

do $$
declare
  v_rls      boolean;
  v_policies text[];
begin
  select c.relrowsecurity into strict v_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'team_brief_audience_skips';

  if not v_rls then
    raise exception 'FAIL [catalog] team_brief_audience_skips has RLS disabled';
  end if;

  select coalesce(array_agg(p.policyname order by p.policyname), array[]::text[])
    into v_policies
  from pg_catalog.pg_policies p
  where p.schemaname = 'public' and p.tablename = 'team_brief_audience_skips';

  if v_policies <> array['manager reads team brief audience skips'] then
    raise exception 'FAIL [catalog] skips policies=%', v_policies;
  end if;

  -- Skip rows name reps who did not receive a brief: manager-scoped reads,
  -- and mutation stays RPC-only like every other Team Briefs table.
  if pg_catalog.has_table_privilege('anon', 'public.team_brief_audience_skips', 'select')
     or pg_catalog.has_table_privilege(
          'authenticated', 'public.team_brief_audience_skips', 'insert')
     or not pg_catalog.has_table_privilege(
          'authenticated', 'public.team_brief_audience_skips', 'select') then
    raise exception 'FAIL [catalog] skips table privileges are wrong';
  end if;

  raise notice 'PASS [1] catalog: RLS on, one manager policy, read-only to authenticated';
end
$$;

-- ═══════════════════════ 2. Persona setup ═══════════════════

do $$
declare
  v_jeff   uuid;
  v_dwayne uuid;
begin
  select u.auth_id into strict v_jeff
  from public.users u
  where u.email = 'jeff.hamons@mindtools-kineo.com'
    and u.role = 'manager';

  select u.auth_id into strict v_dwayne
  from public.users u
  where u.email = 'dwayne.haskell@mindtools-kineo.com'
    and u.role = 'rep'
    and u.rep_id = 'dwayne';

  perform pg_catalog.set_config('tbps_test.jeff', v_jeff::text, true);
  perform pg_catalog.set_config('tbps_test.dwayne', v_dwayne::text, true);

  raise notice 'PASS [2] personas resolved';
end
$$;

-- ═══════════════════════ 3. Publish records what it drops ═══
--
-- The defect this migration exists for. Dwayne is temporarily demoted so the
-- expansion cannot seat him; publish must still succeed (the audience is not
-- empty) AND must record him.

do $$
declare
  v_jeff        uuid := pg_catalog.current_setting('tbps_test.jeff')::uuid;
  v_dwayne      uuid := pg_catalog.current_setting('tbps_test.dwayne')::uuid;
  v_brief       uuid;
  v_reason      text;
  v_accountless text[];
begin
  update public.users set role = 'team_admin' where auth_id = v_dwayne;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_jeff, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);

  v_brief := public.publish_team_brief(
    p_title => 'TBPS skip probe',
    p_body => 'Skip recording verification.',
    p_brief_type => 'fyi',
    p_audience_mode => 'sales_all',
    p_timezone => 'America/Chicago',
    p_display_rule => 'manual_clear'
  );

  execute 'reset role';

  if exists (select 1 from public.team_brief_audience_members
              where brief_id = v_brief and rep_id = 'dwayne') then
    raise exception 'FAIL [skip] demoted rep was seated anyway';
  end if;

  select s.reason into v_reason
  from public.team_brief_audience_skips s
  where s.brief_id = v_brief and s.rep_id = 'dwayne';

  if v_reason is null then
    raise exception 'FAIL [skip] publish dropped dwayne and recorded nothing';
  end if;

  if v_reason <> 'account role is team_admin, not rep' then
    raise exception 'FAIL [skip] reason=%', v_reason;
  end if;

  -- Inactive reps are an intended exclusion, not a silent defect; recording
  -- them would bury the real signal under brenda and stuart every publish.
  if exists (
    select 1 from public.team_brief_audience_skips s
    join public.reps r on r.rep_id = s.rep_id
    where s.brief_id = v_brief and not r.active
  ) then
    raise exception 'FAIL [skip] inactive reps were recorded as skipped';
  end if;

  -- Nor are reps with no dashboard account at all. On live data that is every
  -- CS rep outside the US, and it is expected rather than a gap — flagging
  -- them on every publish is how a warning becomes wallpaper. This probe
  -- publishes to sales_all precisely so those reps are in the target set.
  select coalesce(array_agg(s.rep_id order by s.rep_id), array[]::text[])
    into v_accountless
  from public.team_brief_audience_skips s
  where s.brief_id = v_brief
    and not exists (select 1 from public.users u where u.rep_id = s.rep_id);

  if cardinality(v_accountless) > 0 then
    raise exception 'FAIL [skip] reps with no account were recorded: %', v_accountless;
  end if;

  -- Nobody may be both seated and skipped for the same brief.
  if exists (
    select 1 from public.team_brief_audience_skips s
    join public.team_brief_audience_members am
      on am.brief_id = s.brief_id and am.rep_id = s.rep_id
    where s.brief_id = v_brief
  ) then
    raise exception 'FAIL [skip] a rep is recorded as both seated and skipped';
  end if;

  update public.users set role = 'rep' where auth_id = v_dwayne;
  perform pg_catalog.set_config('tbps_test.brief', v_brief::text, true);

  raise notice 'PASS [3] publish succeeded, recorded the dropped rep, spared the inactive and the accountless';
end
$$;

-- ═══════════════════════ 4. A targeted brief only records its own target ══
--
-- The skip set must follow the audience filter. A BD-EMEA brief must not
-- record US CS reps as "skipped" — they were never addressed.

do $$
declare
  v_jeff  uuid := pg_catalog.current_setting('tbps_test.jeff')::uuid;
  v_brief uuid;
  v_stray text[];
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_jeff, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);

  v_brief := public.publish_team_brief(
    p_title => 'TBPS targeted probe',
    p_body => 'Audience-scoped skip verification.',
    p_brief_type => 'fyi',
    p_audience_mode => 'team_region',
    p_audience_team_id => 'newbiz',
    p_audience_region => 'EMEA',
    p_timezone => 'Europe/London',
    p_display_rule => 'manual_clear'
  );

  execute 'reset role';

  select coalesce(array_agg(s.rep_id order by s.rep_id), array[]::text[])
    into v_stray
  from public.team_brief_audience_skips s
  where s.brief_id = v_brief
    and (s.team_id <> 'newbiz' or s.region <> 'EMEA');

  if cardinality(v_stray) > 0 then
    raise exception 'FAIL [scope] off-target reps recorded as skipped: %', v_stray;
  end if;

  raise notice 'PASS [4] skip recording respects the audience target';
end
$$;

-- ═══════════════════════ 5. Reps cannot read the skip record ══

do $$
declare
  v_dwayne uuid := pg_catalog.current_setting('tbps_test.dwayne')::uuid;
  v_brief  uuid := pg_catalog.current_setting('tbps_test.brief')::uuid;
  v_visible integer;
begin
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_dwayne, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('role', 'authenticated', true);

  select pg_catalog.count(*) into v_visible
  from public.team_brief_audience_skips
  where brief_id = v_brief;

  execute 'reset role';

  if v_visible <> 0 then
    raise exception 'FAIL [authz] a rep read % skip rows', v_visible;
  end if;

  raise notice 'PASS [5] the skip record is manager-scoped';
end
$$;

rollback;
