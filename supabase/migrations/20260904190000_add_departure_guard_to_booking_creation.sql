-- Corrige un trou confirmé en conditions réelles : un trajet déjà parti
-- restait réservable et payable (create_booking/create_round_trip_booking
-- ne vérifiaient departure_at contre aucune règle temporelle — seul
-- l'ordre aller/retour était contrôlé). Même formulation que le
-- garde-fou déjà existant côté annulation (cancel_booking,
-- 20260902220000_add_vouchers.sql) : errcode 'check_violation', message
-- construit sur "Ce trajet est déjà parti, ...".

create or replace function public.create_booking(
  p_trip_id uuid,
  p_seat_count integer,
  p_phone text,
  p_passenger_names text[]
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_trip_price integer;
  v_trip_departure timestamptz;
  v_booking_id uuid;
begin
  if v_user_id is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  if array_length(p_passenger_names, 1) is distinct from p_seat_count then
    raise exception 'Le nombre de passagers doit correspondre au nombre de places'
      using errcode = 'check_violation';
  end if;

  select price_fcfa, departure_at into v_trip_price, v_trip_departure
  from public.trips where id = p_trip_id;
  if v_trip_price is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  if v_trip_departure <= now() then
    raise exception 'Ce trajet est déjà parti, la réservation n''est plus possible'
      using errcode = 'check_violation';
  end if;

  insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, phone)
  values (p_trip_id, v_user_id, p_seat_count, v_trip_price * p_seat_count, p_phone)
  returning id into v_booking_id;
  -- reserve_trip_seats locks trips here — assign_and_insert_passengers
  -- runs below while that lock is still held, in the same transaction.

  perform public.assign_and_insert_passengers(v_booking_id, p_trip_id, p_passenger_names);

  return v_booking_id;
end;
$$;

-- Grants déjà en place (to authenticated) — signature inchangée.

create or replace function public.create_round_trip_booking(
  p_outbound_trip_id uuid,
  p_return_trip_id uuid,
  p_seat_count integer,
  p_phone text,
  p_passenger_names text[]
)
returns table (booking_group_id uuid, outbound_booking_id uuid, return_booking_id uuid)
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_group_id uuid;
  v_outbound_booking_id uuid;
  v_return_booking_id uuid;
  v_outbound_price integer;
  v_return_price integer;
  v_outbound_departure timestamptz;
  v_return_departure timestamptz;
  c_not_enough_seats_prefix constant text := 'Plus assez de places disponibles sur ce trajet%';
begin
  if v_user_id is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  if p_outbound_trip_id = p_return_trip_id then
    raise exception 'Le trajet retour doit être différent du trajet aller'
      using errcode = 'check_violation';
  end if;

  if array_length(p_passenger_names, 1) is distinct from p_seat_count then
    raise exception 'Le nombre de passagers doit correspondre au nombre de places'
      using errcode = 'check_violation';
  end if;

  select price_fcfa, departure_at into v_outbound_price, v_outbound_departure
  from public.trips where id = p_outbound_trip_id;
  select price_fcfa, departure_at into v_return_price, v_return_departure
  from public.trips where id = p_return_trip_id;

  if v_outbound_price is null or v_return_price is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  if v_outbound_departure <= now() then
    raise exception 'Ce trajet est déjà parti, la réservation n''est plus possible'
      using errcode = 'check_violation';
  end if;

  if v_return_departure <= now() then
    raise exception 'Ce trajet est déjà parti, la réservation n''est plus possible'
      using errcode = 'check_violation';
  end if;

  if v_return_departure <= v_outbound_departure then
    raise exception 'Le trajet retour doit partir après le trajet aller'
      using errcode = 'check_violation';
  end if;

  insert into public.booking_groups (user_id) values (v_user_id)
    returning id into v_group_id;

  begin
    insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, booking_group_id, leg, phone)
    values (p_outbound_trip_id, v_user_id, p_seat_count, v_outbound_price * p_seat_count, v_group_id, 'outbound', p_phone)
    returning id into v_outbound_booking_id;
  exception when others then
    if sqlerrm like c_not_enough_seats_prefix then
      raise exception 'Plus de places disponibles sur le trajet aller choisi, essayez un autre horaire'
        using errcode = 'check_violation', detail = sqlerrm;
    else
      raise;
    end if;
  end;

  perform public.assign_and_insert_passengers(v_outbound_booking_id, p_outbound_trip_id, p_passenger_names);

  begin
    insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, booking_group_id, leg, phone)
    values (p_return_trip_id, v_user_id, p_seat_count, v_return_price * p_seat_count, v_group_id, 'return', p_phone)
    returning id into v_return_booking_id;
  exception when others then
    if sqlerrm like c_not_enough_seats_prefix then
      raise exception 'Plus de places disponibles sur le trajet retour choisi, essayez un autre horaire'
        using errcode = 'check_violation', detail = sqlerrm;
    else
      raise;
    end if;
  end;

  perform public.assign_and_insert_passengers(v_return_booking_id, p_return_trip_id, p_passenger_names);

  return query select v_group_id, v_outbound_booking_id, v_return_booking_id;
end;
$$;

-- Grants déjà en place (to authenticated) — signature inchangée.
