-- Chantier "Embarquement" — validation de billets par scan QR/saisie
-- manuelle. Granularité au PASSAGER (passengers.seat_number), jamais à la
-- réservation : une réservation peut contenir plusieurs passagers
-- (bookings.seat_count > 1), chacun doit être validé individuellement.

-- ============================================================================
-- 1. boarding_validations — une ligne par passager effectivement embarqué.
--    company_id est dénormalisé depuis trip_id (même choix que
--    audit_logs.company_id) pour simplifier GRANT et RPC de lecture.
-- ============================================================================

create table public.boarding_validations (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.passengers (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete restrict,
  company_id uuid not null references public.companies (id) on delete cascade,
  agency_id uuid references public.agencies (id) on delete restrict,
  validated_by uuid not null references auth.users (id),
  method text not null check (method in ('scan', 'manuel')),
  validated_at timestamptz not null default now(),
  -- Anti-double-validation : un passager ne peut être embarqué qu'une
  -- seule fois. C'est ce filet, et non une logique applicative, qui
  -- garantit l'invariant même sous concurrence — validate_boarding()
  -- verrouille la réservation avant de vérifier cette unicité, mais cette
  -- contrainte reste le dernier rempart si ce raisonnement avait un trou
  -- (même philosophie que passengers_trip_id_seat_number_unique_idx).
  constraint boarding_validations_passenger_unique unique (passenger_id)
);

create index boarding_validations_company_id_idx
  on public.boarding_validations (company_id, validated_at desc);

create index boarding_validations_trip_id_idx
  on public.boarding_validations (trip_id);

alter table public.boarding_validations enable row level security;

-- Lecture : tout membre actif de la compagnie (owner, agency_manager,
-- agent) — même granularité que is_company_member ailleurs. Les pages du
-- back-office lisent en pratique via les RPC service_role ci-dessous
-- (comme /reservations), cette policy reste la protection de fond exigée
-- par la convention du projet.
create policy "boarding_validations_select_member" on public.boarding_validations
  for select
  using (public.is_company_member(company_id));

-- Pas de policy insert/update/delete pour authenticated : toute écriture
-- passe par validate_boarding() (security definer), jamais par un insert
-- direct côté client — même convention que company_notifications.
grant select on public.boarding_validations to authenticated;
grant all on public.boarding_validations to service_role;

-- ============================================================================
-- 2. validate_boarding — cœur métier. Verrou AVANT tout calcul, même
--    patron que record_payment_part_received / simulate_single_booking_payment
--    (verrouiller la RÉSERVATION, pas seulement le passager, empêche aussi
--    une annulation concurrente de la réservation pendant la validation
--    d'un de ses passagers).
--
--    Ordre de vérification exact demandé : appartenance compagnie ->
--    trajet correspondant -> fenêtre de temps -> statut réservation ->
--    non-déjà-validé.
--
--    Cas "déjà validé" : ce n'est PAS une exception SQL comme les autres
--    rejets, volontairement — une exception provoquerait un ROLLBACK qui
--    annulerait aussi l'insertion de l'alerte de fraude qu'on veut
--    justement committer. On retourne donc un statut normal
--    (already_validated = true) après avoir inséré la notification, la
--    fonction appelante décide de l'affichage du rejet.
-- ============================================================================

create function public.validate_boarding(
  p_passenger_id uuid,
  p_trip_id uuid,
  p_company_id uuid,
  p_agency_id uuid,
  p_actor_id uuid,
  p_method text
)
returns table (
  already_validated boolean,
  previous_validated_at timestamptz,
  previous_validated_by_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_existing record;
begin
  if p_method not in ('scan', 'manuel') then
    raise exception 'Méthode de validation invalide' using errcode = 'check_violation';
  end if;

  select b.* into v_booking
  from public.bookings b
  join public.passengers p on p.booking_id = b.id
  where p.id = p_passenger_id
  for update of b;

  if v_booking.id is null then
    raise exception 'Billet introuvable' using errcode = 'check_violation';
  end if;

  if v_booking.company_id <> p_company_id then
    raise exception 'Ce billet n''appartient pas à votre compagnie' using errcode = 'check_violation';
  end if;

  if v_booking.trip_id <> p_trip_id then
    raise exception 'Ce billet est pour un autre trajet que celui en cours' using errcode = 'check_violation';
  end if;

  -- Fenêtre [departure_at - 2h, departure_at] : comparaison sur
  -- timestamptz, departure_at est déjà un instant absolu, aucune logique
  -- de fuseau horaire n'est nécessaire ici.
  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and now() between t.departure_at - interval '2 hours' and t.departure_at
  ) then
    raise exception 'Hors de la fenêtre d''embarquement pour ce trajet' using errcode = 'check_violation';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'Réservation annulée ou non payée' using errcode = 'check_violation';
  end if;

  select bv.validated_at, coalesce(cm.full_name, 'Agent') as validated_by_name
  into v_existing
  from public.boarding_validations bv
  left join public.company_members cm
    on cm.user_id = bv.validated_by and cm.company_id = bv.company_id
  where bv.passenger_id = p_passenger_id;

  if found then
    -- L'alerte de fraude EST le rejet ici, pas un rejet silencieux en
    -- plus — réutilise entièrement company_notifications (chantier 5),
    -- nouveau type sans migration de schéma (type n'a pas de CHECK).
    insert into public.company_notifications
      (company_id, kind, type, level, title, body, action_href, target_agency_id)
    values (
      p_company_id, 'event', 'boarding_double_validation', 'warning',
      'Tentative de double validation — ' || v_booking.booking_reference,
      'Billet déjà embarqué le ' || to_char(v_existing.validated_at, 'DD/MM à HH24:MI') ||
        ' par ' || v_existing.validated_by_name || '. Nouvelle tentative détectée.',
      '/embarquement',
      p_agency_id
    );

    return query select true, v_existing.validated_at, v_existing.validated_by_name;
    return;
  end if;

  insert into public.boarding_validations
    (passenger_id, trip_id, company_id, agency_id, validated_by, method)
  values (p_passenger_id, p_trip_id, p_company_id, p_agency_id, p_actor_id, p_method);

  return query select false, null::timestamptz, null::text;
end;
$$;

revoke execute on function public.validate_boarding(uuid, uuid, uuid, uuid, uuid, text) from public;
grant execute on function public.validate_boarding(uuid, uuid, uuid, uuid, uuid, text) to service_role;

-- ============================================================================
-- 3. get_company_boarding_validations_overview — une ligne par validation,
--    même patron que get_company_bookings_overview : security definer,
--    service_role UNIQUEMENT, portée garantie par le filtre company_id.
-- ============================================================================

create function public.get_company_boarding_validations_overview(p_company_id uuid)
returns table (
  validation_id uuid,
  booking_id uuid,
  booking_reference text,
  origin_city text,
  destination_city text,
  departure_at timestamptz,
  bus_number text,
  full_name text,
  seat_number text,
  validated_at timestamptz,
  method text,
  validated_by_name text,
  trip_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      bv.id as validation_id,
      b.id as booking_id,
      b.booking_reference,
      r.origin_city,
      r.destination_city,
      t.departure_at,
      t.bus_number,
      p.full_name,
      p.seat_number,
      bv.validated_at,
      bv.method,
      coalesce(cm.full_name, 'Agent') as validated_by_name,
      t.id as trip_id
    from public.boarding_validations bv
    join public.passengers p on p.id = bv.passenger_id
    join public.bookings b on b.id = p.booking_id
    join public.trips t on t.id = bv.trip_id
    join public.routes r on r.id = t.route_id
    left join public.company_members cm
      on cm.user_id = bv.validated_by and cm.company_id = bv.company_id
    where bv.company_id = p_company_id
    order by bv.validated_at desc;
end;
$$;

revoke execute on function public.get_company_boarding_validations_overview(uuid) from public;
grant execute on function public.get_company_boarding_validations_overview(uuid) to service_role;

-- ============================================================================
-- 4. get_company_boarding_validations_export_rows — même shape, pour
--    l'export CSV filtré, même patron que get_company_bookings_export_rows.
-- ============================================================================

create function public.get_company_boarding_validations_export_rows(
  p_company_id uuid,
  p_validation_ids uuid[]
)
returns table (
  booking_reference text,
  origin_city text,
  destination_city text,
  departure_at timestamptz,
  bus_number text,
  full_name text,
  seat_number text,
  validated_at timestamptz,
  method text,
  validated_by_name text
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
      p.seat_number,
      bv.validated_at,
      bv.method,
      coalesce(cm.full_name, 'Agent') as validated_by_name
    from public.boarding_validations bv
    join public.passengers p on p.id = bv.passenger_id
    join public.bookings b on b.id = p.booking_id
    join public.trips t on t.id = bv.trip_id
    join public.routes r on r.id = t.route_id
    left join public.company_members cm
      on cm.user_id = bv.validated_by and cm.company_id = bv.company_id
    where bv.company_id = p_company_id
      and bv.id = any(p_validation_ids)
    order by bv.validated_at asc;
end;
$$;

revoke execute on function public.get_company_boarding_validations_export_rows(uuid, uuid[]) from public;
grant execute on function public.get_company_boarding_validations_export_rows(uuid, uuid[]) to service_role;
