-- Chantier : redesign de /reservations (back-office) — vue d'ensemble par
-- réservation, export filtré, réassignation de siège sans collision,
-- annulation d'une réservation individuelle par la compagnie.

-- ============================================================================
-- 1. get_company_bookings_overview : une ligne par RÉSERVATION (pas par
--    passager comme get_company_passenger_bookings, qui reste inchangée —
--    /clients en dépend toujours). Ajoute ce qui manquait pour ce
--    chantier : statut du dernier paiement, statut de l'avoir éventuel.
--    Même convention de sécurité que toutes les fonctions company-scoped
--    de ce projet : security definer, service_role UNIQUEMENT, portée
--    garantie par le filtre where b.company_id = p_company_id lui-même.
-- ============================================================================

create function public.get_company_bookings_overview(p_company_id uuid)
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
      select booking_id, string_agg(full_name, ', ' order by created_at) as names
      from public.passengers
      group by booking_id
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

revoke execute on function public.get_company_bookings_overview(uuid) from public;
grant execute on function public.get_company_bookings_overview(uuid) to service_role;

-- ============================================================================
-- 2. get_company_bookings_export_rows : remplace get_company_bookings_for_export
--    (Dashboard, "export du jour") — aucun autre appelant, et son contrat
--    (from/to) ne correspond plus au besoin : l'export respecte
--    maintenant les filtres actifs du tableau /reservations, décidés côté
--    TypeScript (filterBookings), pas une plage de dates SQL. drop +
--    create : signature différente.
-- ============================================================================

drop function if exists public.get_company_bookings_for_export(uuid, timestamptz, timestamptz);

create function public.get_company_bookings_export_rows(p_company_id uuid, p_booking_ids uuid[])
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
      and b.id = any(p_booking_ids)
    order by b.created_at asc;
end;
$$;

revoke execute on function public.get_company_bookings_export_rows(uuid, uuid[]) from public;
grant execute on function public.get_company_bookings_export_rows(uuid, uuid[]) to service_role;

-- ============================================================================
-- 3. update_booking_details : correction de nom(s) de passager, téléphone
--    de contact, réassignation de siège — jamais seat_count ni trip_id
--    (structurellement impossible : ne touche que des passagers déjà
--    existants de CETTE réservation). Une seule fonction atomique plutôt
--    que plusieurs appels séparés : téléphone + noms + sièges dans une
--    seule transaction, jamais d'état partiel si une étape échoue.
--
--    Mécanisme anti-collision de siège : assign_and_insert_passengers (à
--    la création d'une réservation) ne pose aucun verrou explicite — il
--    "surfe" sur le verrou de ligne déjà posé par reserve_trip_seats (un
--    UPDATE ... trips dans la même transaction). Ici, il n'y a pas cet
--    UPDATE gratuit puisqu'on ne crée pas de réservation : un
--    `select ... for update` explicite sur trips le remplace. Deux appels
--    concurrents (double-clic compris) se sérialisent sur ce verrou — le
--    second relit toujours les sièges réellement occupés après le commit
--    du premier, jamais une version obsolète. L'index unique partiel
--    passengers_trip_id_seat_number_unique_idx (déjà en place) reste le
--    filet de sécurité final si ce raisonnement avait un trou.
-- ============================================================================

create function public.update_booking_details(
  p_booking_id uuid,
  p_company_id uuid,
  p_phone text,
  p_passenger_updates jsonb -- [{"passenger_id": uuid, "full_name": text, "seat_number": text|null}, ...]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_seat_labels jsonb;
  v_update jsonb;
  v_passenger_id uuid;
  v_seat_number text;
  v_seat_taken boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Réservation introuvable' using errcode = 'check_violation';
  end if;

  if v_booking.company_id <> p_company_id then
    raise exception 'Cette réservation n''appartient pas à votre compagnie' using errcode = 'check_violation';
  end if;

  if v_booking.status in ('cancelled', 'completed') then
    raise exception 'Cette réservation ne peut plus être modifiée' using errcode = 'check_violation';
  end if;

  -- Rejette tout le tableau si un passenger_id y apparaît plus d'une
  -- fois : sans ce contrôle, la boucle plus bas traiterait les deux
  -- entrées séquentiellement — la seconde écraserait silencieusement la
  -- première (dernier gagnant), sans jamais passer par la vérification de
  -- collision de siège (qui exclut justement p2.id <> v_passenger_id, donc
  -- ne se déclenche jamais entre deux entrées visant LE MÊME passager).
  -- Contrairement à une vraie collision de siège entre deux passagers
  -- différents (détectée plus bas), ce cas ne lève aujourd'hui aucune
  -- erreur — vérifié avant tout effet de bord (avant le verrou et avant
  -- la mise à jour du téléphone), pour ne jamais appliquer un résultat
  -- partiellement écrasé.
  if jsonb_array_length(p_passenger_updates) <> (
    select count(distinct elem->>'passenger_id')
    from jsonb_array_elements(p_passenger_updates) as elem
  ) then
    raise exception 'La liste des passagers contient un doublon' using errcode = 'check_violation';
  end if;

  perform 1 from public.trips where id = v_booking.trip_id for update;

  select bl.seat_labels into v_seat_labels
  from public.trips t
  join public.bus_layouts bl on bl.id = t.bus_layout_id
  where t.id = v_booking.trip_id;

  update public.bookings set phone = p_phone where id = p_booking_id;

  for v_update in select * from jsonb_array_elements(p_passenger_updates)
  loop
    v_passenger_id := (v_update->>'passenger_id')::uuid;
    v_seat_number := v_update->>'seat_number';

    if not exists (
      select 1 from public.passengers where id = v_passenger_id and booking_id = p_booking_id
    ) then
      raise exception 'Passager introuvable sur cette réservation' using errcode = 'check_violation';
    end if;

    if v_seat_number is not null then
      if not (v_seat_labels ? v_seat_number) then
        raise exception 'Ce siège n''existe pas sur le plan de bus de ce trajet'
          using errcode = 'check_violation';
      end if;

      select exists (
        select 1 from public.passengers p2
        join public.bookings b2 on b2.id = p2.booking_id
        where p2.trip_id = v_booking.trip_id
          and p2.seat_number = v_seat_number
          and p2.id <> v_passenger_id
          and b2.status <> 'cancelled'
      ) into v_seat_taken;

      if v_seat_taken then
        raise exception 'Le siège % est déjà occupé', v_seat_number using errcode = 'check_violation';
      end if;
    end if;

    update public.passengers
    set full_name = v_update->>'full_name', seat_number = v_seat_number
    where id = v_passenger_id;
  end loop;
end;
$$;

revoke execute on function public.update_booking_details(uuid, uuid, text, jsonb) from public;
grant execute on function public.update_booking_details(uuid, uuid, text, jsonb) to service_role;

-- ============================================================================
-- 4. cancel_booking_by_company : annule UNE réservation confirmée (pas
--    tout le trajet), scoped à la compagnie. Réutilise
--    issue_voucher_and_cancel_booking SANS la dupliquer — même règle que
--    cancel_booking (voyageur) et cancel_confirmed_bookings_for_trip
--    (compagnie, tout un trajet) : avoir de base_amount_fcfa valable 24h,
--    jamais de remboursement direct. issue_voucher_and_cancel_booking
--    n'a aucun GRANT (ni authenticated ni service_role) — appelable
--    uniquement depuis l'intérieur d'une autre fonction security definer,
--    exactement comme ici.
-- ============================================================================

create function public.cancel_booking_by_company(p_booking_id uuid, p_company_id uuid)
returns table (voucher_amount_fcfa integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_departure_at timestamptz;
  v_base_amount integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Réservation introuvable' using errcode = 'check_violation';
  end if;

  if v_booking.company_id <> p_company_id then
    raise exception 'Cette réservation n''appartient pas à votre compagnie' using errcode = 'check_violation';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'Seule une réservation confirmée peut être annulée' using errcode = 'check_violation';
  end if;

  select departure_at into v_departure_at from public.trips where id = v_booking.trip_id;
  if v_departure_at <= now() then
    raise exception 'Ce trajet est déjà parti, la réservation ne peut plus être annulée'
      using errcode = 'check_violation';
  end if;

  select base_amount_fcfa into v_base_amount from public.payments
  where booking_id = p_booking_id and status = 'approved'
  order by paid_at desc nulls last limit 1;

  if v_base_amount is null then
    raise exception 'Aucun paiement approuvé trouvé pour cette réservation' using errcode = 'check_violation';
  end if;

  perform public.issue_voucher_and_cancel_booking(p_booking_id, v_base_amount);

  return query select v_base_amount;
end;
$$;

revoke execute on function public.cancel_booking_by_company(uuid, uuid) from public;
grant execute on function public.cancel_booking_by_company(uuid, uuid) to service_role;
