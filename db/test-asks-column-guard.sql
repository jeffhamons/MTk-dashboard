-- ============================================================
-- TEST — asks column-level guard (issue #10)
-- Run in Supabase → SQL Editor (project tvdizqryowracmtjdskv) or via MCP
-- execute_sql, AFTER db/migration-asks-column-guard.sql. The whole file runs
-- in one transaction and ends in ROLLBACK — it seeds an ask, proves the
-- guard, and persists nothing.
--
-- TDD contract:
--   RED   — run BEFORE the migration: block 1 fails with
--           'FAIL [1]: a rep forged a manager response' (the hole itself).
--   GREEN — run after: every block raises a PASS notice and the final SELECT
--           returns 'ASKS COLUMN GUARD: ALL ASSERTIONS PASSED'.
--
-- Personas match db/test-team-rbac-rls.sql:
--   Cammy  cammy.bean@mindtools-kineo.com    role=rep, rep_id=cammy
--   Jeff   jeff.hamons@mindtools-kineo.com   role=manager
-- Impersonation is the same set_config('request.jwt.claims', …) idiom; both
-- GUCs are transaction-local.
-- ============================================================

begin;

-- Seed one open ask owned by Cammy as the privileged session role.
insert into public.asks (rep_id, week_index, deliverable_id, body)
values ('cammy', 1, 'GUARD-TEST-DEL', 'GUARD-TEST: original ask body');

-- ── 1. A rep may NOT forge a manager response on their own ask ────────────
do $$
declare v_auth text; v_forged boolean := false;
begin
  select auth_id::text into strict v_auth from public.users
   where email = 'cammy.bean@mindtools-kineo.com';
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  begin
    update public.asks
       set response          = 'Approved — go ahead',
           response_by_name  = 'Jeff Hamons',
           response_by_email = 'jeff.hamons@mindtools-kineo.com',
           response_at       = now()
     where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'GUARD-TEST-DEL';
    v_forged := true;   -- reached only if NOTHING raised
  exception when insufficient_privilege then
    null;               -- expected
  end;

  execute 'reset role';
  if v_forged then
    raise exception 'FAIL [1]: a rep forged a manager response';
  end if;
  raise notice 'PASS [1] rep cannot write response columns on their own ask';
end $$;

-- ── 2. A rep may NOT sign a resolution as a manager ───────────────────────
do $$
declare v_auth text; v_forged boolean := false;
begin
  select auth_id::text into strict v_auth from public.users
   where email = 'cammy.bean@mindtools-kineo.com';
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  begin
    update public.asks
       set resolved_at       = now(),
           resolved_by_role  = 'manager',
           resolved_by_email = 'jeff.hamons@mindtools-kineo.com'
     where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'GUARD-TEST-DEL';
    v_forged := true;
  exception when insufficient_privilege then
    null;
  end;

  execute 'reset role';
  if v_forged then
    raise exception 'FAIL [2]: a rep signed a resolution as a manager';
  end if;
  raise notice 'PASS [2] rep cannot claim resolved_by_role = manager';
end $$;

-- ── 3. A rep CAN still self-resolve and re-raise (workflow preserved) ─────
-- The guard must not break the primary rep path; a regression here is worse
-- than the hole, so it is asserted explicitly rather than assumed.
do $$
declare v_auth text; v_email text; v_resolved timestamptz;
begin
  select auth_id::text, email into strict v_auth, v_email from public.users
   where email = 'cammy.bean@mindtools-kineo.com';
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  update public.asks
     set resolved_at       = now(),
         resolved_by_role  = 'rep',
         resolved_by_email = v_email,
         resolved_by_name  = 'Cammy Bean'
   where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'GUARD-TEST-DEL';

  select resolved_at into v_resolved from public.asks
   where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'GUARD-TEST-DEL';
  if v_resolved is null then
    execute 'reset role';
    raise exception 'FAIL [3a]: rep self-resolve was blocked (workflow regression)';
  end if;

  -- Re-raise: clears the resolution back to NULL.
  update public.asks
     set resolved_at = null, resolved_by_role = null,
         resolved_by_email = null, resolved_by_name = null
   where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'GUARD-TEST-DEL';

  select resolved_at into v_resolved from public.asks
   where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'GUARD-TEST-DEL';
  execute 'reset role';
  if v_resolved is not null then
    raise exception 'FAIL [3b]: rep re-raise was blocked (workflow regression)';
  end if;
  raise notice 'PASS [3] rep self-resolve + re-raise still work';
end $$;

-- ── 4. A manager CAN write the response columns ───────────────────────────
do $$
declare v_auth text; v_resp text;
begin
  select auth_id::text into strict v_auth from public.users
   where email = 'jeff.hamons@mindtools-kineo.com';
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  update public.asks
     set response          = 'GUARD-TEST: manager reply',
         response_by_name  = 'Jeff Hamons',
         response_by_email = 'jeff.hamons@mindtools-kineo.com',
         response_at       = now()
   where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'GUARD-TEST-DEL';

  select response into v_resp from public.asks
   where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'GUARD-TEST-DEL';
  execute 'reset role';
  if v_resp is distinct from 'GUARD-TEST: manager reply' then
    raise exception 'FAIL [4]: manager response write was blocked, got %', v_resp;
  end if;
  raise notice 'PASS [4] manager can write response columns';
end $$;

-- ── 5. A rep may NOT insert an ask that arrives pre-answered ──────────────
-- The upsert path in setAskSupabase INSERTs on a fresh (rep, week,
-- deliverable), so freezing only UPDATE would leave the forgery one INSERT
-- away.
do $$
declare v_auth text; v_forged boolean := false;
begin
  select auth_id::text into strict v_auth from public.users
   where email = 'cammy.bean@mindtools-kineo.com';
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  begin
    insert into public.asks (rep_id, week_index, deliverable_id, body, response, response_by_name)
    values ('cammy', 2, 'GUARD-TEST-DEL-2', 'GUARD-TEST: second ask',
            'Approved at raise time', 'Jeff Hamons');
    v_forged := true;
  exception when insufficient_privilege then
    null;
  end;

  execute 'reset role';
  if v_forged then
    raise exception 'FAIL [5]: a rep inserted a pre-answered ask';
  end if;
  raise notice 'PASS [5] rep cannot insert an ask with a response already on it';
end $$;

select 'ASKS COLUMN GUARD: ALL ASSERTIONS PASSED' as result;

rollback;
