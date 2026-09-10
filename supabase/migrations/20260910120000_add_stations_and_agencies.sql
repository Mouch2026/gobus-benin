-- Chantier 1 d'une refonte plus large : introduire les gares (lieux
-- physiques) et les agences (guichets d'une compagnie, rattachés à une
-- gare). Voir le plan pour le raisonnement complet.
--
--   1. stations : référence PARTAGÉE entre toutes les compagnies (une gare
--      physique de Cotonou accueille plusieurs compagnies), curée par
--      GoBus — écrite exclusivement via service_role, aucune policy
--      insert/update/delete pour authenticated. Même moule que
--      subscription_plans.
--   2. Migration additive, avec coexistence : routes.origin_city /
--      destination_city (texte libre) restent NOT NULL et AUTORITAIRES.
--      On ajoute routes.origin_station_id / destination_station_id (FK
--      nullables), backfillées ici, mais RIEN ne les lit encore — aucune
--      fonction SQL ni aucun fichier TypeScript n'est touché. Le seed des
--      gares vient des villes distinctes déjà présentes, dédupliquées
--      insensiblement à la casse/aux espaces.
--   3. agencies : purement company-owned (guichet opéré par une compagnie
--      précise), RLS owner-only via is_company_owner — même schéma que
--      bus_layouts (company_id posé côté serveur, pas de parent d'où le
--      dériver).
--   5. bookings.agency_id : posée nullable, VIDE pour l'instant — sera
--      renseignée quand les comptes-agents existeront (chantier ultérieur).

-- ============================================================================
-- 1. stations — référence partagée, curée par GoBus
-- ============================================================================

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- name + city plutôt que name seul : une ville peut avoir plusieurs gares
-- ("Gare Dantokpa" et "Gare de l'Étoile Rouge", toutes deux city='Cotonou').
-- La recherche voyageur se fait par ville → city groupe les gares.
create unique index stations_name_city_unique_idx
  on public.stations (lower(trim(name)), lower(trim(city)));

create trigger set_updated_at before update on public.stations
  for each row execute function public.set_updated_at();

alter table public.stations enable row level security;

-- Catalogue public, comme subscription_plans / routes / trips : lisible
-- par tous (la recherche voyageur d'apps/web est non authentifiée), écrit
-- exclusivement via service_role. AUCUNE policy insert/update/delete pour
-- authenticated : une compagnie ne crée jamais de gare.
create policy "stations_select_public" on public.stations
  for select
  using (true);

grant select on public.stations to anon, authenticated;
grant all on public.stations to service_role;

-- ============================================================================
-- 2. Seed des gares depuis les villes déjà présentes dans routes
--    Déduplication insensible à la casse et aux espaces : "Cotonou" /
--    "cotonou" / "Cotonou " → une seule gare (première casse rencontrée
--    dans l'ordre alphabétique). name = city = la chaîne, initialement.
--    Bloc do $$ : même patron que 20260830070000_backfill_default_bus_layouts.sql.
-- ============================================================================

do $$
begin
  insert into public.stations (name, city)
  select distinct on (lower(trim(v.city)))
         trim(v.city) as name, trim(v.city) as city
  from (
    select origin_city as city from public.routes
    union all
    select destination_city as city from public.routes
  ) v
  where trim(v.city) <> ''
  order by lower(trim(v.city)), trim(v.city)
  on conflict do nothing;
end $$;

-- ============================================================================
-- 3. routes.origin_station_id / destination_station_id — FK nullables,
--    backfillées immédiatement. on delete restrict : une gare référencée
--    ne peut pas être supprimée en dur — GoBus la désactive (is_active).
-- ============================================================================

alter table public.routes
  add column origin_station_id uuid references public.stations (id) on delete restrict,
  add column destination_station_id uuid references public.stations (id) on delete restrict;

create index routes_origin_station_id_idx on public.routes (origin_station_id);
create index routes_destination_station_id_idx on public.routes (destination_station_id);

update public.routes r set
  origin_station_id = (
    select s.id from public.stations s where lower(trim(s.name)) = lower(trim(r.origin_city))
  ),
  destination_station_id = (
    select s.id from public.stations s where lower(trim(s.name)) = lower(trim(r.destination_city))
  );

-- Colle de coexistence : quand origin_city / destination_city sont écrites
-- (chemin getOrCreateRouteId inchangé), résout station_id sur une gare
-- EXISTANTE, insensiblement à la casse. Aucune correspondance (ville
-- inconnue de GoBus) → station_id reste null, la route/le trajet
-- fonctionne quand même en texte. Ne crée JAMAIS de gare. Mirroir de
-- set_trip_company_id / set_booking_company_id.
create function public.set_route_station_ids()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select id into new.origin_station_id from public.stations
  where lower(trim(name)) = lower(trim(new.origin_city))
  limit 1;

  select id into new.destination_station_id from public.stations
  where lower(trim(name)) = lower(trim(new.destination_city))
  limit 1;

  return new;
end;
$$;

create trigger set_route_station_ids
  before insert or update of origin_city, destination_city on public.routes
  for each row execute function public.set_route_station_ids();

-- ============================================================================
-- 4. agencies — guichet d'une compagnie, rattaché à une gare
-- ============================================================================

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  station_id uuid not null references public.stations (id) on delete restrict,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, station_id, name)
);

create index agencies_company_id_idx on public.agencies (company_id);
create index agencies_station_id_idx on public.agencies (station_id);

create trigger set_updated_at before update on public.agencies
  for each row execute function public.set_updated_at();

alter table public.agencies enable row level security;

-- Privée à la compagnie propriétaire (comme company_subscriptions).
-- company_id est posé côté serveur depuis requireCompany(), jamais depuis
-- le formulaire — même schéma que bus_layouts (pas de parent d'où dériver
-- company_id, donc with check is_company_owner + point).
create policy "agencies_select_owner" on public.agencies
  for select
  using (public.is_company_owner(company_id));

create policy "agencies_insert_owner" on public.agencies
  for insert
  with check (public.is_company_owner(company_id));

create policy "agencies_update_owner" on public.agencies
  for update
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));

create policy "agencies_delete_owner" on public.agencies
  for delete
  using (public.is_company_owner(company_id));

grant select, insert, update, delete on public.agencies to authenticated;
grant all on public.agencies to service_role;
-- Pas de grant anon : privé tant que agency_id n'apparaît pas côté
-- voyageur (à élargir le jour où une confirmation/ticket affiche
-- « vendu à l'agence X »).

-- ============================================================================
-- 5. bookings.agency_id — posée nullable, VIDE pour l'instant
--    Aucun trigger, aucun backfill, aucun code ne l'écrit dans ce
--    chantier. on delete restrict : « retirer une agence sans casser
--    l'historique » — quand des ventes y seront rattachées, on désactive
--    (is_active), on ne supprime pas. Les GRANT bookings existants
--    couvrent déjà la nouvelle colonne.
-- ============================================================================

alter table public.bookings
  add column agency_id uuid references public.agencies (id) on delete restrict;

create index bookings_agency_id_idx on public.bookings (agency_id) where agency_id is not null;
