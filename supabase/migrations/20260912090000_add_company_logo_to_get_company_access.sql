-- Chantier : topbar back-office (logo de compagnie)
--
-- get_company_access() gagne company_logo_url, pour que requireCompany()
-- (dal.ts) puisse afficher le logo de la compagnie dans la topbar sans
-- requête Supabase supplémentaire. Signature de retour modifiée : drop +
-- create (jamais create or replace sur un changement de colonnes de
-- returns table), puis re-grant.

drop function public.get_company_access(uuid);

create function public.get_company_access(p_user_id uuid)
returns table (
  company_id uuid, company_name text, company_slug text, company_logo_url text,
  member_role text, agency_id uuid, agency_name text, member_name text,
  subscription_status text, current_period_end timestamptz, plan_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    c.id, c.name, c.slug, c.logo_url,
    m.role, m.agency_id, ag.name,
    coalesce(m.full_name, u.email),
    s.status, s.current_period_end, sp.name
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
