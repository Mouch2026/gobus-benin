-- Chantier 2 : comptes multi-agents avec rôles ('owner', 'agency_manager',
-- 'agent'), rattachés à une agence (chantier 1). Voir le plan pour le
-- raisonnement complet. Résumé des décisions structurantes :
--
--   1. company_members (user_id, company_id, role, agency_id, is_active) :
--      agency_id obligatoire pour un non-owner, interdit pour un owner
--      (check), et forcément dans la MÊME compagnie (FK composite vers
--      agencies(id, company_id)).
--   2. companies.owner_id RESTE la seule source de vérité pour "qui est
--      propriétaire" — la ligne 'owner' de company_members est DÉRIVÉE par
--      un trigger (sync_owner_company_member), jamais éditée directement
--      (RLS interdit role='owner' en écriture applicative). Backfill : une
--      ligne 'owner' par compagnie existante.
--   3. get_company_access(p_user_id) — nouvelle fonction security definer
--      qui remplace les 2 requêtes RLS-dépendantes de requireCompany() par
--      un seul appel service_role, résolvant la compagnie par owner_id OU
--      par company_members, et renvoyant en plus role/agency/memberName.
--      La logique de statut d'abonnement (pending_payment/inactive/actif)
--      reste strictement identique.
--   is_company_member(company_id) : jumeau de is_company_owner, vrai pour
--      le propriétaire ET tout membre actif. Toutes les policies de TABLE
--      qui étaient owner-only et que les pages lisent via le client de
--      session (agencies, routes, trips, bookings, passengers, payments,
--      bus_layouts, company_subscriptions, subscription_payments,
--      companies update/delete, company-logos storage) passent à ce
--      helper — décision explicite : un employé a un back-office
--      pleinement utilisable dès ce chantier, les restrictions PAR RÔLE
--      viennent en chantier 3 à la couche applicative. Les appels
--      is_company_owner() À L'INTÉRIEUR de fonctions security definer
--      (ex. cancel_confirmed_bookings_for_trip) ne sont volontairement PAS
--      touchés — l'annulation d'un trajet entier reste propriétaire.

-- ============================================================================
-- 0. Garde-fou : company_members.unique(user_id) suppose qu'un utilisateur
--    n'a qu'une identité back-office. Vérifier qu'aucun propriétaire actuel
--    ne possède déjà 2 compagnies (sinon le backfill plus bas violerait
--    cette contrainte).
-- ============================================================================

do $$
begin
  if exists (select 1 from public.companies group by owner_id having count(*) > 1) then
    raise exception 'Un utilisateur possède plusieurs compagnies — à traiter manuellement avant ce chantier.';
  end if;
end $$;

-- ============================================================================
-- 1. company_members
-- ============================================================================

-- Permet une FK composite (agency_id, company_id) → interdit de rattacher
-- un membre à l'agence d'une AUTRE compagnie, de façon déclarative plutôt
-- que par un trigger de validation.
alter table public.agencies add constraint agencies_id_company_id_key unique (id, company_id);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  role text not null check (role in ('owner', 'agency_manager', 'agent')),
  agency_id uuid,
  full_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  -- owner ⟺ pas d'agence ; non-owner ⟺ agence obligatoire.
  constraint company_members_agency_matches_role check ((role = 'owner') = (agency_id is null)),
  -- L'agence, si présente, appartient forcément à la même compagnie.
  foreign key (agency_id, company_id) references public.agencies (id, company_id) on delete restrict
);

create index company_members_company_id_idx on public.company_members (company_id);
create index company_members_agency_id_idx on public.company_members (agency_id);

create trigger set_updated_at before update on public.company_members
  for each row execute function public.set_updated_at();

alter table public.company_members enable row level security;

-- Un employé ne voit QUE sa propre ligne ; seul le propriétaire voit tout
-- le roster (is_company_owner, pas is_company_member — l'énumération des
-- collègues reste owner-only, c'est la page "Employés").
create policy "company_members_select_self_or_owner" on public.company_members
  for select
  using (user_id = auth.uid() or public.is_company_owner(company_id));

-- Écritures : propriétaire uniquement, et jamais sur une ligne 'owner' (la
-- ligne owner est dérivée par trigger — voir section 2).
create policy "company_members_insert_owner" on public.company_members
  for insert
  with check (public.is_company_owner(company_id) and role <> 'owner');

create policy "company_members_update_owner" on public.company_members
  for update
  using (public.is_company_owner(company_id) and role <> 'owner')
  with check (public.is_company_owner(company_id) and role <> 'owner');

create policy "company_members_delete_owner" on public.company_members
  for delete
  using (public.is_company_owner(company_id) and role <> 'owner');

grant select, insert, update, delete on public.company_members to authenticated;
grant all on public.company_members to service_role;
-- Pas de grant anon.

-- Roster complet d'une compagnie, pour la page back-office "Employés" —
-- security definer pour joindre auth.users (email), comme les autres
-- get_company_*(p_company_id) déjà en place.
create function public.get_company_members(p_company_id uuid)
returns table (
  id uuid, user_id uuid, full_name text, email text, role text,
  agency_id uuid, agency_name text, is_active boolean, created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select m.id, m.user_id, m.full_name, u.email::text, m.role,
         m.agency_id, ag.name, m.is_active, m.created_at
  from public.company_members m
  join auth.users u on u.id = m.user_id
  left join public.agencies ag on ag.id = m.agency_id
  where m.company_id = p_company_id
  order by (m.role = 'owner') desc, m.full_name nulls last, u.email;
$$;

revoke execute on function public.get_company_members(uuid) from public;
grant execute on function public.get_company_members(uuid) to service_role;

-- ============================================================================
-- 2. companies.owner_id reste la source de vérité — la ligne 'owner' de
--    company_members est DÉRIVÉE par ce trigger, jamais éditée directement.
-- ============================================================================

create function public.sync_owner_company_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    delete from public.company_members where company_id = old.id and role = 'owner';
  end if;

  insert into public.company_members (user_id, company_id, role, agency_id, is_active)
  values (new.owner_id, new.id, 'owner', null, true)
  on conflict (user_id) do update
    set company_id = excluded.company_id,
        role = 'owner',
        agency_id = null,
        is_active = true,
        updated_at = now();

  return new;
end;
$$;

create trigger sync_owner_company_member
  after insert or update of owner_id on public.companies
  for each row execute function public.sync_owner_company_member();

-- Backfill : une ligne 'owner' par compagnie déjà existante.
insert into public.company_members (user_id, company_id, role, agency_id, is_active)
select owner_id, id, 'owner', null, true from public.companies
on conflict (user_id) do nothing;

-- ============================================================================
-- 3. is_company_member — jumeau de is_company_owner, vrai pour le
--    propriétaire (toujours un membre actif, garanti par le trigger
--    ci-dessus) ET tout employé actif.
-- ============================================================================

create function public.is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members m
    where m.company_id = target_company_id
      and m.user_id = auth.uid()
      and m.is_active = true
  );
$$;

-- ============================================================================
-- 4. RLS élargie au niveau "membre" — remplace is_company_owner par
--    is_company_member dans les policies de TABLE que les pages lisent via
--    le client de session. companies_insert_owner (owner_id = auth.uid())
--    n'est PAS touchée : on ne "crée" pas une compagnie en tant qu'employé.
-- ============================================================================

alter policy "companies_update_owner" on public.companies
  using (public.is_company_member(id))
  with check (public.is_company_member(id));
alter policy "companies_delete_owner" on public.companies
  using (public.is_company_member(id));

alter policy "routes_insert_owner" on public.routes
  with check (public.is_company_member(company_id));
alter policy "routes_update_owner" on public.routes
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));
alter policy "routes_delete_owner" on public.routes
  using (public.is_company_member(company_id));

alter policy "trips_insert_owner" on public.trips
  with check (public.is_company_member(company_id));
alter policy "trips_update_owner" on public.trips
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));
alter policy "trips_delete_owner" on public.trips
  using (public.is_company_member(company_id));

alter policy "bookings_select_own_or_company" on public.bookings
  using (user_id = auth.uid() or public.is_company_member(company_id));
alter policy "bookings_update_own_or_company" on public.bookings
  using (user_id = auth.uid() or public.is_company_member(company_id))
  with check (user_id = auth.uid() or public.is_company_member(company_id));

alter policy "passengers_select_via_booking" on public.passengers
  using (
    exists (
      select 1 from public.bookings b
      where b.id = passengers.booking_id
        and (b.user_id = auth.uid() or public.is_company_member(b.company_id))
    )
  );
alter policy "passengers_insert_via_booking" on public.passengers
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = passengers.booking_id
        and (b.user_id = auth.uid() or public.is_company_member(b.company_id))
    )
  );
alter policy "passengers_update_via_booking" on public.passengers
  using (
    exists (
      select 1 from public.bookings b
      where b.id = passengers.booking_id
        and (b.user_id = auth.uid() or public.is_company_member(b.company_id))
    )
  );

alter policy "payments_select_via_booking" on public.payments
  using (
    exists (
      select 1 from public.bookings b
      where b.id = payments.booking_id
        and (b.user_id = auth.uid() or public.is_company_member(b.company_id))
    )
  );

alter policy "bus_layouts_insert_owner" on public.bus_layouts
  with check (public.is_company_member(company_id));
alter policy "bus_layouts_update_owner" on public.bus_layouts
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));
alter policy "bus_layouts_delete_owner" on public.bus_layouts
  using (public.is_company_member(company_id));

alter policy "agencies_select_owner" on public.agencies
  using (public.is_company_member(company_id));
alter policy "agencies_insert_owner" on public.agencies
  with check (public.is_company_member(company_id));
alter policy "agencies_update_owner" on public.agencies
  using (public.is_company_member(company_id))
  with check (public.is_company_member(company_id));
alter policy "agencies_delete_owner" on public.agencies
  using (public.is_company_member(company_id));

alter policy "company_subscriptions_select_owner" on public.company_subscriptions
  using (public.is_company_member(company_id));
alter policy "subscription_payments_select_owner" on public.subscription_payments
  using (public.is_company_member(company_id));

alter policy "company_logos_insert_owner" on storage.objects
  with check (
    bucket_id = 'company-logos'
    and public.is_company_member((storage.foldername(name))[1]::uuid)
  );
alter policy "company_logos_update_owner" on storage.objects
  using (
    bucket_id = 'company-logos'
    and public.is_company_member((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'company-logos'
    and public.is_company_member((storage.foldername(name))[1]::uuid)
  );
alter policy "company_logos_delete_owner" on storage.objects
  using (
    bucket_id = 'company-logos'
    and public.is_company_member((storage.foldername(name))[1]::uuid)
  );

-- ============================================================================
-- 5. get_company_access — remplace les 2 requêtes RLS-dépendantes de
--    requireCompany() (dal.ts) par un seul appel service_role, résolvant
--    la compagnie via company_members (qui couvre le propriétaire — ligne
--    dérivée — ET tout employé actif) et renvoyant role/agency/memberName
--    en plus des champs déjà consommés aujourd'hui. La logique de statut
--    d'abonnement reste entièrement dans requireCompany() (TypeScript),
--    inchangée — cette fonction ne fait que relayer le statut brut.
-- ============================================================================

create function public.get_company_access(p_user_id uuid)
returns table (
  company_id uuid, company_name text, company_slug text,
  member_role text, agency_id uuid, agency_name text, member_name text,
  subscription_status text, current_period_end timestamptz, plan_name text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    c.id, c.name, c.slug,
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
