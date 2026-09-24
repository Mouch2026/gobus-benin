-- Chantier A : chauffeurs — CRUD, fiche, désactivation, affectation à un
-- trajet. Aucune notion de chauffeur n'existait avant cette migration
-- (vérifié : aucune table drivers, la nav "Chauffeurs" n'avait que des
-- rubriques "Bientôt disponible").

-- ============================================================================
-- 1. drivers — scoped à une compagnie, même patron que agencies.
-- ============================================================================

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  full_name text not null,
  phone text,
  license_number text, -- "permis", optionnel
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Permet la FK composite (driver_id, company_id) depuis trips — même
  -- patron exact que agencies_id_company_id_key (company_members.agency_id).
  unique (id, company_id)
);

create index drivers_company_id_idx on public.drivers (company_id);

create trigger set_updated_at before update on public.drivers
  for each row execute function public.set_updated_at();

alter table public.drivers enable row level security;

-- Lecture ouverte à tout membre actif (comme agencies/bus_layouts depuis
-- 20260910130000 : "un employé a un back-office pleinement utilisable"),
-- écriture réservée au propriétaire (comme agencies/bus_layouts).
create policy "drivers_select_member" on public.drivers
  for select using (public.is_company_member(company_id));
create policy "drivers_insert_owner" on public.drivers
  for insert with check (public.is_company_owner(company_id));
create policy "drivers_update_owner" on public.drivers
  for update using (public.is_company_owner(company_id)) with check (public.is_company_owner(company_id));

grant select, insert, update on public.drivers to authenticated;
grant all on public.drivers to service_role;
-- Pas de delete (ni policy ni grant) : désactivation (is_active = false)
-- uniquement, jamais de suppression — même choix qu'agencies/employes/
-- codes-promo.

-- ============================================================================
-- 2. trips.driver_id — nullable, n'empêche jamais la création d'un trajet.
--    FK composite (jamais de FK simple sur driver_id seul) pour interdire
--    déclarativement l'affectation d'un chauffeur d'une AUTRE compagnie —
--    même patron exact que company_members.agency_id. on delete restrict :
--    moot en pratique puisqu'un chauffeur n'est jamais supprimé, seulement
--    désactivé, mais restrict reste le choix sûr par défaut (même que
--    company_members.agency_id) si jamais ce raisonnement avait un trou.
-- ============================================================================

alter table public.trips add column driver_id uuid;
alter table public.trips
  add constraint trips_driver_id_company_id_fkey
  foreign key (driver_id, company_id) references public.drivers (id, company_id)
  on delete restrict;

create index trips_driver_id_idx on public.trips (driver_id);

-- ============================================================================
-- 3. get_company_drivers_overview — une ligne par chauffeur, avec le
--    trajet "en mission" actuel s'il y en a un (intervalle
--    [departure_at, coalesce(arrival_at, departure_at)] couvrant now()).
--    Même patron que get_company_bookings_overview : security definer,
--    service_role uniquement, le filtrage/la recherche restent en mémoire
--    côté TypeScript (filterDrivers.ts), pas de paramètres de filtre ici.
-- ============================================================================

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
      r.origin_city as current_origin_city,
      r.destination_city as current_destination_city,
      t.departure_at as current_departure_at
    from public.drivers d
    left join lateral (
      select trips.id, trips.bus_number, trips.route_id, trips.departure_at
      from public.trips
      where trips.driver_id = d.id
        and now() between trips.departure_at and coalesce(trips.arrival_at, trips.departure_at)
      order by trips.departure_at desc
      limit 1
    ) t on true
    left join public.routes r on r.id = t.route_id
    where d.company_id = p_company_id
    order by d.full_name asc;
end;
$$;

revoke execute on function public.get_company_drivers_overview(uuid) from public;
grant execute on function public.get_company_drivers_overview(uuid) to service_role;
