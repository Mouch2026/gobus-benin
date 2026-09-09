-- Corrige "column reference booking_id is ambiguous" dans
-- get_company_bookings_overview — confirmé réellement en appelant la
-- fonction après application de 20260909090000 (pas supposé).
--
-- Cause : même piège déjà rencontré sur les fonctions de sweep d'avoirs
-- (20260903000000) — les paramètres OUT implicites d'un RETURNS TABLE
-- sont visibles dans TOUT le corps de la fonction, y compris à
-- l'intérieur d'un CTE imbriqué. La CTE passenger_names sélectionnait
-- booking_id et created_at sans les qualifier depuis public.passengers
-- (sans alias de table) — ces deux noms existent AUSSI comme paramètres
-- OUT de get_company_bookings_overview (booking_id, created_at),
-- rendant la référence ambiguë. Un alias de table + qualification
-- explicite lève l'ambiguïté, comme pour les fonctions de sweep.

create or replace function public.get_company_bookings_overview(p_company_id uuid)
returns table (
  booking_id uuid,
  booking_reference text,
  passenger_names text,
  phone text,
  origin_city text,
  destination_city text,
  departure_at timestamptz,
  bus_number text,
  booking_status text,
  voucher_status text,
  latest_payment_status text,
  total_price_fcfa integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    with passenger_names as (
      select p.booking_id, string_agg(p.full_name, ', ' order by p.created_at) as names
      from public.passengers p
      group by p.booking_id
    )
    select
      b.id as booking_id,
      b.booking_reference,
      coalesce(pn.names, '') as passenger_names,
      b.phone,
      r.origin_city,
      r.destination_city,
      t.departure_at,
      t.bus_number,
      b.status as booking_status,
      v.status as voucher_status,
      lp.status as latest_payment_status,
      b.total_price_fcfa,
      b.created_at
    from public.bookings b
    join public.trips t on t.id = b.trip_id
    join public.routes r on r.id = t.route_id
    left join passenger_names pn on pn.booking_id = b.id
    left join public.vouchers v on v.origin_booking_id = b.id
    left join lateral (
      select pay.status
      from public.payments pay
      where pay.booking_id = b.id
      order by pay.paid_at desc nulls last, pay.created_at desc
      limit 1
    ) lp on true
    where b.company_id = p_company_id
    order by t.departure_at desc;
end;
$$;

-- Grants déjà en place (to service_role) — create or replace préserve une
-- signature identique donc pas de re-grant nécessaire.
