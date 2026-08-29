-- Bug found via the first-ever real end-to-end ticket payment test: the
-- ticket payment flow (app/reservation/[bookingId]/paiement/actions.ts)
-- inserts payments with provider = 'simulated' — mirroring the pattern
-- already used for subscription_payments (provider text not null default
-- 'simulated' check (provider in ('simulated', 'fedapay'))) — but
-- public.payments' own check constraint, written before that "simulated"
-- concept existed, was never updated to match:
--   provider text not null default 'fedapay' check (provider in ('fedapay'))
-- so the insert failed with a real, observed 23514
-- (payments_provider_check violation), not a guess.
--
-- Fix: widen the constraint and flip the default, exactly matching
-- subscription_payments — no real FedaPay integration exists anywhere in
-- this project yet, so 'simulated' should be the default here too, not
-- 'fedapay' (which would otherwise falsely claim a real payment gateway
-- was used for any insert that omits provider).

alter table public.payments drop constraint payments_provider_check;

alter table public.payments
  add constraint payments_provider_check check (provider in ('simulated', 'fedapay'));

alter table public.payments alter column provider set default 'simulated';
