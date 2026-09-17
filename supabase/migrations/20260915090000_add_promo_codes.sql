-- Chantier 3b-2 : codes promo pour les réservations en ligne (apps/web)
--
-- Réutilise discount_percent/discount_amount_fcfa (ajoutés au chantier
-- 3b-1 pour la remise agent) : un code promo est économiquement la même
-- réduction (prix du billet uniquement, jamais les frais, même plafond
-- payments_discount_voucher_points_not_exceeding_check) — aucune
-- quatrième colonne monétaire, aucun changement à amount_charged_fcfa.
--
-- discount_granted_by (uuid -> auth.users) est inadapté à un code : on
-- ajoute une colonne sœur promo_code_id, et la contrainte devient
-- « exactement une origine si remise non nulle » plutôt que « un
-- grantor si remise non nulle ».
--
-- Deux garanties de comptage, chacune calquée sur un patron déjà
-- existant dans ce projet :
--   - quota total  : décrément conditionnel WHERE (comme reserve_trip_seats)
--   - un par client : contrainte unique, l'insertion EST la réclamation
--                      atomique (comme vouchers_origin_booking_unique /
--                      points_ledger_booking_id_reason_key)
-- Composées dans cet ordre (unicité client d'abord, quota ensuite, avec
-- annulation de la réclamation d'unicité si le quota échoue) par
-- packages/shared/src/lib/redeemPromoCode.ts — même style que
-- applyVoucherAndPoints.ts (appels supabaseAdmin conditionnels). Seul le
-- décrément de quota lui-même passe par une fonction SQL dédiée
-- (claim_promo_code_use, section 2 plus bas) : PostgREST ne peut pas
-- exprimer "uses_count = uses_count + 1" dans un update() JSON classique
-- (valeurs littérales uniquement) — l'orchestration reste en TypeScript,
-- pas la validation ni l'unicité qui n'ont pas ce problème.
--
-- Annulation : usage JAMAIS restitué (ni uses_count ni la ligne de
-- promo_code_redemptions) — même choix que points_redeemed_fcfa
-- (jamais repris à l'annulation, cf. 20260901020000_add_booking_cancellation.sql),
-- et anti-abus : restituer l'usage permettrait un cycle
-- réserver-annuler-réessayer pour contourner quota ET unicité.

-- ============================================================================
-- 1. promo_codes
-- ============================================================================

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Toujours normalisé en MAJUSCULES à l'écriture (création ET
  -- rédemption) — un seul mécanisme de correspondance insensible à la
  -- casse, jamais un index fonctionnel séparé à maintenir en plus.
  code text not null check (code = upper(code)),
  discount_type text not null check (discount_type in ('fixed', 'percent')),
  discount_fixed_fcfa integer check (discount_fixed_fcfa is null or discount_fixed_fcfa >= 0),
  discount_percent integer check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)),
  -- Exactement le bon champ rempli selon le type — jamais les deux,
  -- jamais aucun.
  constraint promo_codes_discount_matches_type check (
    (discount_type = 'fixed' and discount_fixed_fcfa is not null and discount_percent is null)
    or (discount_type = 'percent' and discount_percent is not null and discount_fixed_fcfa is null)
  ),
  starts_at timestamptz,
  ends_at timestamptz,
  constraint promo_codes_dates_order check (starts_at is null or ends_at is null or starts_at < ends_at),
  max_uses integer check (max_uses is null or max_uses > 0),
  uses_count integer not null default 0 check (uses_count >= 0),
  constraint promo_codes_uses_within_max check (max_uses is null or uses_count <= max_uses),
  min_purchase_fcfa integer check (min_purchase_fcfa is null or min_purchase_fcfa >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create index promo_codes_company_id_idx on public.promo_codes (company_id);

create trigger set_updated_at before update on public.promo_codes
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 2. claim_promo_code_use — décrément conditionnel atomique du quota,
--    même patron que reserve_trip_seats() : PostgREST ne peut pas exprimer
--    "uses_count = uses_count + 1" dans un simple update() (valeurs
--    littérales uniquement), d'où cette fonction dédiée pour ce seul
--    primitif atomique. L'orchestration (réclamer l'unicité client
--    d'abord, appeler ceci ensuite, annuler si 0 ligne) reste en
--    TypeScript dans redeemPromoCode.ts — cette fonction ne fait qu'une
--    chose, jamais la validation ni l'unicité.
-- ============================================================================

create function public.claim_promo_code_use(p_promo_code_id uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  update public.promo_codes
  set uses_count = uses_count + 1
  where id = p_promo_code_id and (max_uses is null or uses_count < max_uses)
  returning id;
$$;

revoke execute on function public.claim_promo_code_use(uuid) from public;
grant execute on function public.claim_promo_code_use(uuid) to service_role;

-- ============================================================================
-- 3. promo_code_redemptions — le vrai verrou "un seul usage par client".
--    L'insertion EST la réclamation atomique, jamais une vérification
--    préalable séparée (même philosophie que points_balance_balance_check).
--    Purement interne : jamais lue ni écrite ailleurs que par
--    redeemPromoCode.ts (service_role) — aucun grant authenticated.
-- ============================================================================

create table public.promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references public.promo_codes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (promo_code_id, user_id)
);

create index promo_code_redemptions_booking_id_idx on public.promo_code_redemptions (booking_id);

-- ============================================================================
-- 4. promo_code_attempts — journal minimal pour la limite de tentatives
--    (protection anti-énumération réelle, pas un message vague). Jamais
--    lu ailleurs que par redeemPromoCode.ts. Aucun grant authenticated.
-- ============================================================================

create table public.promo_code_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index promo_code_attempts_user_id_created_at_idx
  on public.promo_code_attempts (user_id, created_at desc);

-- ============================================================================
-- 5. RLS + GRANT — promo_codes lisible par tout membre actif (le
--    back-office affiche la liste), écrit par le propriétaire seul
--    (palier structurel, comme agencies/bus_layouts) : le client de
--    session est donc le second rempart derrière requirePermission()
--    côté application, pas seulement un raccourci service_role.
-- ============================================================================

alter table public.promo_codes enable row level security;

create policy "promo_codes_select_member" on public.promo_codes
  for select
  using (public.is_company_member(company_id));

create policy "promo_codes_insert_owner" on public.promo_codes
  for insert
  with check (public.is_company_owner(company_id));

create policy "promo_codes_update_owner" on public.promo_codes
  for update
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));

grant select, insert, update on public.promo_codes to authenticated;
grant all on public.promo_codes to service_role;
-- Pas de grant anon.

alter table public.promo_code_redemptions enable row level security;
alter table public.promo_code_attempts enable row level security;
-- Aucune policy pour authenticated sur ces deux tables : purement
-- internes, jamais interrogées par un client, service_role uniquement.
grant all on public.promo_code_redemptions to service_role;
grant all on public.promo_code_attempts to service_role;

-- ============================================================================
-- 6. payments — origine de la remise : agent (discount_granted_by) OU
--    code promo (promo_code_id), jamais les deux, jamais aucune si la
--    remise est non nulle.
-- ============================================================================

alter table public.payments
  add column promo_code_id uuid references public.promo_codes (id) on delete set null;

alter table public.payments drop constraint payments_discount_requires_grantor;
alter table public.payments
  add constraint payments_discount_requires_origin
  check (
    (discount_amount_fcfa = 0 and discount_granted_by is null and promo_code_id is null)
    or (discount_amount_fcfa > 0 and (discount_granted_by is not null) <> (promo_code_id is not null))
  );
