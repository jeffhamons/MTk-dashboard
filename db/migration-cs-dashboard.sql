-- ============================================================
-- RFC-158 Phase 1 — CS dashboard data layer (judgment + derived)
-- Target: Supabase project tvdizqryowracmtjdskv (MIndtools Dashboard).
-- Idempotent — safe to re-run in Supabase → SQL Editor.
-- Human-applied later (A3). This file is NOT auto-applied.
--
-- cs_targets is the SINGLE Lara-owned CS target source of truth
-- (A6 / supersedes OQ3), including the quarterly comp denominator.
-- Judgment tables (cs_targets, cs_pipeline_items, cs_risks,
-- cs_current_focus, cs_team_focus) are UI-written and never touched
-- by replace_table-style writers (OQ2). Feed tables stay disjoint (A4:
-- no FKs into renewal_book / expansion_book / closed_won_deals /
-- attainment_* / cs_quarterly_targets). rep_id is plain text matching
-- public.reps.rep_id by convention only (mirrors existing judgment
-- tables — none FK to reps).
--
-- Requires: migration-team-rbac-schema.sql (teams/reps/team_admins)
-- so policies can join the registry. Writes: manager OR covering
-- team_admin with team_id='cs' (R1 role tie). Reads: manager OR
-- CS-team members OR covering cs team_admin (region-keyed).
-- cs_dashboard_snapshot is a third category — derived snapshot (A5):
-- append-only, Monday-cron / service_role written. Authenticated SELECT only.
-- ============================================================

-- ═══════════════════════ 1. cs_targets ═══════════════════════
-- Single CS target source (region + optional per-rep rows).
create table if not exists public.cs_targets (
  region       text        not null check (region in ('US', 'EMEA', 'APAC')),
  rep_id       text,                                    -- null = region-level row
  period_type  text        not null check (period_type in ('monthly', 'quarterly', 'ytd')),
  fy           int         not null,
  period       int,                                     -- month 1-12 / quarter 1-4 / null for ytd
  component    text        not null check (component in ('renewal', 'growth', 'pe', 'lt', 'ls')),
  amount       numeric,                                 -- null = no target that period
  currency     text        not null default 'USD',
  updated_by   text,                                    -- email of last editor
  updated_at   timestamptz not null default now(),
  constraint cs_targets_period_shape_check check (
    (period_type = 'monthly'   and (period is null or period between 1 and 12))  -- null = standing monthly target (Lara's model keeps one set, not per-month rows)
    or (period_type = 'quarterly' and period between 1 and 4)
    or (period_type = 'ytd'       and period is null)
  )
);

-- Unique grain includes nullable rep_id + period. Postgres treats NULLs as
-- distinct in a plain UNIQUE constraint. NULLS NOT DISTINCT (PG15+) makes
-- two region-level rows (rep_id NULL, same period_type/fy/period/component)
-- collide — which is the intended grain.
create unique index if not exists cs_targets_grain_uidx
  on public.cs_targets (region, rep_id, period_type, fy, period, component)
  nulls not distinct;

create index if not exists cs_targets_region_fy_idx
  on public.cs_targets (region, fy, period_type);
create index if not exists cs_targets_rep_fy_idx
  on public.cs_targets (rep_id, fy)
  where rep_id is not null;

-- ═══════════════════════ 2. cs_targets_audit + trigger ═══════
-- A6 comp guardrail substrate: every cs_targets change is auditable
-- (who/when/old amount → new amount). Insert-only from the trigger
-- (security definer). No authenticated write policies.
create table if not exists public.cs_targets_audit (
  id                 bigint generated always as identity primary key,
  op                 text        not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  changed_at         timestamptz not null default now(),
  changed_by_auth_id uuid,
  changed_by_email   text,
  region             text        not null,
  rep_id             text,
  period_type        text        not null,
  fy                 int         not null,
  period             int,
  component          text        not null,
  old_amount         numeric,
  new_amount         numeric
);

create index if not exists cs_targets_audit_changed_at_idx
  on public.cs_targets_audit (changed_at desc);
create index if not exists cs_targets_audit_grain_idx
  on public.cs_targets_audit (region, rep_id, period_type, fy, period, component);

create or replace function public.cs_targets_audit_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid;
  v_email text;
begin
  begin
    v_uid   := auth.uid();
    v_email := auth.email();
  exception when others then
    v_uid   := null;
    v_email := null;
  end;

  if tg_op = 'INSERT' then
    insert into public.cs_targets_audit (
      op, changed_by_auth_id, changed_by_email,
      region, rep_id, period_type, fy, period, component,
      old_amount, new_amount
    ) values (
      'INSERT', v_uid, v_email,
      new.region, new.rep_id, new.period_type, new.fy, new.period, new.component,
      null, new.amount
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.cs_targets_audit (
      op, changed_by_auth_id, changed_by_email,
      region, rep_id, period_type, fy, period, component,
      old_amount, new_amount
    ) values (
      'UPDATE', v_uid, v_email,
      new.region, new.rep_id, new.period_type, new.fy, new.period, new.component,
      old.amount, new.amount
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.cs_targets_audit (
      op, changed_by_auth_id, changed_by_email,
      region, rep_id, period_type, fy, period, component,
      old_amount, new_amount
    ) values (
      'DELETE', v_uid, v_email,
      old.region, old.rep_id, old.period_type, old.fy, old.period, old.component,
      old.amount, null
    );
    return old;
  end if;
  return null;
end;
$$;

-- DROP TRIGGER ON schema.table trips sqlglot - bare table name is fine (search_path=public)
drop trigger if exists cs_targets_audit_trg on cs_targets;
create trigger cs_targets_audit_trg
  after insert or update or delete on public.cs_targets
  for each row execute function public.cs_targets_audit_fn();

-- ═══════════════════════ 3. cs_pipeline_items ═══════════════
-- Lara's manual pipeline tags (Jeff decision 4 / OQ2). Separate from
-- Salesforce-fed renewal_book. No FK into feed tables (A4).
create table if not exists public.cs_pipeline_items (
  id              uuid        primary key default gen_random_uuid(),
  region          text        not null check (region in ('US', 'EMEA', 'APAC')),
  stage           text        not null check (stage in ('front-runner', 'in-motion', 'won', 'lost')),
  kind            text        not null check (kind in ('renewal', 'growth')),
  client          text        not null default '',
  product         text,
  amount          numeric,
  currency        text        not null default 'USD',
  rep_id          text,                                    -- owner (plain text, not FK)
  rag             text        check (rag is null or rag in ('red', 'amber', 'green')),
  notes           text,
  original_month  text,                                    -- draggers: when it was originally due
  estimated_close date,                                    -- growth close estimate
  lost_reason     text,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_by      text,
  updated_at      timestamptz not null default now()
);

create index if not exists cs_pipeline_items_region_stage_idx
  on public.cs_pipeline_items (region, stage);
create index if not exists cs_pipeline_items_rep_idx
  on public.cs_pipeline_items (rep_id)
  where rep_id is not null;

-- ═══════════════════════ 4. cs_risks ════════════════════════
create table if not exists public.cs_risks (
  id          uuid        primary key default gen_random_uuid(),
  region      text        not null check (region in ('US', 'EMEA', 'APAC')),
  rag         text        not null check (rag in ('red', 'amber', 'green')),
  risk        text        not null default '',
  action      text        not null default '',
  owner       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cs_risks_region_rag_idx
  on public.cs_risks (region, rag);

-- ═══════════════════════ 5. cs_current_focus + cs_team_focus ═
create table if not exists public.cs_current_focus (
  id          uuid        primary key default gen_random_uuid(),
  region      text        check (region is null or region in ('US', 'EMEA', 'APAC')),  -- null = company-wide
  category    text        not null check (category in (
                  'priorities', 'campaigns', 'incentives', 'strategies',
                  'internal', 'external', 'notes'
                )),
  content     text        not null default '',
  position    int         not null default 0,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create index if not exists cs_current_focus_region_cat_idx
  on public.cs_current_focus (region, category, position);

create table if not exists public.cs_team_focus (
  id          uuid        primary key default gen_random_uuid(),
  person      text        not null,
  focus       text        not null default '',
  updated_by  text,
  updated_at  timestamptz not null default now()
);

create index if not exists cs_team_focus_person_idx
  on public.cs_team_focus (person);

-- ═══════════════════════ 6. cs_dashboard_snapshot ═══════════
-- Derived snapshot category (A5 / OQ2 third bucket): neither feed nor
-- judgment. Append-only, machine-written by the Monday cron via
-- service_role (bypasses RLS). "Reproducible = the stored row is
-- immutable" — a later cs_targets edit never rewrites history. The
-- cron INSERTs a new Monday row and never UPDATEs/DELETEs prior ones.
-- Authenticated users get SELECT only. No insert/update/delete policies
-- for authenticated (cron = service_role).
create table if not exists public.cs_dashboard_snapshot (
  id             uuid        primary key default gen_random_uuid(),
  snapshot_date  date        not null,
  region         text        not null check (region in ('company', 'US', 'EMEA', 'APAC')),  -- 'company' = the companyTargetLastWeek WoW row
  metric         text        not null,
  pct            numeric,
  numerator      numeric,
  denominator    numeric,
  created_at     timestamptz not null default now()
);

comment on table public.cs_dashboard_snapshot is
  'RFC-158 A5 derived snapshot: append-only, Monday-cron machine-written. '
  'Neither feed (replace_table) nor judgment (UI). Reproducible = the stored '
  'row is immutable — never update or delete historical Monday rows.';

create index if not exists cs_dashboard_snapshot_date_region_idx
  on public.cs_dashboard_snapshot (snapshot_date desc, region, metric);

-- ═══════════════════════ RLS enable ═════════════════════════
alter table public.cs_targets             enable row level security;
alter table public.cs_targets_audit       enable row level security;
alter table public.cs_pipeline_items      enable row level security;
alter table public.cs_risks               enable row level security;
alter table public.cs_current_focus       enable row level security;
alter table public.cs_team_focus          enable row level security;
alter table public.cs_dashboard_snapshot  enable row level security;

-- ── helpers inlined as EXISTS branches (no plpgsql helper fns) ─
-- All auth.uid() wrapped in (select ...) — initplan once/statement,
-- mirroring migration-team-rbac-rls.sql. team_admin branch always
-- carries R1 role tie (users.role = 'team_admin').

-- ═══════════════════════ cs_targets policies ════════════════
drop policy if exists "manager or cs team reads cs_targets"      on public.cs_targets;
drop policy if exists "manager or cs admin inserts cs_targets"    on public.cs_targets;
drop policy if exists "manager or cs admin updates cs_targets"    on public.cs_targets;
drop policy if exists "manager or cs admin deletes cs_targets"    on public.cs_targets;

create policy "manager or cs team reads cs_targets" on public.cs_targets
  for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               join public.reps r on r.rep_id = u.rep_id
               where u.auth_id = (select auth.uid()) and r.team_id = 'cs')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_targets.region)
  );

create policy "manager or cs admin inserts cs_targets" on public.cs_targets
  for insert to authenticated
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_targets.region)
  );

create policy "manager or cs admin updates cs_targets" on public.cs_targets
  for update to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_targets.region)
  )
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_targets.region)
  );

create policy "manager or cs admin deletes cs_targets" on public.cs_targets
  for delete to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_targets.region)
  );

-- ═══════════════════════ cs_targets_audit policies ══════════
-- Insert-only via security-definer trigger. Authenticated SELECT for
-- managers + covering cs team_admins (comp audit visibility). No
-- insert/update/delete policies for authenticated.
drop policy if exists "manager or cs admin reads cs_targets_audit" on public.cs_targets_audit;

create policy "manager or cs admin reads cs_targets_audit" on public.cs_targets_audit
  for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_targets_audit.region)
  );

-- ═══════════════════════ cs_pipeline_items policies ═════════
drop policy if exists "manager or cs team reads cs_pipeline_items"   on public.cs_pipeline_items;
drop policy if exists "manager or cs admin inserts cs_pipeline_items" on public.cs_pipeline_items;
drop policy if exists "manager or cs admin updates cs_pipeline_items" on public.cs_pipeline_items;
drop policy if exists "manager or cs admin deletes cs_pipeline_items" on public.cs_pipeline_items;

create policy "manager or cs team reads cs_pipeline_items" on public.cs_pipeline_items
  for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               join public.reps r on r.rep_id = u.rep_id
               where u.auth_id = (select auth.uid()) and r.team_id = 'cs')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_pipeline_items.region)
  );

create policy "manager or cs admin inserts cs_pipeline_items" on public.cs_pipeline_items
  for insert to authenticated
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_pipeline_items.region)
  );

create policy "manager or cs admin updates cs_pipeline_items" on public.cs_pipeline_items
  for update to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_pipeline_items.region)
  )
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_pipeline_items.region)
  );

create policy "manager or cs admin deletes cs_pipeline_items" on public.cs_pipeline_items
  for delete to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_pipeline_items.region)
  );

-- ═══════════════════════ cs_risks policies ══════════════════
drop policy if exists "manager or cs team reads cs_risks"   on public.cs_risks;
drop policy if exists "manager or cs admin inserts cs_risks" on public.cs_risks;
drop policy if exists "manager or cs admin updates cs_risks" on public.cs_risks;
drop policy if exists "manager or cs admin deletes cs_risks" on public.cs_risks;

create policy "manager or cs team reads cs_risks" on public.cs_risks
  for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               join public.reps r on r.rep_id = u.rep_id
               where u.auth_id = (select auth.uid()) and r.team_id = 'cs')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_risks.region)
  );

create policy "manager or cs admin inserts cs_risks" on public.cs_risks
  for insert to authenticated
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_risks.region)
  );

create policy "manager or cs admin updates cs_risks" on public.cs_risks
  for update to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_risks.region)
  )
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_risks.region)
  );

create policy "manager or cs admin deletes cs_risks" on public.cs_risks
  for delete to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and ta.region = cs_risks.region)
  );

-- ═══════════════════════ cs_current_focus policies ══════════
-- region NULL = company-wide: any cs team_admin may write. Region
-- rows stay covering-admin scoped to that region.
drop policy if exists "manager or cs team reads cs_current_focus"   on public.cs_current_focus;
drop policy if exists "manager or cs admin inserts cs_current_focus" on public.cs_current_focus;
drop policy if exists "manager or cs admin updates cs_current_focus" on public.cs_current_focus;
drop policy if exists "manager or cs admin deletes cs_current_focus" on public.cs_current_focus;

create policy "manager or cs team reads cs_current_focus" on public.cs_current_focus
  for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               join public.reps r on r.rep_id = u.rep_id
               where u.auth_id = (select auth.uid()) and r.team_id = 'cs')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and (cs_current_focus.region is null or ta.region = cs_current_focus.region))
  );

create policy "manager or cs admin inserts cs_current_focus" on public.cs_current_focus
  for insert to authenticated
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and (cs_current_focus.region is null or ta.region = cs_current_focus.region))
  );

create policy "manager or cs admin updates cs_current_focus" on public.cs_current_focus
  for update to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and (cs_current_focus.region is null or ta.region = cs_current_focus.region))
  )
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and (cs_current_focus.region is null or ta.region = cs_current_focus.region))
  );

create policy "manager or cs admin deletes cs_current_focus" on public.cs_current_focus
  for delete to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs'
                 and (cs_current_focus.region is null or ta.region = cs_current_focus.region))
  );

-- ═══════════════════════ cs_team_focus policies ═════════════
-- No region column — any cs team_admin covers the whole table.
drop policy if exists "manager or cs team reads cs_team_focus"   on public.cs_team_focus;
drop policy if exists "manager or cs admin inserts cs_team_focus" on public.cs_team_focus;
drop policy if exists "manager or cs admin updates cs_team_focus" on public.cs_team_focus;
drop policy if exists "manager or cs admin deletes cs_team_focus" on public.cs_team_focus;

create policy "manager or cs team reads cs_team_focus" on public.cs_team_focus
  for select to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.users u
               join public.reps r on r.rep_id = u.rep_id
               where u.auth_id = (select auth.uid()) and r.team_id = 'cs')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs')
  );

create policy "manager or cs admin inserts cs_team_focus" on public.cs_team_focus
  for insert to authenticated
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs')
  );

create policy "manager or cs admin updates cs_team_focus" on public.cs_team_focus
  for update to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs')
  )
  with check (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs')
  );

create policy "manager or cs admin deletes cs_team_focus" on public.cs_team_focus
  for delete to authenticated
  using (
    exists (select 1 from public.users u
            where u.auth_id = (select auth.uid()) and u.role = 'manager')
    or exists (select 1 from public.team_admins ta
               join public.users u3 on u3.auth_id = ta.auth_id and u3.role = 'team_admin'
               where ta.auth_id = (select auth.uid())
                 and ta.team_id = 'cs')
  );

-- ═══════════════════════ cs_dashboard_snapshot policies ═════
-- SELECT for authenticated. NO insert/update/delete policies.
-- Monday cron writes via service_role (bypasses RLS). Append-only.
drop policy if exists "authenticated read cs_dashboard_snapshot" on public.cs_dashboard_snapshot;

create policy "authenticated read cs_dashboard_snapshot"
  on public.cs_dashboard_snapshot
  for select to authenticated
  using (true);

-- ═══════════════════════ grants ═════════════════════════════
grant select, insert, update, delete on public.cs_targets        to authenticated;
grant select on public.cs_targets_audit                          to authenticated;
grant select, insert, update, delete on public.cs_pipeline_items to authenticated;
grant select, insert, update, delete on public.cs_risks          to authenticated;
grant select, insert, update, delete on public.cs_current_focus  to authenticated;
grant select, insert, update, delete on public.cs_team_focus     to authenticated;
grant select on public.cs_dashboard_snapshot                     to authenticated;

-- identity sequences (none on uuid tables - audit uses identity)
grant usage, select on all sequences in schema public to authenticated;
