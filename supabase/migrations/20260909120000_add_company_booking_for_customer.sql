-- Chantier : "+ Nouvelle réservation" côté compagnie — création d'une
-- réservation pour un client qui ne peut pas la faire lui-même, payée
-- ensuite via un lien sécurisé sans connexion.

-- ============================================================================
-- 1. create_booking : ajoute un paramètre optionnel p_user_id, réservé à
--    service_role — jamais dupliquée, reste la SEULE implémentation de la
--    logique de réservation (garde de départ, verrou de sièges via
--    reserve_trip_seats, attribution des passagers). Le reste du corps
--    est repris à l'identique de sa version actuelle
--    (20260904190000_add_departure_guard_to_booking_creation.sql).
--
--    Sécurité du nouveau paramètre : current_user reflète le rôle
--    Postgres RÉEL de l'appelant (la fonction reste security invoker,
--    jamais definer) — 'authenticated' pour un voyageur normal,
--    'service_role' pour un appel back-office via supabaseAdmin. Un
--    voyageur qui tenterait de fournir p_user_id pour réserver "en tant
--    que" quelqu'un d'autre est bloqué ici, pas seulement par l'absence
--    de grant (qui ne suffirait pas seule : authenticated garde de toute
--    façon EXECUTE sur cette fonction pour son usage normal à 4
--    arguments).
--
--    drop puis create (pas create or replace) : ajouter un paramètre
--    change la signature de la fonction, piège déjà rencontré plusieurs
--    fois sur ce projet.
-- ============================================================================

drop function if exists public.create_booking(uuid, integer, text, text[]);

create function public.create_booking(
  p_trip_id uuid,
  p_seat_count integer,
  p_phone text,
  p_passenger_names text[],
  p_user_id uuid default null
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id uuid;
  v_trip_price integer;
  v_trip_departure timestamptz;
  v_booking_id uuid;
begin
  if p_user_id is not null then
    if current_user <> 'service_role' then
      raise exception 'p_user_id réservé à service_role' using errcode = '42501';
    end if;
    v_user_id := p_user_id;
  else
    v_user_id := auth.uid();
  end if;

  if v_user_id is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;

  if array_length(p_passenger_names, 1) is distinct from p_seat_count then
    raise exception 'Le nombre de passagers doit correspondre au nombre de places'
      using errcode = 'check_violation';
  end if;

  select price_fcfa, departure_at into v_trip_price, v_trip_departure
  from public.trips where id = p_trip_id;
  if v_trip_price is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  if v_trip_departure <= now() then
    raise exception 'Ce trajet est déjà parti, la réservation n''est plus possible'
      using errcode = 'check_violation';
  end if;

  insert into public.bookings (trip_id, user_id, seat_count, total_price_fcfa, phone)
  values (p_trip_id, v_user_id, p_seat_count, v_trip_price * p_seat_count, p_phone)
  returning id into v_booking_id;
  -- reserve_trip_seats locks trips here — assign_and_insert_passengers
  -- runs below while that lock is still held, in the same transaction.

  perform public.assign_and_insert_passengers(v_booking_id, p_trip_id, p_passenger_names);

  return v_booking_id;
end;
$$;

-- apps/web et apps/mobile continuent d'appeler create_booking avec
-- exactement les 4 arguments actuels (Supabase RPC matche par nom, pas
-- par position) — aucun changement requis côté traveler, d'où le grant à
-- authenticated conservé ici.
revoke execute on function public.create_booking(uuid, integer, text, text[], uuid) from public;
grant execute on function public.create_booking(uuid, integer, text, text[], uuid) to authenticated;
grant execute on function public.create_booking(uuid, integer, text, text[], uuid) to service_role;

-- ============================================================================
-- 2. create_booking_for_company : vérifie que le trajet appartient bien à
--    la compagnie appelante, puis délègue entièrement à create_booking
--    (jamais de logique de réservation dupliquée ici).
--
--    security invoker, délibérément (pas definer) : security definer
--    changerait current_user vers le PROPRIÉTAIRE de la fonction (pas
--    service_role) pour le reste de la chaîne d'appel — cassant la garde
--    qu'on vient d'ajouter dans create_booking ci-dessus. En restant
--    invoker, current_user reste service_role de bout en bout (aucune
--    fonction intermédiaire n'élève le privilège), et service_role a de
--    toute façon déjà un accès complet à trips/bookings/passengers (RLS
--    contournée par conception) — pas besoin d'élévation, juste de la
--    vérification d'appartenance ci-dessous.
-- ============================================================================

create function public.create_booking_for_company(
  p_trip_id uuid,
  p_seat_count integer,
  p_phone text,
  p_passenger_names text[],
  p_user_id uuid,
  p_company_id uuid
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_trip_company_id uuid;
begin
  select company_id into v_trip_company_id from public.trips where id = p_trip_id;
  if v_trip_company_id is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  if v_trip_company_id <> p_company_id then
    raise exception 'Ce trajet n''appartient pas à votre compagnie' using errcode = 'check_violation';
  end if;

  return public.create_booking(p_trip_id, p_seat_count, p_phone, p_passenger_names, p_user_id);
end;
$$;

revoke execute on function public.create_booking_for_company(uuid, integer, text, text[], uuid, uuid) from public;
grant execute on function public.create_booking_for_company(uuid, integer, text, text[], uuid, uuid) to service_role;

-- ============================================================================
-- 3. Jeton de paiement sécurisé sur bookings — généré côté TypeScript
--    (crypto.randomBytes(32).toString("hex"), 256 bits d'entropie),
--    jamais en SQL malgré pgcrypto déjà actif : le Server Action qui crée
--    la réservation orchestre déjà plusieurs étapes en TypeScript
--    (création/réutilisation du compte discret, appel RPC, envoi de
--    l'e-mail), le jeton s'y insère naturellement.
--
--    Index unique partiel (pas une contrainte unique classique) : les
--    réservations créées normalement par un voyageur n'ont jamais de
--    jeton (NULL), seules celles créées par ce chantier en ont un — un
--    index partiel évite que ces NULL ne posent un quelconque problème
--    d'unicité entre eux, tout en garantissant qu'aucun jeton réel ne
--    peut être dupliqué entre deux réservations.
-- ============================================================================

alter table public.bookings
  add column payment_token text,
  add column payment_token_expires_at timestamptz;

create unique index bookings_payment_token_unique_idx
  on public.bookings (payment_token)
  where payment_token is not null;

-- ============================================================================
-- 4. notification_log.type : élargi pour la nouvelle notification
--    "lien de paiement" — même patron que l'élargissement précédent de
--    vouchers_status_check / points_ledger_reason_check.
-- ============================================================================

alter table public.notification_log drop constraint notification_log_type_check;
alter table public.notification_log add constraint notification_log_type_check
  check (type in ('booking_confirmation', 'trip_cancellation', 'voucher_refund_pending', 'booking_payment_link'));
