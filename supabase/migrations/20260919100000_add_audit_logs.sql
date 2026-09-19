-- Chantier 5 : journal d'audit unifié (création/modification/annulation
-- de réservation, demande d'impression de billet) + vue consolidée
-- par-dessus mouvements_caisse/supervisor_approval_requests/
-- notification_log.
--
-- Marquage des billets : vérifié — discount_granted_by (payments,
-- chantier 3b-1) ne couvre que les remises ; create_booking_for_company
-- ne prenait même pas l'id de l'agent en paramètre. Aucune colonne
-- n'identifiait jusqu'ici l'agent/l'agence émettrice d'une réservation
-- guichet — ajoutée ici sur bookings, jamais dérivée à la lecture (même
-- raisonnement que supervisor_approval_requests.agency_id : un agent qui
-- change d'agence plus tard ne doit jamais réécrire l'histoire d'un
-- billet déjà émis).

-- ============================================================================
-- 1. bookings : marquage agent/agence émetteurs — nul pour le web.
-- ============================================================================

alter table public.bookings
  add column issued_by_agent_id uuid references auth.users (id),
  add column issued_by_agency_id uuid references public.agencies (id);

-- ============================================================================
-- 2. create_booking_for_company : gagne p_agent_id (obligatoire — son
--    seul appelant, createBookingForCustomer, a toujours un agent
--    authentifié). create_booking elle-même n'est PAS touchée : le web
--    l'appelle aussi directement et n'a jamais d'agent à transmettre.
--    drop puis create (changement de signature), corps identique à
--    20260910100000 sinon.
-- ============================================================================

drop function if exists public.create_booking_for_company(uuid, integer, text, text[], uuid, uuid, text[]);

create function public.create_booking_for_company(
  p_trip_id uuid,
  p_seat_count integer,
  p_phone text,
  p_passenger_names text[],
  p_user_id uuid,
  p_company_id uuid,
  p_agent_id uuid,
  p_requested_seats text[] default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_trip_company_id uuid;
  v_booking_id uuid;
begin
  select company_id into v_trip_company_id from public.trips where id = p_trip_id;
  if v_trip_company_id is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  if v_trip_company_id <> p_company_id then
    raise exception 'Ce trajet n''appartient pas à votre compagnie' using errcode = 'check_violation';
  end if;

  v_booking_id := public.create_booking(p_trip_id, p_seat_count, p_phone, p_passenger_names, p_user_id, p_requested_seats);

  -- L'agence est celle de l'agent AU MOMENT de l'émission — jamais
  -- redérivée plus tard si son agence change (voir le plan, point
  -- "marquage des billets").
  update public.bookings
  set issued_by_agent_id = p_agent_id,
      issued_by_agency_id = (select agency_id from public.company_members where user_id = p_agent_id)
  where id = v_booking_id;

  return v_booking_id;
end;
$$;

revoke execute on function public.create_booking_for_company(uuid, integer, text, text[], uuid, uuid, uuid, text[]) from public;
grant execute on function public.create_booking_for_company(uuid, integer, text, text[], uuid, uuid, uuid, text[]) to service_role;

-- ============================================================================
-- 3. audit_logs — immuable : voir le plan pour le raisonnement complet
--    (l'absence de grant update/delete suffit, service_role compris,
--    puisque BYPASSRLS ne contourne que RLS, jamais GRANT/REVOKE ; le
--    trigger ci-dessous est un filet contre une future migration qui
--    élargirait les grants par erreur, pas une nécessité aujourd'hui).
-- ============================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  -- Pas de check constraint — même choix que company_notifications.type
  -- ("ajouter un type reste une simple insertion, jamais une migration"),
  -- pas celui de notification_log.type (déjà élargi une fois par
  -- migration sur ce projet).
  action text not null,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  -- Vérifié : aucun des 4 chemins tracés ne peut s'exécuter sans un
  -- auth.uid() identifié (create_booking exige "Connexion requise",
  -- cancel_booking pareil, modification/impression sont guichet-only via
  -- requireCompany()) — pas de guest checkout dans ce produit. NOT NULL,
  -- pas nullable.
  acteur_id uuid not null references auth.users (id),
  -- Nul pour le web (aucun agent impliqué) — même convention que
  -- supervisor_approval_requests.
  agency_id uuid references public.agencies (id),
  -- Dénormalisé depuis bookings.company_id à l'écriture, jamais
  -- recalculé par jointure à la lecture — même choix que
  -- supervisor_approval_requests.company_id.
  company_id uuid not null references public.companies (id) on delete cascade,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_company_id_idx on public.audit_logs (company_id, created_at desc);
create index audit_logs_booking_id_idx on public.audit_logs (booking_id);

alter table public.audit_logs enable row level security;
-- Pas de policy authenticated : RLS activé par principe (CLAUDE.md), mais
-- aucun grant authenticated ne rend une policy atteignable — même choix
-- que promo_code_redemptions/supervisor_approval_requests/mouvements_caisse.
grant select, insert on public.audit_logs to service_role;
-- JAMAIS de grant update/delete — à personne, y compris service_role :
-- c'est cette absence, pas une policy RLS (inopérante pour service_role,
-- qui contourne RLS via BYPASSRLS), qui rend la table immuable.

create function public.reject_audit_logs_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs est immuable : aucune modification ni suppression n''est permise'
    using errcode = '0LSMU';
end;
$$;

create trigger reject_audit_logs_update before update on public.audit_logs
  for each row execute function public.reject_audit_logs_mutation();
create trigger reject_audit_logs_delete before delete on public.audit_logs
  for each row execute function public.reject_audit_logs_mutation();

-- ============================================================================
-- 4. get_company_audit_feed — vue consolidée, structure commune minimale
--    (source, action, timestamp, acteur, agence, lien, détail) projetée
--    depuis les 4 tables SANS changer leur schéma.
-- ============================================================================

create function public.get_company_audit_feed(
  p_company_id uuid,
  p_agency_id uuid default null,
  p_limit integer default 100
)
returns table (
  source text,
  action text,
  occurred_at timestamptz,
  acteur_id uuid,
  agency_id uuid,
  booking_id uuid,
  payload jsonb
)
-- security definer, comme toutes les fonctions get_company_* du projet
-- (get_company_payments, get_company_bookings_overview, ...) — pas
-- security invoker : ça n'a aucune incidence de sécurité réelle ici
-- (seul service_role peut appeler cette fonction, et il contourne RLS de
-- toute façon via BYPASSRLS), mais definer évite de dépendre des grants
-- directs de service_role sur chacune des 4 tables sources plutôt que
-- des privilèges du propriétaire de la fonction — cohérent avec le
-- reste du projet, pas une nécessité de sécurité distincte.
language sql
security definer
set search_path = public
stable
as $$
  select * from (
    select
      'audit_logs' as source, al.action, al.created_at as occurred_at,
      al.acteur_id, al.agency_id, al.booking_id, al.payload
    from public.audit_logs al
    where al.company_id = p_company_id
      and (p_agency_id is null or al.agency_id = p_agency_id)

    union all

    -- Agence/compagnie non stockées directement sur mouvements_caisse —
    -- résolues via session_caisse (chantier 4).
    select
      'mouvements_caisse', mc.type, mc.created_at,
      mc.effectue_par, sc.agence_id, null::uuid,
      jsonb_build_object('montant_fcfa', mc.montant_fcfa, 'session_id', mc.session_id)
    from public.mouvements_caisse mc
    join public.session_caisse sc on sc.id = mc.session_id
    where sc.company_id = p_company_id
      and (p_agency_id is null or sc.agence_id = p_agency_id)

    union all

    -- Une ligne par DEMANDE (created_at) — pas de seconde ligne pour sa
    -- résolution, le détail approuvé/refusé reste sur /validations.
    select
      'supervisor_approval_requests', sar.action_type || '_requested', sar.created_at,
      sar.requested_by, sar.agency_id, sar.booking_id,
      jsonb_build_object('mode', sar.mode, 'status', sar.status)
    from public.supervisor_approval_requests sar
    where sar.company_id = p_company_id
      and (p_agency_id is null or sar.agency_id = p_agency_id)

    union all

    -- Ni company_id ni agence sur notification_log — résolues via
    -- booking_id -> bookings. Une notification liée à un avoir SEUL
    -- (booking_id nul) n'a aucun chemin vers une compagnie : absente de
    -- toute vue scopée, limite acceptée (voir le plan).
    select
      'notification_log', nl.type, nl.created_at,
      nl.user_id, b.issued_by_agency_id, nl.booking_id,
      jsonb_build_object('status', nl.status, 'channel', nl.channel)
    from public.notification_log nl
    join public.bookings b on b.id = nl.booking_id
    where b.company_id = p_company_id
      and (p_agency_id is null or b.issued_by_agency_id = p_agency_id)
  ) feed
  order by occurred_at desc
  limit p_limit;
$$;

revoke execute on function public.get_company_audit_feed(uuid, uuid, integer) from public;
grant execute on function public.get_company_audit_feed(uuid, uuid, integer) to service_role;
