-- Chantier : infrastructure de notifications back-office (cloche)
--
-- Table distincte de notification_log : celle-ci journalise les e-mails
-- SORTANTS vers le voyageur (aucun company_id, aucun état lu, et un check
-- « booking_id or voucher_id not null » qui interdirait une alerte
-- back-office générique). Rien n'y est touché ici.
--
-- Deux natures dans la même table :
--   * 'event'       — horodaté, marquable comme lu, reste dans l'historique.
--   * 'state_alert' — vit tant que sa condition est vraie, supprimée dès
--                     qu'elle cesse ; pas de notion de « lu ».
--
-- Ciblage : trois colonnes nullables combinées en ET (NULL = pas de
-- contrainte sur cette dimension, donc les trois NULL = toute la
-- compagnie). Choisi contre une table de destinataires (qui n'apporterait
-- que le multi-cible, dont personne n'a besoin, au prix d'une jointure sur
-- le chemin le plus chaud) et contre un couple polymorphe target_kind /
-- target_id (incapable d'exprimer une intersection « les agents DE cette
-- agence », forme qu'auront les types futurs : caisse, remises).
--
-- À noter, et assumé : ni trips ni bookings ne portent aujourd'hui
-- d'agence (bookings.agency_id existe mais reste vide — cf. migration
-- 20260910120000), donc les deux types branchés ici visent la compagnie
-- entière. La dimension agence est prête, mais ne sera réellement
-- exercée qu'au chantier qui remplira bookings.agency_id.

-- ============================================================================
-- 1. company_notifications
-- ============================================================================

create table public.company_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('event', 'state_alert')),
  -- Volontairement SANS check : ajouter un type doit rester une simple
  -- insertion, jamais une migration. notification_log.type a fait le choix
  -- inverse et son check a déjà dû être élargi deux fois.
  type text not null,
  level text not null check (level in ('critical', 'warning', 'info')),
  title text not null,
  body text,
  -- Chemin relatif interne (« /trajets/<id> ») — jamais une URL absolue.
  action_href text,
  -- Ciblage : NULL = pas de contrainte sur cette dimension.
  target_agency_id uuid,
  target_role text check (target_role in ('owner', 'agency_manager', 'agent')),
  target_user_id uuid references auth.users (id) on delete cascade,
  -- Identité stable d'une alerte d'état (l'objet concerné : un trajet, une
  -- agence…), qui permet de la créer puis de la résoudre sans doublon.
  subject_id uuid,
  -- Expiration générique, pour les conditions qui cessent sans qu'aucune
  -- ligne ne change (ex. un trajet complet qui finit par partir). Tout
  -- type futur peut s'en servir sans toucher à la lecture.
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint company_notifications_state_alert_subject
    check (kind <> 'state_alert' or subject_id is not null),
  -- Réutilise agencies_id_company_id_key (posée au chantier
  -- company_members) : interdit déclarativement de viser l'agence d'une
  -- AUTRE compagnie, plutôt que par un trigger de validation.
  foreign key (target_agency_id, company_id)
    references public.agencies (id, company_id) on delete cascade
);

create unique index company_notifications_state_alert_key
  on public.company_notifications (company_id, type, subject_id)
  where kind = 'state_alert';

create index company_notifications_company_id_idx
  on public.company_notifications (company_id, created_at desc);

-- ============================================================================
-- 2. company_notification_reads — état lu PAR MEMBRE
--    Deux agents voyant la même notification ont chacun leur ligne :
--    l'exigence est structurelle, pas applicative.
-- ============================================================================

create table public.company_notification_reads (
  notification_id uuid not null references public.company_notifications (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index company_notification_reads_user_id_idx
  on public.company_notification_reads (user_id);

-- ============================================================================
-- 3. notification_targets_me — la sémantique du ciblage, écrite UNE fois
--    et réutilisée par la policy RLS ET par les fonctions de lecture.
-- ============================================================================

create function public.notification_targets_me(
  target_company_id uuid,
  target_agency_id uuid,
  target_role text,
  target_user_id uuid
)
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
      and (target_agency_id is null or m.agency_id = target_agency_id)
      and (target_role is null or m.role = target_role)
      and (target_user_id is null or m.user_id = target_user_id)
  );
$$;

-- ============================================================================
-- 4. RLS + GRANT — même principe que notification_log : lecture seule côté
--    membre, toute écriture par service_role ou depuis une fonction
--    security definer (le trigger, cancel_booking).
-- ============================================================================

alter table public.company_notifications enable row level security;

create policy "company_notifications_select_targeted" on public.company_notifications
  for select
  using (
    public.notification_targets_me(company_id, target_agency_id, target_role, target_user_id)
  );

alter table public.company_notification_reads enable row level security;

create policy "company_notification_reads_select_own" on public.company_notification_reads
  for select
  using (user_id = auth.uid());

-- Aucune policy insert/update/delete pour authenticated sur les deux
-- tables : les notifications naissent du trigger et de cancel_booking, les
-- marquages de lecture passent par les fonctions service_role ci-dessous.
grant select on public.company_notifications to authenticated;
grant all on public.company_notifications to service_role;
grant select on public.company_notification_reads to authenticated;
grant all on public.company_notification_reads to service_role;
-- Pas de grant anon : n'existe que pour un membre connecté du back-office.

-- ============================================================================
-- 5. Lecture / marquage — patron get_company_*(p_*) + revoke/grant
-- ============================================================================

create function public.get_company_notifications(p_user_id uuid, p_limit integer default 20)
returns table (
  id uuid, kind text, type text, level text, title text, body text,
  action_href text, created_at timestamptz, is_read boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select n.id, n.kind, n.type, n.level, n.title, n.body,
         n.action_href, n.created_at,
         -- Une alerte d'état n'a pas de notion de « lu » : toujours false,
         -- pour que l'appelant n'ait aucune règle par nature à connaître.
         (n.kind = 'event' and r.notification_id is not null) as is_read
  from public.company_notifications n
  join public.company_members m
    on m.company_id = n.company_id
   and m.user_id = p_user_id
   and m.is_active = true
  left join public.company_notification_reads r
    on r.notification_id = n.id and r.user_id = p_user_id
  where (n.target_agency_id is null or n.target_agency_id = m.agency_id)
    and (n.target_role is null or n.target_role = m.role)
    and (n.target_user_id is null or n.target_user_id = m.user_id)
    and (n.expires_at is null or n.expires_at > now())
  -- Les alertes d'état (conditions vivantes) d'abord, puis le fil des
  -- événements du plus récent au plus ancien.
  order by (n.kind = 'state_alert') desc, n.created_at desc
  limit p_limit;
$$;

revoke execute on function public.get_company_notifications(uuid, integer) from public;
grant execute on function public.get_company_notifications(uuid, integer) to service_role;

-- Seuls les ÉVÉNEMENTS non lus sont comptés : une alerte d'état n'a pas de
-- « lu », la compter donnerait un badge qu'aucune action ne peut ramener à
-- zéro tant que la condition dure.
create function public.count_unread_company_notifications(p_user_id uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select count(*)::integer
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
    and (n.expires_at is null or n.expires_at > now());
$$;

revoke execute on function public.count_unread_company_notifications(uuid) from public;
grant execute on function public.count_unread_company_notifications(uuid) to service_role;

create function public.mark_all_company_notifications_read(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.company_notification_reads (notification_id, user_id)
  select n.id, p_user_id
  from public.company_notifications n
  join public.company_members m
    on m.company_id = n.company_id
   and m.user_id = p_user_id
   and m.is_active = true
  where n.kind = 'event'
    and (n.target_agency_id is null or n.target_agency_id = m.agency_id)
    and (n.target_role is null or n.target_role = m.role)
    and (n.target_user_id is null or n.target_user_id = m.user_id)
  on conflict (notification_id, user_id) do nothing;
$$;

revoke execute on function public.mark_all_company_notifications_read(uuid) from public;
grant execute on function public.mark_all_company_notifications_read(uuid) to service_role;

-- Marquage d'une seule notification (clic sur son lien d'action). Le join
-- sur company_members garantit qu'on ne peut pas marquer lu ce qu'on n'a
-- pas le droit de voir, même en forgeant l'id.
create function public.mark_company_notification_read(p_user_id uuid, p_notification_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.company_notification_reads (notification_id, user_id)
  select n.id, p_user_id
  from public.company_notifications n
  join public.company_members m
    on m.company_id = n.company_id
   and m.user_id = p_user_id
   and m.is_active = true
  where n.id = p_notification_id
    and n.kind = 'event'
    and (n.target_agency_id is null or n.target_agency_id = m.agency_id)
    and (n.target_role is null or n.target_role = m.role)
    and (n.target_user_id is null or n.target_user_id = m.user_id)
  on conflict (notification_id, user_id) do nothing;
$$;

revoke execute on function public.mark_company_notification_read(uuid, uuid) from public;
grant execute on function public.mark_company_notification_read(uuid, uuid) to service_role;

-- ============================================================================
-- 6. Alerte d'état « trajet complet » — trigger sur trips
--
--    available_seats est écrit par TROIS mécanismes distincts :
--      * reserve_trip_seats()                        (trigger insert bookings)
--      * adjust_trip_seats_on_booking_status_change() (trigger update bookings)
--      * updateTripDetails()                          (TypeScript, changement
--                                                      de capacité)
--    Un trigger sur trips est le seul point unique qui les couvre tous —
--    y compris celui qui vit hors de la base.
-- ============================================================================

create function public.sync_trip_full_alert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route record;
begin
  if new.available_seats = 0 and new.status = 'scheduled' then
    select r.origin_city, r.destination_city into v_route
    from public.routes r where r.id = new.route_id;

    insert into public.company_notifications (
      company_id, kind, type, level, title, body, action_href,
      subject_id, expires_at
    )
    values (
      new.company_id, 'state_alert', 'trip_full', 'warning',
      coalesce(v_route.origin_city || ' → ' || v_route.destination_city, 'Trajet') || ' complet',
      'Plus aucune place disponible sur ce départ.',
      '/trajets/' || new.id,
      new.id,
      -- Un trajet parti n'est plus actionnable : l'alerte s'éteint d'elle-même
      -- via le filtre générique d'expiration, sans qu'aucune ligne ne change.
      new.departure_at
    )
    on conflict (company_id, type, subject_id) where kind = 'state_alert'
    do update set title = excluded.title,
                  body = excluded.body,
                  expires_at = excluded.expires_at;
  else
    -- Une place s'est libérée, ou le trajet est annulé/terminé : dans les
    -- deux cas la condition a cessé, l'alerte disparaît.
    delete from public.company_notifications
    where kind = 'state_alert' and type = 'trip_full' and subject_id = new.id;
  end if;

  return new;
end;
$$;

create trigger sync_trip_full_alert
  after insert or update of available_seats, status on public.trips
  for each row execute function public.sync_trip_full_alert();

-- Backfill : les trajets déjà complets aujourd'hui doivent avoir leur
-- alerte, sinon elle n'apparaîtrait qu'au prochain mouvement de sièges.
insert into public.company_notifications (
  company_id, kind, type, level, title, body, action_href, subject_id, expires_at
)
select t.company_id, 'state_alert', 'trip_full', 'warning',
       r.origin_city || ' → ' || r.destination_city || ' complet',
       'Plus aucune place disponible sur ce départ.',
       '/trajets/' || t.id, t.id, t.departure_at
from public.trips t
join public.routes r on r.id = t.route_id
where t.available_seats = 0 and t.status = 'scheduled'
on conflict do nothing;

-- ============================================================================
-- 7. Événement « réservation annulée par le voyageur »
--
--    Inséré DANS cancel_booking plutôt que par un trigger sur
--    bookings.status : les trois chemins d'annulation (voyageur,
--    compagnie-une-réservation, compagnie-trajet-entier) convergent sur la
--    même instruction, et un trigger devrait donc deviner l'origine via
--    auth.uid() = NEW.user_id — une heuristique qui dépend du client
--    utilisé et casserait en silence. cancel_booking est PAR CONSTRUCTION
--    le chemin voyageur (il refuse déjà toute réservation d'autrui) :
--    l'exclusion des annulations compagnie devient structurelle.
--
--    Signature et grants inchangés : create or replace suffit.
-- ============================================================================

create or replace function public.cancel_booking(p_booking_id uuid)
returns table (voucher_amount_fcfa integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_departure_at timestamptz;
  v_voucher_amount integer;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Réservation introuvable' using errcode = 'check_violation';
  end if;

  if v_booking.user_id <> auth.uid() then
    raise exception 'Cette réservation ne vous appartient pas' using errcode = 'check_violation';
  end if;

  if v_booking.status <> 'confirmed' then
    raise exception 'Seule une réservation confirmée peut être annulée' using errcode = 'check_violation';
  end if;

  select departure_at into v_departure_at from public.trips where id = v_booking.trip_id;
  if v_departure_at <= now() then
    raise exception 'Ce trajet est déjà parti, la réservation ne peut plus être annulée'
      using errcode = 'check_violation';
  end if;

  select v.voucher_amount_fcfa into v_voucher_amount
  from public.issue_voucher_and_cancel_booking(p_booking_id) v;

  -- Après l'annulation réelle, jamais avant : la notification ne doit
  -- jamais être la raison pour laquelle une annulation échoue.
  insert into public.company_notifications (
    company_id, kind, type, level, title, body, action_href
  )
  values (
    v_booking.company_id, 'event', 'booking_cancelled_by_traveller', 'info',
    'Réservation ' || v_booking.booking_reference || ' annulée par le voyageur',
    v_booking.seat_count || ' place(s) de nouveau disponible(s).',
    '/reservations/' || p_booking_id
  );

  voucher_amount_fcfa := v_voucher_amount;
  return next;
end;
$$;
