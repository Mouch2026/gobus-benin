-- Chantier : deux extensions au flux "+ Nouvelle réservation" côté
-- compagnie (existant depuis hier, 20260909120000/20260909130000) :
--   1. choix manuel du siège par passager (au lieu de toujours prendre le
--      premier libre) ;
--   2. enregistrement d'un paiement déjà reçu au comptoir (espèces/carte),
--      sans jamais passer par payment_token.

-- ============================================================================
-- 1. payments : élargir method et provider pour représenter un paiement
--    encaissé au comptoir.
--
--    method gagne 'cash' (demande explicite).
--
--    provider gagne 'manual' — au-delà de la demande littérale (qui ne
--    portait que sur method), mais nécessaire : ni 'simulated' (paiement en
--    ligne simulé en l'absence d'intégration FedaPay réelle) ni 'fedapay'
--    ne décrivent honnêtement un encaissement physique saisi par la
--    compagnie. Sans cette valeur, on serait forcé de mentir sur cette
--    colonne pour ce nouveau cas.
-- ============================================================================

alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('mtn_money', 'moov_money', 'card', 'cash'));

alter table public.payments drop constraint payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('simulated', 'fedapay', 'manual'));

-- platform_fee_collected : distingue "la compagnie doit encore la
-- commission plateforme sur ce paiement" (paiement comptoir, l'argent n'a
-- jamais transité par nous) de "on l'a réellement perçue" (tout paiement
-- en ligne, simulated/fedapay — l'argent transite par nous). default true
-- + backfill implicite pour tout paiement déjà existant : ils sont tous
-- des paiements en ligne (cette colonne n'existe pas encore, donc aucun
-- paiement comptoir n'a pu être créé avant cette migration).
alter table public.payments
  add column platform_fee_collected boolean not null default true;

-- ============================================================================
-- 2. assign_and_insert_passengers : ajoute un paramètre optionnel
--    p_requested_seats (même longueur/ordre que p_passenger_names, NULL par
--    élément = attribution automatique pour ce passager). drop puis create
--    (pas create or replace) : ajouter un paramètre change la signature de
--    la fonction, piège déjà rencontré plusieurs fois sur ce projet.
--
--    Aucun nouveau verrou : cette fonction continue de s'exécuter à
--    l'intérieur de create_booking, après l'insert into bookings qui a
--    déjà déclenché reserve_trip_seats et posé le verrou sur trips dans la
--    même transaction — exactement le même raisonnement que l'attribution
--    automatique déjà en place. La revérification de v_taken/v_assigned
--    juste avant l'insertion, PLUS l'index unique partiel
--    passengers_trip_id_seat_number_unique_idx (jamais modifié), restent
--    l'unique protection anti-collision, réutilisée à l'identique pour les
--    deux modes (auto et choisi).
-- ============================================================================

drop function if exists public.assign_and_insert_passengers(uuid, uuid, text[]);

create function public.assign_and_insert_passengers(
  p_booking_id uuid,
  p_trip_id uuid,
  p_passenger_names text[],
  p_requested_seats text[] default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_seat_labels jsonb;
  v_taken text[];
  v_candidate text;
  v_assigned text[] := '{}';
  v_name text;
  v_requested text;
  i int;
begin
  if not exists (select 1 from public.bookings where id = p_booking_id and trip_id = p_trip_id) then
    raise exception 'Réservation et trajet incohérents' using errcode = 'check_violation';
  end if;

  if p_requested_seats is not null and array_length(p_requested_seats, 1) <> array_length(p_passenger_names, 1) then
    raise exception 'Le nombre de sièges choisis doit correspondre au nombre de passagers'
      using errcode = 'check_violation';
  end if;

  select bl.seat_labels into v_seat_labels
  from public.trips t
  join public.bus_layouts bl on bl.id = t.bus_layout_id
  where t.id = p_trip_id;

  -- Sièges déjà occupés sur CE trajet, toutes réservations non annulées
  -- confondues — inchangé, même requête qu'avant ce chantier.
  select coalesce(array_agg(p.seat_number), '{}') into v_taken
  from public.passengers p
  join public.bookings b on b.id = p.booking_id
  where b.trip_id = p_trip_id and b.status <> 'cancelled' and p.seat_number is not null;

  for i in 1 .. array_length(p_passenger_names, 1) loop
    v_name := p_passenger_names[i];
    v_requested := case when p_requested_seats is not null then p_requested_seats[i] else null end;

    if v_requested is not null then
      if not exists (select 1 from jsonb_array_elements_text(v_seat_labels) elem where elem = v_requested) then
        raise exception 'Siège "%" introuvable sur ce plan de bus', v_requested
          using errcode = 'check_violation';
      end if;

      -- Revérifié ICI, au moment de l'insertion réelle : un siège vu
      -- "libre" au chargement de la page a pu être pris entre-temps par
      -- une autre réservation — jamais fait confiance à ce que le client a
      -- affiché.
      if v_requested = any (v_taken || v_assigned) then
        raise exception 'Le siège "%" vient d''être pris, merci d''en choisir un autre', v_requested
          using errcode = 'unique_violation';
      end if;

      v_candidate := v_requested;
    else
      -- Comportement automatique inchangé, à l'identique : premier siège
      -- libre dans l'ordre du tableau.
      select elem into v_candidate
      from jsonb_array_elements_text(v_seat_labels) with ordinality as t(elem, ord)
      where elem <> all (v_taken || v_assigned)
      order by ord
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

revoke execute on function public.assign_and_insert_passengers(uuid, uuid, text[], text[]) from public;
grant execute on function public.assign_and_insert_passengers(uuid, uuid, text[], text[]) to authenticated;
grant execute on function public.assign_and_insert_passengers(uuid, uuid, text[], text[]) to service_role;

-- ============================================================================
-- 3. create_booking / create_booking_for_company : passe-plat de
--    p_requested_seats jusqu'à assign_and_insert_passengers, aucune
--    logique nouvelle sinon. Corps repris à l'identique de
--    20260909120000_add_company_booking_for_customer.sql (drop+create,
--    même raison : changement de signature).
-- ============================================================================

drop function if exists public.create_booking(uuid, integer, text, text[], uuid);

create function public.create_booking(
  p_trip_id uuid,
  p_seat_count integer,
  p_phone text,
  p_passenger_names text[],
  p_user_id uuid default null,
  p_requested_seats text[] default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id uuid;
  v_trip_price integer;
  v_trip_departure timestamptz;
  v_booking_id uuid;
begin
  if p_user_id is not null then
    if current_user <> 'service_role' then
      raise exception 'p_user_id réservé à service_role' using errcode = '42501';
    end if;
    v_user_id := p_user_id;
  else
    v_user_id := auth.uid();
  end if;

  if v_user_id is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  if array_length(p_passenger_names, 1) is distinct from p_seat_count then
    raise exception 'Le nombre de passagers doit correspondre au nombre de places'
      using errcode = 'check_violation';
  end if;

  select price_fcfa, departure_at into v_trip_price, v_trip_departure
  from public.trips where id = p_trip_id;
  if v_trip_price is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  if v_trip_departure <= now() then
    raise exception 'Ce trajet est déjà parti, la réservation n''est plus possible'
      using errcode = 'check_violation';
  end if;

  insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, phone)
  values (p_trip_id, v_user_id, p_seat_count, v_trip_price * p_seat_count, p_phone)
  returning id into v_booking_id;
  -- reserve_trip_seats locks trips here — assign_and_insert_passengers
  -- runs below while that lock is still held, in the same transaction.

  perform public.assign_and_insert_passengers(v_booking_id, p_trip_id, p_passenger_names, p_requested_seats);

  return v_booking_id;
end;
$$;

revoke execute on function public.create_booking(uuid, integer, text, text[], uuid, text[]) from public;
grant execute on function public.create_booking(uuid, integer, text, text[], uuid, text[]) to authenticated;
grant execute on function public.create_booking(uuid, integer, text, text[], uuid, text[]) to service_role;

drop function if exists public.create_booking_for_company(uuid, integer, text, text[], uuid, uuid);

create function public.create_booking_for_company(
  p_trip_id uuid,
  p_seat_count integer,
  p_phone text,
  p_passenger_names text[],
  p_user_id uuid,
  p_company_id uuid,
  p_requested_seats text[] default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_trip_company_id uuid;
begin
  select company_id into v_trip_company_id from public.trips where id = p_trip_id;
  if v_trip_company_id is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  if v_trip_company_id <> p_company_id then
    raise exception 'Ce trajet n''appartient pas à votre compagnie' using errcode = 'check_violation';
  end if;

  return public.create_booking(p_trip_id, p_seat_count, p_phone, p_passenger_names, p_user_id, p_requested_seats);
end;
$$;

revoke execute on function public.create_booking_for_company(uuid, integer, text, text[], uuid, uuid, text[]) from public;
grant execute on function public.create_booking_for_company(uuid, integer, text, text[], uuid, uuid, text[]) to service_role;
