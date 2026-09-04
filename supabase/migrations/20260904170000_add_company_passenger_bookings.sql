-- Fonction de lecture groupée pour /reservations (apps/backoffice) : une
-- ligne par passager, jointe jusqu'à auth.users pour l'email — évite une
-- boucle admin.getUserById() par ligne. service_role uniquement (jamais
-- authenticated) : appelée depuis un client service_role côté
-- back-office, après que requireCompany() a déjà vérifié l'accès — la
-- fonction elle-même ne peut pas revérifier via is_company_owner()
-- (service_role n'a pas de JWT, donc pas de auth.uid()).

create function public.get_company_passenger_bookings(p_company_id uuid)
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
      u.email,
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

revoke execute on function public.get_company_passenger_bookings(uuid) from public;
grant execute on function public.get_company_passenger_bookings(uuid) to service_role;
