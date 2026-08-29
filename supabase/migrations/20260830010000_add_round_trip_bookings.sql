-- Round-trip bookings: two linked bookings (outbound + return, two distinct
-- trip_id's) that must be created together, atomically — never one leg
-- without the other, even on partial failure. Two sequential .insert()
-- calls from a Server Action cannot guarantee this (two separate network
-- round-trips, two separate transactions); a single Postgres function
-- called via supabase.rpc() can, because Postgres runs the whole function
-- body as one transaction and rolls back everything if any statement
-- inside it raises.

-- ============================================================================
-- 1. Schema: a grouping table, not a bare correlation column
-- ============================================================================

create table public.booking_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Nullable: a one-way booking keeps both columns null, no backfill needed
-- for existing rows. reserve_trip_seats (and every other bookings trigger)
-- is untouched — it still fires once per bookings row, decrementing
-- whichever trip_id that row references, exactly as before.
alter table public.bookings
  add column booking_group_id uuid references public.booking_groups (id) on delete cascade,
  add column leg text check (leg in ('outbound', 'return'));

alter table public.bookings
  add constraint bookings_leg_requires_group
    check ((booking_group_id is null) = (leg is null));

-- Prevents two bookings from claiming the same leg within one group. In
-- practice only create_round_trip_booking() below ever creates a group and
-- its two legs, but this is a cheap, real guarantee rather than trusting
-- that alone.
create unique index bookings_group_leg_unique_idx
  on public.bookings (booking_group_id, leg)
  where booking_group_id is not null;

create index bookings_booking_group_id_idx on public.bookings (booking_group_id);

alter table public.booking_groups enable row level security;

create policy "booking_groups_select_own" on public.booking_groups
  for select
  using (user_id = auth.uid());

create policy "booking_groups_insert_own" on public.booking_groups
  for insert
  with check (user_id = auth.uid());

grant select, insert on public.booking_groups to authenticated;
grant all on public.booking_groups to service_role;
-- No anon grant, consistent with bookings/passengers/payments/points_*.

-- ============================================================================
-- 2. Atomic creation of both legs
-- ============================================================================

create function public.create_round_trip_booking(
  p_outbound_trip_id uuid,
  p_return_trip_id uuid,
  p_seat_count integer,
  p_passenger_name text,
  p_passenger_phone text
)
returns table (booking_group_id uuid, outbound_booking_id uuid, return_booking_id uuid)
language plpgsql
-- security invoker (the default, stated explicitly): every write below is
-- already permitted to the calling traveler by existing RLS policies
-- (booking_groups_insert_own, bookings_insert_own,
-- passengers_insert_via_booking). reserve_trip_seats() and
-- generate_booking_reference() are already security definer (fixed in
-- 20260829210512_fix_booking_trigger_rls_gap.sql), so they work regardless
-- of the calling role. No privilege elevation needed here — atomicity
-- comes from the transaction, not from bypassing RLS. v_user_id comes from
-- auth.uid(), never a parameter, so it can't be spoofed via RPC arguments.
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_outbound_booking_id uuid;
  v_return_booking_id uuid;
  v_outbound_price integer;
  v_return_price integer;
  v_outbound_departure timestamptz;
  v_return_departure timestamptz;
begin
  if v_user_id is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  if p_outbound_trip_id = p_return_trip_id then
    raise exception 'Le trajet retour doit être différent du trajet aller'
      using errcode = 'check_violation';
  end if;

  select price_fcfa, departure_at into v_outbound_price, v_outbound_departure
  from public.trips where id = p_outbound_trip_id;
  select price_fcfa, departure_at into v_return_price, v_return_departure
  from public.trips where id = p_return_trip_id;

  if v_outbound_price is null or v_return_price is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  if v_return_departure <= v_outbound_departure then
    raise exception 'Le trajet retour doit partir après le trajet aller'
      using errcode = 'check_violation';
  end if;

  insert into public.booking_groups (user_id) values (v_user_id)
    returning id into v_group_id;

  insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, booking_group_id, leg)
  values (p_outbound_trip_id, v_user_id, p_seat_count, v_outbound_price * p_seat_count, v_group_id, 'outbound')
  returning id into v_outbound_booking_id;
  -- reserve_trip_seats fires here for the outbound leg. If it raises,
  -- everything above (including the booking_groups insert) is rolled back
  -- — one RPC call is one transaction, nothing to compensate manually.

  insert into public.passengers (booking_id, full_name, phone)
  values (v_outbound_booking_id, p_passenger_name, p_passenger_phone);

  insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, booking_group_id, leg)
  values (p_return_trip_id, v_user_id, p_seat_count, v_return_price * p_seat_count, v_group_id, 'return')
  returning id into v_return_booking_id;
  -- If reserve_trip_seats raises HERE (not enough seats on the return
  -- leg), Postgres unwinds the whole call — the outbound booking inserted
  -- just above ceases to exist, as if it had never been inserted. This is
  -- the guarantee this migration exists for, obtained from a function
  -- call's native transactional semantics, not from compensating code.

  insert into public.passengers (booking_id, full_name, phone)
  values (v_return_booking_id, p_passenger_name, p_passenger_phone);

  return query select v_group_id, v_outbound_booking_id, v_return_booking_id;
end;
$$;

revoke execute on function public.create_round_trip_booking(uuid, uuid, integer, text, text) from public;
grant execute on function public.create_round_trip_booking(uuid, uuid, integer, text, text) to authenticated;

-- ============================================================================
-- 3. Payment + points: two linked payments, not one merged payment
--
-- award_points_on_payment_approved fires on `before update of status on
-- payments` and reads new.booking_id to credit one traveler for one
-- booking. Reusing it without duplicating it means each leg needs its own
-- payments.booking_id — hence two payments, created and approved together
-- in one atomic call, rather than a merged payment that would force either
-- duplicating the points logic or teaching that trigger about booking
-- groups.
--
-- Accepted, documented consequence: total points credited is the sum of
-- two independent floor()'d amounts (floor(outbound/100) +
-- floor(return/100)), which can differ by 1 from flooring the combined
-- total in rare cases — a minor, acceptable side effect of "two
-- independent payments that each trigger the existing mechanism
-- unmodified".
-- ============================================================================

create function public.simulate_round_trip_payment(
  p_booking_group_id uuid,
  p_user_id uuid
)
returns table (outbound_payment_id uuid, return_payment_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbound record;
  v_return record;
  v_outbound_payment_id uuid;
  v_return_payment_id uuid;
  -- Duplicated from packages/shared/src/lib/pricing.ts (PLATFORM_FEE_RATE /
  -- TRANSACTION_FEE_RATE) — no SQL trigger/function can import that file,
  -- same accepted limitation as POINTS_PER_FCFA_SPENT. If the rates ever
  -- change, change them here, in pricing.ts, AND in the comment on
  -- award_points_on_payment_approved.
  v_platform_fee_rate numeric := 0.027;
  v_transaction_fee_rate numeric := 0.013;
begin
  select id, total_price_fcfa, status, user_id into v_outbound
  from public.bookings where booking_group_id = p_booking_group_id and leg = 'outbound';
  select id, total_price_fcfa, status, user_id into v_return
  from public.bookings where booking_group_id = p_booking_group_id and leg = 'return';

  if v_outbound.id is null or v_return.id is null then
    raise exception 'Réservation aller-retour introuvable' using errcode = 'check_violation';
  end if;

  -- Defense in depth: this function is security definer and bypasses RLS,
  -- so it can't rely on auth.uid() (called via service_role, no traveler
  -- session). p_user_id must already have been verified by the caller via
  -- the normal authenticated client (RLS) — re-checked here so correctness
  -- never rests on a single layer.
  if v_outbound.user_id <> p_user_id or v_return.user_id <> p_user_id then
    raise exception 'Cette réservation ne vous appartient pas' using errcode = 'check_violation';
  end if;

  if v_outbound.status <> 'pending' or v_return.status <> 'pending' then
    raise exception 'Ce billet aller-retour a déjà été payé ou annulé'
      using errcode = 'check_violation';
  end if;

  insert into public.payments (booking_id, base_amount_fcfa, platform_fee_fcfa, transaction_fee_fcfa, provider, status)
  values (v_outbound.id, v_outbound.total_price_fcfa,
          round(v_outbound.total_price_fcfa * v_platform_fee_rate),
          round(v_outbound.total_price_fcfa * v_transaction_fee_rate),
          'simulated', 'pending')
  returning id into v_outbound_payment_id;
  update public.payments set status = 'approved', paid_at = now() where id = v_outbound_payment_id;
  -- ↑ triggers award_points_on_payment_approved for the outbound leg,
  -- with zero modification to that trigger.
  update public.bookings set status = 'confirmed' where id = v_outbound.id;

  insert into public.payments (booking_id, base_amount_fcfa, platform_fee_fcfa, transaction_fee_fcfa, provider, status)
  values (v_return.id, v_return.total_price_fcfa,
          round(v_return.total_price_fcfa * v_platform_fee_rate),
          round(v_return.total_price_fcfa * v_transaction_fee_rate),
          'simulated', 'pending')
  returning id into v_return_payment_id;
  update public.payments set status = 'approved', paid_at = now() where id = v_return_payment_id;
  update public.bookings set status = 'confirmed' where id = v_return.id;

  return query select v_outbound_payment_id, v_return_payment_id;
end;
$$;

-- security definer is required here (payments has zero insert/update grant
-- for authenticated, by original design — writes are reserved to a
-- privileged role, exactly why the single-leg simulatePayment Server
-- Action already uses supabaseAdmin for this). But because this function
-- is security definer and accepts p_user_id as a plain argument (it can't
-- read auth.uid(), which is empty on a service_role call), granting
-- `authenticated` execute on it directly would let a traveler call it with
-- someone else's booking_group_id and their OWN p_user_id — the internal
-- check would compare two values they both control. So execute is revoked
-- from public/authenticated and granted only to service_role; the Server
-- Action calls this via supabaseAdmin, and only AFTER verifying ownership
-- of both bookings itself via the normal authenticated client (RLS) — same
-- two-step sequence the single-leg payment flow already uses, just
-- extended to two bookings.
revoke execute on function public.simulate_round_trip_payment(uuid, uuid) from public;
grant execute on function public.simulate_round_trip_payment(uuid, uuid) to service_role;
