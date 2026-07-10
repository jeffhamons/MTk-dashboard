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
  ('stephen', 'Stephen Mackenzie',        'newbiz', 'EMEA', false),
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

-- ── 5. Registry RLS: authenticated-read-all, writes fail closed ────────────
-- Phase 2's predicates join through reps/team_admins inside EXISTS
-- subqueries. If either table had RLS enabled with no read policy, every
-- subquery would fail closed and lock out every rep — including Lara —
-- exactly the way an un-policied users table would break the precedent
-- migrations' EXISTS(... from users ...) checks. Mirrors public.users'
-- "authenticated can read all". No write policies: provisioning runs via
-- SQL editor / service_role, which bypasses RLS.
alter table public.teams       enable row level security;
alter table public.reps        enable row level security;
alter table public.team_admins enable row level security;

drop policy if exists "authenticated read teams" on public.teams;
create policy "authenticated read teams"
  on public.teams for select to authenticated using (true);

drop policy if exists "authenticated read reps" on public.reps;
create policy "authenticated read reps"
  on public.reps for select to authenticated using (true);

drop policy if exists "authenticated read team_admins" on public.team_admins;
create policy "authenticated read team_admins"
  on public.team_admins for select to authenticated using (true);

grant select on public.teams, public.reps, public.team_admins to authenticated;
