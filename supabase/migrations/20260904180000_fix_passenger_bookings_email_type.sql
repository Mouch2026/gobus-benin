-- Corrige "structure of query does not match function result type" dans
-- get_company_passenger_bookings() — confirmé réellement en appelant la
-- fonction après application de la migration précédente (pas supposé).
--
-- Cause : auth.users.email est de type "character varying" (varchar) dans
-- le schéma standard GoTrue de Supabase, pas "text" — la fonction déclare
-- "email text" dans son RETURNS TABLE, et RETURN QUERY exige une
-- correspondance de type exacte entre les colonnes de la requête et la
-- signature déclarée (contrairement à un simple SELECT, où varchar/text
-- sont interchangeables sans y penser). Un cast explicite ::text suffit.

create or replace function public.get_company_passenger_bookings(p_company_id uuid)
returns table (
  passenger_id uuid,
  full_name text,
  seat_number text,
  phone text,
  email text,
  booking_reference text,
  booking_status text,
  origin_city text,
  destination_city text,
  departure_at timestamptz,
  bus_number text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      p.id as passenger_id,
      p.full_name,
      p.seat_number,
      b.phone,
      u.email::text,
      b.booking_reference,
      b.status as booking_status,
      r.origin_city,
      r.destination_city,
      t.departure_at,
      t.bus_number
    from public.passengers p
    join public.bookings b on b.id = p.booking_id
    join public.trips t on t.id = b.trip_id
    join public.routes r on r.id = t.route_id
    join auth.users u on u.id = b.user_id
    where b.company_id = p_company_id
    order by t.departure_at desc;
end;
$$;

-- Grants déjà en place (to service_role) — create or replace préserve une
-- signature identique donc pas de re-grant nécessaire.
