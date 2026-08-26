-- Core schema: companies, routes, trips, bookings, passengers, payments
-- RLS: une compagnie ne voit/gère que ses propres trajets et réservations ;
-- un client ne voit/gère que ses propres réservations.

create extension if not exists pgcrypto;

-- ============================================================================
-- Tables
-- ============================================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  slug text not null unique,
  phone text,
  email text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  origin_city text not null,
  destination_city text not null,
  distance_km integer not null check (distance_km > 0),
  duration_minutes integer check (duration_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, origin_city, destination_city)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  route_id uuid not null references public.routes (id) on delete cascade,
  seat_class text not null default 'standard' check (seat_class in ('standard', 'vip')),
  departure_at timestamptz not null,
  arrival_at timestamptz,
  price_fcfa integer not null check (price_fcfa >= 0),
  total_seats integer not null check (total_seats > 0),
  available_seats integer not null check (available_seats >= 0),
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_seats <= total_seats),
  check (arrival_at is null or arrival_at > departure_at)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  booking_reference text not null unique,
  seat_count integer not null check (seat_count > 0),
  total_price_fcfa integer not null check (total_price_fcfa >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.passengers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  full_name text not null,
  phone text,
  seat_number text,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  provider text not null default 'fedapay' check (provider in ('fedapay')),
  provider_transaction_id text,
  method text check (method in ('mtn_money', 'moov_money', 'card')),
  amount_fcfa integer not null check (amount_fcfa >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

create index routes_company_id_idx on public.routes (company_id);
create index trips_company_id_idx on public.trips (company_id);
create index trips_route_id_idx on public.trips (route_id);
create index trips_departure_at_idx on public.trips (departure_at);
create index bookings_trip_id_idx on public.bookings (trip_id);
create index bookings_company_id_idx on public.bookings (company_id);
create index bookings_user_id_idx on public.bookings (user_id);
create index passengers_booking_id_idx on public.passengers (booking_id);
create index payments_booking_id_idx on public.payments (booking_id);

-- ============================================================================
-- bookings.company_id consistency
-- `company_id` is denormalized onto bookings (and, via booking_id, read by
-- passengers/payments policies) so RLS can check it without joining through
-- trips. It must always mirror trips.company_id, so it is derived here
-- instead of trusted from client input.
-- ============================================================================

create function public.set_booking_company_id()
returns trigger
language plpgsql
as $$
begin
  select company_id into new.company_id
  from public.trips
  where id = new.trip_id;
  return new;
end;
$$;

create trigger set_booking_company_id before insert or update of trip_id on public.bookings
  for each row execute function public.set_booking_company_id();

-- ============================================================================
-- Trip seat inventory (avoid overselling) + booking price integrity
-- `available_seats` is decremented in the same transaction as the booking
-- insert via a conditional UPDATE ... WHERE available_seats >= seat_count.
-- Under concurrent bookings racing for the last seats, only the UPDATE(s)
-- that still find enough seats succeed; a losing transaction's UPDATE
-- affects 0 rows and is rejected explicitly here instead of silently
-- overselling (the row lock taken by the first UPDATE also serializes the
-- competing transactions, so this is safe under concurrency, not just
-- correct in isolation).
-- That same UPDATE returns price_fcfa from the row it just locked, which is
-- also used to reject bookings whose total_price_fcfa (client-supplied)
-- doesn't match trips.price_fcfa x seat_count — there is currently no
-- server-side recomputation of this amount elsewhere (no
-- supabase/functions/create-payment yet), so the client value cannot be
-- trusted without this check. Reusing the locked row (instead of a separate
-- SELECT) means the price is validated against the exact row version the
-- seat count was reserved against, not a possibly-stale read.
-- Cancelling a booking recredits the seats it held; reactivating a
-- previously cancelled booking re-attempts the same capacity-checked
-- decrement (and can itself fail if the seats were taken meanwhile). The
-- price is intentionally not re-validated on reactivation: a booking's
-- price is locked in at creation time even if the trip's price changes
-- later.
-- ============================================================================

create function public.reserve_trip_seats()
returns trigger
language plpgsql
as $$
declare
  trip_price_fcfa integer;
begin
  update public.trips
  set available_seats = available_seats - new.seat_count
  where id = new.trip_id
    and available_seats >= new.seat_count
  returning price_fcfa into trip_price_fcfa;

  if not found then
    raise exception 'Plus assez de places disponibles sur ce trajet (trip_id=%)', new.trip_id
      using errcode = 'check_violation';
  end if;

  if new.total_price_fcfa <> trip_price_fcfa * new.seat_count then
    raise exception
      'total_price_fcfa (%) ne correspond pas au prix du trajet (% x % places = %)',
      new.total_price_fcfa, trip_price_fcfa, new.seat_count, trip_price_fcfa * new.seat_count
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger reserve_seats_and_validate_price_on_booking_insert before insert on public.bookings
  for each row execute function public.reserve_trip_seats();

-- ============================================================================
-- Booking reference generation
-- `booking_reference` is always generated server-side and overwrites
-- whatever the client supplied, so a client can neither omit it nor spoof a
-- specific/guessable value. Format: "GB-" + 6 characters from an
-- unambiguous alphabet (digits/letters that are easy to confuse when read
-- aloud or typed — 0/O, 1/I/L — are excluded), e.g. "GB-A3F9K2".
-- generate_booking_reference() checks the candidate against existing rows
-- before returning it, so a collision is extremely unlikely in practice;
-- the column's UNIQUE constraint remains the actual correctness guarantee
-- for the residual race between that check and the row's insert (which
-- would surface as an ordinary unique_violation for the caller to retry).
-- ============================================================================

create function public.generate_booking_reference()
returns text
language plpgsql
as $$
declare
  charset text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  charset_len int := length(charset);
  candidate text;
  attempt int := 0;
begin
  loop
    candidate := 'GB-' || (
      select string_agg(substr(charset, (floor(random() * charset_len) + 1)::int, 1), '')
      from generate_series(1, 6)
    );

    exit when not exists (
      select 1 from public.bookings where booking_reference = candidate
    );

    attempt := attempt + 1;
    if attempt > 20 then
      raise exception 'Impossible de générer une référence de réservation unique après % tentatives', attempt;
    end if;
  end loop;

  return candidate;
end;
$$;

create function public.set_booking_reference()
returns trigger
language plpgsql
as $$
begin
  new.booking_reference := public.generate_booking_reference();
  return new;
end;
$$;

create trigger set_booking_reference before insert on public.bookings
  for each row execute function public.set_booking_reference();

create function public.adjust_trip_seats_on_booking_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update public.trips
    set available_seats = available_seats + old.seat_count
    where id = old.trip_id;

  elsif old.status = 'cancelled' and new.status <> 'cancelled' then
    update public.trips
    set available_seats = available_seats - new.seat_count
    where id = new.trip_id
      and available_seats >= new.seat_count;

    if not found then
      raise exception 'Plus assez de places disponibles pour réactiver cette réservation (trip_id=%)', new.trip_id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger adjust_seats_on_booking_status_change before update of status on public.bookings
  for each row execute function public.adjust_trip_seats_on_booking_status_change();

-- ============================================================================
-- updated_at maintenance
-- ============================================================================

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.companies
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.routes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.trips
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.bookings
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ============================================================================
-- Helper: is the current user the owner of the given company?
-- security definer + fixed search_path so it can read `companies` regardless
-- of the caller's RLS visibility, without being redefinable via search_path.
-- ============================================================================

create function public.is_company_owner(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = target_company_id
      and c.owner_id = auth.uid()
  );
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.companies enable row level security;
alter table public.routes enable row level security;
alter table public.trips enable row level security;
alter table public.bookings enable row level security;
alter table public.passengers enable row level security;
alter table public.payments enable row level security;

-- companies: profil public en lecture (nom affiché aux clients), gestion
-- réservée au propriétaire de la compagnie.
create policy "companies_select_public" on public.companies
  for select
  using (true);

create policy "companies_insert_owner" on public.companies
  for insert
  with check (owner_id = auth.uid());

create policy "companies_update_owner" on public.companies
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "companies_delete_owner" on public.companies
  for delete
  using (owner_id = auth.uid());

-- routes: consultables publiquement (recherche de trajets côté client),
-- gérées uniquement par la compagnie propriétaire.
create policy "routes_select_public" on public.routes
  for select
  using (true);

create policy "routes_insert_owner" on public.routes
  for insert
  with check (public.is_company_owner(company_id));

create policy "routes_update_owner" on public.routes
  for update
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));

create policy "routes_delete_owner" on public.routes
  for delete
  using (public.is_company_owner(company_id));

-- trips: consultables publiquement (recherche/réservation côté client),
-- gérés uniquement par la compagnie propriétaire.
create policy "trips_select_public" on public.trips
  for select
  using (true);

create policy "trips_insert_owner" on public.trips
  for insert
  with check (public.is_company_owner(company_id));

create policy "trips_update_owner" on public.trips
  for update
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));

create policy "trips_delete_owner" on public.trips
  for delete
  using (public.is_company_owner(company_id));

-- bookings: un client ne voit/gère que ses propres réservations ; une
-- compagnie ne voit/gère que les réservations de ses propres trajets.
create policy "bookings_select_own_or_company" on public.bookings
  for select
  using (
    user_id = auth.uid()
    or public.is_company_owner(company_id)
  );

create policy "bookings_insert_own" on public.bookings
  for insert
  with check (user_id = auth.uid());

create policy "bookings_update_own_or_company" on public.bookings
  for update
  using (
    user_id = auth.uid()
    or public.is_company_owner(company_id)
  )
  with check (
    user_id = auth.uid()
    or public.is_company_owner(company_id)
  );

-- Pas de policy delete : l'annulation passe par une mise à jour de `status`,
-- l'historique des réservations est conservé.

-- passengers: visibles/gérables via la réservation parente (client ou
-- compagnie propriétaire du trajet réservé).
create policy "passengers_select_via_booking" on public.passengers
  for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = passengers.booking_id
        and (b.user_id = auth.uid() or public.is_company_owner(b.company_id))
    )
  );

create policy "passengers_insert_via_booking" on public.passengers
  for insert
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = passengers.booking_id
        and (b.user_id = auth.uid() or public.is_company_owner(b.company_id))
    )
  );

create policy "passengers_update_via_booking" on public.passengers
  for update
  using (
    exists (
      select 1 from public.bookings b
      where b.id = passengers.booking_id
        and (b.user_id = auth.uid() or public.is_company_owner(b.company_id))
    )
  )
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = passengers.booking_id
        and (b.user_id = auth.uid() or public.is_company_owner(b.company_id))
    )
  );

-- payments: lecture seule côté client/compagnie. Les écritures
-- (création, confirmation webhook) passent exclusivement par les Edge
-- Functions supabase/functions/create-payment et payment-webhook, qui
-- utilisent la service_role key et contournent RLS — aucune policy insert/
-- update/delete n'est donc définie ici pour les rôles anon/authenticated.
create policy "payments_select_via_booking" on public.payments
  for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = payments.booking_id
        and (b.user_id = auth.uid() or public.is_company_owner(b.company_id))
    )
  );
