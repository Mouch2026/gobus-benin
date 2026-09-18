-- Chantier 4 : sessions de caisse par agent, plafond d'espèces avec
-- blocage réel, vide-caisse, clôture par réconciliation aveugle.
--
-- Noms français (session_caisse, mouvements_caisse, employe_id,
-- agence_id, DEPOT_COFFRE) donnés explicitement dans la demande — repris
-- tels quels, bien que ce soit la première fois que ce schéma mélange du
-- français dans des noms de table/colonne (tout le reste, y compris les
-- chantiers précédents, est en anglais).
--
-- Le solde théorique n'est JAMAIS un compteur mis en cache : c'est la
-- somme signée de mouvements_caisse (ENCAISSEMENT positif, DEPOT_COFFRE
-- négatif), recalculée à chaque décision. Ce choix est ce qui rend le
-- déblocage après un vide-caisse automatique — aucun mécanisme de
-- déblocage séparé à maintenir en cohérence avec un compteur caché.

-- ============================================================================
-- 1. session_caisse — une seule session ouverte par employé, appliqué en
--    base via un index unique partiel (même patron que
--    supervisor_approval_requests_pending_booking_idx, chantier 3c).
-- ============================================================================

create table public.session_caisse (
  id uuid primary key default gen_random_uuid(),
  employe_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  agence_id uuid not null references public.agencies (id) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  -- Renseignés uniquement à la clôture — jamais avant, et jamais
  -- affichés à l'agent avant sa propre saisie du montant compté
  -- (réconciliation aveugle, appliquée côté application ; ici on ne
  -- garantit que la cohérence des données).
  montant_compte_fcfa integer,
  solde_theorique_fcfa integer,
  ecart_fcfa integer,
  constraint session_caisse_closed_fields_match check (
    (closed_at is null
      and montant_compte_fcfa is null and solde_theorique_fcfa is null and ecart_fcfa is null)
    or (closed_at is not null
      and montant_compte_fcfa is not null and solde_theorique_fcfa is not null and ecart_fcfa is not null)
  ),
  -- L'agence doit appartenir à la même compagnie — même garde-fou
  -- déclaratif que supervisor_approval_requests (chantier 3c), pas un
  -- trigger de validation.
  foreign key (agence_id, company_id) references public.agencies (id, company_id) on delete cascade
);

create index session_caisse_company_id_idx on public.session_caisse (company_id);
create index session_caisse_agence_id_idx on public.session_caisse (agence_id);

create unique index session_caisse_one_open_per_employee_idx
  on public.session_caisse (employe_id)
  where closed_at is null;

-- ============================================================================
-- 2. mouvements_caisse — le grand livre, seule source de vérité du solde
--    théorique. Un encaissement référence toujours un paiement ; un
--    vide-caisse jamais.
-- ============================================================================

create table public.mouvements_caisse (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session_caisse (id) on delete cascade,
  type text not null check (type in ('ENCAISSEMENT', 'DEPOT_COFFRE')),
  montant_fcfa integer not null check (montant_fcfa > 0),
  payment_id uuid references public.payments (id) on delete restrict,
  effectue_par uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint mouvements_caisse_payment_matches_type check (
    (type = 'ENCAISSEMENT' and payment_id is not null)
    or (type = 'DEPOT_COFFRE' and payment_id is null)
  )
);

create index mouvements_caisse_session_id_idx on public.mouvements_caisse (session_id);

-- Un paiement ne doit jamais être compté deux fois comme encaissement.
create unique index mouvements_caisse_payment_id_key
  on public.mouvements_caisse (payment_id)
  where payment_id is not null;

-- ============================================================================
-- 3. companies.cash_ceiling_fcfa — plafond configurable, nullable =
--    aucun plafond configuré (jamais de blocage tant que le propriétaire
--    ne l'a pas réglé). Premier réglage structurel stocké directement
--    sur companies — aucun précédent de table de configuration séparée
--    n'existe dans ce schéma pour une seule valeur.
-- ============================================================================

alter table public.companies
  add column cash_ceiling_fcfa integer check (cash_ceiling_fcfa is null or cash_ceiling_fcfa > 0);

-- ============================================================================
-- 4. Trigger — interdit de changer l'agence d'un employé tant qu'une
--    session de caisse lui appartenant est encore ouverte (chantier 4,
--    point 1). Fermeture automatique délibérément écartée : elle
--    casserait la réconciliation aveugle (il faudrait remplir un montant
--    compté à la place de l'agent). Protège par avance toute future UI
--    d'édition d'employé — aucune n'existe encore aujourd'hui — et
--    bloque aussi une modification directe via le client de session d'un
--    propriétaire (RLS l'autorise déjà : company_members_update_owner).
-- ============================================================================

create function public.prevent_agency_change_with_open_session()
returns trigger
language plpgsql
as $$
begin
  if new.agency_id is distinct from old.agency_id
     and exists (
       select 1 from public.session_caisse
       where employe_id = old.user_id and closed_at is null
     )
  then
    raise exception 'Impossible de changer l''agence : une session de caisse est encore ouverte pour cet employé.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger prevent_agency_change_with_open_session
  before update of agency_id on public.company_members
  for each row execute function public.prevent_agency_change_with_open_session();

-- ============================================================================
-- 5. record_cash_payment_received — même patron que
--    record_payment_part_received (verrouille la ligne parente, calcule,
--    compare, agit, un seul aller-retour). Appelle
--    record_payment_part_received (INCHANGÉE, partagée avec le flux
--    carte/mobile money) en dernière étape, dans la MÊME transaction :
--    le verrou posé ici en tête couvre tout l'appel imbriqué.
-- ============================================================================

create function public.record_cash_payment_received(p_payment_id uuid, p_session_id uuid)
returns table (booking_confirmed boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session record;
  v_ceiling integer;
  v_balance integer;
  v_amount integer;
begin
  select * into v_session from public.session_caisse where id = p_session_id for update;

  if v_session.id is null then
    raise exception 'Session de caisse introuvable' using errcode = 'check_violation';
  end if;
  if v_session.closed_at is not null then
    raise exception 'Cette session de caisse est déjà clôturée' using errcode = 'check_violation';
  end if;

  select cash_ceiling_fcfa into v_ceiling from public.companies where id = v_session.company_id;
  select base_amount_fcfa into v_amount from public.payments where id = p_payment_id;

  if v_amount is null then
    raise exception 'Paiement introuvable' using errcode = 'check_violation';
  end if;

  select coalesce(sum(case when type = 'ENCAISSEMENT' then montant_fcfa else -montant_fcfa end), 0)
    into v_balance
  from public.mouvements_caisse
  where session_id = p_session_id;

  -- "atteint OU dépasse" : >=, pas >.
  if v_ceiling is not null and (v_balance + v_amount) >= v_ceiling then
    raise exception 'Plafond de caisse atteint (% FCFA). Choisissez un autre moyen de paiement ou faites un vide-caisse.', v_ceiling
      using errcode = 'check_violation';
  end if;

  insert into public.mouvements_caisse (session_id, type, montant_fcfa, payment_id, effectue_par)
  values (p_session_id, 'ENCAISSEMENT', v_amount, p_payment_id, v_session.employe_id);

  return query select * from public.record_payment_part_received(p_payment_id);
end;
$$;

revoke execute on function public.record_cash_payment_received(uuid, uuid) from public;
grant execute on function public.record_cash_payment_received(uuid, uuid) to service_role;

-- ============================================================================
-- 6. record_cash_drop — vide-caisse. Ne ferme jamais la session ; le
--    déblocage du plafond est automatique (le solde recalculé inclut
--    désormais cette ligne négative).
-- ============================================================================

create function public.record_cash_drop(p_session_id uuid, p_employe_id uuid, p_montant_fcfa integer)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session record;
  v_id uuid;
begin
  select * into v_session from public.session_caisse where id = p_session_id for update;

  if v_session.id is null or v_session.employe_id <> p_employe_id then
    raise exception 'Session de caisse introuvable' using errcode = 'check_violation';
  end if;
  if v_session.closed_at is not null then
    raise exception 'Cette session est déjà clôturée' using errcode = 'check_violation';
  end if;

  insert into public.mouvements_caisse (session_id, type, montant_fcfa, effectue_par)
  values (p_session_id, 'DEPOT_COFFRE', p_montant_fcfa, p_employe_id)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.record_cash_drop(uuid, uuid, integer) from public;
grant execute on function public.record_cash_drop(uuid, uuid, integer) to service_role;

-- ============================================================================
-- 7. close_session_caisse — clôture par réconciliation aveugle. Le solde
--    théorique n'est calculé et révélé qu'ICI, après que l'appelant a
--    déjà transmis son montant compté — jamais avant (l'aveuglement lui-
--    même est une discipline d'implémentation côté page, pas quelque
--    chose que cette fonction impose, mais elle ne renvoie l'écart qu'en
--    sortie, jamais en entrée).
-- ============================================================================

create function public.close_session_caisse(p_session_id uuid, p_employe_id uuid, p_montant_compte_fcfa integer)
returns table (ecart_fcfa integer, solde_theorique_fcfa integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session record;
  v_balance integer;
begin
  select * into v_session from public.session_caisse where id = p_session_id for update;

  if v_session.id is null or v_session.employe_id <> p_employe_id then
    raise exception 'Session de caisse introuvable' using errcode = 'check_violation';
  end if;
  if v_session.closed_at is not null then
    raise exception 'Cette session est déjà clôturée' using errcode = 'check_violation';
  end if;

  select coalesce(sum(case when type = 'ENCAISSEMENT' then montant_fcfa else -montant_fcfa end), 0)
    into v_balance
  from public.mouvements_caisse
  where session_id = p_session_id;

  update public.session_caisse
  set closed_at = now(),
      montant_compte_fcfa = p_montant_compte_fcfa,
      solde_theorique_fcfa = v_balance,
      ecart_fcfa = p_montant_compte_fcfa - v_balance
  where id = p_session_id;

  return query select (p_montant_compte_fcfa - v_balance), v_balance;
end;
$$;

revoke execute on function public.close_session_caisse(uuid, uuid, integer) from public;
grant execute on function public.close_session_caisse(uuid, uuid, integer) to service_role;

-- ============================================================================
-- 8. RLS + GRANT — tables purement internes, comme
--    supervisor_approval_requests/promo_code_redemptions (chantier
--    précédent) : aucune policy authenticated, tout accès passe par des
--    Server Actions via supabaseAdmin avec les vérifications de portée
--    codées explicitement.
-- ============================================================================

alter table public.session_caisse enable row level security;
alter table public.mouvements_caisse enable row level security;
-- Pas de policy pour authenticated sur les deux tables : RLS activé par
-- principe (CLAUDE.md), mais aucun grant authenticated ne rend une
-- policy atteignable.
grant all on public.session_caisse to service_role;
grant all on public.mouvements_caisse to service_role;
-- Pas de grant anon, pas de grant authenticated.
