-- Correctif get_company_drivers_overview() : un chauffeur affecté à un
-- trajet SANS arrival_at redevenait "Disponible" à l'instant précis du
-- départ, alors qu'il est manifestement encore sur la route — la requête
-- d'origine (20260922090000_add_drivers.sql) utilisait
-- "coalesce(arrival_at, departure_at)" comme borne haute, réduisant
-- l'intervalle à un point unique quand arrival_at est absent (observé et
-- documenté lors de la vérification en conditions réelles du chantier
-- chauffeurs).
--
-- 20260922090000 est déjà appliquée sur le projet distant : ce fichier la
-- corrige via un simple CREATE OR REPLACE, jamais une édition sur place.

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
declare
  -- Estimation de fin de trajet quand arrival_at est absent — JAMAIS une
  -- vraie donnée de fin de course : trips.arrival_at reste la seule
  -- source de vérité quand elle est renseignée, ceci ne sert qu'à éviter
  -- qu'un chauffeur reparte instantanément à "Disponible" à l'heure de
  -- départ faute de mieux. Recalculée à chaque appel, jamais stockée.
  --
  -- Deux niveaux, du plus précis au plus grossier :
  --   1. Si routes.distance_km est renseignée : durée estimée =
  --      distance_km / 60 km/h. 60 km/h est une vitesse moyenne de
  --      croisière plausible pour un bus interurbain au Bénin une fois
  --      les arrêts absorbés (traversées de ville, contrôles routiers,
  --      montées/descentes de passagers) sur des routes bitumées
  --      primaires — cohérent avec les distances déjà vues dans ce
  --      projet (Cotonou–Parakou ≈ 411 km ⇒ ≈ 6h50, un ordre de grandeur
  --      raisonnable pour ce trajet réel).
  --   2. Sinon (distance_km absente, cas déjà courant : la colonne est
  --      nullable depuis 20260830060000) : constante de repli de 4h — une
  --      durée médiane plausible pour un trajet interurbain "classique"
  --      au Bénin en l'absence de toute autre donnée.
  --
  -- Aucune des deux valeurs n'a la moindre prétention d'exactitude : un
  -- futur lecteur qui voudrait un statut fiable doit passer par une vraie
  -- donnée de fin de trajet (arrival_at renseignée, ou un futur pointage
  -- GPS/évènement de fin de course — hors de ce chantier), pas ajuster
  -- ces constantes.
  c_avg_speed_kmh constant numeric := 60;
  c_default_mission_hours constant numeric := 4;
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
          trips.departure_at + (
            coalesce(
              -- distance_km / vitesse moyenne = durée estimée en heures
              routes.distance_km / c_avg_speed_kmh,
              c_default_mission_hours
            ) * interval '1 hour'
          )
        )
      order by trips.departure_at desc
      limit 1
    ) t on true
    where d.company_id = p_company_id
    order by d.full_name asc;
end;
$$;

-- Signature inchangée (create or replace) : pas de nouveau
-- revoke/grant nécessaire, ceux de 20260922090000 restent valides.
