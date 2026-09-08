-- Corrige une régression réelle introduite par 20260908090000_add_points_redemption.sql
-- (confirmée en conditions réelles, pas supposée) : award_points_on_payment_approved()
-- fait "on conflict (booking_id) do nothing", qui ciblait l'ancienne
-- contrainte unique(booking_id) sur points_ledger. Cette contrainte a été
-- remplacée par unique(booking_id, reason) pour permettre une ligne
-- 'booking_reward' ET une ligne 'booking_redemption' par réservation —
-- "on conflict (booking_id)" ne correspond plus à AUCUNE contrainte
-- existante, ce qui fait échouer l'INSERT avec l'erreur Postgres 42P10
-- ("there is no unique or exclusion constraint matching the ON CONFLICT
-- specification"), qui fait échouer le trigger, qui fait échouer TOUT
-- update de payments.status vers 'approved' — cassant l'approbation de
-- paiement elle-même, pas seulement l'octroi de points. Reproduit
-- explicitement avant ce correctif : une tentative réelle de passage à
-- 'approved' échouait avec exactement ce code d'erreur.

create or replace function public.award_points_on_payment_approved()
returns trigger
language plpgsql
as $$
declare
  booking_user_id uuid;
  booking_amount integer;
begin
  if new.status = 'approved' and old.status <> 'approved' then
    select user_id, total_price_fcfa into booking_user_id, booking_amount
    from public.bookings
    where id = new.booking_id;

    insert into public.points_ledger (booking_id, user_id, points_amount, reason)
    values (new.booking_id, booking_user_id, floor(booking_amount / 100), 'booking_reward')
    on conflict (booking_id, reason) do nothing;
  end if;

  return new;
end;
$$;
