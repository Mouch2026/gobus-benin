-- Chantier : permissions par rôle dans le back-office (durcissement RLS)
--
-- 1. Nouveau helper is_company_manager_or_owner(company_id), jumeau de
--    is_company_member — vrai pour un membre actif dont le rôle est
--    'owner' ou 'agency_manager', faux pour un 'agent' ou un non-membre.
-- 2. Applique ce helper aux policies d'ÉCRITURE (insert/update/delete)
--    des 4 tables dont les mutations passent par le client de session
--    lié à la RLS (routes, trips, bus_layouts, agencies) — ce sont les
--    seules où la vérification applicative ajoutée dans ce chantier
--    (requirePermission()) n'était pas déjà doublée par service_role.
--    Les policies de LECTURE (select) ne sont pas touchées : routes et
--    trips sont en lecture publique (routes_select_public,
--    trips_select_public), bus_layouts aussi
--    (bus_layouts_select_public), et agencies_select_owner reste
--    is_company_member — un agent doit continuer à tout consulter.
-- 3. company_members n'est pas concernée : ses écritures passent par
--    supabaseAdmin (service_role), qui contourne déjà la RLS — y ajouter
--    une policy plus stricte n'y changerait rien (choix déjà assumé au
--    chantier précédent).

create function public.is_company_manager_or_owner(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = target_company_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role in ('owner', 'agency_manager')
  );
$$;

alter policy "routes_insert_owner" on public.routes
  with check (public.is_company_manager_or_owner(company_id));
alter policy "routes_update_owner" on public.routes
  using (public.is_company_manager_or_owner(company_id))
  with check (public.is_company_manager_or_owner(company_id));
alter policy "routes_delete_owner" on public.routes
  using (public.is_company_manager_or_owner(company_id));

alter policy "trips_insert_owner" on public.trips
  with check (public.is_company_manager_or_owner(company_id));
alter policy "trips_update_owner" on public.trips
  using (public.is_company_manager_or_owner(company_id))
  with check (public.is_company_manager_or_owner(company_id));
alter policy "trips_delete_owner" on public.trips
  using (public.is_company_manager_or_owner(company_id));

-- Plans de bus : palier structurel (owner seul), comme les agences —
-- is_company_owner directement, pas is_company_manager_or_owner (ce
-- gabarit est partagé par toute la compagnie, pas propre à une agence).
alter policy "bus_layouts_insert_owner" on public.bus_layouts
  with check (public.is_company_owner(company_id));
alter policy "bus_layouts_update_owner" on public.bus_layouts
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));
alter policy "bus_layouts_delete_owner" on public.bus_layouts
  using (public.is_company_owner(company_id));

-- Gestion des agences : palier structurel (owner seul), pas le palier
-- supervision — is_company_owner directement, pas is_company_manager_or_owner.
alter policy "agencies_insert_owner" on public.agencies
  with check (public.is_company_owner(company_id));
alter policy "agencies_update_owner" on public.agencies
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));
alter policy "agencies_delete_owner" on public.agencies
  using (public.is_company_owner(company_id));
