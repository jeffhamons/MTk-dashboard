-- ============================================================
-- RFC-151 RLS TEST MATRIX — team-scoped RBAC isolation proofs
-- Run in Supabase → SQL Editor (project tvdizqryowracmtjdskv) or via MCP
-- execute_sql. The ENTIRE file runs inside one transaction and ends in
-- ROLLBACK — it never persists anything, including its seeded test rows,
-- the in-transaction Lara seating, and any write-test side effects.
--
-- TDD contract (RFC-151 build, 2026-07-02):
--   RED  — run BEFORE migration-team-rbac-schema.sql / -rls.sql are applied:
--          first failure is "cammy checks: got 97, want 72" (a BD rep can
--          read CS rows today — the leak this RFC closes). That failure IS
--          the red run; the batch aborts there by design.
--   GREEN — run after both migrations: every block raises PASS notices and
--          the final SELECT returns 'RFC-151 MATRIX: ALL ASSERTIONS PASSED'.
--
-- Personas (live auth identities, resolved by email at runtime):
--   Jeff   jeff.hamons@mindtools-kineo.com   role=manager (global bypass)
--   Cammy  cammy.bean@mindtools-kineo.com    role=rep, rep_id=cammy  (NA BD)
--   Dwayne dwayne.haskell@mindtools-kineo.com role=rep, rep_id=dwayne (CS)
--   Lara   lkidd@mindtools.com               seated IN-TXN as team_admin
--                                            with scopes (cs,US)+(cs,EMEA)
--
-- Impersonation mechanics: set_config('role','authenticated',true) +
-- set_config('request.jwt.claims','{"sub":"<auth_id>",...}',true) — both
-- transaction-local; auth.uid()/auth.role() read those GUCs, so RLS
-- evaluates exactly as it would for that user's PostgREST session.
-- Every block computes its expected counts as the privileged session role
-- FIRST (temp tables aren't readable once SET ROLE authenticated), then
-- switches role, gathers actuals, resets role, then asserts.
-- ============================================================

begin;

-- ── Stage 0: team map (registry if present, literal fallback for RED run) ──
create temp table _m (rep_id text primary key, team_id text not null, region text not null);

do $$
begin
  if to_regclass('public.reps') is not null then
    insert into _m select rep_id, team_id, region from public.reps;
    raise notice 'RFC-151 matrix: team map loaded from public.reps (% rows)', (select count(*) from _m);
  else
    insert into _m values
      ('cammy','newbiz','US'),('brenda','newbiz','US'),('farah','newbiz','US'),('don','newbiz','US'),
      ('dwayne','cs','US'),('meri','cs','US'),
      ('laura','cs','EMEA'),('owen','cs','EMEA'),('james','cs','EMEA'),('rowan','cs','EMEA'),('alex','cs','EMEA'),
      ('rory','newbiz','EMEA'),('stephen','newbiz','EMEA'),('simon','newbiz','EMEA'),('matthew','newbiz','EMEA'),
      ('paul','newbiz','ZA'),('mike','newbiz','ZA');
    raise notice 'RFC-151 matrix: public.reps missing — literal fallback map (pre-migration RED run)';
  end if;
end $$;

-- ── Stage 1: seed detail rows (tables are empty in prod; rolled back) ──────
-- Four owners spanning both teams so owner-only isolation is observable.
insert into public.closed_won_deals (rep_id, account, amount, close_date) values
  ('cammy',  'RFC151-TEST NB Acct A', 1000, current_date),
  ('farah',  'RFC151-TEST NB Acct B', 2000, current_date),
  ('dwayne', 'RFC151-TEST CS Acct C', 3000, current_date),
  ('meri',   'RFC151-TEST CS Acct D', 4000, current_date);
insert into public.renewal_book (rep_id, account, arr, due_date, status) values
  ('cammy',  'RFC151-TEST NB Ren A', 1100, current_date, 'open'),
  ('farah',  'RFC151-TEST NB Ren B', 2100, current_date, 'open'),
  ('dwayne', 'RFC151-TEST CS Ren C', 3100, current_date, 'open'),
  ('meri',   'RFC151-TEST CS Ren D', 4100, current_date, 'open');

-- ── Scenario 1: Jeff (global manager) sees EVERYTHING ──────────────────────
do $$
declare
  v_auth text;
  w_checks bigint; w_asks bigint; w_wins bigint; w_standup bigint;
  w_attain bigint; w_cst bigint; w_cwd bigint; w_ren bigint;
  g bigint;
begin
  select auth_id::text into strict v_auth from public.users where email = 'jeff.hamons@mindtools-kineo.com';
  select count(*) into w_checks  from public.checks;
  select count(*) into w_asks    from public.asks;
  select count(*) into w_wins    from public.wins;
  select count(*) into w_standup from public.standup_entries;
  select count(*) into w_attain  from public.attainment_snapshot;
  select count(*) into w_cst     from public.cs_quarterly_targets;
  select count(*) into w_cwd     from public.closed_won_deals;
  select count(*) into w_ren     from public.renewal_book;

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  select count(*) into g from public.checks;
  if g <> w_checks then raise exception 'FAIL [jeff checks]: got %, want % (manager bypass broken)', g, w_checks; end if;
  select count(*) into g from public.asks;
  if g <> w_asks then raise exception 'FAIL [jeff asks]: got %, want %', g, w_asks; end if;
  select count(*) into g from public.wins;
  if g <> w_wins then raise exception 'FAIL [jeff wins]: got %, want %', g, w_wins; end if;
  select count(*) into g from public.standup_entries;
  if g <> w_standup then raise exception 'FAIL [jeff standup]: got %, want %', g, w_standup; end if;
  select count(*) into g from public.attainment_snapshot;
  if g <> w_attain then raise exception 'FAIL [jeff attainment]: got %, want %', g, w_attain; end if;
  select count(*) into g from public.cs_quarterly_targets;
  if g <> w_cst then raise exception 'FAIL [jeff cs_targets]: got %, want %', g, w_cst; end if;
  select count(*) into g from public.closed_won_deals;
  if g <> w_cwd then raise exception 'FAIL [jeff closed_won_deals]: got %, want % (manager must see all detail)', g, w_cwd; end if;
  select count(*) into g from public.renewal_book;
  if g <> w_ren then raise exception 'FAIL [jeff renewal_book]: got %, want %', g, w_ren; end if;
  -- manager_notes: must be readable without error (0 rows in prod is fine)
  select count(*) into g from public.manager_notes;

  execute 'reset role';
  raise notice 'PASS [scenario 1] Jeff (manager) sees everything: checks=% standup=% detail=%', w_checks, w_standup, w_cwd + w_ren;
end $$;

-- ── Scenario 2: Cammy (NA BD rep) — full BD visibility, ZERO CS rows ──────
-- THIS is the block that goes RED pre-migration (BD reps see CS rows today).
do $$
declare
  v_auth text;
  w_checks bigint; w_asks bigint; w_wins bigint; w_standup bigint;
  w_attain bigint; w_cst bigint;
  g bigint;
begin
  select auth_id::text into strict v_auth from public.users where email = 'cammy.bean@mindtools-kineo.com';
  select count(*) into w_checks  from public.checks c  join _m on _m.rep_id = c.rep_id  where _m.team_id = 'newbiz';
  select count(*) into w_asks    from public.asks a    join _m on _m.rep_id = a.rep_id  where _m.team_id = 'newbiz';
  select count(*) into w_wins    from public.wins w    join _m on _m.rep_id = w.rep_id  where _m.team_id = 'newbiz';
  -- standup: own team PLUS Jeff's shared rep_id='manager' pseudo-rows
  select count(*) into w_standup from public.standup_entries s
    where s.rep_id = 'manager' or exists (select 1 from _m where _m.rep_id = s.rep_id and _m.team_id = 'newbiz');
  select count(*) into w_attain  from public.attainment_snapshot t join _m on _m.rep_id = t.rep_id where _m.team_id = 'newbiz';
  w_cst := 0;  -- cs_quarterly_targets rows are all CS-team → invisible to BD

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  select count(*) into g from public.checks;
  if g <> w_checks then raise exception 'FAIL [cammy checks]: got %, want % (BD rep must see BD team only — CS rows leaked)', g, w_checks; end if;
  select count(*) into g from public.asks;
  if g <> w_asks then raise exception 'FAIL [cammy asks]: got %, want %', g, w_asks; end if;
  select count(*) into g from public.wins;
  if g <> w_wins then raise exception 'FAIL [cammy wins]: got %, want %', g, w_wins; end if;
  select count(*) into g from public.standup_entries;
  if g <> w_standup then raise exception 'FAIL [cammy standup]: got %, want % (must include Jeff''s rep_id=manager rows, exclude CS)', g, w_standup; end if;
  select count(*) into g from public.attainment_snapshot;
  if g <> w_attain then raise exception 'FAIL [cammy attainment]: got %, want %', g, w_attain; end if;
  select count(*) into g from public.cs_quarterly_targets;
  if g <> w_cst then raise exception 'FAIL [cammy cs_targets]: got %, want 0 (CS targets leaked to BD rep)', g; end if;

  -- direct cross-team probe: a CS rep_id queried by name returns NOTHING
  select count(*) into g from public.checks where rep_id = 'dwayne';
  if g <> 0 then raise exception 'FAIL [cammy→dwayne probe]: got % checks rows for a CS rep_id — RLS not blocking direct probes', g; end if;
  select count(*) into g from public.standup_entries where rep_id = 'meri';
  if g <> 0 then raise exception 'FAIL [cammy→meri standup probe]: got % rows', g; end if;

  -- detail tables: owner-only — cammy sees HER seeded row only, not farah's
  -- (same team!), not CS ones. Catches the stale qual=true policy being live.
  select count(*) into g from public.closed_won_deals;
  if g <> 1 then raise exception 'FAIL [cammy closed_won_deals]: got %, want 1 (owner-only; same-team detail must stay hidden — stale authenticated-read policy?)', g; end if;
  select count(*) into g from public.renewal_book;
  if g <> 1 then raise exception 'FAIL [cammy renewal_book]: got %, want 1 (owner-only)', g; end if;

  -- manager_notes: closed to plain reps
  select count(*) into g from public.manager_notes;
  if g <> 0 then raise exception 'FAIL [cammy manager_notes]: got %, want 0 (manager notes leaked to a rep)', g; end if;

  execute 'reset role';
  raise notice 'PASS [scenario 2] Cammy (BD rep): BD-only reads, zero CS rows, owner-only detail';
end $$;

-- ── Scenario 3: Dwayne (CS rep) — CS visibility, ZERO BD rows, no peer $ ──
do $$
declare
  v_auth text;
  w_checks bigint; w_wins bigint; w_standup bigint; w_attain bigint; w_cst bigint;
  g bigint;
begin
  select auth_id::text into strict v_auth from public.users where email = 'dwayne.haskell@mindtools-kineo.com';
  select count(*) into w_checks  from public.checks c  join _m on _m.rep_id = c.rep_id where _m.team_id = 'cs';
  select count(*) into w_wins    from public.wins w    join _m on _m.rep_id = w.rep_id where _m.team_id = 'cs';
  select count(*) into w_standup from public.standup_entries s
    where s.rep_id = 'manager' or exists (select 1 from _m where _m.rep_id = s.rep_id and _m.team_id = 'cs');
  select count(*) into w_attain  from public.attainment_snapshot t join _m on _m.rep_id = t.rep_id where _m.team_id = 'cs';
  select count(*) into w_cst     from public.cs_quarterly_targets t join _m on _m.rep_id = t.rep_id where _m.team_id = 'cs';

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  select count(*) into g from public.checks;
  if g <> w_checks then raise exception 'FAIL [dwayne checks]: got %, want % (CS rep must see CS team only)', g, w_checks; end if;
  select count(*) into g from public.asks;
  if g <> 0 then raise exception 'FAIL [dwayne asks]: got %, want 0 (all live asks are BD — leaked to CS rep)', g; end if;
  select count(*) into g from public.wins;
  if g <> w_wins then raise exception 'FAIL [dwayne wins]: got %, want %', g, w_wins; end if;
  select count(*) into g from public.standup_entries;
  if g <> w_standup then raise exception 'FAIL [dwayne standup]: got %, want %', g, w_standup; end if;
  select count(*) into g from public.attainment_snapshot;
  if g <> w_attain then raise exception 'FAIL [dwayne attainment]: got %, want %', g, w_attain; end if;
  select count(*) into g from public.cs_quarterly_targets;
  if g <> w_cst then raise exception 'FAIL [dwayne cs_targets]: got %, want % (CS team-shared)', g, w_cst; end if;

  -- detail tables: owner-only WITHIN team too — dwayne must NOT see meri's $
  select count(*) into g from public.closed_won_deals;
  if g <> 1 then raise exception 'FAIL [dwayne closed_won_deals]: got %, want 1 (CS peer dollar detail must stay owner-only)', g; end if;
  select count(*) into g from public.closed_won_deals where rep_id = 'meri';
  if g <> 0 then raise exception 'FAIL [dwayne→meri deal probe]: got % — CS peer named-account detail leaked', g; end if;
  select count(*) into g from public.renewal_book;
  if g <> 1 then raise exception 'FAIL [dwayne renewal_book]: got %, want 1', g; end if;

  -- manager_notes stay closed to the rep they are ABOUT
  select count(*) into g from public.manager_notes where rep_id = 'dwayne';
  if g <> 0 then raise exception 'FAIL [dwayne own manager_notes]: got %, want 0 (notes about a rep must not be readable by that rep)', g; end if;

  execute 'reset role';
  raise notice 'PASS [scenario 3] Dwayne (CS rep): CS-only reads, zero BD rows, owner-only $ detail';
end $$;

-- ── Scenario 4: Lara — team_admin(cs,US)+(cs,EMEA): all CS, ZERO BD ───────
-- Requires Phase 1 (team_admins + widened role CHECK). Seated inside this
-- rolled-back transaction; prod keeps her live role untouched.
do $$
declare
  v_auth text;
  w_checks bigint; w_wins bigint; w_standup bigint; w_attain bigint; w_cst bigint; w_cwd bigint;
  g bigint;
begin
  if to_regclass('public.team_admins') is null then
    raise notice 'SKIP [scenario 4] Lara/team_admin — Phase 1 not applied yet (pre-migration run)';
    return;
  end if;

  select auth_id::text into strict v_auth from public.users where email = 'lkidd@mindtools.com';
  update public.users set role = 'team_admin' where email = 'lkidd@mindtools.com';
  insert into public.team_admins (auth_id, team_id, region)
    select v_auth::uuid, v.team, v.region from (values ('cs','US'), ('cs','EMEA')) v(team, region)
    on conflict do nothing;

  -- covering scope = CS × {US, EMEA}
  select count(*) into w_checks from public.checks c join _m on _m.rep_id = c.rep_id
    where _m.team_id = 'cs' and _m.region in ('US','EMEA');
  select count(*) into w_wins from public.wins w join _m on _m.rep_id = w.rep_id
    where _m.team_id = 'cs' and _m.region in ('US','EMEA');
  select count(*) into w_standup from public.standup_entries s
    where s.rep_id = 'manager' or exists (select 1 from _m where _m.rep_id = s.rep_id and _m.team_id = 'cs' and _m.region in ('US','EMEA'));
  select count(*) into w_attain from public.attainment_snapshot t join _m on _m.rep_id = t.rep_id
    where _m.team_id = 'cs' and _m.region in ('US','EMEA');
  select count(*) into w_cst from public.cs_quarterly_targets t join _m on _m.rep_id = t.rep_id
    where _m.team_id = 'cs' and _m.region in ('US','EMEA');
  select count(*) into w_cwd from public.closed_won_deals d join _m on _m.rep_id = d.rep_id
    where _m.team_id = 'cs' and _m.region in ('US','EMEA');

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);

  select count(*) into g from public.checks;
  if g <> w_checks then raise exception 'FAIL [lara checks]: got %, want % (team_admin must cover all CS)', g, w_checks; end if;
  select count(*) into g from public.asks;
  if g <> 0 then raise exception 'FAIL [lara asks]: got %, want 0 (BD asks leaked to CS team_admin — THE hard constraint)', g; end if;
  select count(*) into g from public.wins;
  if g <> w_wins then raise exception 'FAIL [lara wins]: got %, want %', g, w_wins; end if;
  select count(*) into g from public.standup_entries;
  if g <> w_standup then raise exception 'FAIL [lara standup]: got %, want %', g, w_standup; end if;
  select count(*) into g from public.attainment_snapshot;
  if g <> w_attain then raise exception 'FAIL [lara attainment]: got %, want %', g, w_attain; end if;
  select count(*) into g from public.cs_quarterly_targets;
  if g <> w_cst then raise exception 'FAIL [lara cs_targets]: got %, want %', g, w_cst; end if;

  -- THE hard-constraint probe: direct query of an NA BD rep_id → zero rows,
  -- RLS-blocked, not UI-hidden.
  select count(*) into g from public.checks where rep_id = 'cammy';
  if g <> 0 then raise exception 'FAIL [lara→cammy probe]: got % checks rows — Lara can read NA BD data', g; end if;
  select count(*) into g from public.standup_entries where rep_id = 'farah';
  if g <> 0 then raise exception 'FAIL [lara→farah standup probe]: got % rows', g; end if;
  select count(*) into g from public.closed_won_deals where rep_id = 'cammy';
  if g <> 0 then raise exception 'FAIL [lara→cammy deal probe]: got % rows', g; end if;

  -- team_admin DOES see her team's dollar detail (third branch of owner-scoped read)
  select count(*) into g from public.closed_won_deals;
  if g <> w_cwd then raise exception 'FAIL [lara closed_won_deals]: got %, want % (covering team_admin must see CS detail)', g, w_cwd; end if;

  -- manager_notes parity: covering team_admin can read CS notes (0 rows live, must not error)
  select count(*) into g from public.manager_notes;

  execute 'reset role';

  -- R1 guard: the grant is tied to users.role = 'team_admin'. Flip the label
  -- off (keep the team_admins rows) → all covering access must vanish.
  update public.users set role = 'rep' where email = 'lkidd@mindtools.com';
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  select count(*) into g from public.checks;
  if g <> 0 then raise exception 'FAIL [R1 tie]: role flipped off team_admin but % checks rows still visible via bare team_admins row', g; end if;
  execute 'reset role';
  update public.users set role = 'team_admin' where email = 'lkidd@mindtools.com';

  raise notice 'PASS [scenario 4] Lara (team_admin cs×US,EMEA): all CS, zero NA BD, R1 role-tie enforced';
end $$;

-- ── Scenario 5: registry tables readable by ANY member (fail-closed guard) ─
-- Phase 2 predicates join through reps/team_admins inside EXISTS subqueries;
-- if registry RLS has no read policy every subquery fails closed and locks
-- out every rep including Lara.
do $$
declare
  v_auth text; w_reps bigint; g bigint;
begin
  if to_regclass('public.reps') is null then
    raise notice 'SKIP [scenario 5] registry readability — Phase 1 not applied yet';
    return;
  end if;
  select auth_id::text into strict v_auth from public.users where email = 'cammy.bean@mindtools-kineo.com';
  select count(*) into w_reps from public.reps;

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  select count(*) into g from public.reps;
  if g <> w_reps then raise exception 'FAIL [registry reps]: got %, want % (authenticated-read-all missing → predicates fail closed)', g, w_reps; end if;
  select count(*) into g from public.teams;
  if g < 2 then raise exception 'FAIL [registry teams]: got %, want >= 2', g; end if;
  select count(*) into g from public.team_admins;
  if g < 2 then raise exception 'FAIL [registry team_admins]: got %, want >= 2 (Lara''s seeded scopes must be visible to predicates)', g; end if;
  execute 'reset role';
  raise notice 'PASS [scenario 5] registry tables authenticated-readable (% reps)', w_reps;
end $$;

-- ── Scenario 6: WRITE matrix ───────────────────────────────────────────────
-- Owner-write model: manager OR owner OR covering team_admin. Peer-to-peer
-- marking is REMOVED on purpose (Jeff's grill ruling) — a rep writes only
-- their own rows; Jeff writes anything; Lara writes CS only.
do $$
declare
  v_cammy text; v_jeff text; v_lara text;
  denied boolean;
  g bigint;
begin
  select auth_id::text into strict v_cammy from public.users where email = 'cammy.bean@mindtools-kineo.com';
  select auth_id::text into strict v_jeff  from public.users where email = 'jeff.hamons@mindtools-kineo.com';
  select auth_id::text into strict v_lara  from public.users where email = 'lkidd@mindtools.com';

  -- 6a. cammy writes her OWN check → ALLOWED
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_cammy, 'role', 'authenticated')::text, true);
  insert into public.checks (rep_id, week_index, deliverable_id, marked_by_email, marked_by_name, marked_by_role)
    values ('cammy', 999, 'rfc151-own', 'cammy.bean@mindtools-kineo.com', 'Cammy', 'rep');

  -- 6b. cammy marks FARAH's check (peer-marking) → DENIED under owner-write
  denied := false;
  begin
    insert into public.checks (rep_id, week_index, deliverable_id, marked_by_email, marked_by_name, marked_by_role)
      values ('farah', 999, 'rfc151-peer', 'cammy.bean@mindtools-kineo.com', 'Cammy', 'rep');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL [cammy→farah check write]: peer-marking still allowed (owner-write not enforced)'; end if;

  -- 6c. cammy writes a CS rep's standup → DENIED (cross-team AND non-owner)
  denied := false;
  begin
    insert into public.standup_entries (date, rep_id, what_moved) values ('2099-01-01', 'meri', 'rfc151 cross-team write probe');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL [cammy→meri standup write]: cross-team standup write allowed'; end if;

  -- 6d. cammy writes a rep_id='manager' standup row → DENIED (shared-read
  -- pseudo-row must NOT be writable by reps)
  denied := false;
  begin
    insert into public.standup_entries (date, rep_id, what_moved) values ('2099-01-01', 'manager', 'rfc151 pseudo-row write probe');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL [cammy→manager standup write]: rep can write the shared manager pseudo-row'; end if;

  -- 6e. cammy writes manager_notes → DENIED
  denied := false;
  begin
    insert into public.manager_notes (rep_id, week_id, del_id, note) values ('cammy', 'rfc151-w', 'rfc151-d', 'probe');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'FAIL [cammy manager_notes write]: rep can write manager notes'; end if;
  execute 'reset role';

  -- 6f. Jeff (manager) marks farah's check → ALLOWED (manager bypass)
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_jeff, 'role', 'authenticated')::text, true);
  insert into public.checks (rep_id, week_index, deliverable_id, marked_by_email, marked_by_name, marked_by_role)
    values ('farah', 999, 'rfc151-mgr', 'jeff.hamons@mindtools-kineo.com', 'Jeff', 'manager');
  insert into public.manager_notes (rep_id, week_id, del_id, note, updated_by)
    values ('farah', 'rfc151-w', 'rfc151-d', 'manager note probe', 'jeff.hamons@mindtools-kineo.com');
  execute 'reset role';

  -- 6g/6h. Lara: requires Phase 1 seating (done in scenario 4's txn state)
  if to_regclass('public.team_admins') is not null then
    perform set_config('role','authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_lara, 'role', 'authenticated')::text, true);

    -- 6g. Lara marks DWAYNE's check (covering team_admin) → ALLOWED; also
    -- exercises the widened marked_by_role CHECK ('team_admin').
    insert into public.checks (rep_id, week_index, deliverable_id, marked_by_email, marked_by_name, marked_by_role)
      values ('dwayne', 999, 'rfc151-ta', 'lkidd@mindtools.com', 'Lara', 'team_admin');

    -- Lara writes a CS manager_note (parity branch) → ALLOWED, then readable
    insert into public.manager_notes (rep_id, week_id, del_id, note, updated_by)
      values ('dwayne', 'rfc151-w', 'rfc151-d', 'cs team admin note probe', 'lkidd@mindtools.com');
    select count(*) into g from public.manager_notes where rep_id = 'dwayne' and week_id = 'rfc151-w';
    if g <> 1 then raise exception 'FAIL [lara manager_notes read-back]: got %, want 1', g; end if;

    -- 6h. Lara marks CAMMY's check (NA BD) → DENIED — hard constraint, write side
    denied := false;
    begin
      insert into public.checks (rep_id, week_index, deliverable_id, marked_by_email, marked_by_name, marked_by_role)
        values ('cammy', 999, 'rfc151-ta-bd', 'lkidd@mindtools.com', 'Lara', 'team_admin');
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'FAIL [lara→cammy check write]: CS team_admin wrote an NA BD row'; end if;
    execute 'reset role';
  else
    raise notice 'SKIP [scenario 6g/6h] Lara write tests — Phase 1 not applied yet';
  end if;

  raise notice 'PASS [scenario 6] write matrix: owner/manager/team_admin writes allowed, peer + cross-team writes denied';
end $$;

rollback;

-- Reached only if every scenario above passed (any FAIL aborts the batch).
select 'RFC-151 MATRIX: ALL ASSERTIONS PASSED (transaction rolled back — prod untouched)' as result;
