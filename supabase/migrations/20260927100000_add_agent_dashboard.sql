-- Chantier : tableau de bord dédié à l'agent (/mon-tableau-de-bord),
-- scopé à SON agence et SA session de caisse — jamais des données
-- stratégiques compagnie entière (voir le Dashboard existant, route "/").
--
-- Nouveauté : signalement manuel de retard sur un trajet, back-office
-- uniquement (jamais exposé côté voyageur dans ce chantier).

-- ============================================================================
-- 1. trip_delay_reports — historique immuable, jamais mis à jour en place.
--    Le dernier signalement d'un trajet donné se dérive toujours à la
--    lecture (order by reported_at desc limit 1) — même philosophie que
--    session_caisse/l'écran de verrouillage : rien n'est mis en cache.
--    company_id dénormalisé depuis trips.company_id, même choix que
--    boarding_validations.company_id / audit_logs.company_id.
-- ============================================================================

create table public.trip_delay_reports (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  delay_minutes integer not null check (delay_minutes >= 0),
  reason text,
  reported_by uuid not null references auth.users (id),
  reported_at timestamptz not null default now()
);

create index trip_delay_reports_trip_id_idx on public.trip_delay_reports (trip_id, reported_at desc);
create index trip_delay_reports_company_id_idx on public.trip_delay_reports (company_id, reported_at desc);

alter table public.trip_delay_reports enable row level security;

-- Lecture : tout membre actif de la compagnie. Écriture exclusivement via
-- report_trip_delay() (security definer) — même convention que
-- driver_ratings/boarding_validations : aucune policy insert/update/delete
-- pour authenticated. En pratique, les pages du back-office lisent via la
-- RPC get_agency_upcoming_trips (service_role) ; cette policy reste la
-- protection de fond exigée par la convention du projet.
create policy "trip_delay_reports_select_member" on public.trip_delay_reports
  for select using (public.is_company_member(company_id));

grant select on public.trip_delay_reports to authenticated;
grant all on public.trip_delay_reports to service_role;
-- Pas de grant anon.

-- ============================================================================
-- 2. report_trip_delay — RPC appelée depuis le back-office via
--    supabaseAdmin (service_role), jamais depuis le client de session :
--    sous service_role, auth.uid() est toujours null, donc jamais
--    is_company_member() ici (même piège déjà évité par validate_boarding)
--    — p_company_id/p_actor_id sont transmis explicitement par l'appelant,
--    déjà vérifié côté TS par requireCompany().
--
--    Une ligne company_notifications PAR agence dont la gare correspond à
--    la gare de départ du trajet (même patron "une ligne par cible" que
--    sweep_driver_document_expiry, une ligne par target_role). Si aucune
--    agence ne correspond à cette gare, repli en notification compagnie
--    entière (target_agency_id null).
-- ============================================================================

create function public.report_trip_delay(
  p_trip_id uuid,
  p_company_id uuid,
  p_actor_id uuid,
  p_delay_minutes integer,
  p_reason text default null
)
returns table (
  id uuid,
  trip_id uuid,
  company_id uuid,
  notified_agency_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_origin_station_id uuid;
  v_report_id uuid;
  v_agency_ids uuid[];
begin
  if p_delay_minutes is null or p_delay_minutes < 0 then
    raise exception 'Le retard doit être un nombre de minutes positif ou nul' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.company_members cm
    where cm.user_id = p_actor_id and cm.company_id = p_company_id and cm.is_active = true
  ) then
    raise exception 'Vous n''appartenez pas à cette compagnie' using errcode = 'check_violation';
  end if;

  select * into v_trip from public.trips t where t.id = p_trip_id and t.company_id = p_company_id;
  if v_trip.id is null then
    raise exception 'Trajet introuvable pour cette compagnie' using errcode = 'check_violation';
  end if;

  select r.origin_station_id into v_origin_station_id
  from public.routes r where r.id = v_trip.route_id;

  insert into public.trip_delay_reports (trip_id, company_id, delay_minutes, reason, reported_by)
  values (p_trip_id, p_company_id, p_delay_minutes, nullif(trim(p_reason), ''), p_actor_id)
  returning trip_delay_reports.id into v_report_id;

  if v_origin_station_id is not null then
    select array_agg(a.id) into v_agency_ids
    from public.agencies a
    where a.company_id = p_company_id and a.station_id = v_origin_station_id;
  end if;

  if v_agency_ids is not null and array_length(v_agency_ids, 1) > 0 then
    insert into public.company_notifications
      (company_id, kind, type, level, title, body, action_href, target_agency_id)
    select
      p_company_id, 'event', 'trip_delay_reported', 'warning',
      p_delay_minutes || ' min de retard — départ prévu à ' || to_char(v_trip.departure_at, 'HH24:MI'),
      coalesce(nullif(trim(p_reason), '') || ' — ', '')
        || 'Départ initialement prévu le ' || to_char(v_trip.departure_at, 'DD/MM/YYYY à HH24:MI') || '.',
      '/voyages',
      agency_id
    from unnest(v_agency_ids) as agency_id;
  else
    -- Repli compagnie entière : aucune agence de cette compagnie ne
    -- couvre la gare de départ de ce trajet.
    insert into public.company_notifications (company_id, kind, type, level, title, body, action_href)
    values (
      p_company_id, 'event', 'trip_delay_reported', 'warning',
      p_delay_minutes || ' min de retard — départ prévu à ' || to_char(v_trip.departure_at, 'HH24:MI'),
      coalesce(nullif(trim(p_reason), '') || ' — ', '')
        || 'Départ initialement prévu le ' || to_char(v_trip.departure_at, 'DD/MM/YYYY à HH24:MI') || '.',
      '/voyages'
    );
    v_agency_ids := '{}';
  end if;

  return query select v_report_id, v_trip.id, p_company_id, v_agency_ids;
end;
$$;

revoke execute on function public.report_trip_delay(uuid, uuid, uuid, integer, text) from public;
grant execute on function public.report_trip_delay(uuid, uuid, uuid, integer, text) to service_role;

-- ============================================================================
-- 3. get_agency_operational_kpis — KPI 1 (réservations du jour + hier à la
--    même heure), 2 (paiements en ligne en attente), 4 (billets à
--    valider), scopés par la gare de départ du trajet (routes.origin_
--    station_id = p_station_id) — même patron déjà établi que
--    _station-filter.ts, filtre d'affichage jamais une frontière de
--    sécurité. Les bornes temporelles sont calculées côté TS
--    (getBeninMidnightToday) et transmises en paramètres — aucune logique
--    de fuseau horaire ici.
-- ============================================================================

create function public.get_agency_operational_kpis(
  p_company_id uuid,
  p_station_id uuid,
  p_today_from timestamptz,
  p_today_to timestamptz,
  p_yesterday_from timestamptz,
  p_yesterday_to timestamptz
)
returns table (
  bookings_today_count integer,
  bookings_yesterday_same_time_count integer,
  pending_online_payment_count integer,
  boarding_pending_count integer
)
language sql
security definer
stable
set search_path = public
as $$
  select
    (
      select count(*)::integer from public.bookings b
      join public.trips t on t.id = b.trip_id
      join public.routes r on r.id = t.route_id
      where b.company_id = p_company_id and r.origin_station_id = p_station_id
        and b.created_at between p_today_from and p_today_to
    ),
    (
      select count(*)::integer from public.bookings b
      join public.trips t on t.id = b.trip_id
      join public.routes r on r.id = t.route_id
      where b.company_id = p_company_id and r.origin_station_id = p_station_id
        and b.created_at between p_yesterday_from and p_yesterday_to
    ),
    (
      select count(*)::integer from public.payments pay
      join public.bookings b on b.id = pay.booking_id
      join public.trips t on t.id = b.trip_id
      join public.routes r on r.id = t.route_id
      where b.company_id = p_company_id and r.origin_station_id = p_station_id
        and pay.status = 'pending' and pay.method in ('mtn_money', 'moov_money', 'card')
    ),
    (
      select count(*)::integer from public.passengers p
      join public.bookings b on b.id = p.booking_id
      join public.trips t on t.id = b.trip_id
      join public.routes r on r.id = t.route_id
      where b.company_id = p_company_id and r.origin_station_id = p_station_id
        and b.status = 'confirmed'
        and now() between t.departure_at - interval '2 hours' and t.departure_at
        and not exists (select 1 from public.boarding_validations bv where bv.passenger_id = p.id)
    );
$$;

revoke execute on function public.get_agency_operational_kpis(uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public;
grant execute on function public.get_agency_operational_kpis(uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz) to service_role;

-- ============================================================================
-- 4. get_agency_upcoming_trips — section "Prochains départs depuis
--    l'agence". Dernier signalement de retard par trajet via left join
--    lateral, jamais mis en cache.
-- ============================================================================

create function public.get_agency_upcoming_trips(
  p_company_id uuid,
  p_station_id uuid,
  p_limit integer default 10
)
returns table (
  trip_id uuid,
  departure_at timestamptz,
  bus_number text,
  origin_city text,
  destination_city text,
  total_seats integer,
  available_seats integer,
  latest_delay_minutes integer,
  latest_delay_reason text,
  latest_delay_reported_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    t.id, t.departure_at, t.bus_number, r.origin_city, r.destination_city,
    t.total_seats, t.available_seats,
    d.delay_minutes, d.reason, d.reported_at
  from public.trips t
  join public.routes r on r.id = t.route_id
  left join lateral (
    select tdr.delay_minutes, tdr.reason, tdr.reported_at
    from public.trip_delay_reports tdr
    where tdr.trip_id = t.id
    order by tdr.reported_at desc
    limit 1
  ) d on true
  where t.company_id = p_company_id
    and r.origin_station_id = p_station_id
    and t.status = 'scheduled'
    and t.departure_at > now()
  order by t.departure_at asc
  limit p_limit;
$$;

revoke execute on function public.get_agency_upcoming_trips(uuid, uuid, integer) from public;
grant execute on function public.get_agency_upcoming_trips(uuid, uuid, integer) to service_role;

-- ============================================================================
-- 5. get_agency_pending_payment_bookings — section "Réservations à
--    traiter" (Relancer). Uniquement les liens en ligne (Mobile Money/
--    carte) : un paiement espèces est réconcilié de façon synchrone à la
--    création (record_cash_payment_received), jamais laissé "en attente"
--    dans ce schéma.
-- ============================================================================

create function public.get_agency_pending_payment_bookings(
  p_company_id uuid,
  p_station_id uuid
)
returns table (
  booking_id uuid,
  booking_reference text,
  passenger_names text,
  phone text,
  origin_city text,
  destination_city text,
  departure_at timestamptz,
  payment_id uuid,
  payment_method text,
  amount_due_fcfa integer,
  payment_token_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    with passenger_names as (
      select pg.booking_id, string_agg(pg.full_name, ', ' order by pg.created_at) as names
      from public.passengers pg
      group by pg.booking_id
    )
    select
      b.id, b.booking_reference, coalesce(pn.names, ''), b.phone,
      r.origin_city, r.destination_city, t.departure_at,
      pay.id, pay.method, pay.amount_charged_fcfa, pay.payment_token_expires_at
    from public.payments pay
    join public.bookings b on b.id = pay.booking_id
    join public.trips t on t.id = b.trip_id
    join public.routes r on r.id = t.route_id
    left join passenger_names pn on pn.booking_id = b.id
    where b.company_id = p_company_id
      and r.origin_station_id = p_station_id
      and pay.status = 'pending'
      and pay.method in ('mtn_money', 'moov_money', 'card')
    order by t.departure_at asc;
end;
$$;

revoke execute on function public.get_agency_pending_payment_bookings(uuid, uuid) from public;
grant execute on function public.get_agency_pending_payment_bookings(uuid, uuid) to service_role;

-- ============================================================================
-- 6. get_agency_notifications — section "Mes alertes". Même filtre exact
--    que get_company_notifications (target_role/target_user_id/expires_at,
--    jointure company_notification_reads pour is_read), mais
--    target_agency_id est un PARAMÈTRE explicite plutôt que dérivé de
--    company_members.agency_id de l'appelant — nécessaire pour un owner
--    qui consulte une agence qui n'est jamais la sienne (il n'en a
--    aucune). target_role reste filtré par le RÔLE RÉEL de l'appelant
--    (m.role), pas par un rôle transmis par le client.
-- ============================================================================

create function public.get_agency_notifications(p_user_id uuid, p_agency_id uuid, p_limit integer default 20)
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
         (n.kind = 'event' and r.notification_id is not null) as is_read
  from public.company_notifications n
  join public.company_members m
    on m.company_id = n.company_id
   and m.user_id = p_user_id
   and m.is_active = true
  left join public.company_notification_reads r
    on r.notification_id = n.id and r.user_id = p_user_id
  where n.company_id = (select a.company_id from public.agencies a where a.id = p_agency_id)
    and (n.target_agency_id is null or n.target_agency_id = p_agency_id)
    and (n.target_role is null or n.target_role = m.role)
    and (n.target_user_id is null or n.target_user_id = m.user_id)
    and (n.expires_at is null or n.expires_at > now())
  order by (n.kind = 'state_alert') desc, n.created_at desc
  limit p_limit;
$$;

revoke execute on function public.get_agency_notifications(uuid, uuid, integer) from public;
grant execute on function public.get_agency_notifications(uuid, uuid, integer) to service_role;
