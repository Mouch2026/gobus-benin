-- Chantier B : disponibilités déclarées + historique enrichi des trajets.
-- Complète le chantier A (chauffeurs) : DriverDisplayStatus n'avait
-- délibérément pas de statut "congé" (voir le commentaire dans
-- apps/backoffice/app/(app)/_shared.tsx) — c'est ce que cette migration
-- ajoute, sans toucher au statut existant (en_mission/disponible/archive
-- reste basé uniquement sur les trajets assignés).

-- ============================================================================
-- 1. driver_unavailability — congé/maladie/indisponibilité déclarée.
--    Contrairement à drivers (archive, jamais de suppression réelle), une
--    indisponibilité est un événement de planning révocable : suppression
--    réelle permise (voir policy plus bas), pas un is_active.
-- ============================================================================

create table public.driver_unavailability (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text not null check (reason in ('conge', 'maladie', 'indisponible')),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  -- Même patron composite que trips.driver_id (chantier A) : interdit
  -- déclarativement de déclarer une indisponibilité pour le chauffeur
  -- d'une AUTRE compagnie.
  foreign key (driver_id, company_id) references public.drivers (id, company_id)
);

create index driver_unavailability_driver_id_idx
  on public.driver_unavailability (driver_id, start_date, end_date);

create trigger set_updated_at before update on public.driver_unavailability
  for each row execute function public.set_updated_at();

alter table public.driver_unavailability enable row level security;

-- Lecture ouverte à tout membre actif (même niveau que drivers/trips),
-- écriture (insert/update/delete) réservée à owner + agency_manager —
-- même niveau que l'affectation de chauffeur à un trajet (trips.manage),
-- PAS le niveau CRUD du roster (drivers.manage, owner seul).
create policy "driver_unavailability_select_member" on public.driver_unavailability
  for select using (public.is_company_member(company_id));
create policy "driver_unavailability_write_manager" on public.driver_unavailability
  for all using (public.is_company_manager_or_owner(company_id))
  with check (public.is_company_manager_or_owner(company_id));

grant select, insert, update, delete on public.driver_unavailability to authenticated;
grant all on public.driver_unavailability to service_role;

-- ============================================================================
-- 2. estimate_trip_duration_hours — extrait de get_company_drivers_overview
--    (20260922090000, corrigée par 20260923090000) pour ne plus dupliquer
--    les constantes 60 km/h / repli 4h ailleurs (get_driver_month_coverage,
--    get_driver_trip_history, tous deux ajoutés par cette migration).
--    JAMAIS une vraie donnée de fin de trajet — voir le commentaire complet
--    d'origine dans 20260923090000 pour la justification des deux valeurs.
-- ============================================================================

create or replace function public.estimate_trip_duration_hours(p_distance_km integer)
returns numeric
language sql
immutable
as $$
  select coalesce(p_distance_km / 60.0, 4.0);
$$;

-- get_company_drivers_overview recréée à l'identique (même comportement,
-- mêmes constantes 60/4 — vérifié par la suite de tests déjà exécutée sur
-- le chantier A), seule la formule est maintenant appelée depuis la
-- fonction partagée ci-dessus au lieu d'être dupliquée inline.
create or replace function public.get_company_drivers_overview(p_company_id uuid)
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
  current_departure_at timestamptz
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
      t.departure_at as current_departure_at
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
    where d.company_id = p_company_id
    order by d.full_name asc;
end;
$$;

-- ============================================================================
-- 3. get_driver_month_coverage — bornes brutes des trajets ET des
--    indisponibilités d'un chauffeur qui touchent un mois donné. Le calcul
--    "quel jour du mois est couvert" reste fait en TypeScript (voir
--    apps/backoffice/lib/duration.ts) : générer dynamiquement l'ensemble
--    des jours touchés par un intervalle est plus naturel côté TS que SQL
--    pour ce cas précis. Cette fonction ne fait que scoper + renvoyer les
--    lignes brutes, jamais de jointure jour-par-jour ici.
-- ============================================================================

create function public.get_driver_month_coverage(
  p_driver_id uuid,
  p_company_id uuid,
  p_month date -- premier jour du mois, ex. '2026-09-01'
)
returns table (
  kind text, -- 'trip' | 'unavailability'
  trip_id uuid,
  departure_at timestamptz,
  arrival_at timestamptz,
  distance_km integer,
  bus_number text,
  origin_city text,
  destination_city text,
  unavailability_id uuid,
  start_date date,
  end_date date,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := p_month;
  v_month_end date := (p_month + interval '1 month')::date;
begin
  return query
    select
      'trip'::text as kind,
      t.id as trip_id,
      t.departure_at,
      t.arrival_at,
      r.distance_km,
      t.bus_number,
      r.origin_city,
      r.destination_city,
      null::uuid as unavailability_id,
      null::date as start_date,
      null::date as end_date,
      null::text as reason
    from public.trips t
    join public.routes r on r.id = t.route_id
    where t.driver_id = p_driver_id
      and t.company_id = p_company_id
      -- Le trajet touche le mois si son intervalle (réel ou estimé)
      -- chevauche [début du mois, début du mois suivant).
      and t.departure_at < v_month_end
      and (
        t.departure_at
          + (public.estimate_trip_duration_hours(r.distance_km) * interval '1 hour')
      ) >= v_month_start

    union all

    select
      'unavailability'::text as kind,
      null::uuid as trip_id,
      null::timestamptz as departure_at,
      null::timestamptz as arrival_at,
      null::integer as distance_km,
      null::text as bus_number,
      null::text as origin_city,
      null::text as destination_city,
      u.id as unavailability_id,
      u.start_date,
      u.end_date,
      u.reason
    from public.driver_unavailability u
    where u.driver_id = p_driver_id
      and u.company_id = p_company_id
      and u.start_date < v_month_end
      and u.end_date >= v_month_start;
end;
$$;

revoke execute on function public.get_driver_month_coverage(uuid, uuid, date) from public;
grant execute on function public.get_driver_month_coverage(uuid, uuid, date) to service_role;

-- ============================================================================
-- 4. get_driver_trip_history — remplace la requête plate de
--    chauffeurs/[id]/page.tsx : un champ calculé (durée, réelle ou
--    estimée) justifie maintenant une vraie RPC plutôt qu'un simple
--    .select() joint. AUCUNE métrique de ponctualité : aucune heure
--    réelle de départ n'existe dans le schéma, seules departure_at/
--    arrival_at (prévues, pas constatées) sont utilisées.
-- ============================================================================

create function public.get_driver_trip_history(
  p_driver_id uuid,
  p_company_id uuid
)
returns table (
  trip_id uuid,
  departure_at timestamptz,
  origin_city text,
  destination_city text,
  bus_number text,
  status text,
  duration_hours numeric,
  duration_is_estimated boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      t.id as trip_id,
      t.departure_at,
      r.origin_city,
      r.destination_city,
      t.bus_number,
      t.status,
      case
        when t.arrival_at is not null
          then extract(epoch from (t.arrival_at - t.departure_at)) / 3600.0
        else public.estimate_trip_duration_hours(r.distance_km)
      end as duration_hours,
      (t.arrival_at is null) as duration_is_estimated
    from public.trips t
    join public.routes r on r.id = t.route_id
    where t.driver_id = p_driver_id
      and t.company_id = p_company_id
      and t.departure_at < now()
    order by t.departure_at desc
    limit 50;
end;
$$;

revoke execute on function public.get_driver_trip_history(uuid, uuid) from public;
grant execute on function public.get_driver_trip_history(uuid, uuid) to service_role;
