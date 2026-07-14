-- migration-book-product-values.sql
-- RFC-158 decision-6: deal-level product value columns on the three CS book tables.
-- APPLIED to tvdizqryowracmtjdskv by Jeff 2026-07-13 (incl. renewal_book.product,
-- which the original artifact missed — live-verified 3 tables x 4 value cols + product).
-- Idempotent: ADD COLUMN IF NOT EXISTS. No FKs (A4).

alter table if exists public.renewal_book
  add column if not exists product text,
  add column if not exists lt_value numeric,
  add column if not exists pe_value numeric,
  add column if not exists ls_value numeric,
  add column if not exists ai_value numeric;

alter table if exists public.expansion_book
  add column if not exists lt_value numeric,
  add column if not exists pe_value numeric,
  add column if not exists ls_value numeric,
  add column if not exists ai_value numeric;

alter table if exists public.cs_deal_book_final
  add column if not exists lt_value numeric,
  add column if not exists pe_value numeric,
  add column if not exists ls_value numeric,
  add column if not exists ai_value numeric;
