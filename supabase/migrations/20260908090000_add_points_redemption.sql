-- GoBus Points en réduction sur un billet (1 point = 1 FCFA), combinable
-- avec un avoir sur le même paiement — avoir en priorité 1 (déjà
-- existant, inchangé), points en priorité 2 sur le reliquat du prix du
-- billet (base_amount_fcfa) après avoir, jamais les frais de service.

-- ============================================================
-- 1. points_ledger — une réservation peut désormais avoir une ligne
--    'booking_reward' ET une ligne 'booking_redemption' (plus une seule
--    ligne au total).
-- ============================================================

alter table public.points_ledger drop constraint points_ledger_booking_id_key;
alter table public.points_ledger
  add constraint points_ledger_booking_id_reason_key unique (booking_id, reason);

alter table public.points_ledger drop constraint points_ledger_reason_check;
alter table public.points_ledger
  add constraint points_ledger_reason_check check (reason in ('booking_reward', 'booking_redemption'));

-- ============================================================
-- 2. points_balance — la contrainte EST le mécanisme d'application
--    d'une dépense, pas un filet derrière une vérification applicative
--    séparée. apply_points_ledger_entry() (inchangée) fait déjà un
--    upsert additif pur (balance = balance + excluded.balance) : pour
--    une ligne négative, si le résultat descend sous 0, cet update viole
--    la contrainte ci-dessous, ce qui fait échouer le trigger, ce qui
--    fait échouer l'INSERT déclencheur dans points_ledger — un seul
--    INSERT est toujours atomique avec les triggers qu'il déclenche.
--    points_balance a sa clé primaire sur user_id : deux dépenses
--    concurrentes du même compte se sérialisent sur ce verrou de ligne,
--    fermant le TOCTOU qu'une simple lecture préalable du solde ne
--    pourrait pas fermer seule.
-- ============================================================

alter table public.points_balance
  add constraint points_balance_balance_check check (balance >= 0);

-- ============================================================
-- 3. payments — nouvelle colonne, colonne générée reconstruite
--    (une colonne générée ne peut pas voir son expression modifiée en
--    place — déjà rencontré et vérifié pour amount_charged_fcfa
--    elle-même lors du chantier des avoirs — drop puis re-add).
-- ============================================================

alter table public.payments
  add column points_redeemed_fcfa integer not null default 0
    -- Plafond volontairement sur base_amount_fcfa (pas amount_fcfa comme
    -- voucher_amount_fcfa) : contrairement à l'avoir, les points ne
    -- s'appliquent JAMAIS aux frais de service — encodé ici, pas
    -- seulement dans la logique applicative.
    check (points_redeemed_fcfa >= 0 and points_redeemed_fcfa <= base_amount_fcfa);

alter table public.payments drop column amount_charged_fcfa;
alter table public.payments add column amount_charged_fcfa integer
  generated always as (
    base_amount_fcfa + platform_fee_fcfa + transaction_fee_fcfa - voucher_amount_fcfa - points_redeemed_fcfa
  ) stored;

-- Garde-fou supplémentaire : même si chaque colonne est bornée
-- individuellement, la somme avoir+points ne doit jamais dépasser le
-- montant total — la logique applicative (actions.ts /
-- simulate_round_trip_payment) garantit déjà que ça n'arrive jamais,
-- ceci est un filet de sécurité.
alter table public.payments
  add constraint payments_voucher_points_not_exceeding_check
  check (voucher_amount_fcfa + points_redeemed_fcfa <= amount_fcfa);

-- ============================================================
-- 4. simulate_round_trip_payment — nouveau paramètre p_use_points
--
-- Piège Postgres déjà rencontré : "create or replace function" refuse de
-- changer la liste de paramètres d'une fonction existante — il faut
-- explicitement drop puis create (et re-déclarer les grants, perdus avec
-- le drop).
-- ============================================================

drop function if exists public.simulate_round_trip_payment(uuid, uuid, uuid);

create function public.simulate_round_trip_payment(
  p_booking_group_id uuid,
  p_user_id uuid,
  p_voucher_id uuid default null,
  p_use_points boolean default false
)
returns table (outbound_payment_id uuid, return_payment_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbound record;
  v_return record;
  v_outbound_payment_id uuid;
  v_return_payment_id uuid;
  -- Dupliqué depuis packages/shared/src/lib/pricing.ts (PLATFORM_FEE_RATE /
  -- TRANSACTION_FEE_RATE) — même limitation déjà documentée dans les
  -- versions précédentes de cette fonction.
  v_platform_fee_rate numeric := 0.027;
  v_transaction_fee_rate numeric := 0.013;
  v_outbound_total integer;
  v_return_total integer;
  v_combined_total integer;
  v_voucher_amount integer;
  v_voucher_applied integer := 0;
  v_outbound_voucher integer := 0;
  v_return_voucher integer := 0;
  v_leftover integer;
  v_outbound_voucher_to_base integer := 0;
  v_return_voucher_to_base integer := 0;
  v_combined_remaining_base integer;
  v_points_balance integer;
  v_points_to_redeem integer := 0;
  v_outbound_points integer := 0;
  v_return_points integer := 0;
begin
  select id, total_price_fcfa, status, user_id into v_outbound
  from public.bookings where booking_group_id = p_booking_group_id and leg = 'outbound';
  select id, total_price_fcfa, status, user_id into v_return
  from public.bookings where booking_group_id = p_booking_group_id and leg = 'return';

  if v_outbound.id is null or v_return.id is null then
    raise exception 'Réservation aller-retour introuvable' using errcode = 'check_violation';
  end if;

  if v_outbound.user_id <> p_user_id or v_return.user_id <> p_user_id then
    raise exception 'Cette réservation ne vous appartient pas' using errcode = 'check_violation';
  end if;

  if v_outbound.status <> 'pending' or v_return.status <> 'pending' then
    raise exception 'Ce billet aller-retour a déjà été payé ou annulé'
      using errcode = 'check_violation';
  end if;

  v_outbound_total := v_outbound.total_price_fcfa
    + round(v_outbound.total_price_fcfa * v_platform_fee_rate)
    + round(v_outbound.total_price_fcfa * v_transaction_fee_rate);
  v_return_total := v_return.total_price_fcfa
    + round(v_return.total_price_fcfa * v_platform_fee_rate)
    + round(v_return.total_price_fcfa * v_transaction_fee_rate);
  v_combined_total := v_outbound_total + v_return_total;

  -- Avoir : inchangé, priorité 1. Réclamation atomique (une seule
  -- transaction) : la clause "and status = 'active'" ferme toute course
  -- avec une autre utilisation concurrente du même avoir.
  if p_voucher_id is not null then
    update public.vouchers
    set status = 'used', consumed_booking_group_id = p_booking_group_id, consumed_at = now()
    where id = p_voucher_id and user_id = p_user_id and status = 'active' and expires_at > now()
    returning amount_fcfa into v_voucher_amount;

    if found then
      v_voucher_applied := least(v_voucher_amount, v_combined_total);
      v_outbound_voucher := round(v_voucher_applied * v_outbound_total::numeric / v_combined_total);
      v_return_voucher := v_voucher_applied - v_outbound_voucher;

      v_leftover := v_voucher_amount - v_voucher_applied;
      if v_leftover > 0 then
        update public.vouchers
        set status = 'refund_pending', refund_pending_amount_fcfa = v_leftover, refund_pending_at = now()
        where id = p_voucher_id;
      end if;
    end if;
    -- Si "not found" (avoir déjà utilisé/expiré entre-temps) : le paiement
    -- continue simplement sans avoir, aucune erreur bloquante.
  end if;

  -- Points : priorité 2, uniquement sur le reliquat du prix du BILLET de
  -- chaque leg (jamais les frais) après la part de l'avoir déjà comptée
  -- sur ce billet — voir le plan de ce chantier pour le détail chiffré.
  if p_use_points then
    v_outbound_voucher_to_base := least(v_outbound_voucher, v_outbound.total_price_fcfa);
    v_return_voucher_to_base := least(v_return_voucher, v_return.total_price_fcfa);
    v_combined_remaining_base := (v_outbound.total_price_fcfa - v_outbound_voucher_to_base)
                                + (v_return.total_price_fcfa - v_return_voucher_to_base);

    if v_combined_remaining_base > 0 then
      select balance into v_points_balance from public.points_balance where user_id = p_user_id;
      v_points_to_redeem := least(v_combined_remaining_base, coalesce(v_points_balance, 0));

      if v_points_to_redeem > 0 then
        -- Même répartition proportionnelle que l'avoir (le second leg par
        -- soustraction, jamais un round() indépendant — évite un écart
        -- d'arrondi entre la somme des deux legs et le montant décidé).
        v_outbound_points := round(
          v_points_to_redeem * (v_outbound.total_price_fcfa - v_outbound_voucher_to_base)::numeric
          / v_combined_remaining_base
        );
        v_return_points := v_points_to_redeem - v_outbound_points;

        -- begin/exception agit comme un savepoint : si l'un des deux
        -- inserts viole points_balance_balance_check (course concurrente
        -- rarissime), LES DEUX sont annulés — jamais un seul leg avec des
        -- points appliqués — et on retombe sur 0 point, jamais une erreur
        -- qui bloquerait tout le paiement combiné.
        begin
          if v_outbound_points > 0 then
            insert into public.points_ledger (booking_id, user_id, points_amount, reason)
            values (v_outbound.id, p_user_id, -v_outbound_points, 'booking_redemption');
          end if;
          if v_return_points > 0 then
            insert into public.points_ledger (booking_id, user_id, points_amount, reason)
            values (v_return.id, p_user_id, -v_return_points, 'booking_redemption');
          end if;
        exception when others then
          raise warning 'Échec de la dépense de points pour le groupe % : %', p_booking_group_id, sqlerrm;
          v_outbound_points := 0;
          v_return_points := 0;
        end;
      end if;
    end if;
  end if;

  insert into public.payments (booking_id, base_amount_fcfa, platform_fee_fcfa, transaction_fee_fcfa, voucher_id, voucher_amount_fcfa, points_redeemed_fcfa, provider, status)
  values (v_outbound.id, v_outbound.total_price_fcfa,
          round(v_outbound.total_price_fcfa * v_platform_fee_rate),
          round(v_outbound.total_price_fcfa * v_transaction_fee_rate),
          case when v_outbound_voucher > 0 then p_voucher_id end, v_outbound_voucher,
          v_outbound_points,
          'simulated', 'pending')
  returning id into v_outbound_payment_id;
  update public.payments set status = 'approved', paid_at = now() where id = v_outbound_payment_id;
  update public.bookings set status = 'confirmed' where id = v_outbound.id;

  insert into public.payments (booking_id, base_amount_fcfa, platform_fee_fcfa, transaction_fee_fcfa, voucher_id, voucher_amount_fcfa, points_redeemed_fcfa, provider, status)
  values (v_return.id, v_return.total_price_fcfa,
          round(v_return.total_price_fcfa * v_platform_fee_rate),
          round(v_return.total_price_fcfa * v_transaction_fee_rate),
          case when v_return_voucher > 0 then p_voucher_id end, v_return_voucher,
          v_return_points,
          'simulated', 'pending')
  returning id into v_return_payment_id;
  update public.payments set status = 'approved', paid_at = now() where id = v_return_payment_id;
  update public.bookings set status = 'confirmed' where id = v_return.id;

  return query select v_outbound_payment_id, v_return_payment_id;
end;
$$;

revoke execute on function public.simulate_round_trip_payment(uuid, uuid, uuid, boolean) from public;
grant execute on function public.simulate_round_trip_payment(uuid, uuid, uuid, boolean) to service_role;
