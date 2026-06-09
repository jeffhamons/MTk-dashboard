-- ============================================================
-- Attainment detail RLS — scope deal-level detail to owner + manager
-- Run ONCE in Supabase → SQL Editor (project: MIndtools Dashboard
-- = tvdizqryowracmtjdskv).
--
-- WHY: migration-attainment-v2.sql shipped closed_won_deals and
-- renewal_book as "team-visible" (authenticated read USING (true)), so
-- every signed-in rep could read every other rep's named accounts and
-- dollar amounts. We tighten the two DETAIL tables to owner-or-manager.
--
-- The headline leaderboard stays team-visible on purpose:
--   • attainment_snapshot   — the %s + headline $ the board ranks on
--   • cs_quarterly_targets  — the denominator behind each CS headline %
-- Only the line-item detail (who closed which named account for how much)
-- is locked down.
--
-- Identity uses the EXISTING public.users table (auth_id = auth.uid(),
-- role, rep_id) — the same mechanism checks/asks/manager_notes already
-- use. No new table, no email parsing, no SECURITY DEFINER function.
-- Managers (role='manager') see all reps; a rep sees only their rep_id.
-- The nightly sync writes via the service_role key, which bypasses RLS,
-- so writes are unaffected. Idempotent: drop-then-create policies.
-- ============================================================

-- ── closed_won_deals — New Business deal stack ──────────────
drop policy if exists "authenticated read closed_won_deals" on closed_won_deals;
drop policy if exists "owner or manager read closed_won_deals" on closed_won_deals;
create policy "owner or manager read closed_won_deals"
  on closed_won_deals for select to authenticated
  using (
    exists (
      select 1 from users u
      where u.auth_id = auth.uid()
        and (u.role = 'manager' or u.rep_id = closed_won_deals.rep_id)
    )
  );

-- ── renewal_book — CS renewal book ──────────────────────────
drop policy if exists "authenticated read renewal_book" on renewal_book;
drop policy if exists "owner or manager read renewal_book" on renewal_book;
create policy "owner or manager read renewal_book"
  on renewal_book for select to authenticated
  using (
    exists (
      select 1 from users u
      where u.auth_id = auth.uid()
        and (u.role = 'manager' or u.rep_id = renewal_book.rep_id)
    )
  );
