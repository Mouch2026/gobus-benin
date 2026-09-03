-- Système d'avoir (store credit) à la place du remboursement immédiat.
-- Remplace refund_and_cancel_booking (remboursement direct, marquait
-- payments.status = 'refunded') par issue_voucher_and_cancel_booking
-- (émet un avoir de 24h, marque payments.status = 'voucher_issued').
-- cancel_booking perd sa règle des 30 minutes : un avoir est désormais
-- toujours accordé, quel que soit le délai avant le départ (décision
-- explicitement confirmée avec l'utilisateur, remplace l'ancienne
-- politique de remboursement conditionnel).

-- ============================================================
-- 1. Table vouchers
-- ============================================================

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  origin_booking_id uuid not null references public.bookings (id) on delete restrict,
  amount_fcfa integer not null check (amount_fcfa > 0),
  status text not null default 'active' check (status in ('active', 'used', 'refund_pending')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  -- Réservation (simple ou aller-retour) qui a consommé cet avoir, le cas
  -- échéant — jamais les deux à la fois.
  consumed_booking_id uuid references public.bookings (id) on delete set null,
  consumed_booking_group_id uuid references public.booking_groups (id) on delete set null,
  consumed_at timestamptz,

  -- Alimenté soit à l'expiration sans utilisation (montant = amount_fcfa),
  -- soit après une utilisation sur une réservation moins chère (montant =
  -- le reliquat). "refund_pending" couvre les deux cas — consumed_booking_id/
  -- consumed_booking_group_id distinguent lequel s'est produit.
  refund_pending_amount_fcfa integer
    check (refund_pending_amount_fcfa is null or (refund_pending_amount_fcfa > 0 and refund_pending_amount_fcfa <= amount_fcfa)),
  refund_pending_at timestamptz,
  refund_notified_at timestamptz, -- évite un second e-mail si le sweep repasse dessus

  updated_at timestamptz not null default now(),

  constraint vouchers_consumed_single_target
    check (consumed_booking_id is null or consumed_booking_group_id is null),
  constraint vouchers_origin_booking_unique unique (origin_booking_id)
);

create index vouchers_user_id_idx on public.vouchers (user_id);
create index vouchers_active_expiry_idx on public.vouchers (expires_at) where status = 'active';

create trigger set_vouchers_updated_at before update on public.vouchers
  for each row execute function public.set_updated_at();

alter table public.vouchers enable row level security;

create policy "vouchers_select_own" on public.vouchers
  for select
  using (user_id = auth.uid());

-- Aucune policy insert/update/delete pour authenticated : toute mutation
-- passe par des fonctions security definer (ci-dessous) ou service_role —
-- même principe que points_ledger/points_balance.

grant select on public.vouchers to authenticated;
grant all on public.vouchers to service_role;
-- No anon grant: un avoir n'existe que pour un compte connecté (même
-- convention que points_ledger/points_balance).

-- ============================================================
-- 2. payments — nouvelles colonnes + nouveau statut
-- ============================================================

alter table public.payments
  add column voucher_id uuid references public.vouchers (id) on delete set null,
  add column voucher_amount_fcfa integer not null default 0
    check (voucher_amount_fcfa >= 0 and voucher_amount_fcfa <= amount_fcfa),
  -- PostgreSQL interdit à une colonne générée de référencer une autre
  -- colonne générée dans sa propre expression ("cannot use generated
  -- column ... in column generation expression", vérifié réellement via
  -- un Postgres jetable avant d'écrire cette migration) — amount_fcfa
  -- (déjà "generated always as (base_amount_fcfa + platform_fee_fcfa +
  -- transaction_fee_fcfa) stored") ne peut donc pas être référencée ici.
  -- On duplique le même calcul plutôt que de la référencer ; un simple
  -- CHECK (ci-dessus) référençant amount_fcfa reste en revanche autorisé,
  -- ce n'est pas la même restriction.
  add column amount_charged_fcfa integer
    generated always as (base_amount_fcfa + platform_fee_fcfa + transaction_fee_fcfa - voucher_amount_fcfa) stored;

-- 'voucher_issued' remplace l'usage de 'refunded' au moment de
-- l'annulation : le paiement d'origine n'est plus immédiatement remboursé,
-- un avoir est émis à la place. 'refunded' reste une valeur légale pour le
-- jour où la future page back-office traite réellement la file d'attente.
alter table public.payments drop constraint payments_status_check;
alter table public.payments
  add constraint payments_status_check
  check (status in ('pending', 'approved', 'failed', 'refunded', 'voucher_issued'));

-- ============================================================
-- 3. Helper interne renommé : refund_and_cancel_booking →
--    issue_voucher_and_cancel_booking (son rôle change de nature : il
--    n'exécute plus un remboursement, il émet un avoir)
-- ============================================================

drop function if exists public.refund_and_cancel_booking(uuid, integer);

create function public.issue_voucher_and_cancel_booking(p_booking_id uuid, p_voucher_amount_fcfa integer)
returns uuid -- id de l'avoir créé (null si p_voucher_amount_fcfa = 0)
language plpgsql
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_user_id uuid;
  v_voucher_id uuid;
begin
  select id into v_payment_id from public.payments
  where booking_id = p_booking_id and status = 'approved'
  order by paid_at desc nulls last limit 1;

  if v_payment_id is null then
    raise exception 'Aucun paiement approuvé trouvé pour cette réservation' using errcode = 'check_violation';
  end if;

  select user_id into v_user_id from public.bookings where id = p_booking_id;

  update public.payments set status = 'voucher_issued' where id = v_payment_id;
  update public.bookings set status = 'cancelled' where id = p_booking_id;
  -- Déclenche toujours adjust_trip_seats_on_booking_status_change, inchangé.

  if p_voucher_amount_fcfa > 0 then
    insert into public.vouchers (user_id, origin_booking_id, amount_fcfa, expires_at)
    values (v_user_id, p_booking_id, p_voucher_amount_fcfa, now() + interval '24 hours')
    returning id into v_voucher_id;
  end if;

  return v_voucher_id;
end;
$$;

revoke execute on function public.issue_voucher_and_cancel_booking(uuid, integer) from public;
-- Pas de grant à authenticated/service_role : appelée uniquement depuis
-- l'intérieur d'autres fonctions security definer, comme l'était
-- refund_and_cancel_booking.

-- ============================================================
-- 4. cancel_booking — create or replace, règle des 30 minutes levée
-- ============================================================

create or replace function public.cancel_booking(p_booking_id uuid)
returns table (voucher_amount_fcfa integer) -- renommé (était refunded_amount_fcfa)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_departure_at timestamptz;
  v_base_amount integer;
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

  select base_amount_fcfa into v_base_amount from public.payments
  where booking_id = p_booking_id and status = 'approved'
  order by paid_at desc nulls last limit 1;

  if v_base_amount is null then
    raise exception 'Aucun paiement approuvé trouvé pour cette réservation' using errcode = 'check_violation';
  end if;

  -- Plus de condition de délai : un avoir de base_amount_fcfa est
  -- toujours accordé, tant que le trajet n'est pas déjà parti (garde-fou
  -- conservé juste au-dessus). Remplace l'ancienne règle "remboursement
  -- intégral si > 30 minutes avant le départ, sinon rien".
  perform public.issue_voucher_and_cancel_booking(p_booking_id, v_base_amount);

  return query select v_base_amount;
end;
$$;

-- Grants déjà en place (to authenticated) — create or replace préserve
-- une signature identique donc pas de re-grant nécessaire.

-- ============================================================
-- 5. cancel_confirmed_bookings_for_trip — create or replace, appelle le
--    helper renommé
-- ============================================================

create or replace function public.cancel_confirmed_bookings_for_trip(p_trip_id uuid)
returns table (booking_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip public.trips%rowtype;
  v_booking record;
  v_base_amount integer;
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
    select p.base_amount_fcfa into v_base_amount from public.payments p
    where p.booking_id = v_booking.id and p.status = 'approved'
    order by p.paid_at desc nulls last limit 1;

    if v_base_amount is not null then
      begin
        perform public.issue_voucher_and_cancel_booking(v_booking.id, v_base_amount);
        booking_id := v_booking.id;
        return next;
      exception when others then
        raise warning 'Échec de l''émission de l''avoir pour la réservation % : %', v_booking.id, sqlerrm;
      end;
    end if;
  end loop;
end;
$$;

-- Grants déjà en place (to authenticated) — inchangés.

-- ============================================================
-- 6. simulate_round_trip_payment — nouveau paramètre p_voucher_id
--
-- Piège Postgres : "create or replace function" refuse de changer la
-- liste de paramètres d'une fonction existante (même avec une valeur par
-- défaut ajoutée en fin de liste) — cela créerait une surcharge distincte
-- et laisserait l'ancienne fonction à 2 arguments en place. Il faut donc
-- explicitement drop puis create (et re-déclarer les grants, perdus avec
-- le drop).
-- ============================================================

drop function if exists public.simulate_round_trip_payment(uuid, uuid);

create function public.simulate_round_trip_payment(
  p_booking_group_id uuid,
  p_user_id uuid,
  p_voucher_id uuid default null
)
returns table (outbound_payment_id uuid, return_payment_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_outbound record;
  v_return record;
  v_outbound_payment_id uuid;
  v_return_payment_id uuid;
  -- Dupliqué depuis packages/shared/src/lib/pricing.ts (PLATFORM_FEE_RATE /
  -- TRANSACTION_FEE_RATE) — voir le commentaire déjà présent dans la
  -- version précédente de cette fonction, même limitation, inchangée.
  v_platform_fee_rate numeric := 0.027;
  v_transaction_fee_rate numeric := 0.013;
  v_outbound_total integer;
  v_return_total integer;
  v_combined_total integer;
  v_voucher_amount integer;
  v_voucher_applied integer := 0;
  v_outbound_voucher integer := 0;
  v_return_voucher integer := 0;
  v_leftover integer;
begin
  select id, total_price_fcfa, status, user_id into v_outbound
  from public.bookings where booking_group_id = p_booking_group_id and leg = 'outbound';
  select id, total_price_fcfa, status, user_id into v_return
  from public.bookings where booking_group_id = p_booking_group_id and leg = 'return';

  if v_outbound.id is null or v_return.id is null then
    raise exception 'Réservation aller-retour introuvable' using errcode = 'check_violation';
  end if;

  if v_outbound.user_id <> p_user_id or v_return.user_id <> p_user_id then
    raise exception 'Cette réservation ne vous appartient pas' using errcode = 'check_violation';
  end if;

  if v_outbound.status <> 'pending' or v_return.status <> 'pending' then
    raise exception 'Ce billet aller-retour a déjà été payé ou annulé'
      using errcode = 'check_violation';
  end if;

  v_outbound_total := v_outbound.total_price_fcfa
    + round(v_outbound.total_price_fcfa * v_platform_fee_rate)
    + round(v_outbound.total_price_fcfa * v_transaction_fee_rate);
  v_return_total := v_return.total_price_fcfa
    + round(v_return.total_price_fcfa * v_platform_fee_rate)
    + round(v_return.total_price_fcfa * v_transaction_fee_rate);
  v_combined_total := v_outbound_total + v_return_total;

  -- Réclame l'avoir de façon atomique (une seule transaction, contrairement
  -- au paiement simple côté TS) : la clause "and status = 'active'" ferme
  -- toute course avec une autre utilisation concurrente du même avoir.
  if p_voucher_id is not null then
    update public.vouchers
    set status = 'used', consumed_booking_group_id = p_booking_group_id, consumed_at = now()
    where id = p_voucher_id and user_id = p_user_id and status = 'active' and expires_at > now()
    returning amount_fcfa into v_voucher_amount;

    if found then
      v_voucher_applied := least(v_voucher_amount, v_combined_total);
      v_outbound_voucher := round(v_voucher_applied * v_outbound_total::numeric / v_combined_total);
      v_return_voucher := v_voucher_applied - v_outbound_voucher;

      v_leftover := v_voucher_amount - v_voucher_applied;
      if v_leftover > 0 then
        update public.vouchers
        set status = 'refund_pending', refund_pending_amount_fcfa = v_leftover, refund_pending_at = now()
        where id = p_voucher_id;
      end if;
    end if;
    -- Si "not found" (avoir déjà utilisé/expiré entre-temps) : le paiement
    -- continue simplement sans avoir, aucune erreur bloquante.
  end if;

  insert into public.payments (booking_id, base_amount_fcfa, platform_fee_fcfa, transaction_fee_fcfa, voucher_id, voucher_amount_fcfa, provider, status)
  values (v_outbound.id, v_outbound.total_price_fcfa,
          round(v_outbound.total_price_fcfa * v_platform_fee_rate),
          round(v_outbound.total_price_fcfa * v_transaction_fee_rate),
          case when v_outbound_voucher > 0 then p_voucher_id end, v_outbound_voucher,
          'simulated', 'pending')
  returning id into v_outbound_payment_id;
  update public.payments set status = 'approved', paid_at = now() where id = v_outbound_payment_id;
  update public.bookings set status = 'confirmed' where id = v_outbound.id;

  insert into public.payments (booking_id, base_amount_fcfa, platform_fee_fcfa, transaction_fee_fcfa, voucher_id, voucher_amount_fcfa, provider, status)
  values (v_return.id, v_return.total_price_fcfa,
          round(v_return.total_price_fcfa * v_platform_fee_rate),
          round(v_return.total_price_fcfa * v_transaction_fee_rate),
          case when v_return_voucher > 0 then p_voucher_id end, v_return_voucher,
          'simulated', 'pending')
  returning id into v_return_payment_id;
  update public.payments set status = 'approved', paid_at = now() where id = v_return_payment_id;
  update public.bookings set status = 'confirmed' where id = v_return.id;

  return query select v_outbound_payment_id, v_return_payment_id;
end;
$$;

revoke execute on function public.simulate_round_trip_payment(uuid, uuid, uuid) from public;
grant execute on function public.simulate_round_trip_payment(uuid, uuid, uuid) to service_role;

-- ============================================================
-- 7. sweep_my_expired_vouchers() — sweep paresseux
--
-- security definer, utilise auth.uid() en interne (appelée via la
-- session voyageur elle-même, pas via service_role — même raisonnement
-- déjà établi pour cancel_booking : pas besoin de p_user_id).
-- ============================================================

create function public.sweep_my_expired_vouchers()
returns table (voucher_id uuid, amount_fcfa integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Forme "CTE + RETURN QUERY SELECT" plutôt que "RETURN QUERY UPDATE ...
  -- RETURNING" directement : les deux sont valides en PL/pgSQL, mais
  -- celle-ci lève toute ambiguïté sur la correspondance positionnelle
  -- entre les colonnes retournées et voucher_id/amount_fcfa déclarés
  -- ci-dessus.
  return query
    with expired as (
      update public.vouchers
      set status = 'refund_pending',
          refund_pending_amount_fcfa = vouchers.amount_fcfa,
          refund_pending_at = now()
      where user_id = auth.uid()
        and status = 'active'
        and expires_at <= now()
      returning id, amount_fcfa
    )
    select id, amount_fcfa from expired;
end;
$$;

revoke execute on function public.sweep_my_expired_vouchers() from public;
grant execute on function public.sweep_my_expired_vouchers() to authenticated;
