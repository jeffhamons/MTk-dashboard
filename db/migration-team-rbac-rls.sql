-- ============================================================
-- RFC-151 Phase 2 — team-scoped RLS isolation (critical path)
-- Target: Supabase project tvdizqryowracmtjdskv (MIndtools Dashboard).
-- Requires: migration-team-rbac-schema.sql (Phase 1 registry) applied first.
-- Idempotent — safe to re-run in Supabase → SQL Editor.
-- Verified by: db/test-team-rbac-rls.sql (run RED before, GREEN after).
--
-- Implements the RFC's binding "Post-grill amendment": THREE grains, not
-- the original single generalized predicate (which would have leaked
-- standup_entries and re-opened the closed_won_deals/renewal_book
-- owner-only lockdown):
--
--   TEAM-SHARED READ   checks, asks, wins, standup_entries,
--                      attainment_snapshot, cs_quarterly_targets
--                      → manager OR same-team OR covering team_admin
--   OWNER-SCOPED READ  closed_won_deals, renewal_book
--                      → manager OR owner OR covering team_admin
--                        (NO same-team branch — reps never see a peer's
--                        named-account dollar detail, even same-team)
--   MANAGER/ADMIN ONLY manager_notes (read + write)
--                      → manager OR covering team_admin
--                        (no owner branch: notes about a rep stay closed
--                        to that rep)
--   OWNER-WRITE        checks, asks, wins, standup_entries (ins/upd/del)
--                      → manager OR owner OR covering team_admin
--                        This TIGHTENS NA BD on purpose (Jeff's grill
--                        ruling): peer-to-peer marking goes away; self-,
--                        manager- and covering-admin-marking remain.
--
-- Branch definitions (every team-admin branch carries ratification R1's
-- role tie — a stray team_admins row grants NOTHING unless users.role is
-- also 'team_admin', so label and grant cannot silently diverge):
--   manager   caller has users.role = 'manager'            (global bypass)
--   same-team caller's rep and the row's rep share reps.team_id
--   owner     caller's users.rep_id equals the row's rep_id
--   covering  a team_admins row (caller, row-rep's team, row-rep's region)
--             exists AND caller's users.role = 'team_admin'
--
-- All auth.uid() calls are wrapped in (select ...) — evaluated once per
-- statement (initplan), not per row. Registry lookups are PK/indexed.
--
-- Deliberate behavior notes, verified against live data (2026-07-02):
--   • standup_entries holds 9 rows with rep_id = 'manager' — Jeff's own
--     standup cells (standup.jsx writes managers under that pseudo-id).
--     The standup SELECT policy carries an explicit rep_id = 'manager'
--     branch so every member keeps seeing them; the write predicate does
--     NOT (no user has rep_id='manager'), so only the manager bypass can
--     write them. Without this branch Jeff's cells would silently vanish
--     from every rep's standup grid.
--   • closed_won_deals/renewal_book each carried a STALE permissive
--     "authenticated read …" (qual=true) policy alongside the newer
--     owner-or-manager policy. Permissive policies OR together, so the
--     owner-only lockdown from migration-attainment-detail-rls.sql was
--     DEFEATED live (both tables happened to be empty, so nothing actually
--     leaked). This migration drops the stale pair for good.
--   • A users row with role='rep' and rep_id NULL (or a rep_id absent from
--     public.reps) now reads NOTHING team-shared (previously: everything).
--     No such live user exists; the parity guard keeps reps complete.
--   • A deleted user's stale JWT (no users row) fails every branch —
--     the membership-gate property is preserved and extended to the
--     standup/attainment tables it previously excluded.
--   • wins/standup write policies move from `to public` to
--     `to authenticated` — anon never had a valid path through them.
-- ============================================================

-- ═══════════════════════ checks ═══════════════════════
drop policy if exists "members read checks"   on public.checks;
drop policy if exists "members insert checks" on public.checks;
drop policy if exists "members update checks" on public.checks;
drop policy if exists "members delete checks" on public.checks;
drop policy if exists "team reads checks"                  on public.checks;
drop policy if exists "owner manager or admin insert checks" on public.checks;
drop policy if exists "owner manager or admin update checks" on public.checks;
drop policy if exists "owner manager or admin delete checks" on public.checks;

create policy "team reads checks" on public.checks for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.reps r
               join public.users u2 on u2.auth_id = (select auth.uid())
               join public.reps r2 on r2.rep_id = u2.rep_id
               where r.rep_id = checks.rep_id and r.team_id = r2.team_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = checks.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin insert checks" on public.checks for insert to authenticated
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = checks.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = checks.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin update checks" on public.checks for update to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = checks.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = checks.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  )
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = checks.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = checks.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin delete checks" on public.checks for delete to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = checks.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = checks.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

-- ═══════════════════════ asks ═══════════════════════
drop policy if exists "members read asks"   on public.asks;
drop policy if exists "members insert asks" on public.asks;
drop policy if exists "members update asks" on public.asks;
drop policy if exists "members delete asks" on public.asks;
drop policy if exists "team reads asks"                    on public.asks;
drop policy if exists "owner manager or admin insert asks" on public.asks;
drop policy if exists "owner manager or admin update asks" on public.asks;
drop policy if exists "owner manager or admin delete asks" on public.asks;

create policy "team reads asks" on public.asks for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.reps r
               join public.users u2 on u2.auth_id = (select auth.uid())
               join public.reps r2 on r2.rep_id = u2.rep_id
               where r.rep_id = asks.rep_id and r.team_id = r2.team_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = asks.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin insert asks" on public.asks for insert to authenticated
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = asks.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = asks.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin update asks" on public.asks for update to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = asks.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = asks.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  )
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = asks.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = asks.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin delete asks" on public.asks for delete to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = asks.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = asks.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

-- ═══════════════════════ wins ═══════════════════════
drop policy if exists "members read wins"     on public.wins;
drop policy if exists "users insert own wins" on public.wins;
drop policy if exists "users update own wins" on public.wins;
drop policy if exists "users delete own wins" on public.wins;
drop policy if exists "team reads wins"                    on public.wins;
drop policy if exists "owner manager or admin insert wins" on public.wins;
drop policy if exists "owner manager or admin update wins" on public.wins;
drop policy if exists "owner manager or admin delete wins" on public.wins;

create policy "team reads wins" on public.wins for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.reps r
               join public.users u2 on u2.auth_id = (select auth.uid())
               join public.reps r2 on r2.rep_id = u2.rep_id
               where r.rep_id = wins.rep_id and r.team_id = r2.team_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = wins.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin insert wins" on public.wins for insert to authenticated
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = wins.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = wins.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin update wins" on public.wins for update to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = wins.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = wins.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  )
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = wins.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = wins.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin delete wins" on public.wins for delete to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = wins.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = wins.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

-- ═══════════════════════ standup_entries ═══════════════════════
drop policy if exists "read all standup entries"           on public.standup_entries;
drop policy if exists "rep writes own; manager writes any" on public.standup_entries;
drop policy if exists "team reads standup entries"                    on public.standup_entries;
drop policy if exists "owner manager or admin insert standup entries" on public.standup_entries;
drop policy if exists "owner manager or admin update standup entries" on public.standup_entries;
drop policy if exists "owner manager or admin delete standup entries" on public.standup_entries;

-- Read carries the extra rep_id='manager' branch (Jeff's shared standup
-- cells — see header). Team-shared otherwise.
create policy "team reads standup entries" on public.standup_entries for select to authenticated
  using (
    standup_entries.rep_id = 'manager'
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.reps r
               join public.users u2 on u2.auth_id = (select auth.uid())
               join public.reps r2 on r2.rep_id = u2.rep_id
               where r.rep_id = standup_entries.rep_id and r.team_id = r2.team_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = standup_entries.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin insert standup entries" on public.standup_entries for insert to authenticated
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = standup_entries.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = standup_entries.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin update standup entries" on public.standup_entries for update to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = standup_entries.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = standup_entries.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  )
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = standup_entries.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = standup_entries.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "owner manager or admin delete standup entries" on public.standup_entries for delete to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = standup_entries.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = standup_entries.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

-- ═══════════════════════ attainment_snapshot ═══════════════════════
-- Read: team-shared (headline leaderboard stays team-visible WITHIN a team).
-- Writes: no policies — the nightly sync writes via service_role (bypasses
-- RLS); everyone else fails closed. Unchanged from live behavior.
drop policy if exists "authenticated users can read attainment" on public.attainment_snapshot;
drop policy if exists "team reads attainment" on public.attainment_snapshot;

create policy "team reads attainment" on public.attainment_snapshot for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.reps r
               join public.users u2 on u2.auth_id = (select auth.uid())
               join public.reps r2 on r2.rep_id = u2.rep_id
               where r.rep_id = attainment_snapshot.rep_id and r.team_id = r2.team_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = attainment_snapshot.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

-- ═══════════════════════ cs_quarterly_targets ═══════════════════════
drop policy if exists "authenticated read cs_quarterly_targets" on public.cs_quarterly_targets;
drop policy if exists "team reads cs_quarterly_targets" on public.cs_quarterly_targets;

create policy "team reads cs_quarterly_targets" on public.cs_quarterly_targets for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.reps r
               join public.users u2 on u2.auth_id = (select auth.uid())
               join public.reps r2 on r2.rep_id = u2.rep_id
               where r.rep_id = cs_quarterly_targets.rep_id and r.team_id = r2.team_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = cs_quarterly_targets.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

-- ═══════════════════════ closed_won_deals (owner-scoped detail) ═══════════
-- Drops the STALE qual=true policy that was silently defeating the
-- owner-only lockdown (permissive policies OR together). NO same-team
-- branch — deliberate, per the amendment and the original
-- migration-attainment-detail-rls.sql intent.
drop policy if exists "authenticated read closed_won_deals"    on public.closed_won_deals;
drop policy if exists "owner or manager read closed_won_deals" on public.closed_won_deals;
drop policy if exists "owner manager or admin read closed_won_deals" on public.closed_won_deals;

create policy "owner manager or admin read closed_won_deals" on public.closed_won_deals for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = closed_won_deals.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = closed_won_deals.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

-- ═══════════════════════ renewal_book (owner-scoped detail) ═══════════════
drop policy if exists "authenticated read renewal_book"    on public.renewal_book;
drop policy if exists "owner or manager read renewal_book" on public.renewal_book;
drop policy if exists "owner manager or admin read renewal_book" on public.renewal_book;

create policy "owner manager or admin read renewal_book" on public.renewal_book for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               where u.auth_id = (select auth.uid()) and u.rep_id = renewal_book.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = renewal_book.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

-- ═══════════════════════ manager_notes (manager/covering-admin only) ══════
-- Amendment D: live policy was manager-only — a parity gap, not a leak
-- (without a team_admin branch Lara couldn't read her own team's notes).
-- Adds the covering-admin branch to read AND write; stays closed to plain
-- reps — including the rep the note is ABOUT.
-- Write policies are per-command (insert/update/delete), NOT `for all` —
-- a `for all` policy also applies to SELECT and would stack a second
-- permissive SELECT policy (the multiple_permissive_policies advisor lint
-- the old managers-read + managers-write-ALL pair already tripped).
drop policy if exists "managers read manager_notes"  on public.manager_notes;
drop policy if exists "managers write manager_notes" on public.manager_notes;
drop policy if exists "manager or team admin reads manager_notes"   on public.manager_notes;
drop policy if exists "manager or team admin writes manager_notes"  on public.manager_notes;
drop policy if exists "manager or team admin inserts manager_notes" on public.manager_notes;
drop policy if exists "manager or team admin updates manager_notes" on public.manager_notes;
drop policy if exists "manager or team admin deletes manager_notes" on public.manager_notes;

create policy "manager or team admin reads manager_notes" on public.manager_notes for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = manager_notes.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "manager or team admin inserts manager_notes" on public.manager_notes for insert to authenticated
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = manager_notes.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "manager or team admin updates manager_notes" on public.manager_notes for update to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = manager_notes.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  )
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = manager_notes.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

create policy "manager or team admin deletes manager_notes" on public.manager_notes for delete to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = manager_notes.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );

-- ── 2026-07-10 roster upsert (parity source for tests/test_rfc151_reps_parity.py)
-- One row per data-model.js REPS[] entry (26 as of 2026-07-10).
-- active=false mirrors departed reps (activeThrough) and emit:false stubs;
-- EMEA BD (rory/stephen/simon/matthew/paul/mike) activated 2026-07-10;
-- APAC BD + CS activated 2026-07-10; stuart remains emit:false (active false).
-- paul/mike rehomed ZA→EMEA (RFC-152 D1).
-- OPS: live public.reps needs the same upsert (ops step, issue #4369).
insert into public.reps (rep_id, name, team_id, region, active) values
  ('cammy',   'Cammy Bean',               'newbiz', 'US',   true),
  ('brenda',  'Brenda Bravener-Greville', 'newbiz', 'US',   false),
  ('farah',   'Farah Issa',               'newbiz', 'US',   true),
  ('don',     'Don Hazelwood',            'newbiz', 'US',   true),
  ('dwayne',  'Dwayne Haskell',           'cs',     'US',   true),
  ('meri',    'Meri Tosh',                'cs',     'US',   true),
  -- EMEA CS (Lara's team).
  ('laura',   'Laura Blackmore',          'cs',     'EMEA', true),
  ('owen',    'Owen Bolding',             'cs',     'EMEA', true),
  ('james',   'James Brooke',             'cs',     'EMEA', true),
  ('rowan',   'Rowan Donoghue',           'cs',     'EMEA', true),
  ('alex',    'Alex Martin',              'cs',     'EMEA', true),
  -- EMEA BD activated 2026-07-10 (join weekly rhythm; targets later).
  ('rory',    'Rory Lawson',              'newbiz', 'EMEA', true),
  ('stephen', 'Stephen Mackenzie',        'newbiz', 'EMEA', true),
  ('simon',   'Simon Bailie',             'newbiz', 'EMEA', true),
  ('matthew', 'Matthew Saward',           'newbiz', 'EMEA', true),
  -- paul/mike rehomed ZA→EMEA (RFC-152 D1) and activated 2026-07-10.
  ('paul',    'Paul Welch',               'newbiz', 'EMEA', true),
  ('mike',    'Mike Cawood',              'newbiz', 'EMEA', true),
  -- EMEA BD stub — starts 7/13; active=false mirrors emit:false.
  ('stuart',  'Stuart Chadwick',          'newbiz', 'EMEA', false),
  -- APAC BD — activated 2026-07-10.
  ('dourlay', 'Paul Dourlay',             'newbiz', 'APAC', true),
  ('andrew',  'Andrew Bennett',           'newbiz', 'APAC', true),
  ('annum',   'Annum Sikander',           'newbiz', 'APAC', true),
  -- APAC CS — activated 2026-07-10.
  ('angela',  'Angela Beck',              'cs',     'APAC', true),
  ('sarah',   'Sarah Flynn',              'cs',     'APAC', true),
  ('aaron',   'Aaron Mathew',             'cs',     'APAC', true),
  ('suzanne', 'Suzanne Grennan',          'cs',     'APAC', true),
  ('cindy',   'Cindy Nguyen',             'cs',     'APAC', true)
on conflict (rep_id) do update
  set name = excluded.name, team_id = excluded.team_id,
      region = excluded.region, active = excluded.active;
