-- Chantier 6 (correctif) : expiration dure après 8h.
--
-- jwt_expiry (3600s) seul ne suffit pas — vérifié en conditions réelles :
-- le SDK (@supabase/ssr, client de session) rafraîchit silencieusement
-- l'access token via le refresh token tant que l'agent reste actif, donc
-- une session active ne meurt jamais d'elle-même au bout de jwt_expiry.
-- session_started_at ancre la dernière connexion RÉELLE par mot de passe
-- (posée par login(), apps/backoffice/app/connexion/actions.ts),
-- indépendante du cycle de rafraîchissement du JWT — comparée dans
-- requireCompany() (dal.ts) à côté du calcul isLocked déjà en place,
-- PRIORITAIRE sur lui : au-delà de 8h, vraie déconnexion (signOut() +
-- redirection /connexion), jamais juste l'écran de verrouillage, qui
-- suppose au contraire une session encore valide qu'on ne fait que
-- réaffirmer.
--
-- Scope volontairement limité au back-office : le natif Supabase
-- équivalent ([auth.sessions] timebox, présent mais commenté dans
-- supabase/config.toml) est un réglage de PROJET, donc s'appliquerait
-- aussi à apps/web (voyageurs) — hors de portée de ce chantier.

alter table public.company_members
  add column session_started_at timestamptz not null default now();

-- get_company_access gagne session_started_at — signature de retour
-- modifiée : drop + create (jamais create or replace sur un changement
-- de colonnes de returns table), puis re-grant.

drop function public.get_company_access(uuid);

create function public.get_company_access(p_user_id uuid)
returns table (
  company_id uuid, company_name text, company_slug text, company_logo_url text,
  member_role text, agency_id uuid, agency_name text, agency_station_id uuid,
  member_name text,
  subscription_status text, current_period_end timestamptz, plan_name text,
  has_pin boolean, locked_at timestamptz, last_activity_at timestamptz,
  lock_timeout_minutes integer, session_started_at timestamptz
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
    c.lock_timeout_minutes, m.session_started_at
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
