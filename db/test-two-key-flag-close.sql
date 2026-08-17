-- ============================================================
-- TEST — two-key flag close
-- Run in Supabase → SQL Editor (project tvdizqryowracmtjdskv) or via MCP
-- execute_sql, AFTER db/migration-two-key-flag-close.sql. The whole file runs
-- in one transaction and ends in ROLLBACK — it seeds asks, proves the rule,
-- and persists nothing.
--
-- TDD contract:
--   RED   — run BEFORE the migration: block 1 fails with
--           'FAIL [1]: a rep closed their own flag single-handed' (the hole).
--           (Before the migration the new columns do not exist either, so the
--           file errors on the first reference — that is also a RED.)
--   GREEN — run after: every block raises a PASS notice and the final SELECT
--           returns 'TWO-KEY FLAG CLOSE: ALL ASSERTIONS PASSED'.
--
-- Personas match db/test-team-rbac-rls.sql:
--   Cammy  cammy.bean@mindtools-kineo.com    role=rep, rep_id=cammy
--   Jeff   jeff.hamons@mindtools-kineo.com   role=manager
-- Impersonation is the same set_config('request.jwt.claims', …) idiom; both
-- GUCs are transaction-local.
-- ============================================================

begin;

insert into public.asks (rep_id, week_index, deliverable_id, body)
values ('cammy', 1, 'TWOKEY-TEST-DEL', 'TWOKEY-TEST: need pricing sign-off'),
       ('cammy', 1, 'onboarding:TWOKEY-TEST', 'TWOKEY-TEST: vpn access');

create or replace function pg_temp.be(p_email text) returns void
language plpgsql as $fn$
declare v_auth text;
begin
  select auth_id::text into strict v_auth from public.users where email = p_email;
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_auth, 'role', 'authenticated', 'email', p_email)::text, true);
end $fn$;

-- ── 1. A rep may NOT close their own flag single-handed ───────────────────
do $$
declare v_closed boolean := false;
begin
  perform pg_temp.be('cammy.bean@mindtools-kineo.com');
  begin
    update public.asks
       set rep_closed_at       = now(),
           rep_closed_by_email = 'cammy.bean@mindtools-kineo.com',
           resolved_at         = now(),
           resolved_by_email   = 'cammy.bean@mindtools-kineo.com',
           resolved_by_role    = 'rep'
     where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'TWOKEY-TEST-DEL';
    v_closed := true;
  exception when insufficient_privilege then
    null;   -- expected: the manager has not signed
  end;
  if v_closed then
    raise exception 'FAIL [1]: a rep closed their own flag single-handed';
  end if;
  raise notice 'PASS [1]: a rep alone cannot close their own flag';
end $$;

-- ── 2. A manager may NOT close it single-handed either ────────────────────
do $$
declare v_closed boolean := false;
begin
  perform pg_temp.be('jeff.hamons@mindtools-kineo.com');
  begin
    update public.asks
       set mgr_closed_at       = now(),
           mgr_closed_by_email = 'jeff.hamons@mindtools-kineo.com',
           mgr_closed_by_role  = 'manager',
           resolved_at         = now(),
           resolved_by_email   = 'jeff.hamons@mindtools-kineo.com',
           resolved_by_role    = 'manager'
     where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'TWOKEY-TEST-DEL';
    v_closed := true;
  exception when insufficient_privilege then
    null;   -- expected: the rep has not signed
  end;
  if v_closed then
    raise exception 'FAIL [2]: a manager closed a flag the rep had not signed';
  end if;
  raise notice 'PASS [2]: a manager alone cannot close a rep''s flag';
end $$;

-- ── 3. A manager may NOT forge the rep's signature ────────────────────────
do $$
declare v_forged boolean := false;
begin
  perform pg_temp.be('jeff.hamons@mindtools-kineo.com');
  begin
    update public.asks
       set rep_closed_at       = now(),
           rep_closed_by_email = 'cammy.bean@mindtools-kineo.com'
     where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'TWOKEY-TEST-DEL';
    v_forged := true;
  exception when insufficient_privilege then
    null;   -- expected
  end;
  if v_forged then
    raise exception 'FAIL [3]: a manager forged the rep''s close signature';
  end if;
  raise notice 'PASS [3]: a manager cannot sign for the rep';
end $$;

-- ── 4. A rep may NOT forge the manager's signature ────────────────────────
do $$
declare v_forged boolean := false;
begin
  perform pg_temp.be('cammy.bean@mindtools-kineo.com');
  begin
    update public.asks
       set mgr_closed_at       = now(),
           mgr_closed_by_email = 'jeff.hamons@mindtools-kineo.com',
           mgr_closed_by_role  = 'manager'
     where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'TWOKEY-TEST-DEL';
    v_forged := true;
  exception when insufficient_privilege then
    null;   -- expected
  end;
  if v_forged then
    raise exception 'FAIL [4]: a rep forged the manager''s close signature';
  end if;
  raise notice 'PASS [4]: a rep cannot sign for the manager';
end $$;

-- ── 5. Both signatures, either order, DO close it ─────────────────────────
do $$
declare v_resolved timestamptz;
begin
  perform pg_temp.be('cammy.bean@mindtools-kineo.com');
  update public.asks
     set rep_closed_at       = now(),
         rep_closed_by_email = 'cammy.bean@mindtools-kineo.com',
         rep_closed_by_name  = 'Cammy Bean'
   where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'TWOKEY-TEST-DEL';

  perform pg_temp.be('jeff.hamons@mindtools-kineo.com');
  update public.asks
     set mgr_closed_at       = now(),
         mgr_closed_by_email = 'jeff.hamons@mindtools-kineo.com',
         mgr_closed_by_role  = 'manager',
         resolved_at         = now(),
         resolved_by_email   = 'jeff.hamons@mindtools-kineo.com',
         resolved_by_role    = 'manager'
   where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'TWOKEY-TEST-DEL';

  select resolved_at into v_resolved from public.asks
   where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'TWOKEY-TEST-DEL';
  if v_resolved is null then
    raise exception 'FAIL [5]: both signatures present but the flag did not close';
  end if;
  raise notice 'PASS [5]: rep + manager signatures close the flag';
end $$;

-- ── 6. Onboarding access notes still close on one signature ───────────────
do $$
declare v_resolved timestamptz;
begin
  perform pg_temp.be('cammy.bean@mindtools-kineo.com');
  update public.asks
     set resolved_at       = now(),
         resolved_by_email = 'cammy.bean@mindtools-kineo.com',
         resolved_by_role  = 'rep'
   where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'onboarding:TWOKEY-TEST';

  select resolved_at into v_resolved from public.asks
   where rep_id = 'cammy' and week_index = 1 and deliverable_id = 'onboarding:TWOKEY-TEST';
  if v_resolved is null then
    raise exception 'FAIL [6]: a rep could not clear their own onboarding access note';
  end if;
  raise notice 'PASS [6]: onboarding access notes keep the one-signature close';
end $$;

select 'TWO-KEY FLAG CLOSE: ALL ASSERTIONS PASSED' as result;

rollback;
