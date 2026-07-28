-- ============================================================
-- expansion_book — CS expansion deal feed (RFC-158 Phase 2, OQ4)
-- Run ONCE in Supabase → SQL Editor (project: MIndtools Dashboard
-- = tvdizqryowracmtjdskv) BEFORE the nightly sync first writes.
-- Idempotent: CREATE TABLE IF NOT EXISTS + drop-then-create policy.
--
-- Mirrors renewal_book in migration-attainment-v2.sql: a sync-written
-- (replace_table) feed table carrying the current quarter's expansion
-- deals (Upsell + Expansion + folded unknown-type-on-CS-rep). Written
-- nightly by agents/sf_attainment_sync.py :: build_expansion_book +
-- replace_table('expansion_book', ...). Completed quarters are
-- archived in cs_deal_book_final (migration-deal-book-final.sql); the
-- current quarter stays live here and is full-replaced each night.
--
-- No FKs to judgment tables (RFC-158 A4): account-name cross-reference
-- is best-effort, display-only.
-- ============================================================

create table if not exists expansion_book (
  id          bigint generated always as identity primary key,
  rep_id      text not null,                       -- dwayne, meri, lara, ...
  account     text not null,
  amount      numeric not null,                    -- expansion ARR / TCV closed-won
  close_date  date not null,
  product     text,                                -- nullable (ledger carries no product yet; decision-6 upstream)
  synced_at   timestamptz not null default now()
);
create index if not exists eb_rep_date_idx on expansion_book (rep_id, close_date);

-- ============================================================
-- RLS — OWNER-SCOPED read grain, matching renewal_book /
-- closed_won_deals in migration-team-rbac-rls.sql. Writes use the
-- service key (bypasses RLS); no write policy needed.
--
-- SECURITY (issue #5): this table shipped with
--   `for select to authenticated using (true)`
-- which let ANY signed-in user read every rep's named-account expansion
-- detail — cross-team and cross-region. expansion_book carries the same
-- named-account dollar grain as renewal_book, so it gets renewal_book's
-- predicate verbatim: manager OR owner OR covering team_admin. There is
-- deliberately NO same-team branch — reps never see a peer's named-account
-- dollar detail, even on their own team (RFC-151 post-grill amendment).
--
-- The owner branch additionally requires reps.active (issue #9): a
-- deactivated rep loses access to their own book, they do not keep it.
-- ============================================================
alter table expansion_book enable row level security;

drop policy if exists "authenticated read expansion_book"        on expansion_book;
drop policy if exists "owner manager or admin read expansion_book" on expansion_book;

create policy "owner manager or admin read expansion_book"
  on public.expansion_book for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               join public.reps ro on ro.rep_id = u.rep_id and ro.active
               where u.auth_id = (select auth.uid()) and u.rep_id = expansion_book.rep_id)
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               join public.reps r3 on r3.rep_id = expansion_book.rep_id
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = r3.team_id and ta.region = r3.region)
  );
