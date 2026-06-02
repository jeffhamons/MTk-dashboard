-- ============================================================
-- Membership-gate RLS on checks / asks / wins
-- APPLIED to project tvdizqryowracmtjdskv on 2026-06-02 as Supabase migration
-- `membership_gate_checks_asks_wins_rls` (verified vs live schema: anon and a
-- deleted user's stale JWT both read 0 rows; a legit member reads all; anon
-- write blocked). This file is the in-repo record of that applied change.
-- Idempotent — safe to re-run in Supabase → SQL Editor.
-- ============================================================
-- WHY: the embedded Supabase anon key lives in the public JS bundle, so anyone
-- who ever loaded the dashboard holds it. `checks`/`asks` previously had
-- `anyone can ...` PERMISSIVE policies (qual/with_check = true, role public)
-- granting that anon key full anonymous CRUD, and `wins` allowed anonymous read.
-- The magic-link login wall was therefore only a UI gate, not a data gate:
-- deleting a user's account (or rotating the JWT secret) did NOT cut them off
-- from these tables as long as they had the anon key. This makes access require
-- membership — an existing public.users row for the caller — enforced server-side.
--
-- Linkage (verified against the live schema, NOT assumed):
--   - auth.uid() is a uuid; it maps to public.users via the **auth_id** column.
--   - public.users RLS ("authenticated can read all") lets the EXISTS subquery
--     resolve for any signed-in user, so inlining it here does not recurse
--     (the gated tables are checks/asks/wins, never users itself).
--   - anon has no auth.uid() -> EXISTS is false -> denied.
--   - a deleted user (auth.users row gone, public.users row cascaded away) has a
--     stale JWT whose sub no longer matches any users row -> EXISTS false -> denied.
--
-- BEHAVIOR PRESERVED: any signed-in member may still read/write team checks & asks
-- (the prior `anyone can ...` policies already allowed any caller; this only
-- removes anon + non-members). wins write-rules (own/manager, see
-- migration-wins-rls-harden.sql) are untouched — only its SELECT is tightened.
--
-- NOTE: this intentionally reverses the "Read (SELECT) is intentionally left
-- permissive — the leaderboard is shared-visible" decision in
-- migration-wins-rls-harden.sql. "Shared-visible" meant visible to the team;
-- authenticated members still see everything. The only thing removed is the
-- anonymous (anon-key) read, which the app never relies on (all reads run
-- post-auth in supabase-client.js loadStateFromSupabase / wins loaders).
--
-- OUT OF SCOPE (accepted residual): standup_entries / attainment_snapshot / users
-- reads remain gated only on auth.role() = 'authenticated', so a deleted user's
-- stale JWT can still read those three until it self-expires (<=60 min). Tighten
-- in a follow-up if a hard, instant, total cutoff is ever required.

-- ===== checks =====
drop policy if exists "anyone can read checks"   on public.checks;
drop policy if exists "team reads checks"        on public.checks;
drop policy if exists "anyone can write checks"  on public.checks;
drop policy if exists "edit own checks"          on public.checks;
drop policy if exists "anyone can update checks" on public.checks;
drop policy if exists "update own checks"        on public.checks;
drop policy if exists "anyone can delete checks" on public.checks;
drop policy if exists "delete own checks"        on public.checks;
drop policy if exists "members read checks"      on public.checks;
drop policy if exists "members insert checks"    on public.checks;
drop policy if exists "members update checks"    on public.checks;
drop policy if exists "members delete checks"    on public.checks;

create policy "members read checks"   on public.checks for select to authenticated
  using (exists (select 1 from public.users u where u.auth_id = auth.uid()));
create policy "members insert checks" on public.checks for insert to authenticated
  with check (exists (select 1 from public.users u where u.auth_id = auth.uid()));
create policy "members update checks" on public.checks for update to authenticated
  using      (exists (select 1 from public.users u where u.auth_id = auth.uid()))
  with check (exists (select 1 from public.users u where u.auth_id = auth.uid()));
create policy "members delete checks" on public.checks for delete to authenticated
  using (exists (select 1 from public.users u where u.auth_id = auth.uid()));

-- ===== asks =====
drop policy if exists "anyone can read asks"      on public.asks;
drop policy if exists "team reads asks"           on public.asks;
drop policy if exists "anyone can write asks"     on public.asks;
drop policy if exists "edit own asks"             on public.asks;
drop policy if exists "anyone can update asks"    on public.asks;
drop policy if exists "asks: managers can update" on public.asks;
drop policy if exists "update own asks"           on public.asks;
drop policy if exists "anyone can delete asks"    on public.asks;
drop policy if exists "delete own asks"           on public.asks;
drop policy if exists "members read asks"         on public.asks;
drop policy if exists "members insert asks"       on public.asks;
drop policy if exists "members update asks"       on public.asks;
drop policy if exists "members delete asks"       on public.asks;

create policy "members read asks"   on public.asks for select to authenticated
  using (exists (select 1 from public.users u where u.auth_id = auth.uid()));
create policy "members insert asks" on public.asks for insert to authenticated
  with check (exists (select 1 from public.users u where u.auth_id = auth.uid()));
create policy "members update asks" on public.asks for update to authenticated
  using      (exists (select 1 from public.users u where u.auth_id = auth.uid()))
  with check (exists (select 1 from public.users u where u.auth_id = auth.uid()));
create policy "members delete asks" on public.asks for delete to authenticated
  using (exists (select 1 from public.users u where u.auth_id = auth.uid()));

-- ===== wins (only the public read was a hole; writes already own/manager-gated) =====
drop policy if exists "anyone can read wins" on public.wins;
drop policy if exists "members read wins"    on public.wins;
create policy "members read wins" on public.wins for select to authenticated
  using (exists (select 1 from public.users u where u.auth_id = auth.uid()));
