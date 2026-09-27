-- Chantier : évaluation des chauffeurs par les voyageurs. Première
-- écriture CÔTÉ VOYAGEUR (apps/web) sur le domaine "chauffeur" — jusqu'ici
-- drivers n'était lisible par personne côté voyageur (RLS
-- is_company_member uniquement, jamais de policy publique).

-- ============================================================================
-- 1. driver_ratings — une note par RÉSERVATION (pas par passager nommé),
--    définitive : aucune policy update/delete pour authenticated, comme
--    driver_documents.
-- ============================================================================

create table public.driver_ratings (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  driver_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  -- Même patron composite que trips.driver_id / driver_documents.
  foreign key (driver_id, company_id) references public.drivers (id, company_id)
);

create index driver_ratings_driver_id_idx on public.driver_ratings (driver_id);

alter table public.driver_ratings enable row level security;

-- Deux policies SELECT, combinées en OR (comportement standard de
-- plusieurs policies sur la même commande) :
--  1. La compagnie (owner + agency_manager), cohérent avec les documents.
--  2. Le voyageur lit SA PROPRE note — nécessaire pour que
--     /compte/reservations sache si "Noter mon chauffeur" doit encore
--     s'afficher, sans RPC de lecture dédiée.
create policy "driver_ratings_select_manager" on public.driver_ratings
  for select using (public.is_company_manager_or_owner(company_id));
create policy "driver_ratings_select_own" on public.driver_ratings
  for select using (user_id = auth.uid());

-- Aucune policy insert/update/delete pour authenticated : toute écriture
-- passe par submit_driver_rating() (security definer) ci-dessous.
grant select on public.driver_ratings to authenticated;
grant all on public.driver_ratings to service_role;

-- ============================================================================
-- 2. submit_driver_rating — même patron exact que cancel_booking
--    (20260912130000_add_backoffice_notifications.sql) : security
--    definer, ne reçoit JAMAIS un user id du client, relit la
--    réservation et vérifie auth.uid() elle-même.
--
--    Éligibilité, dans l'ordre : réservation existante et possédée par
--    l'appelant, statut 'confirmed' (jamais 'completed' — aucun code de
--    ce projet ne pose jamais ce statut, vérifié), un chauffeur est
--    assigné au trajet, le trajet est terminé (réel via arrival_at si
--    connu, sinon estimé via estimate_trip_duration_hours — même règle
--    exacte que get_company_drivers_overview), pas déjà noté.
--
--    Le cas "déjà noté" lève une exception avec un message clair
--    (contrairement à validate_boarding/chantier Embarquement, il n'y a
--    ici aucun effet de bord à committer malgré le rejet — donc pas
--    besoin de la distinction "retour normal vs exception" que ce
--    chantier-là avait dû faire). La contrainte unique(booking_id) reste
--    le filet de sécurité final sous concurrence.
-- ============================================================================

create function public.submit_driver_rating(
  p_booking_id uuid,
  p_stars integer,
  p_comment text default null
)
returns table (id uuid, company_id uuid, driver_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_trip public.trips%rowtype;
  v_distance_km integer;
  v_trip_end timestamptz;
  v_rating_id uuid;
begin
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'La note doit être comprise entre 1 et 5 étoiles' using errcode = 'check_violation';
  end if;

  select * into v_booking from public.bookings b where b.id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Réservation introuvable' using errcode = 'check_violation';
  end if;

  if v_booking.user_id <> auth.uid() then
    raise exception 'Cette réservation ne vous appartient pas' using errcode = 'check_violation';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'Seule une réservation confirmée peut être notée' using errcode = 'check_violation';
  end if;

  select * into v_trip from public.trips t where t.id = v_booking.trip_id;

  if v_trip.driver_id is null then
    raise exception 'Aucun chauffeur n''est affecté à ce trajet' using errcode = 'check_violation';
  end if;

  select r.distance_km into v_distance_km from public.routes r where r.id = v_trip.route_id;

  v_trip_end := coalesce(
    v_trip.arrival_at,
    v_trip.departure_at + (public.estimate_trip_duration_hours(v_distance_km) * interval '1 hour')
  );
  if now() < v_trip_end then
    raise exception 'Ce trajet n''est pas encore terminé' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.driver_ratings where booking_id = p_booking_id) then
    raise exception 'Vous avez déjà noté ce chauffeur pour cette réservation' using errcode = 'check_violation';
  end if;

  insert into public.driver_ratings (booking_id, driver_id, company_id, user_id, stars, comment)
  values (p_booking_id, v_trip.driver_id, v_booking.company_id, auth.uid(), p_stars, nullif(trim(p_comment), ''))
  returning driver_ratings.id into v_rating_id;

  return query select v_rating_id, v_booking.company_id, v_trip.driver_id;
end;
$$;

revoke execute on function public.submit_driver_rating(uuid, integer, text) from public;
grant execute on function public.submit_driver_rating(uuid, integer, text) to authenticated;

-- ============================================================================
-- 3. get_company_drivers_overview étendue (moyenne + nombre d'avis).
--    DROP puis CREATE, pas un simple CREATE OR REPLACE : Postgres refuse
--    de changer les colonnes de sortie d'une fonction existante via
--    REPLACE (même raison déjà rencontrée pour
--    get_company_bookings_export_rows, 20260909090000). Comportement
--    inchangé pour les 10 premières colonnes — seules average_rating et
--    ratings_count sont ajoutées.
-- ============================================================================

drop function if exists public.get_company_drivers_overview(uuid);

create function public.get_company_drivers_overview(p_company_id uuid)
returns table (
  driver_id uuid,
  full_name text,
  phone text,
  license_number text,
  is_active boolean,
  current_trip_id uuid,
  current_bus_number text,
  current_origin_city text,
  current_destination_city text,
  current_departure_at timestamptz,
  average_rating numeric,
  ratings_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      d.id as driver_id,
      d.full_name,
      d.phone,
      d.license_number,
      d.is_active,
      t.id as current_trip_id,
      t.bus_number as current_bus_number,
      t.origin_city as current_origin_city,
      t.destination_city as current_destination_city,
      t.departure_at as current_departure_at,
      rt.avg_stars,
      coalesce(rt.n, 0)
    from public.drivers d
    left join lateral (
      select
        trips.id,
        trips.bus_number,
        trips.departure_at,
        routes.origin_city,
        routes.destination_city
      from public.trips
      join public.routes on routes.id = trips.route_id
      where trips.driver_id = d.id
        and now() between trips.departure_at and (
          trips.departure_at
            + (public.estimate_trip_duration_hours(routes.distance_km) * interval '1 hour')
        )
      order by trips.departure_at desc
      limit 1
    ) t on true
    left join lateral (
      select round(avg(stars)::numeric, 1) as avg_stars, count(*)::integer as n
      from public.driver_ratings dr
      where dr.driver_id = d.id
    ) rt on true
    where d.company_id = p_company_id
    order by d.full_name asc;
end;
$$;

revoke execute on function public.get_company_drivers_overview(uuid) from public;
grant execute on function public.get_company_drivers_overview(uuid) to service_role;

-- ============================================================================
-- 4. get_driver_ratings — liste détaillée pour la fiche chauffeur. Le nom
--    du voyageur vient de passengers.full_name via string_agg, même
--    patron exact que get_company_bookings_overview (20260912130000) —
--    jamais auth.users, donc aucun risque de cast varchar/text.
-- ============================================================================

create function public.get_driver_ratings(p_driver_id uuid, p_company_id uuid)
returns table (
  id uuid,
  stars integer,
  comment text,
  created_at timestamptz,
  reviewer_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    dr.id,
    dr.stars,
    dr.comment,
    dr.created_at,
    coalesce(pn.names, 'Voyageur')
  from public.driver_ratings dr
  left join lateral (
    select string_agg(p.full_name, ', ' order by p.created_at) as names
    from public.passengers p
    where p.booking_id = dr.booking_id
  ) pn on true
  where dr.driver_id = p_driver_id
    and dr.company_id = p_company_id
  order by dr.created_at desc;
$$;

revoke execute on function public.get_driver_ratings(uuid, uuid) from public;
grant execute on function public.get_driver_ratings(uuid, uuid) to service_role;
