-- Corrective migration — not an edit of 20260830010000_add_round_trip_bookings.sql.
--
-- Per the convention just added to CLAUDE.md: 20260830010000 was already
-- applied to the remote (confirmed via `supabase migration list` +
-- `pg_get_functiondef` on the live function) before its source file was
-- edited in place to add per-leg, non-mislabeling error messages. Supabase
-- tracks migrations by filename/timestamp, not content — editing and
-- recommitting an already-applied file has zero effect on the live
-- database until a new migration re-applies the change. This migration is
-- that re-application, via `create or replace function` (same signature,
-- so existing GRANT/REVOKE on this function are preserved unchanged).
--
-- Behavior change, exactly as previously designed and shown:
-- - Each leg's insert is wrapped in its own begin/exception block.
-- - Only a failure whose message matches reserve_trip_seats' known, fixed
--   "not enough seats" text is relabeled with a leg-specific, friendly
--   message. Verified by reading 20260825060934_create_core_schema.sql:
--   reserve_trip_seats raises the SAME errcode ('check_violation' /
--   SQLSTATE 23514) for both "not enough seats" and "price mismatch" — no
--   distinct SQLSTATE exists to key off, hence matching on message text.
-- - Anything else (a genuine price mismatch, a different constraint, an
--   unexpected failure) is re-raised UNCHANGED via bare `raise;` — never
--   substituted, never mislabeled as a seats problem.
-- - Atomicity is unaffected either way: a plpgsql exception block's
--   implicit savepoint doesn't stop the exception (relabeled or bare
--   re-raised) from propagating out of the whole function call, so the
--   entire RPC call still fails as a single transaction — any leg already
--   inserted above is still rolled back.

create or replace function public.create_round_trip_booking(
  p_outbound_trip_id uuid,
  p_return_trip_id uuid,
  p_seat_count integer,
  p_passenger_name text,
  p_passenger_phone text
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

  select price_fcfa, departure_at into v_outbound_price, v_outbound_departure
  from public.trips where id = p_outbound_trip_id;
  select price_fcfa, departure_at into v_return_price, v_return_departure
  from public.trips where id = p_return_trip_id;

  if v_outbound_price is null or v_return_price is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  if v_return_departure <= v_outbound_departure then
    raise exception 'Le trajet retour doit partir après le trajet aller'
      using errcode = 'check_violation';
  end if;

  insert into public.booking_groups (user_id) values (v_user_id)
    returning id into v_group_id;

  begin
    insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, booking_group_id, leg)
    values (p_outbound_trip_id, v_user_id, p_seat_count, v_outbound_price * p_seat_count, v_group_id, 'outbound')
    returning id into v_outbound_booking_id;
  exception when others then
    if sqlerrm like c_not_enough_seats_prefix then
      raise exception 'Plus de places disponibles sur le trajet aller choisi, essayez un autre horaire'
        using errcode = 'check_violation', detail = sqlerrm;
    else
      raise;
    end if;
  end;

  insert into public.passengers (booking_id, full_name, phone)
  values (v_outbound_booking_id, p_passenger_name, p_passenger_phone);

  begin
    insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, booking_group_id, leg)
    values (p_return_trip_id, v_user_id, p_seat_count, v_return_price * p_seat_count, v_group_id, 'return')
    returning id into v_return_booking_id;
  exception when others then
    if sqlerrm like c_not_enough_seats_prefix then
      raise exception 'Plus de places disponibles sur le trajet retour choisi, essayez un autre horaire'
        using errcode = 'check_violation', detail = sqlerrm;
    else
      raise;
    end if;
  end;

  insert into public.passengers (booking_id, full_name, phone)
  values (v_return_booking_id, p_passenger_name, p_passenger_phone);

  return query select v_group_id, v_outbound_booking_id, v_return_booking_id;
end;
$$;
