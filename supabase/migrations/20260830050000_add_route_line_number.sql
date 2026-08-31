-- Numéro de ligne optionnel, texte libre (ex. "12", "L-A", peut varier
-- d'une compagnie à l'autre) — aucune contrainte de format.
-- routes est déjà couverte par les GRANT existants
-- (20260828035948_add_missing_grants.sql, au niveau table, pas colonne) :
-- aucun GRANT supplémentaire nécessaire pour cette seule colonne.
alter table public.routes add column line_number text;
