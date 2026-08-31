-- distance_km devient optionnel. Le CHECK (distance_km > 0) existant
-- (20260825060934_create_core_schema.sql) n'est pas touché : un CHECK
-- laisse toujours passer NULL par défaut (il n'est évalué que sur les
-- valeurs non nulles), donc la contrainte ">  0" continue de s'appliquer
-- normalement dès qu'une distance est renseignée.
alter table public.routes alter column distance_km drop not null;
