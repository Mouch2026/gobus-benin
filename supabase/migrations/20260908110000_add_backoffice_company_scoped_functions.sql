-- Chantier : redesign de la navigation back-office en 8 rubriques.
-- Ajoute les 3 fonctions SQL nécessaires aux nouvelles pages Paiements et
-- Remboursements (Clients réutilise get_company_passenger_bookings déjà
-- existante, avec un regroupement côté application — voir le plan).
--
-- Convention de sécurité reproduite à l'identique de
-- get_company_passenger_bookings (20260904170000) : security definer,
-- service_role UNIQUEMENT, aucune revérification interne via
-- is_company_owner (service_role n'a pas de JWT/auth.uid() à vérifier).
-- La portée par compagnie tient au filtre "where ... company_id =
-- p_company_id" lui-même : la fonction n'a aucun mode "sans filtre", donc
-- même appelée hors contexte elle ne peut renvoyer que les lignes de la
-- compagnie passée en paramètre.

-- ============================================================================
-- 1. get_company_payments : vue Paiements — un paiement par ligne, lié aux
--    réservations des trajets de la compagnie (bookings.company_id est déjà
--    dénormalisé, pas besoin de remonter jusqu'à trips pour le filtre).
-- ============================================================================

create function public.get_company_payments(p_company_id uuid)
returns table (
  payment_id uuid,
  booking_id uuid,
  booking_reference text,
  base_amount_fcfa integer,
  platform_fee_fcfa integer,
  transaction_fee_fcfa integer,
  voucher_amount_fcfa integer,
  points_redeemed_fcfa integer,
  amount_charged_fcfa integer,
  status text,
  provider text,
  method text,
  paid_at timestamptz,
  created_at timestamptz,
  origin_city text,
  destination_city text,
  departure_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      pay.id as payment_id,
      pay.booking_id,
      b.booking_reference,
      pay.base_amount_fcfa,
      pay.platform_fee_fcfa,
      pay.transaction_fee_fcfa,
      pay.voucher_amount_fcfa,
      pay.points_redeemed_fcfa,
      pay.amount_charged_fcfa,
      pay.status,
      pay.provider,
      pay.method,
      pay.paid_at,
      pay.created_at,
      r.origin_city,
      r.destination_city,
      t.departure_at
    from public.payments pay
    join public.bookings b on b.id = pay.booking_id
    join public.trips t on t.id = b.trip_id
    join public.routes r on r.id = t.route_id
    where b.company_id = p_company_id
    order by pay.created_at desc;
end;
$$;

revoke execute on function public.get_company_payments(uuid) from public;
grant execute on function public.get_company_payments(uuid) to service_role;

-- ============================================================================
-- 2. vouchers : ajoute la trace d'audit "marqué comme traité" (aucune
--    colonne de ce type n'existait auparavant, confirmé par grep) + un
--    statut terminal distinct de 'refund_pending', pour que l'avoir sorte
--    naturellement de la liste Remboursements une fois traité.
-- ============================================================================

alter table public.vouchers
  add column processed_at timestamptz,
  add column processed_by uuid references auth.users (id) on delete set null;

alter table public.vouchers drop constraint vouchers_status_check;
alter table public.vouchers add constraint vouchers_status_check
  check (status in ('active', 'used', 'refund_pending', 'refund_processed'));

-- ============================================================================
-- 3. get_company_refund_pending_vouchers : vue Remboursements — avoirs en
--    attente dont la réservation d'origine appartient à un trajet de cette
--    compagnie. Cast ::text sur auth.users.email appliqué préventivement
--    (varchar vs text, déjà rencontré une fois sur
--    get_company_passenger_bookings — RETURN QUERY exige une correspondance
--    de type exacte, contrairement à un simple SELECT).
-- ============================================================================

create function public.get_company_refund_pending_vouchers(p_company_id uuid)
returns table (
  voucher_id uuid,
  user_id uuid,
  user_email text,
  amount_fcfa integer,
  refund_pending_amount_fcfa integer,
  refund_pending_at timestamptz,
  origin_booking_id uuid,
  origin_booking_reference text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      v.id as voucher_id,
      v.user_id,
      u.email::text as user_email,
      v.amount_fcfa,
      v.refund_pending_amount_fcfa,
      v.refund_pending_at,
      v.origin_booking_id,
      b.booking_reference as origin_booking_reference
    from public.vouchers v
    join public.bookings b on b.id = v.origin_booking_id
    join auth.users u on u.id = v.user_id
    where b.company_id = p_company_id
      and v.status = 'refund_pending'
    order by v.refund_pending_at asc;
end;
$$;

revoke execute on function public.get_company_refund_pending_vouchers(uuid) from public;
grant execute on function public.get_company_refund_pending_vouchers(uuid) to service_role;

-- ============================================================================
-- 4. mark_voucher_refund_processed : action "marquer comme traité" —
--    purement informatif (aucun mouvement d'argent réel, FedaPay non
--    connecté). Écriture (pas une simple lecture) qui contourne RLS via
--    service_role : auto-vérifiée en interne par défense en profondeur
--    (compare le company_id réel du booking d'origine au paramètre reçu,
--    plutôt que de faire une confiance aveugle à l'appelant côté
--    back-office). p_processed_by est passé explicitement par l'appelant
--    (service_role n'a pas de auth.uid() à lire lui-même) — même
--    convention que p_user_id sur simulate_round_trip_payment.
-- ============================================================================

create function public.mark_voucher_refund_processed(
  p_voucher_id uuid,
  p_company_id uuid,
  p_processed_by uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_company_id uuid;
begin
  select b.company_id into v_booking_company_id
  from public.vouchers v
  join public.bookings b on b.id = v.origin_booking_id
  where v.id = p_voucher_id
    and v.status = 'refund_pending';

  if v_booking_company_id is null then
    raise exception 'Avoir introuvable ou déjà traité (id=%)', p_voucher_id;
  end if;

  if v_booking_company_id <> p_company_id then
    raise exception 'Cet avoir n''appartient pas à votre compagnie';
  end if;

  update public.vouchers
  set status = 'refund_processed',
      processed_at = now(),
      processed_by = p_processed_by
  where id = p_voucher_id;
end;
$$;

revoke execute on function public.mark_voucher_refund_processed(uuid, uuid, uuid) from public;
grant execute on function public.mark_voucher_refund_processed(uuid, uuid, uuid) to service_role;
