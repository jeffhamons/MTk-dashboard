-- ============================================================
-- asks — TWO-KEY FLAG CLOSE
-- Run in Supabase → SQL Editor → New query → Run (idempotent).
--
-- DEPENDS ON db/migration-resolved-flags.sql (defines resolved_by_*) and the
-- asks RLS policies in db/migration-team-rbac-rls.sql. Per README "Schema and
-- Supabase authority", merging this file does NOT apply it — running it
-- against Supabase is a manual step.
--
-- The caller predicates below are INLINED rather than calling
-- public.rbac_caller_role() / rbac_caller_covers_rep(). Those helpers are
-- defined in db/migration-team-rbac-schema.sql but are NOT present in the
-- live database (checked 2026-08-16): the applied asks policies in
-- db/migration-team-rbac-rls.sql inline the same predicates, and this file
-- matches them branch for branch. Keeping it self-contained means applying
-- the two-key rule does not require applying that schema file first.
--
-- ── What changes ─────────────────────────────────────────────────────────
-- A flag used to close on one signature: whoever clicked "Resolved" stamped
-- resolved_at and the row left the open queue. That let a rep clear their own
-- escalation, and it let a manager close something the rep still considered
-- open. Closing now takes BOTH signatures — the rep who raised the flag and
-- the manager (or a covering team_admin) must each mark it resolved, in
-- either order. The flag stays open, and stays in the manager's queue, until
-- both are present.
--
-- resolved_at / resolved_by_* keep their exact old meaning: "this flag is
-- closed, as of this moment, and here is who cast the completing vote". That
-- is what keeps the existing Resolved log, its reopen action, and the
-- open-asks loader (`resolved_at is null`) working untouched. The two new
-- stamp sets record each side's vote independently, so the log can name both
-- signatories and say when each signed.
--
-- ── Exemption: onboarding access notes ───────────────────────────────────
-- Asks with deliverable_id like 'onboarding:%' are raised by a rep against
-- their own login/access checklist, not escalated at anyone. They keep the
-- one-signature close so a rep is never stuck waiting on a manager to clear
-- their own note. The trigger below encodes that exemption; the client mirror
-- is window.flagNeedsBothKeys in src/data-model.js.
-- ============================================================

alter table public.asks
  -- The rep's signature. Only the rep who owns the row may write these.
  add column if not exists rep_closed_at       timestamptz,
  add column if not exists rep_closed_by_email text,
  add column if not exists rep_closed_by_name  text,
  -- The manager's signature. Only a manager or a covering team_admin may
  -- write these; role records which of the two signed.
  add column if not exists mgr_closed_at       timestamptz,
  add column if not exists mgr_closed_by_email text,
  add column if not exists mgr_closed_by_name  text,
  add column if not exists mgr_closed_by_role  text;  -- 'manager' | 'team_admin'

-- ── Server-side enforcement ──────────────────────────────────────────────
-- RLS is row-level only: the write policies on public.asks let the owning rep
-- UPDATE their own row (correct — that is how they edit the ask body), and a
-- policy's USING/WITH CHECK cannot express "these columns may not change".
-- So the two-key rule needs a BEFORE trigger, the same tool and the same
-- reasoning as db/migration-asks-column-guard.sql, which guards the manager
-- reply columns on this table. This is a SECOND, independent trigger: the
-- column guard returns early for privileged callers, and here a manager must
-- NOT be waved through — a manager forging the rep's signature is exactly one
-- of the two failures this rule exists to prevent.
create or replace function public.asks_guard_two_key_close()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_privileged boolean;
  v_is_owner   boolean;
  v_two_key    boolean;
  v_old_rep    timestamptz;
  v_old_mgr    timestamptz;
  v_old_res    timestamptz;
begin
  -- No JWT subject = service_role, the SQL editor, or a migration. Those
  -- bypass RLS entirely by design, so the trigger defers to them too;
  -- otherwise this file would break every backfill and seed script.
  if auth.uid() is null then
    return new;
  end if;

  -- Manager-parity: the global manager, or a team_admin whose seat covers
  -- this rep's team AND region. Mirrors the "owner manager or admin update
  -- asks" policy branches 1 and 3.
  v_privileged := exists (
      select 1 from public.users u
      where u.auth_id = auth.uid() and u.role = 'manager'
    ) or exists (
      select 1
      from public.team_admins ta
      join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
      join public.reps  r3 on r3.rep_id  = new.rep_id
      where ta.auth_id = auth.uid()
        and ta.team_id = r3.team_id
        and ta.region  = r3.region
    );

  v_is_owner := exists (
    select 1 from public.users u
    where u.auth_id = auth.uid() and u.rep_id = new.rep_id
  );

  -- Onboarding access notes keep the one-signature close (see header).
  v_two_key := new.deliverable_id not like 'onboarding:%';

  if tg_op = 'INSERT' then
    v_old_rep := null; v_old_mgr := null; v_old_res := null;
  else
    v_old_rep := old.rep_closed_at; v_old_mgr := old.mgr_closed_at;
    v_old_res := old.resolved_at;
  end if;

  -- ── Each side may only sign for itself ─────────────────────────────────
  -- `is distinct from` (not `<>`) so a NULL→value or value→NULL transition is
  -- caught; `x <> y` is NULL, not true, when either side is NULL.
  if (new.rep_closed_at       is distinct from v_old_rep
   or new.rep_closed_by_email is distinct from (case when tg_op = 'INSERT' then null else old.rep_closed_by_email end)
   or new.rep_closed_by_name  is distinct from (case when tg_op = 'INSERT' then null else old.rep_closed_by_name  end))
  then
    -- A manager clearing the whole row (reopen, or the rep re-raising) resets
    -- both signatures to NULL; that is a withdrawal, not a forgery, so it is
    -- allowed. Setting the rep's signature is not.
    if new.rep_closed_at is not null and not v_is_owner then
      raise exception
        'asks: only the rep who raised this flag may mark it resolved on their side'
        using errcode = '42501';
    end if;
    if new.rep_closed_at is null and not (v_is_owner or v_privileged) then
      raise exception
        'asks: not allowed to withdraw this flag''s rep signature'
        using errcode = '42501';
    end if;
  end if;

  if (new.mgr_closed_at       is distinct from v_old_mgr
   or new.mgr_closed_by_email is distinct from (case when tg_op = 'INSERT' then null else old.mgr_closed_by_email end)
   or new.mgr_closed_by_name  is distinct from (case when tg_op = 'INSERT' then null else old.mgr_closed_by_name  end)
   or new.mgr_closed_by_role  is distinct from (case when tg_op = 'INSERT' then null else old.mgr_closed_by_role  end))
  then
    if new.mgr_closed_at is not null and not v_privileged then
      raise exception
        'asks: only a manager or a covering team admin may sign off on closing a flag'
        using errcode = '42501';
    end if;
    if new.mgr_closed_at is null and not (v_is_owner or v_privileged) then
      raise exception
        'asks: not allowed to withdraw this flag''s manager signature'
        using errcode = '42501';
    end if;
  end if;

  -- ── The rule itself: a close needs both signatures ─────────────────────
  -- Checked on the transition to closed only, so rows resolved before this
  -- migration (one signature, no vote stamps) stay valid history and can
  -- still be reopened.
  if v_two_key
     and new.resolved_at is not null
     and v_old_res is null
     and (new.rep_closed_at is null or new.mgr_closed_at is null)
  then
    raise exception
      'asks: a flag closes only when both the rep and the manager have marked it resolved'
      using errcode = '42501';
  end if;

  return new;
end $$;

revoke all on function public.asks_guard_two_key_close() from public;

drop trigger if exists asks_guard_two_key_close_ins on public.asks;
drop trigger if exists asks_guard_two_key_close_upd on public.asks;

create trigger asks_guard_two_key_close_ins
  before insert on public.asks
  for each row execute function public.asks_guard_two_key_close();

create trigger asks_guard_two_key_close_upd
  before update on public.asks
  for each row execute function public.asks_guard_two_key_close();
