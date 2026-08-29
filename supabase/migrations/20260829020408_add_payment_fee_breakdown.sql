-- Traveler service fees: the traveler now pays base price + ~4% (platform
-- + transaction fees), on top of the base price the company sets and keeps
-- in full. bookings.total_price_fcfa is NOT touched by this migration — it
-- remains the base price only, still validated by reserve_trip_seats in
-- 20260825060934_create_core_schema.sql. This fee layer exists only on
-- payments, at the point the traveler actually pays.
--
-- `payments` currently has zero rows (verified before writing this
-- migration), so the new NOT NULL columns need no backfill/default.

alter table public.payments
  add column base_amount_fcfa integer,
  add column platform_fee_fcfa integer,
  add column transaction_fee_fcfa integer;

-- amount_fcfa becomes a generated total instead of a freely-set column, so
-- it can never drift from its three components — same philosophy as
-- trips.available_seats <= total_seats: the invariant is enforced by
-- Postgres, not trusted to application code.
alter table public.payments drop column amount_fcfa;

alter table public.payments
  add column amount_fcfa integer
    generated always as (base_amount_fcfa + platform_fee_fcfa + transaction_fee_fcfa) stored;

alter table public.payments
  alter column base_amount_fcfa set not null,
  alter column platform_fee_fcfa set not null,
  alter column transaction_fee_fcfa set not null;

alter table public.payments
  add constraint payments_base_amount_fcfa_check check (base_amount_fcfa >= 0),
  add constraint payments_platform_fee_fcfa_check check (platform_fee_fcfa >= 0),
  add constraint payments_transaction_fee_fcfa_check check (transaction_fee_fcfa >= 0);

-- Note: base_amount_fcfa should match the linked booking's
-- total_price_fcfa, and platform_fee_fcfa/transaction_fee_fcfa should match
-- the rates in packages/shared/src/lib/pricing.ts (PLATFORM_FEE_RATE /
-- TRANSACTION_FEE_RATE). That's enforced in the future create-payment Edge
-- Function, not a SQL trigger here — duplicating the rates into SQL would
-- defeat the point of keeping them as single, easily-changed constants.
