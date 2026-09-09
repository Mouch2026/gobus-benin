-- Chantier : redesign du Dashboard back-office — action rapide
-- "Export du jour" (CSV des réservations de la journée).
--
-- get_company_passenger_bookings (déjà existante, utilisée par
-- /reservations et /clients) n'expose ni created_at ni total_price_fcfa,
-- et trie par departure_at (date de départ), pas par date de création de
-- la réservation — inadapté tel quel à un export "réservations créées
-- aujourd'hui". Plutôt que d'élargir cette fonction existante (risque
-- pour les 2 pages qui en dépendent déjà), une fonction dédiée est
-- ajoutée à la place, filtrée sur booking_created_at.
--
-- Même convention de sécurité que get_company_passenger_bookings /
-- get_company_payments / get_company_refund_pending_vouchers :
-- security definer, service_role UNIQUEMENT, aucune revérification
-- interne via is_company_owner (service_role n'a pas de auth.uid()) — la
-- portée par compagnie tient au filtre where b.company_id = p_company_id
-- lui-même.

create function public.get_company_bookings_for_export(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
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
    join public.passengers p on p.booking_id = b.id
    where b.company_id = p_company_id
      and b.created_at >= p_from
      and b.created_at <= p_to
    order by b.created_at asc;
end;
$$;

revoke execute on function public.get_company_bookings_for_export(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_company_bookings_for_export(uuid, timestamptz, timestamptz) to service_role;
