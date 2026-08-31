-- Backfill avant de rendre trips.bus_layout_id obligatoire (voir la
-- migration suivante, 20260830080000_require_trip_bus_layout.sql). Pour
-- chaque compagnie ayant au moins un trajet sans plan de bus, crée un plan
-- "Par défaut" (numérotation séquentielle 1..N, N = le plus grand
-- total_seats observé parmi SES SEULS trajets sans plan — les trajets qui
-- ont déjà un plan ne sont ni lus ni modifiés) et l'assigne à ces trajets.
--
-- total_seats n'est volontairement PAS touché par ce backfill : seul
-- bus_layout_id change. Un trajet dont total_seats < N garde simplement un
-- plan avec des libellés en trop qui ne seront jamais utilisés pour lui —
-- sans conséquence, reserve_trip_seats empêche déjà toute survente au-delà
-- de son propre total_seats.
do $$
declare
  v_company_ids uuid[];
  v_company_id uuid;
  v_max_seats integer;
  v_layout_id uuid;
begin
  -- Matérialisé en tableau AVANT toute boucle : un `for ... in select ...
  -- loop` maintient un curseur ouvert sur trips pendant toute son
  -- exécution, ce qui interdit tout `alter table trips` à l'intérieur de la
  -- boucle (SQLSTATE 55006, rencontré en pratique lors de la première
  -- tentative de cette migration). Un simple array_agg s'exécute et se
  -- referme intégralement avant que la boucle ne commence.
  select array_agg(distinct company_id) into v_company_ids
  from public.trips where bus_layout_id is null;

  foreach v_company_id in array coalesce(v_company_ids, '{}') loop
    select max(total_seats) into v_max_seats
    from public.trips
    where company_id = v_company_id and bus_layout_id is null;

    -- Réutilise un plan "Par défaut" déjà existant pour cette compagnie
    -- (coïncidence de nom) sans écraser ses seat_labels ; sinon en crée un.
    insert into public.bus_layouts (company_id, name, seat_labels)
    values (
      v_company_id,
      'Par défaut',
      to_jsonb(array(select generate_series(1, v_max_seats)::text))
    )
    on conflict (company_id, name) do update set updated_at = public.bus_layouts.updated_at
    returning id into v_layout_id;

    -- set_trip_seats_from_layout bloquerait ce changement (places déjà
    -- vendues sur au moins un des trajets NULL de cette compagnie, cas réel
    -- constaté) et resynchroniserait total_seats depuis le plan — ni l'un
    -- ni l'autre n'est voulu pour ce backfill. Désactivé pour ce seul
    -- UPDATE, réactivé juste après, dans la même transaction de migration.
    alter table public.trips disable trigger set_trip_seats_from_layout;

    update public.trips
    set bus_layout_id = v_layout_id
    where company_id = v_company_id and bus_layout_id is null;

    alter table public.trips enable trigger set_trip_seats_from_layout;
  end loop;
end;
$$;
