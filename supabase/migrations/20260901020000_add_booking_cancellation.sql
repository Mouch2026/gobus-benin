-- Annulation de réservation par le voyageur, avec remboursement partiel
-- selon le délai avant départ. Aucune colonne existante ne trace le
-- montant réellement remboursé (payments a déjà status IN (..., 'refunded')
-- mais jamais utilisé, sans colonne de montant associée). Ajout minimal,
-- symétrique de paid_at.
alter table public.payments
  add column refunded_amount_fcfa integer,
  add column refunded_at timestamptz;

alter table public.payments
  add constraint payments_refunded_amount_fcfa_check
  check (refunded_amount_fcfa is null or (refunded_amount_fcfa >= 0 and refunded_amount_fcfa <= base_amount_fcfa));

-- GoBus Points déjà crédités sur une réservation annulée : jamais repris.
-- Vérifié avant d'écrire cette migration : aucun trigger existant ne
-- réagit à bookings.status = 'cancelled' ni à payments.status =
-- 'refunded' pour toucher points_ledger/points_balance
-- (award_points_on_payment_approved ne réagit qu'à new.status =
-- 'approved' ; apply_points_ledger_entry ne réagit qu'à un insert dans
-- points_ledger). Rien à modifier ici pour garantir ce choix — c'est déjà
-- le comportement par absence de mécanisme de reprise.
create function public.cancel_booking(p_booking_id uuid)
returns table (refunded_amount_fcfa integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_departure_at timestamptz;
  v_payment public.payments%rowtype;
  v_refund_amount integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Réservation introuvable' using errcode = 'check_violation';
  end if;

  -- Jamais de paramètre p_user_id à faire confiance : auth.uid() reste
  -- disponible même dans une fonction security definer (il dérive du JWT
  -- de la requête, pas du rôle d'exécution) tant que l'appel se fait via
  -- le client authentifié normal — pas besoin de la double vérification
  -- "pré-check RLS côté appelant + p_user_id" utilisée pour
  -- simulate_round_trip_payment, qui elle est appelée via service_role
  -- (aucun JWT voyageur dans ce contexte-là, d'où son paramètre
  -- explicite). Ici, plus simple ET plus sûr : zéro identité transmise
  -- par le client.
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

  select * into v_payment from public.payments
  where booking_id = p_booking_id and status = 'approved'
  order by paid_at desc nulls last
  limit 1;

  if v_payment.id is null then
    raise exception 'Aucun paiement approuvé trouvé pour cette réservation' using errcode = 'check_violation';
  end if;

  -- La seule règle métier de ce chantier : > 30 min avant départ ->
  -- base_amount_fcfa seul (jamais platform_fee_fcfa ni
  -- transaction_fee_fcfa) ; à 30 min ou moins -> aucun remboursement.
  if v_departure_at - now() > interval '30 minutes' then
    v_refund_amount := v_payment.base_amount_fcfa;
  else
    v_refund_amount := 0;
  end if;

  update public.payments
  set status = 'refunded', refunded_amount_fcfa = v_refund_amount, refunded_at = now()
  where id = v_payment.id;

  -- Déclenche adjust_trip_seats_on_booking_status_change (déjà en place,
  -- déjà vérifié) : recrédite available_seats, libère seat_number. Rien à
  -- dupliquer ici. N'a aucune connaissance de booking_group_id : annuler
  -- ce leg ne touche jamais son éventuel leg jumeau.
  update public.bookings set status = 'cancelled' where id = p_booking_id;

  return query select v_refund_amount;
end;
$$;

revoke execute on function public.cancel_booking(uuid) from public;
grant execute on function public.cancel_booking(uuid) to authenticated;
