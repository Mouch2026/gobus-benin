-- assign_and_insert_passengers (déjà appliquée dans
-- 20260830030000_add_bus_layouts_and_seat_assignment.sql) est déjà en
-- production : create or replace, jamais d'édition sur place, conformément
-- à la convention CLAUDE.md.
--
-- Seul changement : la branche "pas de plan de bus" (numérotation
-- séquentielle via generate_series) gagne un `order by n` explicite. Sans
-- lui, generate_series retourne aujourd'hui ses lignes dans l'ordre
-- croissant en pratique, mais rien dans la requête ne le garantit — ce
-- n'est pas un contrat, juste un comportement d'implémentation qu'une
-- version future de Postgres ou un plan d'exécution différent pourrait ne
-- pas préserver. La branche "avec plan de bus" a déjà son `order by ord`
-- explicite (jsonb_array_elements_text ... with ordinality) et n'est pas
-- concernée.
create or replace function public.assign_and_insert_passengers(
  p_booking_id uuid,
  p_trip_id uuid,
  p_passenger_names text[]
)
returns void
language plpgsql
security invoker
as $$
declare
  v_seat_labels jsonb;
  v_total_seats integer;
  v_taken text[];
  v_candidate text;
  v_assigned text[] := '{}';
  v_name text;
begin
  -- Defense in depth: only matters if this function is ever called outside
  -- the normal path (never happens from create_booking/create_round_trip_booking,
  -- which always pass a booking_id/trip_id pair they just created together).
  if not exists (select 1 from public.bookings where id = p_booking_id and trip_id = p_trip_id) then
    raise exception 'Réservation et trajet incohérents' using errcode = 'check_violation';
  end if;

  select bl.seat_labels, t.total_seats into v_seat_labels, v_total_seats
  from public.trips t
  left join public.bus_layouts bl on bl.id = t.bus_layout_id
  where t.id = p_trip_id;

  -- Seats already occupied on THIS trip, across every non-cancelled
  -- booking — recomputed on every call, inside the transaction that
  -- already holds the lock on trips via reserve_trip_seats above.
  select coalesce(array_agg(p.seat_number), '{}') into v_taken
  from public.passengers p
  join public.bookings b on b.id = p.booking_id
  where b.trip_id = p_trip_id and b.status <> 'cancelled' and p.seat_number is not null;

  foreach v_name in array p_passenger_names loop
    if v_seat_labels is not null then
      select elem into v_candidate
      from jsonb_array_elements_text(v_seat_labels) with ordinality as t(elem, ord)
      where elem <> all (v_taken || v_assigned)
      order by ord
      limit 1;
    else
      -- No layout: plain sequential numbering, smallest free seat number
      -- first — explicit `order by n` instead of relying on
      -- generate_series' incidental (non-contractual) row order.
      select n::text into v_candidate
      from generate_series(1, v_total_seats) as n
      where n::text <> all (v_taken || v_assigned)
      order by n
      limit 1;
    end if;

    if v_candidate is null then
      raise exception 'Plus assez de sièges disponibles sur ce trajet' using errcode = 'check_violation';
    end if;

    v_assigned := v_assigned || v_candidate;

    insert into public.passengers (booking_id, full_name, seat_number)
    values (p_booking_id, v_name, v_candidate);
  end loop;
end;
$$;
