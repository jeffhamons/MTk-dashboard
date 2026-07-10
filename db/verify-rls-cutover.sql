-- ============================================================
-- RFC-151 CUTOVER VERIFIER — read-only post-flip smoke check
-- Target: Supabase project tvdizqryowracmtjdskv (Postgres 17)
-- Paste into Supabase → SQL Editor, or run via MCP execute_sql.
--
-- STRICTLY READ-ONLY: SELECTs + DO blocks only. No INSERT/UPDATE/
-- DELETE/CREATE/DROP/ALTER/GRANT. No temp tables. Safe against prod.
--
-- WHEN TO RUN:
--   AFTER issue #4342 — flip Lara Kidd (lkidd@mindtools.com) from
--   role='manager' to role='team_admin' in BOTH public.users and
--   public.allowed_emails (her team_admins scopes (cs,'US') and
--   (cs,'EMEA') are already seeded). Every block must pass.
--
--   ALSO SAFE BEFORE the flip: blocks 1-3 should pass if Phase 1/2
--   migrations are live; block 4 (Lara seating, deliberately LAST) is
--   EXPECTED to FAIL while she remains role='manager'. Re-run green
--   after the flip.
--
-- Asserts: (1) exact 27-policy inventory on 12 RLS tables,
--          (2) relrowsecurity=true on all 12, (3) role CHECKs include
--          'team_admin', (4) Lara seated as team_admin with both CS
--          scopes. Final SELECT is the green sentinel.
-- ============================================================

-- ── 1. POLICY INVENTORY — exact-set check on the 12 RLS tables ────────────
do $$
declare
  expected text[] := array[
    'manager or team admin deletes manager_notes',
    'manager or team admin inserts manager_notes',
    'manager or team admin reads manager_notes',
    'manager or team admin updates manager_notes',
    'owner manager or admin delete asks',
    'owner manager or admin delete checks',
    'owner manager or admin delete standup entries',
    'owner manager or admin delete wins',
    'owner manager or admin insert asks',
    'owner manager or admin insert checks',
    'owner manager or admin insert standup entries',
    'owner manager or admin insert wins',
    'owner manager or admin read closed_won_deals',
    'owner manager or admin read renewal_book',
    'owner manager or admin update asks',
    'owner manager or admin update checks',
    'owner manager or admin update standup entries',
    'owner manager or admin update wins',
    'team reads asks',
    'team reads attainment',
    'team reads checks',
    'team reads cs_quarterly_targets',
    'team reads standup entries',
    'team reads wins',
    'authenticated read teams',
    'authenticated read reps',
    'authenticated read team_admins'
  ];
  tables text[] := array[
    'checks','asks','wins','standup_entries','attainment_snapshot',
    'cs_quarterly_targets','closed_won_deals','renewal_book',
    'manager_notes','teams','reps','team_admins'
  ];
  actual text[];
  missing text[];
  unexpected text[];
begin
  select coalesce(array_agg(policyname order by policyname), array[]::text[])
    into actual
  from pg_policies
  where schemaname = 'public' and tablename = any (tables);

  select coalesce(array_agg(e order by e), array[]::text[]) into missing
  from unnest(expected) e where not (e = any (actual));

  select coalesce(array_agg(a order by a), array[]::text[]) into unexpected
  from unnest(actual) a where not (a = any (expected));

  if cardinality(missing) > 0 then
    raise exception 'FAIL [policy inventory MISSING]: expected policies not present: %',
      array_to_string(missing, ', ');
  end if;
  if cardinality(unexpected) > 0 then
    raise exception 'FAIL [policy inventory UNEXPECTED]: stray policies on the 12 tables (permissive OR-leaks are the historical failure mode): %',
      array_to_string(unexpected, ', ');
  end if;
  raise notice 'PASS [1 policy inventory]: exact 27 policies on 12 tables';
end $$;

-- ── 2. ROWSECURITY — relrowsecurity must be true for all 12 tables ────────
do $$
declare
  tables text[] := array[
    'checks','asks','wins','standup_entries','attainment_snapshot',
    'cs_quarterly_targets','closed_won_deals','renewal_book',
    'manager_notes','teams','reps','team_admins'
  ];
  unsecured text[];
begin
  select coalesce(array_agg(t.t order by t.t), array[]::text[]) into unsecured
  from unnest(tables) as t(t)
  where not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = t.t
      and c.relkind = 'r' and c.relrowsecurity
  );

  if cardinality(unsecured) > 0 then
    raise exception 'FAIL [rowsecurity]: tables with relrowsecurity=false (or missing): % — a policy on a non-RLS table is inert and the table is fully readable',
      array_to_string(unsecured, ', ');
  end if;
  raise notice 'PASS [2 rowsecurity]: all 12 tables have relrowsecurity=true';
end $$;

-- ── 3. ROLE CHECK CONSTRAINTS — must include 'team_admin' ─────────────────
do $$
declare
  v_users_def text;
  v_allowed_def text;
begin
  select pg_get_constraintdef(c.oid) into v_users_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = 'users'
    and c.conname = 'users_role_check';

  if v_users_def is null then
    raise exception 'FAIL [role check]: users_role_check constraint not found on public.users';
  end if;
  if position('team_admin' in v_users_def) = 0 then
    raise exception 'FAIL [role check users_role_check]: def does not include team_admin; got %',
      v_users_def;
  end if;

  select pg_get_constraintdef(c.oid) into v_allowed_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = 'allowed_emails'
    and c.conname = 'allowed_emails_role_check';

  if v_allowed_def is null then
    raise exception 'FAIL [role check]: allowed_emails_role_check constraint not found on public.allowed_emails';
  end if;
  if position('team_admin' in v_allowed_def) = 0 then
    raise exception 'FAIL [role check allowed_emails_role_check]: def does not include team_admin; got %',
      v_allowed_def;
  end if;
  raise notice 'PASS [3 role checks]: users_role_check + allowed_emails_role_check include team_admin';
end $$;

-- ── 4. LARA'S SEATING — team_admin label + both CS scopes ─────────────────
do $$
declare
  v_users_role text;
  v_allowed_role text;
  v_auth uuid;
  v_scope_count int;
  v_has_us boolean;
  v_has_emea boolean;
begin
  select role, auth_id into v_users_role, v_auth
  from public.users where email = 'lkidd@mindtools.com';

  if v_users_role is null then
    raise exception 'FAIL [lara seating]: no public.users row for lkidd@mindtools.com';
  end if;
  if v_users_role is distinct from 'team_admin' then
    raise exception 'FAIL [lara seating users.role]: got %, want team_admin (issue #4342 flip not done?)',
      v_users_role;
  end if;

  select role into v_allowed_role
  from public.allowed_emails where email = 'lkidd@mindtools.com';

  if v_allowed_role is null then
    raise exception 'FAIL [lara seating]: no public.allowed_emails row for lkidd@mindtools.com';
  end if;
  if v_allowed_role is distinct from 'team_admin' then
    raise exception 'FAIL [lara seating allowed_emails.role]: got %, want team_admin (issue #4342 flip not done?)',
      v_allowed_role;
  end if;
  if v_auth is null then
    raise exception 'FAIL [lara seating]: users.auth_id is null for lkidd@mindtools.com — cannot verify team_admins scopes';
  end if;

  select count(*),
         bool_or(team_id = 'cs' and region = 'US'),
         bool_or(team_id = 'cs' and region = 'EMEA')
    into v_scope_count, v_has_us, v_has_emea
  from public.team_admins
  where auth_id = v_auth and team_id = 'cs' and region in ('US', 'EMEA');

  if not coalesce(v_has_us, false) or not coalesce(v_has_emea, false) then
    raise exception 'FAIL [lara seating team_admins scopes]: want both (cs,US) and (cs,EMEA) via users.auth_id; got count=% has_US=% has_EMEA=%',
      v_scope_count, coalesce(v_has_us, false), coalesce(v_has_emea, false);
  end if;
  if v_scope_count <> 2 then
    raise exception 'FAIL [lara seating team_admins scopes]: got % rows for (cs,US|EMEA), want exactly 2',
      v_scope_count;
  end if;
  raise notice 'PASS [4 lara seating]: users+allowed_emails role=team_admin, scopes (cs,US)+(cs,EMEA)';
end $$;

-- Reached only if every block above passed (any FAIL aborts the batch).
select 'RFC-151 CUTOVER VERIFIED: policies exact, rowsecurity on, Lara seated team_admin' as result;
