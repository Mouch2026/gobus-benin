-- Rend trips.bus_layout_id obligatoire. Le backfill précédent
-- (20260830070000) a déjà assigné un plan "Par défaut" à tout trajet qui
-- n'en avait pas. SET NOT NULL scanne la table et échoue bruyamment s'il
-- reste un NULL — c'est la vérification elle-même, pas besoin d'un SELECT
-- de contrôle séparé avant.
alter table public.trips alter column bus_layout_id set not null;

-- Conséquence directe : la branche "pas de plan de bus" (numérotation
-- séquentielle via generate_series) d'assign_and_insert_passengers devient
-- structurellement inatteignable — tout trajet a désormais forcément un
-- bus_layout_id non nul pointant vers un plan existant (contrainte FK), le
-- join trouve donc toujours une correspondance. create or replace (déjà
-- appliquée dans 20260830030000, jamais éditée sur place) : supprime la
-- branche morte, resserre le left join en join pour refléter l'invariant
-- réel, retire v_total_seats (devenue inutile).
create or replace function public.assign_and_insert_passengers(
  p_booking_id uuid,
  p_trip_id uuid,
  p_passenger_names text[]
)
returns void
language plpgsql
-- security invoker : le voyageur appelant a déjà le droit RLS d'insérer
-- dans passengers (passengers_insert_via_booking) ; bus_layouts est
-- publiquement lisible (voir sa policy dans 20260830030000) — aucune
-- élévation de privilège nécessaire ici, comme avant.
security invoker
as $$
declare
  v_seat_labels jsonb;
  v_taken text[];
  v_candidate text;
  v_assigned text[] := '{}';
  v_name text;
begin
  -- Defense in depth : ne joue que si cette fonction est appelée hors du
  -- chemin normal (jamais le cas depuis create_booking/create_round_trip_booking).
  if not exists (select 1 from public.bookings where id = p_booking_id and trip_id = p_trip_id) then
    raise exception 'Réservation et trajet incohérents' using errcode = 'check_violation';
  end if;

  select bl.seat_labels into v_seat_labels
  from public.trips t
  join public.bus_layouts bl on bl.id = t.bus_layout_id
  where t.id = p_trip_id;

  -- Sièges déjà occupés sur CE trajet, toutes réservations non annulées
  -- confondues — recalculé à chaque appel, dans la transaction qui tient
  -- déjà le verrou sur trips via reserve_trip_seats.
  select coalesce(array_agg(p.seat_number), '{}') into v_taken
  from public.passengers p
  join public.bookings b on b.id = p.booking_id
  where b.trip_id = p_trip_id and b.status <> 'cancelled' and p.seat_number is not null;

  foreach v_name in array p_passenger_names loop
    select elem into v_candidate
    from jsonb_array_elements_text(v_seat_labels) with ordinality as t(elem, ord)
    where elem <> all (v_taken || v_assigned)
    order by ord
    limit 1;

    if v_candidate is null then
      raise exception 'Plus assez de sièges disponibles sur ce trajet' using errcode = 'check_violation';
    end if;

    v_assigned := v_assigned || v_candidate;

    insert into public.passengers (booking_id, full_name, seat_number)
    values (p_booking_id, v_name, v_candidate);
  end loop;
end;
$$;
