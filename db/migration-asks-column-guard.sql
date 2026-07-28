-- ============================================================
-- asks — COLUMN-level protection for manager-owned fields (issue #10)
-- Run in Supabase → SQL Editor → New query → Run (idempotent).
--
-- DEPENDS ON db/migration-team-rbac-schema.sql (defines
-- public.rbac_caller_role() and public.rbac_caller_covers_rep()). Apply that
-- file first. Per README "Schema and Supabase authority", merging this file
-- does NOT apply it — running it against Supabase is a manual step.
--
-- ── The hole this closes ─────────────────────────────────────────────────
-- Postgres RLS is row-level only. The write policies on public.asks let the
-- owning rep UPDATE their own ask row — which is correct for the ask body,
-- and wrong for the four manager-reply columns that live on the SAME row:
--
--     response, response_by_email, response_by_name, response_at
--
-- Nothing stopped a rep from PATCHing `response = 'Approved — go ahead'` and
-- `response_by_name = 'Jeff Hamons'` onto their own ask and having the UI
-- render it as a manager's reply. db/0002_ask_responses.sql anticipated this
-- ("this policy adds manager-write for the response columns only") but the
-- policy was left commented out, and a policy could not have enforced it
-- anyway: USING/WITH CHECK cannot express "these columns may not change".
-- src/supabase-client.js setAskResponseSupabase carries the comment "manager
-- only; RLS enforces" — before this trigger, that comment was false.
--
-- A BEFORE trigger is the right tool: it sees OLD and NEW and can compare
-- them column by column, which is exactly what RLS cannot do. Chosen over a
-- SECURITY DEFINER RPC because an RPC only protects callers who use it —
-- PostgREST would still accept a direct PATCH to the table. The trigger
-- fires on every write path (client PATCH, upsert-on-conflict, psql), so
-- there is no route around it short of service_role.
--
-- ── What ordinary reps may still do ──────────────────────────────────────
-- resolved_at is deliberately NOT frozen. Reps legitimately self-resolve
-- their own ask (setAskSupabase stamps resolved_at + resolved_by_*) and
-- re-raise it (the upsert clears them back to NULL). Freezing resolved_at
-- would break the primary rep workflow. What is guarded instead is the
-- ATTRIBUTION: a rep may stamp a resolution as themselves ('rep', their own
-- email) but may not sign it as a manager or as a colleague. That is the
-- forgery the issue is about; who closed their own flag is not.
-- ============================================================

create or replace function public.asks_guard_privileged_columns()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_privileged boolean;
  v_email      text;
begin
  -- No JWT subject = service_role, the SQL editor, or a migration. Those
  -- bypass RLS entirely by design, so the trigger defers to them too;
  -- otherwise this file would break every backfill and seed script. The
  -- `anon` role also has no uid, but anon holds no write policy on
  -- public.asks, so it can never reach this trigger.
  if auth.uid() is null then
    return new;
  end if;

  v_privileged :=
    public.rbac_caller_role() = 'manager'
    or public.rbac_caller_covers_rep(new.rep_id);

  if v_privileged then
    return new;
  end if;

  -- Caller's own identity, resolved through the users registry (this
  -- function is SECURITY DEFINER, so the narrowed users SELECT policy from
  -- issue #8 does not hide the row from it). Falls back to the JWT email
  -- claim for a signed-in user with no users row.
  select lower(u.email) into v_email
  from public.users u where u.auth_id = auth.uid() limit 1;
  v_email := coalesce(v_email, lower(auth.email()));

  -- ── Manager reply columns: frozen ──────────────────────────────────────
  -- `is distinct from` (not `<>`) so a NULL→value or value→NULL transition
  -- is caught; `x <> y` is NULL, not true, when either side is NULL, and a
  -- NULL guard silently passes.
  if tg_op = 'INSERT' then
    if new.response          is not null
    or new.response_by_email is not null
    or new.response_by_name  is not null
    or new.response_at       is not null then
      raise exception
        'asks: only a manager or a covering team admin may write the response columns'
        using errcode = '42501';
    end if;
  else
    if new.response          is distinct from old.response
    or new.response_by_email is distinct from old.response_by_email
    or new.response_by_name  is distinct from old.response_by_name
    or new.response_at       is distinct from old.response_at then
      raise exception
        'asks: only a manager or a covering team admin may change the response columns'
        using errcode = '42501';
    end if;
  end if;

  -- ── Resolution attribution: may only be signed as yourself ─────────────
  if new.resolved_by_role is not null and new.resolved_by_role <> 'rep' then
    raise exception
      'asks: only a manager or a covering team admin may record a resolution as %',
      new.resolved_by_role
      using errcode = '42501';
  end if;

  if new.resolved_by_email is not null
     and lower(new.resolved_by_email) is distinct from v_email then
    raise exception
      'asks: a rep may only record a resolution under their own email'
      using errcode = '42501';
  end if;

  return new;
end $$;

revoke all on function public.asks_guard_privileged_columns() from public;

drop trigger if exists asks_guard_privileged_columns_ins on public.asks;
drop trigger if exists asks_guard_privileged_columns_upd on public.asks;

create trigger asks_guard_privileged_columns_ins
  before insert on public.asks
  for each row execute function public.asks_guard_privileged_columns();

create trigger asks_guard_privileged_columns_upd
  before update on public.asks
  for each row execute function public.asks_guard_privileged_columns();
