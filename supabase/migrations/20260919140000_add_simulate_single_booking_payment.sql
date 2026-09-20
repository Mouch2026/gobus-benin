-- Chantier : atomicité réelle de simulatePayment.
--
-- simulatePayment (apps/web/app/reservation/[bookingId]/paiement/actions.ts)
-- faisait jusqu'ici son travail (avoir, points, insertion payments,
-- approbation, passage bookings.status='confirmed') en plusieurs appels
-- TypeScript séparés, sans verrou — deux clics rapprochés pouvaient créer
-- deux paiements pour la même réservation (voir BACKLOG.md, entrée posée
-- au moment même où payViaToken a été introduit comme copie de ce même
-- flux, puis corrigée pour lui seul).
--
-- Vérifié avant d'écrire cette migration : record_payment_part_received
-- (20260910110000_add_split_payments_and_voucher_reuse.sql) est la SEULE
-- fonction de ce projet qui verrouille réellement bookings avant de
-- calculer (`for update of b`) — simulate_round_trip_payment n'a jamais
-- eu ce verrou, malgré son nom. payViaToken délègue déjà entièrement à
-- record_payment_part_received depuis le chantier "paiements scindés" —
-- il n'est pas touché ici.
--
-- Cette migration ajoute :
--   1. claim_voucher_for_booking — extraction de la réclamation d'avoir
--      (déjà dans applyVoucherAndPoints.ts, TypeScript), pour qu'elle
--      soit appelée UNE SEULE fois par les deux couches (le guichet en
--      TS, ce nouveau flux en SQL) plutôt que dupliquée une seconde fois.
--   2. simulate_single_booking_payment — verrouille la réservation EN
--      PREMIER (avant tout calcul d'avoir/points, même patron que
--      record_payment_part_received), applique avoir puis points, insère
--      le paiement, puis délègue la fermeture (approbation + passage
--      confirmed) à record_payment_part_received elle-même — jamais
--      réimplémentée une troisième fois. Le re-verrouillage de bookings
--      à l'intérieur de cet appel est un no-op (même transaction, verrou
--      déjà tenu), jamais un deadlock.
--
-- Frais de service calculés en TypeScript (calculateServiceFees,
-- packages/shared/src/lib/pricing.ts) et transmis en paramètres — jamais
-- recalculés ici, contrairement à simulate_round_trip_payment qui
-- duplique déjà les taux en dur (0.027/0.013), une violation préexistante
-- de la règle CLAUDE.md sur pricing.ts non reproduite ici.

-- ============================================================================
-- 1. claim_voucher_for_booking — réclamation atomique d'un avoir,
--    partagée entre applyVoucherAndPoints.ts (TS, guichet) et
--    simulate_single_booking_payment (SQL, ci-dessous).
-- ============================================================================

create function public.claim_voucher_for_booking(
  p_voucher_id uuid,
  p_user_id uuid,
  p_booking_id uuid,
  p_max_fcfa integer
)
returns table (claimed_voucher_id uuid, applied_fcfa integer, leftover_fcfa integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_voucher record;
  v_applied integer;
  v_leftover integer;
  v_claimed_id uuid;
  v_now timestamptz := now();
begin
  if p_voucher_id is null then
    claimed_voucher_id := null;
    applied_fcfa := 0;
    leftover_fcfa := 0;
    return next;
    return;
  end if;

  select id, amount_fcfa, status, expires_at into v_voucher
  from public.vouchers
  where id = p_voucher_id and user_id = p_user_id;

  -- Contrôle préalable non verrouillé : purement un raccourci pour éviter
  -- une écriture inutile quand l'avoir est visiblement déjà indisponible.
  -- La VRAIE fermeture de la course est le "where status = 'active'" de
  -- l'update ci-dessous, jamais celui-ci.
  if v_voucher.id is null or v_voucher.status <> 'active' or v_voucher.expires_at <= v_now then
    claimed_voucher_id := null;
    applied_fcfa := 0;
    leftover_fcfa := 0;
    return next;
    return;
  end if;

  v_applied := least(v_voucher.amount_fcfa, p_max_fcfa);
  v_leftover := v_voucher.amount_fcfa - v_applied;

  update public.vouchers
  set status = case when v_leftover > 0 then 'refund_pending' else 'used' end,
      consumed_booking_id = p_booking_id,
      consumed_at = v_now,
      refund_pending_amount_fcfa = case when v_leftover > 0 then v_leftover else refund_pending_amount_fcfa end,
      refund_pending_at = case when v_leftover > 0 then v_now else refund_pending_at end
  where id = p_voucher_id and status = 'active'
  returning id into v_claimed_id;

  if v_claimed_id is null then
    -- Réclamé/expiré entre-temps par un appel concurrent — jamais
    -- bloquant, on retombe sur 0 avoir appliqué, même philosophie que
    -- l'ancienne version TypeScript.
    claimed_voucher_id := null;
    applied_fcfa := 0;
    leftover_fcfa := 0;
  else
    claimed_voucher_id := v_claimed_id;
    applied_fcfa := v_applied;
    leftover_fcfa := v_leftover;
  end if;

  return next;
end;
$$;

revoke execute on function public.claim_voucher_for_booking(uuid, uuid, uuid, integer) from public;
grant execute on function public.claim_voucher_for_booking(uuid, uuid, uuid, integer) to service_role;

-- ============================================================================
-- 2. simulate_single_booking_payment
-- ============================================================================

create function public.simulate_single_booking_payment(
  p_booking_id uuid,
  p_user_id uuid,
  p_platform_fee_fcfa integer,
  p_transaction_fee_fcfa integer,
  p_discount_percent integer default 0,
  p_discount_amount_fcfa integer default 0,
  p_promo_code_id uuid default null,
  p_voucher_id uuid default null,
  p_use_points boolean default false
)
returns table (
  payment_id uuid,
  claimed_voucher_id uuid,
  applied_voucher_fcfa integer,
  points_redeemed_fcfa integer,
  leftover_voucher_fcfa integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_booking record;
  v_discounted_base integer;
  v_total_payable integer;
  v_voucher record;
  v_voucher_to_base integer;
  v_remaining_base integer;
  v_points_balance integer;
  v_points_to_redeem integer := 0;
  v_payment_id uuid;
begin
  -- Verrou posé AVANT tout calcul d'avoir/points — même patron que
  -- record_payment_part_received : un second appel concurrent sur la
  -- même réservation attend ici son tour, il ne peut jamais lire un état
  -- "encore pending" pendant que le premier appel est en cours.
  select id, user_id, status, total_price_fcfa into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if v_booking.id is null then
    raise exception 'Réservation introuvable' using errcode = 'check_violation';
  end if;

  if v_booking.user_id <> p_user_id then
    raise exception 'Cette réservation ne vous appartient pas' using errcode = 'check_violation';
  end if;

  if v_booking.status <> 'pending' then
    raise exception 'Cette réservation a déjà été payée ou n''est plus disponible.'
      using errcode = 'check_violation';
  end if;

  v_discounted_base := v_booking.total_price_fcfa - p_discount_amount_fcfa;
  v_total_payable := v_discounted_base + p_platform_fee_fcfa + p_transaction_fee_fcfa;

  -- Avoir — réclamation déléguée à claim_voucher_for_booking, jamais
  -- dupliquée ici (voir applyVoucherAndPoints.ts, même fonction appelée
  -- côté guichet).
  select * into v_voucher
  from public.claim_voucher_for_booking(p_voucher_id, p_user_id, p_booking_id, v_total_payable);

  -- Points — plafonnés sur le reliquat du prix du billet après avoir,
  -- jamais les frais. Toute la logique de verrou/solde reste dans le
  -- trigger apply_points_ledger_entry, jamais recopiée ici.
  if p_use_points then
    v_voucher_to_base := least(coalesce(v_voucher.applied_fcfa, 0), v_discounted_base);
    v_remaining_base := v_discounted_base - v_voucher_to_base;

    if v_remaining_base > 0 then
      select balance into v_points_balance from public.points_balance where user_id = p_user_id;
      v_points_to_redeem := least(v_remaining_base, coalesce(v_points_balance, 0));

      if v_points_to_redeem > 0 then
        begin
          insert into public.points_ledger (booking_id, user_id, points_amount, reason)
          values (p_booking_id, p_user_id, -v_points_to_redeem, 'booking_redemption');
        exception when others then
          raise warning 'Échec de la dépense de points pour la réservation % : %', p_booking_id, sqlerrm;
          v_points_to_redeem := 0;
        end;
      end if;
    end if;
  end if;

  insert into public.payments (
    booking_id, base_amount_fcfa, platform_fee_fcfa, transaction_fee_fcfa,
    discount_percent, discount_amount_fcfa, promo_code_id,
    voucher_id, voucher_amount_fcfa, points_redeemed_fcfa,
    provider, status
  ) values (
    p_booking_id, v_booking.total_price_fcfa, p_platform_fee_fcfa, p_transaction_fee_fcfa,
    p_discount_percent, p_discount_amount_fcfa, p_promo_code_id,
    v_voucher.claimed_voucher_id, coalesce(v_voucher.applied_fcfa, 0), v_points_to_redeem,
    'simulated', 'pending'
  )
  returning id into v_payment_id;

  -- Fermeture (approbation + passage confirmed) déléguée telle quelle à
  -- record_payment_part_received, jamais réimplémentée une troisième
  -- fois — le re-verrouillage de bookings à l'intérieur est un no-op
  -- (même transaction, verrou déjà tenu ci-dessus), jamais un deadlock.
  perform public.record_payment_part_received(v_payment_id);

  payment_id := v_payment_id;
  claimed_voucher_id := v_voucher.claimed_voucher_id;
  applied_voucher_fcfa := coalesce(v_voucher.applied_fcfa, 0);
  points_redeemed_fcfa := v_points_to_redeem;
  leftover_voucher_fcfa := coalesce(v_voucher.leftover_fcfa, 0);
  return next;
end;
$$;

revoke execute on function public.simulate_single_booking_payment(uuid, uuid, integer, integer, integer, integer, uuid, uuid, boolean) from public;
grant execute on function public.simulate_single_booking_payment(uuid, uuid, integer, integer, integer, integer, uuid, uuid, boolean) to service_role;
