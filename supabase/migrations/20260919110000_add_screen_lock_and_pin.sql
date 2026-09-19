-- Chantier 6 : verrouillage d'écran après inactivité + changement rapide
-- d'agent, back-office uniquement.
--
-- Voir le plan pour le raisonnement complet. Résumé des décisions
-- structurelles :
--   - locked_at/last_activity_at sur company_members : le calcul de
--     verrouillage est TOUJOURS dérivé (locked_at is not null OR
--     now() - last_activity_at > lock_timeout_minutes), jamais mis en
--     cache dans une colonne "is_locked" — même philosophie que
--     session_caisse.solde_theorique_fcfa (chantier 4).
--   - pin_hash au format "salt_hex:hash_hex" (scrypt, packages/backoffice
--     lib/pin.ts) — jamais en clair.
--   - lock_timeout_minutes sur companies : même précédent que
--     cash_ceiling_fcfa (chantier 4), un seul réglage structurel, pas de
--     table de config séparée.
--   - pin_attempts : même patron exact que promo_code_attempts (fenêtre
--     glissante, jamais de colonne locked_until mise en cache).
--   - audit_logs.booking_id devient nullable : "session_swap" est le
--     premier type d'événement de ce journal sans réservation associée.

-- ============================================================================
-- 1. company_members : état de verrouillage + PIN haché.
-- ============================================================================

alter table public.company_members
  add column pin_hash text,
  add column locked_at timestamptz,
  add column last_activity_at timestamptz not null default now();

-- ============================================================================
-- 2. companies : seuil d'inactivité configurable (2 à 5 minutes).
-- ============================================================================

alter table public.companies
  add column lock_timeout_minutes integer not null default 3
    check (lock_timeout_minutes between 2 and 5);

-- ============================================================================
-- 3. pin_attempts — rate-limit du PIN, même patron que promo_code_attempts.
-- ============================================================================

create table public.pin_attempts (
  id uuid primary key default gen_random_uuid(),
  locked_member_id uuid not null references public.company_members (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index pin_attempts_locked_member_id_idx
  on public.pin_attempts (locked_member_id, created_at desc);

alter table public.pin_attempts enable row level security;
grant select, insert on public.pin_attempts to service_role;
-- Aucun grant authenticated/anon — jamais interrogée que par les Server
-- Actions de verrouillage/déverrouillage (service_role uniquement).

-- ============================================================================
-- 4. audit_logs.booking_id devient nullable — "session_swap" (chantier 6)
--    est le premier événement journalisé sans réservation associée.
--    get_company_audit_feed n'a besoin d'aucun changement : elle projette
--    déjà booking_id tel quel.
-- ============================================================================

alter table public.audit_logs alter column booking_id drop not null;

-- ============================================================================
-- 5. get_company_access — gagne has_pin/locked_at/last_activity_at/
--    lock_timeout_minutes, en un seul aller-retour (comme aujourd'hui).
--    Signature de retour modifiée : drop + create, puis re-grant.
-- ============================================================================

drop function public.get_company_access(uuid);

create function public.get_company_access(p_user_id uuid)
returns table (
  company_id uuid, company_name text, company_slug text, company_logo_url text,
  member_role text, agency_id uuid, agency_name text, agency_station_id uuid,
  member_name text,
  subscription_status text, current_period_end timestamptz, plan_name text,
  has_pin boolean, locked_at timestamptz, last_activity_at timestamptz,
  lock_timeout_minutes integer
)
language sql
security definer
stable
set search_path = public
as $$
  select
    c.id, c.name, c.slug, c.logo_url,
    m.role, m.agency_id, ag.name, ag.station_id,
    coalesce(m.full_name, u.email),
    s.status, s.current_period_end, sp.name,
    m.pin_hash is not null, m.locked_at, m.last_activity_at,
    c.lock_timeout_minutes
  from public.company_members m
  join public.companies c on c.id = m.company_id
  join auth.users u on u.id = m.user_id
  left join public.agencies ag on ag.id = m.agency_id
  left join public.company_subscriptions s on s.company_id = c.id
  left join public.subscription_plans sp on sp.id = s.subscription_plan_id
  where m.user_id = p_user_id and m.is_active = true
  order by s.current_period_end desc nulls last
  limit 1;
$$;

revoke execute on function public.get_company_access(uuid) from public;
grant execute on function public.get_company_access(uuid) to service_role;
