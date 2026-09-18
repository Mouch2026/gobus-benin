-- Chantier 3c : validation superviseur (remise agent > 10%, annulation
-- guichet < 2h avant départ).
--
-- Une seule table pour les deux déclencheurs, avec un mode on_site/remote
-- — voir le plan (point 1) pour le raisonnement complet. Résumé :
--   - remise  : create_booking_for_company (inchangée) réserve déjà le
--     siège atomiquement ; ce qui est différé jusqu'à validation, c'est
--     uniquement l'insertion des lignes payments (donc jamais de
--     'confirmed', jamais de lien de paiement envoyé). Refusée/expirée →
--     la réservation 'pending' tenue en attente est simplement annulée
--     (issue_voucher_and_cancel_booking, aucun paiement n'existe encore
--     donc aucun avoir émis).
--   - annulation : rien n'est modifié tant que ce n'est pas validé —
--     cancel_booking_by_company est la SEULE fonction qui libère un
--     siège, on ne l'appelle simplement pas tant que la demande est en
--     attente.
-- mode = 'on_site' est écrit déjà résolu (status/reviewed_by/reviewed_at
-- à l'instant de la vérification) — une ligne par action gérée, que ce
-- soit tranché immédiatement ou après une attente, pour un futur audit
-- log unifié (point 4).

-- ============================================================================
-- 1. supervisor_approval_requests
-- ============================================================================

create table public.supervisor_approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  action_type text not null check (action_type in ('discount', 'cancellation')),
  mode text not null check (mode in ('on_site', 'remote')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  -- Remise uniquement — null pour 'cancellation'. voucher_id/use_points
  -- restent facultatifs même pour une remise (un client peut ne choisir
  -- ni avoir ni points), donc hors de la contrainte ci-dessous.
  discount_percent integer check (discount_percent is null or (discount_percent >= 0 and discount_percent <= 100)),
  discount_amount_fcfa integer check (discount_amount_fcfa is null or discount_amount_fcfa >= 0),
  payment_parts jsonb,
  voucher_id uuid references public.vouchers (id),
  use_points boolean,
  constraint supervisor_approval_requests_discount_payload check (
    (action_type = 'cancellation'
      and discount_percent is null and discount_amount_fcfa is null and payment_parts is null)
    or (action_type = 'discount'
      and discount_percent is not null and discount_amount_fcfa is not null and payment_parts is not null)
  ),
  -- Une résolution HUMAINE (approved/rejected) a toujours un auteur et un
  -- instant. 'expired' est un troisième cas, terminal mais jamais
  -- revu par personne — reviewed_by reste null (même chose que
  -- 'pending' sur ce point précis, seul le statut les distingue).
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  constraint supervisor_approval_requests_review_matches_status check (
    (status in ('pending', 'expired') and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index supervisor_approval_requests_company_id_idx
  on public.supervisor_approval_requests (company_id);
create index supervisor_approval_requests_agency_id_idx
  on public.supervisor_approval_requests (agency_id);

-- Au plus une demande ACTIVE par réservation — une fois résolue
-- (approved/rejected/expired), une nouvelle demande peut être ouverte
-- sur la même réservation (ex. annulation refusée, puis retentée plus
-- tard). Même patron que company_notifications_state_alert_key
-- (unicité partielle, pas une contrainte globale).
create unique index supervisor_approval_requests_pending_booking_idx
  on public.supervisor_approval_requests (booking_id)
  where status = 'pending';

-- ============================================================================
-- 2. GRANT — table purement interne, comme promo_code_redemptions/
--    promo_code_attempts (chantier précédent) : aucune policy
--    authenticated, tout accès passe par des Server Actions via
--    supabaseAdmin avec les vérifications de portée codées explicitement.
-- ============================================================================

alter table public.supervisor_approval_requests enable row level security;
-- Pas de policy pour authenticated : RLS activé par principe (CLAUDE.md),
-- mais aucun grant authenticated ne rend ces policies atteignables.
grant all on public.supervisor_approval_requests to service_role;
-- Pas de grant anon, pas de grant authenticated.

-- issue_voucher_and_cancel_booking existe déjà (chantier "paiements
-- scindés") mais n'était jusqu'ici jamais appelée QUE depuis une autre
-- fonction SQL (cancel_booking, cancel_booking_by_company,
-- cancel_confirmed_bookings_for_trip) — un appel SQL→SQL, pas un vrai
-- appel RPC, donc jamais grantée à service_role. Ce chantier l'appelle
-- directement depuis validations/actions.ts (remise refusée : annuler la
-- réservation tenue en attente) — un vrai appel RPC cette fois, qui a
-- donc besoin de ce grant explicite, absent jusqu'ici.
grant execute on function public.issue_voucher_and_cancel_booking(uuid) to service_role;

-- ============================================================================
-- 3. expire_stale_supervisor_requests — sweep, appelée à la fois
--    paresseusement (comme sweep_my_expired_vouchers) et par pg_cron
--    (comme sweep_all_expired_vouchers) : une seule fonction, jamais de
--    logique dupliquée entre TypeScript et SQL.
-- ============================================================================

create function public.expire_stale_supervisor_requests()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  for v_row in
    -- "where status = 'pending'" ferme la course avec une résolution
    -- humaine simultanée (même sémantique MVCC que sweep_all_expired_vouchers) :
    -- si un superviseur vient d'approuver/refuser, cette ligne n'est
    -- déjà plus 'pending' et n'est pas retraitée ici.
    update public.supervisor_approval_requests
    set status = 'expired'
    where status = 'pending' and expires_at <= now()
    returning id, action_type, booking_id
  loop
    if v_row.action_type = 'discount' then
      -- La réservation tenue en attente n'a jamais eu de paiement
      -- inséré : v_received_sum vaudra 0 dans
      -- issue_voucher_and_cancel_booking, aucun avoir n'est donc émis.
      -- Pas cancel_booking_by_company : son garde-fou "trajet déjà
      -- parti" ne s'applique pas ici (on annule une simple attente
      -- expirée, pas une vraie demande client), et l'appartenance a déjà
      -- été vérifiée à la création de la demande.
      perform public.issue_voucher_and_cancel_booking(v_row.booking_id);
    end if;
    -- 'cancellation' : rien à faire, la réservation n'a jamais été touchée.
  end loop;
end;
$$;

revoke execute on function public.expire_stale_supervisor_requests() from public;
grant execute on function public.expire_stale_supervisor_requests() to service_role;

-- ============================================================================
-- 4. Programmation pg_cron — filet de sécurité si personne ne recharge
--    une page pertinente. Pas d'Edge Function ici (contrairement au
--    sweep des avoirs) : cette fonction n'a aucun effet de bord externe
--    (pas d'e-mail), un appel SQL direct suffit.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;

select cron.schedule(
  'expire-stale-supervisor-requests-every-minute',
  '* * * * *',
  $$select public.expire_stale_supervisor_requests();$$
);
