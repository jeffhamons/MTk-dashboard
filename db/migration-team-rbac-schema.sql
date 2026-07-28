-- ============================================================
-- RFC-151 Phase 1 — team & rep registry (foundational schema)
-- Target: Supabase project tvdizqryowracmtjdskv (MIndtools Dashboard).
-- Idempotent — safe to re-run in Supabase → SQL Editor.
--
-- RLS can only enforce facts Postgres knows. Until this migration, which
-- team a rep_id belongs to lived ONLY in the client bundle (data-model.js
-- REPS[]); Postgres could not answer "is this rep on Lara's team". This
-- adds the server-side registry Phase 2's policies join against.
--
-- Verified against the live schema at build time (2026-07-02):
--   • users.role / allowed_emails.role carry CHECK constraints allowing
--     only ('rep','manager') — the RFC assumed bare text with no CHECK;
--     live DB says otherwise, so this migration widens all three role
--     CHECKs (users, allowed_emails, checks.marked_by_role) to admit
--     'team_admin'. Without the checks.marked_by_role widening, a
--     team_admin marking a deliverable would violate the column CHECK.
--   • REPS[] had 12 entries at first build (RFC prose said 13 — stale);
--     now 17 with the EMEA CS roster Jeff named 2026-07-02. The backfill
--     below is guarded by tests/test_rfc151_reps_parity.py (Q3 ruling):
--     id-set equality + CS-membership parity against data-model.js.
--
-- Lara's seating: her (cs,'US') + (cs,'EMEA') team_admins rows are seeded
-- here but are deliberately INERT — Phase 2's team-admin branch requires
-- users.role = 'team_admin' (ratification R1), and her live role stays
-- 'manager' until the documented cutover in DEPLOY.md (after the Phase 3
-- client deploys).
-- ============================================================

-- ── 1. Widen role vocabularies: 'team_admin' becomes the third role ───────
alter table public.users
  drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check
  check (role = any (array['rep'::text, 'manager'::text, 'team_admin'::text]));

alter table public.allowed_emails
  drop constraint if exists allowed_emails_role_check;
alter table public.allowed_emails
  add constraint allowed_emails_role_check
  check (role = any (array['rep'::text, 'manager'::text, 'team_admin'::text]));

alter table public.checks
  drop constraint if exists checks_marked_by_role_check;
alter table public.checks
  add constraint checks_marked_by_role_check
  check (marked_by_role = any (array['rep'::text, 'manager'::text, 'team_admin'::text])
         or marked_by_role is null);

-- ── 2. teams — the two divisions; ids reuse deriveAttainmentPcts() vocabulary ─
create table if not exists public.teams (
  id    text primary key,          -- 'newbiz' | 'cs'
  label text not null
);

insert into public.teams (id, label) values
  ('newbiz', 'New Business (BD)'),
  ('cs',     'Customer Success')
on conflict (id) do update set label = excluded.label;

-- ── 3. reps — server-side roster registry (RLS-authoritative) ─────────────
create table if not exists public.reps (
  rep_id  text primary key,        -- matches the free-text rep_id used across all data tables
  name    text not null,
  team_id text not null references public.teams(id),
  region  text not null,           -- mirrors data-model.js REGIONS ids (US/EMEA/ZA)
  active  boolean not null default true
);

-- Backfill: one row per data-model.js REPS[] entry (17 as of 2026-07-02).
-- active=false mirrors departed reps (activeThrough) and emit:false stubs;
-- `active` is informational — Phase 2 predicates key on rep_id/team_id/region
-- only, so departed reps' history stays visible to their own team.
-- The EMEA/ZA Account-Director stubs are BD-side (team 'newbiz'); Open
-- Question 1 (whether any get repurposed to CS) is Jeff's call — do NOT
-- move them to 'cs' without that answer.
insert into public.reps (rep_id, name, team_id, region, active) values
  ('cammy',   'Cammy Bean',               'newbiz', 'US',   true),
  ('brenda',  'Brenda Bravener-Greville', 'newbiz', 'US',   false),
  ('farah',   'Farah Issa',               'newbiz', 'US',   true),
  ('don',     'Don Hazelwood',            'newbiz', 'US',   true),
  ('dwayne',  'Dwayne Haskell',           'cs',     'US',   true),
  ('meri',    'Meri Tosh',                'cs',     'US',   true),
  -- EMEA CS (Lara's team — Open Question 1 answered by Jeff 2026-07-02;
  -- org-chart Irvin Haskell IS 'dwayne' above, not a new rep).
  -- Activated with Phase 4's CS workspace (2026-07-02).
  ('laura',   'Laura Blackmore',          'cs',     'EMEA', true),
  ('owen',    'Owen Bolding',             'cs',     'EMEA', true),
  ('james',   'James Brooke',             'cs',     'EMEA', true),
  ('rowan',   'Rowan Donoghue',           'cs',     'EMEA', true),
  ('alex',    'Alex Martin',              'cs',     'EMEA', true),
  ('rory',    'Rory Lawson',              'newbiz', 'EMEA', false),
  ('stephen', 'Steve Mackenzie',          'newbiz', 'EMEA', false),
  ('simon',   'Simon Bailie',             'newbiz', 'EMEA', false),
  ('matthew', 'Matthew Saward',           'newbiz', 'EMEA', false),
  ('paul',    'Paul Welch',               'newbiz', 'ZA',   false),
  ('mike',    'Mike Cawood',              'newbiz', 'ZA',   false)
on conflict (rep_id) do update
  set name = excluded.name, team_id = excluded.team_id,
      region = excluded.region, active = excluded.active;

-- ── 4. team_admins — team-scoped admin grants ──────────────────────────────
-- region is NOT NULL by construction: Q2 ratification ruled explicit
-- per-region rows with no null-region "all regions, present and future"
-- shortcut — scope changes must be a deliberate row insert, and a missing
-- region fails loud (admin can't see a rep and asks), never silent-expands.
create table if not exists public.team_admins (
  id      uuid primary key default gen_random_uuid(),
  auth_id uuid not null references auth.users(id) on delete cascade,
  team_id text not null references public.teams(id),
  region  text not null,
  unique (auth_id, team_id, region)
);

create index if not exists team_admins_auth_id_idx on public.team_admins (auth_id);

-- Covering indexes for the team_id FKs (advisor lint 0001; negligible today
-- at registry scale, free to keep clean).
create index if not exists reps_team_id_idx        on public.reps (team_id);
create index if not exists team_admins_team_id_idx on public.team_admins (team_id);

-- Seat Lara for CS×US and CS×EMEA (EMEA roster named by Jeff 2026-07-02,
-- closing Open Question 1). Inert until her users.role flips to
-- 'team_admin' (R1 ties the grant to the role label) — see DEPLOY.md
-- cutover ritual.
insert into public.team_admins (auth_id, team_id, region)
select u.auth_id, 'cs', v.region
from public.users u, (values ('US'), ('EMEA')) v(region)
where u.email = 'lkidd@mindtools.com'
on conflict (auth_id, team_id, region) do nothing;

-- ── 5. Registry RLS ────────────────────────────────────────────────────────
-- Phase 2's predicates join through reps/team_admins inside EXISTS
-- subqueries. RLS applies inside a policy's own subqueries, so a registry
-- table with RLS enabled and no read policy makes every subquery fail closed
-- and locks out every rep — including Lara. That constraint is what shapes
-- the policies below. No write policies on any registry table: provisioning
-- runs via SQL editor / service_role, which bypasses RLS.
--
-- ── 2026-07-28 audit hardening (issue #8) ─────────────────────────────────
-- `users`, `team_admins` and `reps` all shipped as `using (true)` reads, so
-- any signed-in rep could enumerate the whole org. Two of the three are
-- narrowed here; `reps` deliberately is not — see the note on that policy.
--
-- RECURSION: a policy on public.users cannot itself select from public.users
-- (Postgres raises "infinite recursion detected in policy for relation"),
-- and a users policy that reads team_admins whose own policy reads users is
-- the same cycle one hop out. The two SECURITY DEFINER helpers below are the
-- standard break: they run as the function owner and therefore bypass RLS,
-- so no policy expression below references an RLS-protected table directly.
-- Keep them SECURITY DEFINER, keep search_path pinned, and keep EXECUTE
-- revoked from PUBLIC.

alter table public.teams       enable row level security;
alter table public.reps        enable row level security;
alter table public.team_admins enable row level security;
alter table public.users       enable row level security;

-- ── 5a. RLS helper functions (SECURITY DEFINER — see RECURSION above) ─────
-- rbac_caller_role(): the calling user's users.role, or NULL when the JWT
-- has no users row (deleted user with a stale token → every branch false).
create or replace function public.rbac_caller_role()
  returns text
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select u.role from public.users u where u.auth_id = auth.uid() limit 1
$$;

-- rbac_caller_covers_rep(): true when the caller holds a team_admins row for
-- the given rep's (team, region) AND carries users.role = 'team_admin'.
-- This is ratification R1's role tie, identical to the inline EXISTS branch
-- every Phase 2 policy uses — a stray team_admins row grants nothing unless
-- the role label agrees.
create or replace function public.rbac_caller_covers_rep(p_rep_id text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_admins ta
    join public.users u on u.auth_id = ta.auth_id and u.role = 'team_admin'
    join public.reps  r on r.rep_id  = p_rep_id
    where ta.auth_id = auth.uid()
      and ta.team_id = r.team_id
      and ta.region  = r.region
  )
$$;

revoke all on function public.rbac_caller_role()             from public;
revoke all on function public.rbac_caller_covers_rep(text)   from public;
grant execute on function public.rbac_caller_role()           to authenticated;
grant execute on function public.rbac_caller_covers_rep(text) to authenticated;

-- ── 5b. teams — reference data, no personal information ───────────────────
drop policy if exists "authenticated read teams" on public.teams;
create policy "authenticated read teams"
  on public.teams for select to authenticated using (true);

-- ── 5c. reps — DELIBERATELY still readable by every authenticated user ────
-- Not an oversight (issue #8 named this table alongside users/team_admins).
-- Every team-scoped policy in db/migration-team-rbac-rls.sql resolves the
-- ROW's rep through `join public.reps r3 on r3.rep_id = <table>.rep_id`, and
-- RLS applies inside those subqueries: narrowing reps to the caller's own
-- team would make the covering-team-admin and same-team branches evaluate
-- against rows the caller cannot see, and every one of them would fail
-- closed. reps holds rep_id / name / team / region / active — roster facts
-- already shipped to every client in src/data-model.js REPS[] — so the read
-- is not a disclosure the client bundle doesn't already make. Narrowing it
-- requires routing every policy through a SECURITY DEFINER accessor first;
-- that is a separate change, not a one-line predicate edit.
drop policy if exists "authenticated read reps" on public.reps;
create policy "authenticated read reps"
  on public.reps for select to authenticated using (true);

-- ── 5d. team_admins — own rows, or manager ────────────────────────────────
-- Was `using (true)`: any rep could enumerate who administers which team and
-- region. Own-rows keeps every Phase 2 policy working (they all filter
-- `ta.auth_id = auth.uid()`) and keeps getMyUser's adminScopes query
-- (src/supabase-client.js, `.eq("auth_id", user.id)`) working unchanged.
--
-- The DO block drops EVERY pre-existing SELECT/ALL policy rather than a
-- hardcoded name list: the live database predates this file and permissive
-- policies OR together, so one unknown surviving `using (true)` name would
-- silently defeat the narrowing. Write policies (if any exist live) are left
-- alone — this migration is not in the business of granting writes.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'team_admins' and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.team_admins', pol.policyname);
  end loop;
end $$;

create policy "self or manager reads team_admins"
  on public.team_admins for select to authenticated
  using (
    team_admins.auth_id = (select auth.uid())
    or public.rbac_caller_role() = 'manager'
  );

-- ── 5e. users — self, manager, or covering team_admin ─────────────────────
-- Was `using (true)` to PUBLIC (anon included): any signed-in user could
-- read every colleague's email, role and rep_id. Now:
--   self      — the row whose auth_id is the caller's (this is the branch
--               every existing policy subquery relies on, and the one
--               getMyUser needs)
--   manager   — global bypass, unchanged from the rest of the RBAC model
--   covering  — a team_admin may read the users rows of reps inside her
--               (team, region) scope. Lara needs this: the read-only
--               onboarding view calls loadInductionStateFor(repId), which
--               resolves another rep's auth_id out of public.users
--               (src/supabase-client.js ~863). Without this branch that
--               view breaks for her while still working for Jeff.
-- Rows with rep_id NULL (managers, team admins) are covered by the self and
-- manager branches only — a team_admin cannot read another admin's row.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'users' and cmd in ('SELECT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.users', pol.policyname);
  end loop;
end $$;

create policy "self manager or covering admin reads users"
  on public.users for select to authenticated
  using (
    users.auth_id = (select auth.uid())
    or public.rbac_caller_role() = 'manager'
    or (users.rep_id is not null and public.rbac_caller_covers_rep(users.rep_id))
  );

grant select on public.teams, public.reps, public.team_admins, public.users to authenticated;
