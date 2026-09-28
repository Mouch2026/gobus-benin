-- Chantier : affectation d'un tableau de bord à un employé par le
-- propriétaire. Deux colonnes minimales sur company_members :
--   - home_screen : préférence d'accueil ('global' = "/", 'owner_dashboard'
--     = /pilotage, 'employee_dashboard' = /mon-tableau-de-bord).
--   - pilotage_access_granted : autorisation, propriétaire uniquement,
--     donnant à un chef d'agence l'accès aux DEUX vues compagnie entière
--     ("/" vue globale ET /pilotage — décision explicite : ce ne sont pas
--     deux autorisations distinctes, un chef d'agence non autorisé ne
--     doit ouvrir ni l'une ni l'autre). Un agent ne peut JAMAIS la porter
--     — encodé en CHECK, pas seulement côté application, puisque toutes
--     les écritures de ce chantier passent par supabaseAdmin
--     (service_role, qui contourne la RLS) : le CHECK est le seul rempart
--     qui reste actif même en cas de bug applicatif ou de requête forgée.
--
-- Défaut retenu (décision explicite, pas une simple valeur de colonne) :
-- un agent ET un chef d'agence SANS autorisation sont tous les deux
-- accueillis sur le tableau employé (seule valeur que le CHECK leur
-- permet, voir plus bas) ; seul le propriétaire est accueilli sur la vue
-- globale. Même si la connexion elle-même ne redirigeait jusqu'ici jamais
-- différemment par rôle (toujours "/") — c'est justement ce que ce
-- chantier corrige.

-- Colonnes d'abord, SANS les deux CHECK dépendants du rôle (ajoutés plus
-- bas, une fois le backfill fait) : add column ... default 'employee_dashboard'
-- écrit cette valeur sur TOUTES les lignes existantes immédiatement,
-- y compris le propriétaire déjà en base, qui doit finir sur 'global' —
-- le backfill ci-dessous corrige ça avant que les CHECK n'entrent en
-- vigueur, plutôt que de compter sur le fait (vrai ici, mais fragile à
-- maintenir) que le DEFAULT choisi satisferait de toute façon les deux
-- CHECK pour chaque rôle.
alter table public.company_members
  add column home_screen text not null default 'employee_dashboard'
    check (home_screen in ('global', 'owner_dashboard', 'employee_dashboard')),
  add column pilotage_access_granted boolean not null default false;

-- Backfill des lignes existantes, AVANT l'ajout des deux CHECK par rôle
-- ci-dessous : owner -> vue globale ; agency_manager ET agent -> tableau
-- employé (aucun chef d'agence existant n'a d'autorisation pilotage
-- aujourd'hui, cette fonctionnalité n'existait pas avant ce chantier — le
-- DEFAULT ci-dessus leur convient déjà, cette ligne ne fait que le
-- rendre explicite et couvre aussi le propriétaire).
update public.company_members
set home_screen = case when role = 'owner' then 'global' else 'employee_dashboard' end;

-- Un agent ne peut jamais porter l'autorisation pilotage, quoi qu'envoie
-- le client.
alter table public.company_members
  add constraint company_members_pilotage_agent_check
    check (role <> 'agent' or not pilotage_access_granted);

-- Un agent est toujours accueilli sur son tableau employé (aucune autre
-- valeur possible pour lui, même via une requête forgée). Un chef
-- d'agence SANS autorisation ne peut lui non plus avoir qu'un
-- home_screen = 'employee_dashboard' (l'autorisation couvre "/" ET
-- /pilotage à la fois — pas de home_screen = 'global' sans elle) ; AVEC
-- l'autorisation, les trois valeurs sont permises. L'owner n'est pas
-- contraint (son home_screen n'est pas piloté par cette fonctionnalité,
-- voir sync_owner_company_member ci-dessous).
alter table public.company_members
  add constraint company_members_home_screen_role_check
    check (
      role = 'owner'
      or (role = 'agent' and home_screen = 'employee_dashboard')
      or (role = 'agency_manager' and (pilotage_access_granted or home_screen = 'employee_dashboard'))
    );

-- sync_owner_company_member : fixer explicitement les deux nouvelles
-- colonnes plutôt que de compter sur leur DEFAULT (pensé pour un
-- employé), pour qu'un nouveau propriétaire de compagnie atterrisse
-- toujours sur la vue globale, jamais sur le tableau employé. Signature
-- de retour inchangée (returns trigger) : create or replace suffit,
-- contrairement aux fonctions returns table de ce chantier.
create or replace function public.sync_owner_company_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    delete from public.company_members where company_id = old.id and role = 'owner';
  end if;

  insert into public.company_members (
    user_id, company_id, role, agency_id, is_active,
    home_screen, pilotage_access_granted
  )
  values (new.owner_id, new.id, 'owner', null, true, 'global', false)
  on conflict (user_id) do update
    set company_id = excluded.company_id,
        role = 'owner',
        agency_id = null,
        is_active = true,
        home_screen = 'global',
        pilotage_access_granted = false,
        updated_at = now();

  return new;
end;
$$;
