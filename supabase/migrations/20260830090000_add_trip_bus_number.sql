-- Numéro/immatriculation de bus par trajet (texte libre — "12" ou
-- "AB-1234-BJ" tous deux valides). Colonne nullable dans un premier temps
-- pour permettre le backfill explicite ci-dessous avant de poser NOT NULL
-- dans une migration séparée (20260830100000).
alter table public.trips add column bus_number text;

-- Placeholder explicite plutôt qu'une chaîne vide silencieuse : une
-- compagnie qui consulte un vieux trajet de test doit voir clairement
-- qu'il manque une vraie valeur, pas un champ qui semble juste vide par
-- accident.
update public.trips set bus_number = 'À renseigner' where bus_number is null;
