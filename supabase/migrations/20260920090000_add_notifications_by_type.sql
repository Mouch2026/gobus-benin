-- Chantier : finitions de la navigation back-office — badges par
-- rubrique dans la barre latérale (ex. Réservations, Voyages, Caisse,
-- Validations).
--
-- count_unread_company_notifications() (20260912130000_add_backoffice_notifications.sql)
-- renvoie un entier scalaire, sans GROUP BY — structurellement
-- incapable de fournir une répartition par type. Cette fonction reprend
-- SA CLAUSE WHERE À L'IDENTIQUE (mêmes jointures, mêmes 4 conditions
-- d'éligibilité — donc aucune nouvelle définition de ce qui compte
-- comme "non lu"), seule différence : un group by type au lieu d'un
-- total. company_notifications.type est déjà du texte libre sans
-- contrainte CHECK (voir sa migration d'origine) — un type rencontré
-- plus tard sans correspondance côté UI n'affiche simplement aucun
-- badge, aucune migration nécessaire pour en ajouter un nouveau.

create function public.count_unread_company_notifications_by_type(p_user_id uuid)
returns table (type text, unread_count integer)
language sql
security definer
stable
set search_path = public
as $$
  select n.type, count(*)::integer as unread_count
  from public.company_notifications n
  join public.company_members m
    on m.company_id = n.company_id
   and m.user_id = p_user_id
   and m.is_active = true
  left join public.company_notification_reads r
    on r.notification_id = n.id and r.user_id = p_user_id
  where n.kind = 'event'
    and r.notification_id is null
    and (n.target_agency_id is null or n.target_agency_id = m.agency_id)
    and (n.target_role is null or n.target_role = m.role)
    and (n.target_user_id is null or n.target_user_id = m.user_id)
    and (n.expires_at is null or n.expires_at > now())
  group by n.type;
$$;

revoke execute on function public.count_unread_company_notifications_by_type(uuid) from public;
grant execute on function public.count_unread_company_notifications_by_type(uuid) to service_role;
