-- Rend trips.bus_number obligatoire. Le backfill précédent (20260830090000)
-- a déjà donné une valeur explicite à tout trajet qui n'en avait pas.
-- Chaque contrainte valide les lignes existantes au moment où elle est
-- ajoutée : échec bruyant si le backfill était incomplet, pas besoin d'une
-- vérification manuelle séparée avant.
--
-- Pas de précédent dans ce schéma pour un CHECK de non-vidité après trim()
-- sur un champ texte obligatoire (origin_city, destination_city, full_name
-- reposent uniquement sur NOT NULL + validation applicative) — première
-- ici, ajoutée en ceinture-bretelles si un futur appel direct à l'API
-- contournait la validation côté Server Action.
alter table public.trips
  add constraint trips_bus_number_not_blank check (length(trim(bus_number)) > 0);

alter table public.trips alter column bus_number set not null;
