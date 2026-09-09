-- Corrige une incohérence réelle entre get_company_bookings_overview
-- (utilisée par le tableau /reservations) et get_company_bookings_export_rows
-- (utilisée par l'export) — confirmée en conditions réelles, pas
-- supposée : une réservation sans aucun passager apparaît dans le
-- tableau (LEFT JOIN sur passengers, passenger_names = '') mais
-- disparaissait silencieusement du CSV exporté (JOIN — inner — sur
-- passengers), cassant la promesse même de ce chantier ("ce que
-- l'utilisateur voit à l'écran est ce qu'il obtient dans le CSV").
--
-- En pratique, create_booking/create_round_trip_booking insèrent
-- toujours au moins un passager avec la réservation — mais rien au
-- niveau base ne le garantit structurellement (pas de contrainte
-- reliant bookings.seat_count au nombre de lignes passengers), donc une
-- réservation sans passager reste un état atteignable (données de test,
-- anomalie, insertion manuelle service_role) que l'export ne doit pas
-- faire disparaître en silence. LEFT JOIN, comme get_company_bookings_overview.

create or replace function public.get_company_bookings_export_rows(p_company_id uuid, p_booking_ids uuid[])
returns table (
  booking_reference text,
  origin_city text,
  destination_city text,
  departure_at timestamptz,
  bus_number text,
  full_name text,
  phone text,
  seat_number text,
  booking_status text,
  total_price_fcfa integer,
  booking_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      b.booking_reference,
      r.origin_city,
      r.destination_city,
      t.departure_at,
      t.bus_number,
      p.full_name,
      b.phone,
      p.seat_number,
      b.status as booking_status,
      b.total_price_fcfa,
      b.created_at as booking_created_at
    from public.bookings b
    join public.trips t on t.id = b.trip_id
    join public.routes r on r.id = t.route_id
    left join public.passengers p on p.booking_id = b.id
    where b.company_id = p_company_id
      and b.id = any(p_booking_ids)
    order by b.created_at asc;
end;
$$;

-- Grants déjà en place (to service_role) — create or replace préserve une
-- signature identique donc pas de re-grant nécessaire.
