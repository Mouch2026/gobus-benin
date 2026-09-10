-- Chantier : paiements scindés entre plusieurs modes sur une même
-- réservation créée par la compagnie, + application des avoirs/points
-- d'un client déjà existant sur cette même réservation.
--
-- Voir le plan pour le raisonnement complet. Résumé des décisions
-- structurantes :
--   1. Une réservation peut désormais avoir plusieurs lignes `payments`
--      ("parts") — déjà possible schéma-wise (aucune contrainte unique
--      sur booking_id), on l'exploite pleinement ici pour la première
--      fois.
--   2. Nouveau statut `payments.status = 'received'` : une part reçue
--      individuellement mais dont la somme ne couvre pas encore
--      total_price_fcfa. Aucune part ne passe à 'approved' tant que la
--      somme n'est pas complète — voir record_payment_part_received.
--      C'est la garantie centrale qui empêche
--      award_points_on_payment_approved de créditer des points sur un
--      paiement encore partiel (ce trigger reste lui-même inchangé).
--   3. payment_token/payment_token_expires_at déménagent de `bookings`
--      vers `payments` : avec Mobile Money ET Carte toutes deux "par
--      lien", il faut un jeton par part, pas par réservation.
--   4. issue_voucher_and_cancel_booking calcule désormais lui-même la
--      somme réellement reçue (toutes parts 'received'/'approved'
--      confondues) au lieu de recevoir un montant pré-calculé par un
--      `limit 1` sur la part la plus récente — corrige un bug latent
--      (les autres parts d'un paiement scindé étaient silencieusement
--      ignorées) sans changer le résultat pour une réservation à
--      paiement unique (sum() sur 1 ligne = cette ligne).
--   5. cancel_booking / cancel_confirmed_bookings_for_trip /
--      cancel_booking_by_company : simplifiés pour déléguer entièrement à
--      issue_voucher_and_cancel_booking (fin de la triplication du
--      `limit 1`) ; cancel_booking_by_company accepte en plus une
--      réservation encore 'pending' (annulation d'un paiement scindé
--      incomplet).
--   6. apply_points_ledger_entry (indépendant des paiements scindés,
--      découvert en testant en conditions réelles l'application des
--      points d'un client existant, point 6 du chantier) : corrige un bug
--      pré-existant qui empêchait TOUTE dépense de points de fonctionner,
--      partout dans l'application, depuis la création de cette fonction.
--      Voir la section 6 plus bas pour le détail.

-- ============================================================================
-- 1. payments.status : élargi pour accepter 'received'.
-- ============================================================================

alter table public.payments drop constraint payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('pending', 'approved', 'failed', 'refunded', 'voucher_issued', 'received'));

-- ============================================================================
-- 2. payment_token/payment_token_expires_at : bookings -> payments.
--    Un seul jeton par réservation n'a plus de sens dès qu'une réservation
--    peut avoir plusieurs parts "par lien" (Mobile Money ET Carte).
-- ============================================================================

drop index if exists public.bookings_payment_token_unique_idx;
alter table public.bookings drop column payment_token, drop column payment_token_expires_at;

alter table public.payments
  add column payment_token text,
  add column payment_token_expires_at timestamptz;

create unique index payments_payment_token_unique_idx
  on public.payments (payment_token)
  where payment_token is not null;

-- ============================================================================
-- 3. record_payment_part_received : SEUL endroit qui fait passer une part
--    à 'received', et seul endroit qui décide de basculer TOUTES les
--    parts reçues vers 'approved' d'un coup — uniquement quand leur somme
--    atteint exactement total_price_fcfa. Verrou sur la ligne bookings
--    (via `for update of b`) pour sérialiser deux parts qui se
--    compléteraient au même instant — même patron que le verrou déjà pris
--    par update_booking_details sur trips.
--
--    award_points_on_payment_approved (trigger existant, INCHANGÉ) se
--    déclenche une fois par ligne basculée vers 'approved' mais reste
--    idempotent via son on conflict (booking_id, reason) do nothing — un
--    seul crédit de points au final, calculé sur bookings.total_price_fcfa
--    au moment EXACT où la somme complète le justifie, jamais avant.
-- ============================================================================

create function public.record_payment_part_received(p_payment_id uuid)
returns table (booking_confirmed boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_booking_id uuid;
  v_total_price integer;
  v_received_sum integer;
begin
  select b.id, b.total_price_fcfa into v_booking_id, v_total_price
  from public.bookings b
  join public.payments p on p.booking_id = b.id
  where p.id = p_payment_id
  for update of b;

  if v_booking_id is null then
    raise exception 'Paiement introuvable' using errcode = 'check_violation';
  end if;

  -- Idempotent : si déjà 'received' ou 'approved', ce update ne touche
  -- rien — sûr d'appeler cette fonction plus d'une fois pour la même part
  -- (ex. double clic sur le lien de paiement).
  update public.payments set status = 'received'
  where id = p_payment_id and status = 'pending';

  select coalesce(sum(base_amount_fcfa), 0) into v_received_sum
  from public.payments
  where booking_id = v_booking_id and status in ('received', 'approved');

  if v_received_sum > v_total_price then
    raise exception 'Somme des paiements reçus (%) supérieure au prix total (%) — incohérence à corriger',
      v_received_sum, v_total_price using errcode = 'check_violation';
  end if;

  if v_received_sum = v_total_price then
    update public.payments set status = 'approved', paid_at = coalesce(paid_at, now())
    where booking_id = v_booking_id and status = 'received';

    update public.bookings set status = 'confirmed'
    where id = v_booking_id and status = 'pending';

    booking_confirmed := true;
  else
    booking_confirmed := false;
  end if;

  return next;
end;
$$;

-- Appelée par le back-office (part espèces auto-attestée à la création,
-- via service_role) ET par la future page de paiement par lien
-- (apps/web, elle aussi via service_role/supabaseAdmin — cette page ne
-- s'appuie jamais sur une session authentifiée, voir paiement-securise).
revoke execute on function public.record_payment_part_received(uuid) from public;
grant execute on function public.record_payment_part_received(uuid) to service_role;

-- ============================================================================
-- 4. issue_voucher_and_cancel_booking : calcule désormais lui-même la
--    somme réellement reçue (plus de paramètre p_voucher_amount_fcfa
--    pré-calculé par l'appelant) et bascule TOUTES les parts
--    'received'/'approved' vers 'voucher_issued', pas une seule.
--    Changement de signature -> drop puis create.
-- ============================================================================

drop function if exists public.issue_voucher_and_cancel_booking(uuid, integer);

create function public.issue_voucher_and_cancel_booking(p_booking_id uuid)
returns table (voucher_id uuid, voucher_amount_fcfa integer)
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid;
  v_received_sum integer;
begin
  select user_id into v_user_id from public.bookings where id = p_booking_id;
  if v_user_id is null then
    raise exception 'Réservation introuvable' using errcode = 'check_violation';
  end if;

  -- "Ce qui a été réellement reçu" : la somme de TOUTES les parts reçues
  -- ou approuvées, jamais une seule ligne choisie arbitrairement (ancien
  -- bug : limit 1 sur la plus récente, ignorait silencieusement les
  -- autres parts d'un paiement scindé). Pour une réservation à paiement
  -- unique, cette somme vaut exactement le montant de l'unique ligne
  -- 'approved' — comportement inchangé.
  select coalesce(sum(base_amount_fcfa), 0) into v_received_sum
  from public.payments
  where booking_id = p_booking_id and status in ('received', 'approved');

  update public.payments set status = 'voucher_issued'
  where booking_id = p_booking_id and status in ('received', 'approved');

  update public.bookings set status = 'cancelled' where id = p_booking_id;

  if v_received_sum > 0 then
    insert into public.vouchers (user_id, origin_booking_id, amount_fcfa, expires_at)
    values (v_user_id, p_booking_id, v_received_sum, now() + interval '24 hours')
    returning id, amount_fcfa into voucher_id, voucher_amount_fcfa;
  end if;

  return next;
end;
$$;

-- Pas de grant (ni authenticated ni service_role) : appelable uniquement
-- depuis l'intérieur d'une autre fonction security definer (son
-- propriétaire a implicitement le droit d'exécuter ses propres
-- fonctions) — inchangé par rapport à avant ce chantier.
revoke execute on function public.issue_voucher_and_cancel_booking(uuid) from public;

-- ============================================================================
-- 5. cancel_booking / cancel_confirmed_bookings_for_trip /
--    cancel_booking_by_company : signature ET grants inchangés pour les
--    trois (create or replace suffit) — seul le corps change, pour
--    déléguer entièrement à issue_voucher_and_cancel_booking(p_booking_id)
--    au lieu de calculer eux-mêmes un montant via un limit 1 dupliqué
--    trois fois.
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

  return query select v.voucher_amount_fcfa from public.issue_voucher_and_cancel_booking(p_booking_id) v;
end;
$$;

create or replace function public.cancel_confirmed_bookings_for_trip(p_trip_id uuid)
returns table (booking_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_booking record;
begin
  select * into v_trip from public.trips where id = p_trip_id;
  if v_trip.id is null then
    raise exception 'Trajet introuvable' using errcode = 'check_violation';
  end if;

  if not public.is_company_owner(v_trip.company_id) then
    raise exception 'Ce trajet ne vous appartient pas' using errcode = 'check_violation';
  end if;

  if v_trip.status <> 'cancelled' then
    raise exception 'Ce trajet n''est pas annulé' using errcode = 'check_violation';
  end if;

  for v_booking in
    select b.id from public.bookings b where b.trip_id = p_trip_id and b.status = 'confirmed'
  loop
    begin
      perform public.issue_voucher_and_cancel_booking(v_booking.id);
      booking_id := v_booking.id;
      return next;
    exception when others then
      raise warning 'Échec de l''émission de l''avoir pour la réservation % : %', v_booking.id, sqlerrm;
    end;
  end loop;
end;
$$;

-- cancel_booking_by_company : garde assouplie pour permettre l'annulation
-- d'une réservation encore 'pending' (paiement scindé incomplet) — le
-- scénario visé par "ne rembourse que ce qui a été réellement reçu
-- jusque-là" n'a de sens QUE pour une réservation pas encore
-- complètement payée. cancel_booking (voyageur) et
-- cancel_confirmed_bookings_for_trip (ne boucle que sur 'confirmed') ne
-- nécessitent pas cet assouplissement : ce scénario n'est atteignable
-- aujourd'hui que via la création compagnie.
create or replace function public.cancel_booking_by_company(p_booking_id uuid, p_company_id uuid)
returns table (voucher_amount_fcfa integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_departure_at timestamptz;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'Réservation introuvable' using errcode = 'check_violation';
  end if;

  if v_booking.company_id <> p_company_id then
    raise exception 'Cette réservation n''appartient pas à votre compagnie' using errcode = 'check_violation';
  end if;

  if v_booking.status not in ('confirmed', 'pending') then
    raise exception 'Seule une réservation confirmée ou en attente de paiement peut être annulée'
      using errcode = 'check_violation';
  end if;

  select departure_at into v_departure_at from public.trips where id = v_booking.trip_id;
  if v_departure_at <= now() then
    raise exception 'Ce trajet est déjà parti, la réservation ne peut plus être annulée'
      using errcode = 'check_violation';
  end if;

  return query select v.voucher_amount_fcfa from public.issue_voucher_and_cancel_booking(p_booking_id) v;
end;
$$;

-- ============================================================================
-- 6. apply_points_ledger_entry : corrige un bug PRÉ-EXISTANT, indépendant
--    des paiements scindés, découvert en testant en conditions réelles
--    l'application des points d'un client existant (point 6 du chantier).
--
--    L'ancienne version faisait :
--      insert into public.points_balance (user_id, balance)
--      values (new.user_id, new.points_amount)
--      on conflict (user_id) do update
--        set balance = public.points_balance.balance + excluded.balance;
--
--    PostgreSQL valide une contrainte CHECK sur la ligne CANDIDATE de la
--    clause VALUES *avant* de résoudre le ON CONFLICT — pas seulement sur
--    la ligne finale produite par le DO UPDATE. Donc `values (user, -500)`
--    est rejetée par `check (balance >= 0)` immédiatement, même quand le
--    résultat final correct (ex. 500 + (-500) = 0) serait parfaitement
--    valide. Reproduit en bac à sable Postgres isolé PUIS confirmé à
--    l'identique sur le projet réel — pas supposé.
--
--    Conséquence : TOUTE dépense de points (tout `points_amount` négatif,
--    reason 'booking_redemption') a toujours silencieusement échoué,
--    partout — simulatePayment, simulate_round_trip_payment, et
--    maintenant applyVoucherAndPoints. Chaque appelant rattrape l'erreur
--    et retombe sur "0 point appliqué", donc aucun plantage visible, mais
--    la dépense de points n'a jamais réellement fonctionné pour aucun
--    client. Le CRÉDIT de points (montant positif) n'a jamais déclenché ce
--    bug, ce qui explique qu'il soit passé inaperçu.
--
--    Correctif : la fonction valide désormais explicitement en PL/pgSQL
--    (lecture du solde courant sous verrou `for update`, calcul, `raise
--    exception` si négatif, PUIS écriture d'une valeur déjà valide) au
--    lieu de compter sur la contrainte CHECK pour rattraper une ligne
--    candidate transitoirement invalide. La contrainte
--    points_balance_balance_check est CONSERVÉE en filet de sécurité — la
--    valeur écrite étant désormais toujours >= 0, elle ne se déclenche
--    plus jamais dans le chemin normal.
--
--    Le verrou `for update` (précédé d'un upsert 0-balance idempotent pour
--    garantir l'existence de la ligne) sérialise les dépenses concurrentes
--    d'un même utilisateur — rôle que l'ancienne version tenait
--    accidentellement via la sérialisation sur la clé primaire de
--    points_balance lors du ON CONFLICT.
--
--    simulate_round_trip_payment n'a PAS besoin d'être touchée : son
--    `exception when others` rattrape déjà n'importe quelle exception,
--    l'errcode change (23514 identique d'ailleurs) mais la forme est la
--    même.
-- ============================================================================

create or replace function public.apply_points_ledger_entry()
returns trigger
language plpgsql
as $$
declare
  v_current_balance integer;
  v_new_balance integer;
begin
  -- Garantit l'existence de la ligne, de façon idempotente — sérialise
  -- aussi deux tout premiers crédits concurrents pour le même
  -- utilisateur (un seul gagne l'insert, l'autre passe au for update).
  insert into public.points_balance (user_id, balance)
  values (new.user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_current_balance
  from public.points_balance
  where user_id = new.user_id
  for update;

  v_new_balance := v_current_balance + new.points_amount;

  if v_new_balance < 0 then
    raise exception 'Solde de points insuffisant (solde actuel: %, mouvement demandé: %)',
      v_current_balance, new.points_amount
      using errcode = 'check_violation';
  end if;

  update public.points_balance
  set balance = v_new_balance, updated_at = now()
  where user_id = new.user_id;

  return new;
end;
$$;
