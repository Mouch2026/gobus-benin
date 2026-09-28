-- get_company_access et get_company_members exposent les deux nouvelles
-- colonnes (home_screen, pilotage_access_granted) ajoutées par
-- 20260928090000_add_employee_dashboard_assignment.sql. Signature de
-- retour modifiée (returns table) : drop + create, jamais create or
-- replace — même règle que les migrations précédentes touchant ces deux
-- fonctions. Logique interne recopiée à l'identique, colonnes en plus
-- uniquement.

drop function public.get_company_access(uuid);

create function public.get_company_access(p_user_id uuid)
returns table (
  company_id uuid, company_name text, company_slug text, company_logo_url text,
  member_role text, agency_id uuid, agency_name text, agency_station_id uuid,
  member_name text,
  subscription_status text, current_period_end timestamptz, plan_name text,
  has_pin boolean, locked_at timestamptz, last_activity_at timestamptz,
  lock_timeout_minutes integer, session_started_at timestamptz,
  member_home_screen text, member_pilotage_access_granted boolean
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
    c.lock_timeout_minutes, m.session_started_at,
    m.home_screen, m.pilotage_access_granted
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

-- get_company_members : la page /employes a besoin des valeurs actuelles
-- pour pré-remplir le panneau "Tableau de bord" de chaque ligne.

drop function public.get_company_members(uuid);

create function public.get_company_members(p_company_id uuid)
returns table (
  id uuid, user_id uuid, full_name text, email text, role text,
  agency_id uuid, agency_name text, is_active boolean, created_at timestamptz,
  home_screen text, pilotage_access_granted boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select m.id, m.user_id, m.full_name, u.email::text, m.role,
         m.agency_id, ag.name, m.is_active, m.created_at,
         m.home_screen, m.pilotage_access_granted
  from public.company_members m
  join auth.users u on u.id = m.user_id
  left join public.agencies ag on ag.id = m.agency_id
  where m.company_id = p_company_id
  order by (m.role = 'owner') desc, m.full_name nulls last, u.email;
$$;

revoke execute on function public.get_company_members(uuid) from public;
grant execute on function public.get_company_members(uuid) to service_role;
