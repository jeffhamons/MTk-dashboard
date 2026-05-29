-- ============================================================
-- Weekly Wins RLS Hardening — enforce rep-ownership for edits + deletes (F45 / #1224)
-- Run in Supabase → SQL Editor → New query → Run (idempotent).
-- APPLIED to project tvdizqryowracmtjdskv on 2026-05-29 (verified vs live schema).
-- 2026-05-29 follow-up: DELETE also hardened to rep-ownership (was the permissive
-- "anyone can delete wins"); applied to live + advisor-verified — public.wins now
-- has zero permissive-RLS lints.
-- ============================================================
-- Prevents a signed-in user from inserting/updating/deleting a wins row for a rep
-- that isn't theirs (the client-side canEdit gate in wins-form.jsx is the first
-- line; this is server-side defense-in-depth).
--
-- Linkage (verified against the live schema, NOT assumed):
--   - auth.uid() is a uuid; it maps to public.users via the **auth_id** column,
--     NOT users.id (which is a separate uuid PK — auth.uid() never equals it).
--   - public.users.rep_id is text and matches public.wins.rep_id (text).
--   - A manager (role='manager') may edit any row; their rep_id is NULL, so the
--     manager branch — not the ownership branch — is what grants them.
--   - An unmapped non-manager (rep_id NULL) is denied (NULL = rep_id → NULL).
--   - public.users RLS is "authenticated can read all", so the subqueries below
--     resolve for any signed-in user.
--
-- Read (SELECT) is intentionally left permissive ("anyone can read wins") — the
-- leaderboard is shared-visible. DELETE is now ownership-enforced below (mirrors
-- UPDATE): a manager or the owning rep may delete; cross-rep deletes are blocked.

-- Idempotent: drop the old permissive policies and any prior attempt's names.
drop policy if exists "anyone can insert wins" on public.wins;
drop policy if exists "anyone can update wins" on public.wins;
drop policy if exists "users can only edit own wins" on public.wins;
drop policy if exists "users insert own wins" on public.wins;
drop policy if exists "users update own wins" on public.wins;
drop policy if exists "anyone can delete wins" on public.wins;
drop policy if exists "users delete own wins" on public.wins;

create policy "users insert own wins" on public.wins for insert
  with check (
    auth.uid() in (select auth_id from public.users where role = 'manager')
    or (select rep_id from public.users where auth_id = auth.uid()) = rep_id
  );

create policy "users update own wins" on public.wins for update
  using (
    auth.uid() in (select auth_id from public.users where role = 'manager')
    or (select rep_id from public.users where auth_id = auth.uid()) = rep_id
  )
  with check (
    auth.uid() in (select auth_id from public.users where role = 'manager')
    or (select rep_id from public.users where auth_id = auth.uid()) = rep_id
  );

-- DELETE: mirror the UPDATE ownership rule (DELETE has no WITH CHECK clause).
-- The "anyone can read wins" SELECT policy lets DELETE locate rows, so this
-- enforces — rather than silently no-ops — the ownership constraint.
create policy "users delete own wins" on public.wins for delete
  using (
    auth.uid() in (select auth_id from public.users where role = 'manager')
    or (select rep_id from public.users where auth_id = auth.uid()) = rep_id
  );
