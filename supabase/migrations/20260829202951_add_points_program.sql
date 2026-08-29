-- GoBus Points: 1 point per 100 FCFA of a booking's *base* price
-- (bookings.total_price_fcfa, before service fees), credited the moment
-- the ticket's payment is approved. Same philosophy as
-- trips.available_seats: a maintained-by-trigger balance, never written to
-- directly, derived from an append-only ledger — not a column the
-- application could accidentally let drift.

-- ============================================================================
-- Tables
-- ============================================================================

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  points_amount integer not null,
  reason text not null check (reason in ('booking_reward')),
  created_at timestamptz not null default now(),
  -- One credit per booking, no matter how many times the awarding trigger
  -- might fire for it — idempotence is guaranteed by this constraint, not
  -- merely by the trigger's own condition.
  unique (booking_id)
);

-- One row per traveler: the current point balance. Not a history — that's
-- points_ledger. Maintained exclusively by apply_points_ledger_entry()
-- below; never updated directly by application code.
create table public.points_balance (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

create index points_ledger_user_id_idx on public.points_ledger (user_id);

-- ============================================================================
-- Balance maintenance (mirrors the trips.available_seats philosophy, but as
-- an additive running total rather than a bounded decrement — points_ledger
-- is append-only and there's no oversell-equivalent race to guard against,
-- so a plain upsert is enough).
-- ============================================================================

create function public.apply_points_ledger_entry()
returns trigger
language plpgsql
as $$
begin
  insert into public.points_balance (user_id, balance)
  values (new.user_id, new.points_amount)
  on conflict (user_id)
    do update set balance = public.points_balance.balance + excluded.balance,
                  updated_at = now();
  return new;
end;
$$;

create trigger apply_points_ledger_entry after insert on public.points_ledger
  for each row execute function public.apply_points_ledger_entry();

-- ============================================================================
-- Award points on approved payment (same trigger shape as
-- activate_subscription_on_payment_approved in
-- 20260829020406_add_subscription_billing.sql: a status transition handled
-- here, not left to application code to remember).
-- ============================================================================

create function public.award_points_on_payment_approved()
returns trigger
language plpgsql
as $$
declare
  booking_user_id uuid;
  booking_amount integer;
begin
  if new.status = 'approved' and old.status <> 'approved' then
    select user_id, total_price_fcfa into booking_user_id, booking_amount
    from public.bookings
    where id = new.booking_id;

    -- 1 point / 100 FCFA of the base price (confirmed rate). This rate is
    -- necessarily duplicated in packages/shared/src/lib/pricing.ts
    -- (calculatePointsEarned) for the client-side "you'll earn N points"
    -- preview — no SQL trigger can import that file. If the rate ever
    -- changes, change it in both places.
    insert into public.points_ledger (booking_id, user_id, points_amount, reason)
    values (new.booking_id, booking_user_id, floor(booking_amount / 100), 'booking_reward')
    on conflict (booking_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger award_points_on_payment_approved
  before update of status on public.payments
  for each row execute function public.award_points_on_payment_approved();

create trigger set_updated_at before update on public.points_balance
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.points_ledger enable row level security;
alter table public.points_balance enable row level security;

-- Read-only for the owning traveler. Deliberately NO insert/update/delete
-- policy for authenticated — a traveler must never be able to self-credit
-- points. All writes happen via the triggers above, which run under
-- whatever role updates payments.status to 'approved' (service_role, via
-- the simulated payment flow today).
create policy "points_ledger_select_own" on public.points_ledger
  for select
  using (user_id = auth.uid());

create policy "points_balance_select_own" on public.points_balance
  for select
  using (user_id = auth.uid());

-- ============================================================================
-- Grants
-- ============================================================================

grant select on public.points_ledger, public.points_balance to authenticated;
grant all on public.points_ledger, public.points_balance to service_role;
-- No anon grant: points only exist for a signed-in account.
