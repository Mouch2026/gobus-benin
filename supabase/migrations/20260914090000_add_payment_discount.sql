-- Chantier 3b-1 : remise appliquée par un agent au guichet
--
-- Troisième réduction sur payments, sur le même mécanisme que
-- voucher_amount_fcfa/points_redeemed_fcfa : base_amount_fcfa reste
-- TOUJOURS le prix plein du billet (jamais réduit directement), la
-- remise est une colonne sœur soustraite uniquement dans la colonne
-- générée amount_charged_fcfa. « Jamais deux logiques de calcul à
-- maintenir » — même stockage, même mécanique.
--
-- La remise suit la règle des POINTS (jamais les frais de service),
-- pas celle de l'avoir : points_redeemed_fcfa est déjà plafonné sur
-- base_amount_fcfa (pas amount_fcfa comme voucher_amount_fcfa) —
-- asymétrie déjà existante entre avoir et points, pas corrigée ici.
--
-- Vérifié en lecture seule sur la base réelle avant cette migration :
-- aucune des 6 lignes payments existantes n'a
-- voucher_amount_fcfa + points_redeemed_fcfa > base_amount_fcfa — la
-- contrainte de cumul plus stricte ajoutée plus bas peut donc remplacer
-- l'ancienne sans migration de données.

-- ============================================================================
-- 1. Colonnes remise + traçabilité
-- ============================================================================

alter table public.payments
  add column discount_percent integer not null default 0
    check (discount_percent >= 0 and discount_percent <= 100),
  add column discount_amount_fcfa integer not null default 0
    -- Même plafond que points_redeemed_fcfa, pour la même raison : la
    -- remise ne s'applique JAMAIS aux frais de service.
    check (discount_amount_fcfa >= 0 and discount_amount_fcfa <= base_amount_fcfa),
  -- Même patron que vouchers.processed_by : peuplé explicitement par
  -- l'appelant (service_role n'a pas de auth.uid() à lire lui-même),
  -- jamais par un trigger.
  add column discount_granted_by uuid references auth.users (id) on delete set null;

-- Une remise non nulle doit toujours avoir un auteur identifié — encodé
-- en base, pas seulement garanti par le code applicatif.
alter table public.payments
  add constraint payments_discount_requires_grantor
  check (discount_amount_fcfa = 0 or discount_granted_by is not null);

-- ============================================================================
-- 2. amount_charged_fcfa — colonne générée reconstruite (une expression
--    générée ne peut pas être modifiée en place, déjà rencontré au
--    chantier des points : drop puis re-add).
-- ============================================================================

alter table public.payments drop column amount_charged_fcfa;
alter table public.payments add column amount_charged_fcfa integer
  generated always as (
    base_amount_fcfa + platform_fee_fcfa + transaction_fee_fcfa
      - discount_amount_fcfa - voucher_amount_fcfa - points_redeemed_fcfa
  ) stored;

-- ============================================================================
-- 3. Garde-fou de cumul — remplace payments_voucher_points_not_exceeding_check
--    (plafonnait sur amount_fcfa, billet + frais) par une version plus
--    stricte, plafonnée sur base_amount_fcfa (le billet seul). La
--    nouvelle contrainte subsume mathématiquement l'ancienne (remise >= 0
--    donc discount+voucher+points <= base_amount_fcfa implique
--    voucher+points <= amount_fcfa, puisque amount_fcfa >= base_amount_fcfa).
-- ============================================================================

alter table public.payments drop constraint payments_voucher_points_not_exceeding_check;
alter table public.payments
  add constraint payments_discount_voucher_points_not_exceeding_check
  check (discount_amount_fcfa + voucher_amount_fcfa + points_redeemed_fcfa <= base_amount_fcfa);

-- ============================================================================
-- 4. get_company_payments — gagne discount_percent/discount_amount_fcfa,
--    pour la page Paiements. Signature de retour modifiée : drop + create
--    (jamais create or replace sur un changement de colonnes de returns
--    table), puis re-grant identique à l'existant.
-- ============================================================================

drop function public.get_company_payments(uuid);

create function public.get_company_payments(p_company_id uuid)
returns table (
  payment_id uuid,
  booking_id uuid,
  booking_reference text,
  base_amount_fcfa integer,
  platform_fee_fcfa integer,
  transaction_fee_fcfa integer,
  discount_percent integer,
  discount_amount_fcfa integer,
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
      pay.discount_percent,
      pay.discount_amount_fcfa,
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
