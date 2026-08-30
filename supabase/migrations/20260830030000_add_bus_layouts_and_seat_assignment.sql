-- Bus layouts (optional, per company) + named passenger per seat.
--
-- Today `passengers` has one row per BOOKING, never per traveler:
-- createBooking/create_round_trip_booking only ever insert a single
-- full_name/phone regardless of seat_count. `seat_number` already exists
-- as a column but is dead — nothing writes it. This migration makes
-- `passengers` one row per seat, adds an optional per-company seat
-- layout, and guarantees seat assignment can never collide between
-- concurrent bookings on the same trip.

-- ============================================================================
-- 1. bus_layouts + trips.bus_layout_id
-- ============================================================================

create table public.bus_layouts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  seat_labels jsonb not null
    check (jsonb_typeof(seat_labels) = 'array' and jsonb_array_length(seat_labels) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create index bus_layouts_company_id_idx on public.bus_layouts (company_id);

-- Nullable, `on delete set null`: a trip never loses its data if its layout
-- is deleted later — it just falls back to plain sequential numbering,
-- consistent with no company ever being required to configure a layout.
alter table public.trips
  add column bus_layout_id uuid references public.bus_layouts (id) on delete set null;

-- total_seats becomes derived from the layout, not manually entered, the
-- moment a layout is chosen — this makes "total_seats doesn't match the
-- layout's seat count" structurally impossible rather than merely
-- discouraged. Mirrors set_trip_company_id (derive a column from a FK,
-- before insert/update).
create function public.set_trip_seats_from_layout()
returns trigger
language plpgsql
as $$
declare
  v_seat_count integer;
  v_layout_company_id uuid;
begin
  if new.bus_layout_id is null then
    return new; -- no layout chosen: total_seats stays the manual entry
  end if;

  select jsonb_array_length(seat_labels), company_id
    into v_seat_count, v_layout_company_id
  from public.bus_layouts
  where id = new.bus_layout_id;

  if v_seat_count is null then
    raise exception 'Plan de bus introuvable' using errcode = 'check_violation';
  end if;

  if v_layout_company_id <> new.company_id then
    raise exception 'Ce plan de bus n''appartient pas à votre compagnie'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and old.bus_layout_id is distinct from new.bus_layout_id
     and old.total_seats <> old.available_seats then
    raise exception 'Impossible de changer le plan de bus : des places sont déjà réservées sur ce trajet'
      using errcode = 'check_violation';
  end if;

  new.total_seats := v_seat_count; -- always resynchronized, client value never trusted
  if tg_op = 'INSERT' then
    new.available_seats := v_seat_count;
  end if;
  return new;
end;
$$;

-- security invoker (default): a company reading/deriving from its own
-- bus_layout for its own trip never crosses an ownership boundary, so no
-- privilege elevation is needed here — unlike assign_and_insert_passengers
-- below, which specifically needs a traveler (not a company owner) to read
-- bus_layouts, hence that table's public select policy instead.
create trigger set_trip_seats_from_layout
  before insert or update of bus_layout_id, total_seats on public.trips
  for each row execute function public.set_trip_seats_from_layout();

alter table public.bus_layouts enable row level security;

-- Publicly readable, like trips/routes: a seat layout isn't confidential
-- business data, and a traveler (never a company owner) must be able to
-- read ANY company's layout to get a real seat assigned — see the comment
-- on assign_and_insert_passengers() below for why this matters concretely.
create policy "bus_layouts_select_public" on public.bus_layouts
  for select using (true);
create policy "bus_layouts_insert_owner" on public.bus_layouts
  for insert with check (public.is_company_owner(company_id));
create policy "bus_layouts_update_owner" on public.bus_layouts
  for update using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));
create policy "bus_layouts_delete_owner" on public.bus_layouts
  for delete using (public.is_company_owner(company_id));

grant select on public.bus_layouts to anon, authenticated;
grant insert, update, delete on public.bus_layouts to authenticated;
grant all on public.bus_layouts to service_role;

-- ============================================================================
-- 2. passengers: one row per seat, phone moves to the booking level
--
-- Decision: one phone per BOOKING (not per passenger). The real-world case
-- is "one person books for a group" — requiring N phone numbers would add
-- friction (travelers without their own phone, family bookings) for no
-- current benefit (no per-passenger SMS/email notification exists in this
-- project). /gerer-ma-reservation's lookup also gets simpler: comparing
-- one booking.phone instead of scanning several passengers.
-- ============================================================================

alter table public.bookings add column phone text;

-- Costless backfill (not required — this is dev data — but free and
-- correct since today every booking has exactly one passenger row):
update public.bookings b set phone = (
  select p.phone from public.passengers p where p.booking_id = b.id limit 1
);
-- Stays nullable, same as passengers.phone was: no guarantee every
-- existing row actually had a passenger (createBooking's own comment
-- notes a passenger-insert failure is logged, not rolled back), so no
-- NOT NULL constraint is forced onto dev data here.

alter table public.passengers drop column phone;

-- ============================================================================
-- 3. Atomic, collision-free seat assignment — same lock as
-- reserve_trip_seats, not a new mechanism.
--
-- reserve_trip_seats already locks the trips row (via its own
-- `update trips set available_seats = ... where ...`) for the rest of the
-- transaction. As long as seat assignment happens in that SAME
-- transaction, after that update, no concurrent booking on the same trip
-- can be inside its own assignment at the same time — it would still be
-- blocked acquiring that same lock. This is why the single-leg booking
-- flow must now go through one Postgres function too (create_booking,
-- below) instead of two sequential .insert() calls from the Server
-- Action: once the first transaction (insert bookings) commits, the lock
-- it held is released — a second, separate transaction for passengers has
-- no more exclusivity guarantee at all.
-- ============================================================================

-- Denormalized trip_id on passengers, purely so a real database
-- constraint (below) can make a seat collision impossible to persist —
-- mirrors set_booking_company_id exactly (derive a FK-based column via
-- trigger).
alter table public.passengers add column trip_id uuid references public.trips (id) on delete cascade;

create function public.set_passenger_trip_id()
returns trigger
language plpgsql
as $$
begin
  select trip_id into new.trip_id from public.bookings where id = new.booking_id;
  return new;
end;
$$;

create trigger set_passenger_trip_id before insert or update of booking_id on public.passengers
  for each row execute function public.set_passenger_trip_id();

-- The real, unbypassable guarantee: even if a bug ever slipped past
-- assign_and_insert_passengers' own logic, two passengers on the same
-- trip could never both hold the same seat_number — this constraint would
-- raise an ordinary 23505 instead of silently double-booking a seat.
-- Partial (seat_number is not null): existing dev rows (always NULL today)
-- never conflict with each other, no data migration required.
create unique index passengers_trip_id_seat_number_unique_idx
  on public.passengers (trip_id, seat_number)
  where seat_number is not null;

-- Shared by both booking flows — never duplicated between them.
create function public.assign_and_insert_passengers(
  p_booking_id uuid,
  p_trip_id uuid,
  p_passenger_names text[]
)
returns void
language plpgsql
-- security invoker: the calling traveler already has RLS permission to
-- insert into passengers (passengers_insert_via_booking, since the
-- booking they just created has their own user_id). No privilege
-- elevation needed for that write. The only reason this could have needed
-- to be security definer is reading bus_layouts across companies — solved
-- instead by making bus_layouts publicly readable (see its RLS above),
-- which keeps this function, create_booking, and create_round_trip_booking
-- all at the minimum privilege they've had all along.
security invoker
as $$
declare
  v_seat_labels jsonb;
  v_total_seats integer;
  v_taken text[];
  v_candidate text;
  v_assigned text[] := '{}';
  v_name text;
begin
  -- Defense in depth: only matters if this function is ever called outside
  -- the normal path (never happens from create_booking/create_round_trip_booking,
  -- which always pass a booking_id/trip_id pair they just created together).
  if not exists (select 1 from public.bookings where id = p_booking_id and trip_id = p_trip_id) then
    raise exception 'Réservation et trajet incohérents' using errcode = 'check_violation';
  end if;

  select bl.seat_labels, t.total_seats into v_seat_labels, v_total_seats
  from public.trips t
  left join public.bus_layouts bl on bl.id = t.bus_layout_id
  where t.id = p_trip_id;

  -- Seats already occupied on THIS trip, across every non-cancelled
  -- booking — recomputed on every call, inside the transaction that
  -- already holds the lock on trips via reserve_trip_seats above.
  select coalesce(array_agg(p.seat_number), '{}') into v_taken
  from public.passengers p
  join public.bookings b on b.id = p.booking_id
  where b.trip_id = p_trip_id and b.status <> 'cancelled' and p.seat_number is not null;

  foreach v_name in array p_passenger_names loop
    if v_seat_labels is not null then
      select elem into v_candidate
      from jsonb_array_elements_text(v_seat_labels) with ordinality as t(elem, ord)
      where elem <> all (v_taken || v_assigned)
      order by ord
      limit 1;
    else
      -- No layout: plain sequential numbering, same "first free" logic
      -- over 1..total_seats.
      select n::text into v_candidate
      from generate_series(1, v_total_seats) as n
      where n::text <> all (v_taken || v_assigned)
      limit 1;
    end if;

    if v_candidate is null then
      raise exception 'Plus assez de sièges disponibles sur ce trajet' using errcode = 'check_violation';
    end if;

    v_assigned := v_assigned || v_candidate;

    insert into public.passengers (booking_id, full_name, seat_number)
    values (p_booking_id, v_name, v_candidate);
  end loop;
end;
$$;

revoke execute on function public.assign_and_insert_passengers(uuid, uuid, text[]) from public;
grant execute on function public.assign_and_insert_passengers(uuid, uuid, text[]) to authenticated;

-- ============================================================================
-- Fix a gap this feature exposes in an already-applied trigger: cancelling
-- a booking recredits trips.available_seats but never freed
-- passengers.seat_number. Without this, a cancelled booking's seat would
-- still count as "taken" for the unique index above, even though
-- assign_and_insert_passengers already treats a cancelled booking's seats
-- as free (status <> 'cancelled') — a real contradiction that would make
-- assignment fail on a seat that should be available. Per the convention
-- just added to CLAUDE.md, this is a `create or replace` in a NEW
-- migration, never an edit of the already-applied file.
-- ============================================================================

create or replace function public.adjust_trip_seats_on_booking_status_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.trips
    set available_seats = available_seats + old.seat_count
    where id = old.trip_id;

    update public.passengers set seat_number = null where booking_id = new.id;

  elsif old.status = 'cancelled' and new.status <> 'cancelled' then
    update public.trips
    set available_seats = available_seats - new.seat_count
    where id = new.trip_id
      and available_seats >= new.seat_count;

    if not found then
      raise exception 'Plus assez de places disponibles pour réactiver cette réservation (trip_id=%)', new.trip_id
        using errcode = 'check_violation';
    end if;
    -- Known, not handled here: reactivation doesn't reassign a seat — the
    -- booking becomes active again but "seatless" until a reassignment
    -- mechanism exists. No application code path exercises this branch
    -- today (no traveler-facing cancel/reactivate feature is built) — to
    -- address together with the BACKLOG item "Règles de
    -- modification/annulation d'une réservation par le voyageur", not here.
  end if;

  return new;
end;
$$;

-- ============================================================================
-- 4. Booking creation becomes a single Postgres function, both flows.
-- ============================================================================

create function public.create_booking(
  p_trip_id uuid,
  p_seat_count integer,
  p_phone text,
  p_passenger_names text[]
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_trip_price integer;
  v_booking_id uuid;
begin
  if v_user_id is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  if array_length(p_passenger_names, 1) is distinct from p_seat_count then
    raise exception 'Le nombre de passagers doit correspondre au nombre de places'
      using errcode = 'check_violation';
  end if;

  select price_fcfa into v_trip_price from public.trips where id = p_trip_id;
  if v_trip_price is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, phone)
  values (p_trip_id, v_user_id, p_seat_count, v_trip_price * p_seat_count, p_phone)
  returning id into v_booking_id;
  -- reserve_trip_seats locks trips here — assign_and_insert_passengers
  -- runs below while that lock is still held, in the same transaction.

  perform public.assign_and_insert_passengers(v_booking_id, p_trip_id, p_passenger_names);

  return v_booking_id;
end;
$$;

revoke execute on function public.create_booking(uuid, integer, text, text[]) from public;
grant execute on function public.create_booking(uuid, integer, text, text[]) to authenticated;

-- create_round_trip_booking: same signature change (one shared phone, a
-- names array instead of a single name), same passengers used for both
-- legs (the same travelers go both ways). Everything else — the per-leg
-- begin/exception blocks, the not-enough-seats message discrimination —
-- is unchanged. create or replace: this function is already applied
-- (20260830020000), never edited in place.

create or replace function public.create_round_trip_booking(
  p_outbound_trip_id uuid,
  p_return_trip_id uuid,
  p_seat_count integer,
  p_phone text,
  p_passenger_names text[]
)
returns table (booking_group_id uuid, outbound_booking_id uuid, return_booking_id uuid)
language plpgsql
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
  c_not_enough_seats_prefix constant text := 'Plus assez de places disponibles sur ce trajet%';
begin
  if v_user_id is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  if p_outbound_trip_id = p_return_trip_id then
    raise exception 'Le trajet retour doit être différent du trajet aller'
      using errcode = 'check_violation';
  end if;

  if array_length(p_passenger_names, 1) is distinct from p_seat_count then
    raise exception 'Le nombre de passagers doit correspondre au nombre de places'
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

  begin
    insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, booking_group_id, leg, phone)
    values (p_outbound_trip_id, v_user_id, p_seat_count, v_outbound_price * p_seat_count, v_group_id, 'outbound', p_phone)
    returning id into v_outbound_booking_id;
  exception when others then
    if sqlerrm like c_not_enough_seats_prefix then
      raise exception 'Plus de places disponibles sur le trajet aller choisi, essayez un autre horaire'
        using errcode = 'check_violation', detail = sqlerrm;
    else
      raise;
    end if;
  end;

  perform public.assign_and_insert_passengers(v_outbound_booking_id, p_outbound_trip_id, p_passenger_names);

  begin
    insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, booking_group_id, leg, phone)
    values (p_return_trip_id, v_user_id, p_seat_count, v_return_price * p_seat_count, v_group_id, 'return', p_phone)
    returning id into v_return_booking_id;
  exception when others then
    if sqlerrm like c_not_enough_seats_prefix then
      raise exception 'Plus de places disponibles sur le trajet retour choisi, essayez un autre horaire'
        using errcode = 'check_violation', detail = sqlerrm;
    else
      raise;
    end if;
  end;

  perform public.assign_and_insert_passengers(v_return_booking_id, p_return_trip_id, p_passenger_names);

  return query select v_group_id, v_outbound_booking_id, v_return_booking_id;
end;
$$;
