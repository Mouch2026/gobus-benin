-- Comble un trou trouvé dans le code réel : cancelTrip (annulation d'un
-- trajet entier par une compagnie) ne fait que
-- `update trips set status = 'cancelled'` — aucune réservation confirmée
-- existante sur ce trajet n'était remboursée ni son statut mis à jour.
--
-- Règle spécifique à ce cas, différente de cancel_booking (annulation
-- volontaire du voyageur) : remboursement intégral de base_amount_fcfa,
-- sans condition de délai — le voyageur n'est pas à l'origine de
-- l'annulation.

-- ============================================================================
-- Helper interne, jamais exposé — aucune vérification de propriété ni de
-- montant, fait une confiance totale à l'appelant. Ne doit être appelable
-- que par du code qui a déjà tout vérifié (cancel_booking et
-- cancel_confirmed_bookings_for_trip ci-dessous).
-- ============================================================================
create function public.refund_and_cancel_booking(p_booking_id uuid, p_refund_amount_fcfa integer)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_payment_id uuid;
begin
  select id into v_payment_id from public.payments
  where booking_id = p_booking_id and status = 'approved'
  order by paid_at desc nulls last limit 1;

  if v_payment_id is null then
    raise exception 'Aucun paiement approuvé trouvé pour cette réservation' using errcode = 'check_violation';
  end if;

  update public.payments
  set status = 'refunded', refunded_amount_fcfa = p_refund_amount_fcfa, refunded_at = now()
  where id = v_payment_id;

  -- Déclenche adjust_trip_seats_on_booking_status_change (déjà en place,
  -- déjà vérifié) : recrédite available_seats, libère seat_number. Rien à
  -- dupliquer ici.
  update public.bookings set status = 'cancelled' where id = p_booking_id;
end;
$$;

-- Pas de grant à authenticated : appelée uniquement en interne, depuis
-- l'intérieur d'autres fonctions security definer. Dans ce contexte, le
-- rôle actif est déjà celui du propriétaire des fonctions (élevé par le
-- security definer englobant) — l'appel interne fonctionne sans grant
-- séparé, et aucun rôle authenticated/anon ne peut l'appeler directement.
revoke execute on function public.refund_and_cancel_booking(uuid, integer) from public;

-- ============================================================================
-- cancel_booking : déjà appliquée (20260901020000), jamais éditée sur
-- place. Même logique exactement (propriété via auth.uid(), garde-fou 30
-- minutes, garde-fou trajet déjà parti) — délègue simplement l'écriture
-- finale au helper commun au lieu de la dupliquer.
-- ============================================================================
create or replace function public.cancel_booking(p_booking_id uuid)
returns table (refunded_amount_fcfa integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_departure_at timestamptz;
  v_base_amount integer;
  v_refund_amount integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Réservation introuvable' using errcode = 'check_violation';
  end if;

  if v_booking.user_id <> auth.uid() then
    raise exception 'Cette réservation ne vous appartient pas' using errcode = 'check_violation';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'Seule une réservation confirmée peut être annulée' using errcode = 'check_violation';
  end if;

  select departure_at into v_departure_at from public.trips where id = v_booking.trip_id;
  if v_departure_at <= now() then
    raise exception 'Ce trajet est déjà parti, la réservation ne peut plus être annulée'
      using errcode = 'check_violation';
  end if;

  select base_amount_fcfa into v_base_amount from public.payments
  where booking_id = p_booking_id and status = 'approved'
  order by paid_at desc nulls last
  limit 1;

  if v_base_amount is null then
    raise exception 'Aucun paiement approuvé trouvé pour cette réservation' using errcode = 'check_violation';
  end if;

  -- Seule règle qui différencie ce chemin de cancel_confirmed_bookings_for_trip :
  -- > 30 min avant départ -> remboursement, sinon 0. Le voyageur est ici à
  -- l'origine de l'annulation, contrairement au chemin "compagnie".
  v_refund_amount := case when v_departure_at - now() > interval '30 minutes' then v_base_amount else 0 end;

  perform public.refund_and_cancel_booking(p_booking_id, v_refund_amount);

  return query select v_refund_amount;
end;
$$;

-- ============================================================================
-- Nouveau chemin : annulation d'un trajet entier par la compagnie.
-- Rembourse intégralement (jamais de condition de délai) toutes les
-- réservations confirmées de ce trajet, et renvoie leurs ids pour que
-- l'appelant (cancelTrip) puisse notifier chaque voyageur concerné.
-- ============================================================================
create function public.cancel_confirmed_bookings_for_trip(p_trip_id uuid)
returns table (booking_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_booking record;
  v_base_amount integer;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  -- Jamais de confiance dans le seul pré-check TS de cancelTrip — cette
  -- fonction est exposée via RPC, donc revérifiée ici, même principe que
  -- partout ailleurs sur ce projet.
  if not public.is_company_owner(v_trip.company_id) then
    raise exception 'Ce trajet ne vous appartient pas' using errcode = 'check_violation';
  end if;

  if v_trip.status <> 'cancelled' then
    raise exception 'Ce trajet n''est pas annulé' using errcode = 'check_violation';
  end if;

  -- FOR ... IN SELECT ouvre un curseur MVCC sur un instantané figé au
  -- démarrage — les UPDATE (DML) faits plus bas sur bookings/payments ne
  -- posent pas le même problème que l'ALTER TABLE (DDL) déjà rencontré
  -- dans une boucle similaire (SQLSTATE 55006, migration des plans de
  -- bus) : un UPDATE ne demande qu'un verrou de ligne, compatible avec ce
  -- curseur.
  for v_booking in
    select b.id from public.bookings b where b.trip_id = p_trip_id and b.status = 'confirmed'
  loop
    select p.base_amount_fcfa into v_base_amount from public.payments p
    where p.booking_id = v_booking.id and p.status = 'approved'
    order by p.paid_at desc nulls last limit 1;

    if v_base_amount is not null then
      -- Une réservation en échec ne doit jamais bloquer le remboursement
      -- des autres voyageurs sur ce même trajet.
      begin
        perform public.refund_and_cancel_booking(v_booking.id, v_base_amount);
        booking_id := v_booking.id;
        return next;
      exception when others then
        raise warning 'Échec du remboursement de la réservation % : %', v_booking.id, sqlerrm;
      end;
    end if;
  end loop;
end;
$$;

revoke execute on function public.cancel_confirmed_bookings_for_trip(uuid) from public;
grant execute on function public.cancel_confirmed_bookings_for_trip(uuid) to authenticated;
