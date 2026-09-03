-- Corrige "column reference "amount_fcfa" is ambiguous" dans les deux
-- fonctions de sweep d'avoirs — confirmé réellement (pas supposé) via un
-- Postgres jetable (PGlite) reproduisant la structure exacte des deux
-- fonctions déjà appliquées.
--
-- Cause : "returns table (voucher_id uuid, amount_fcfa integer)" déclare
-- implicitement des variables PL/pgSQL nommées voucher_id/amount_fcfa,
-- visibles dans TOUT le corps de la fonction — y compris à l'intérieur
-- des requêtes SQL imbriquées (la clause RETURNING de l'UPDATE dans le
-- CTE "expired", ET le SELECT final qui lit ce CTE). "amount_fcfa" y
-- désigne alors deux choses à la fois : la colonne de la table
-- vouchers/du CTE, et la variable de sortie du même nom — Postgres refuse
-- de choisir. Qualifier uniquement le SELECT final ne suffit PAS (testé
-- et vérifié) : la RETURNING clause du CTE doit elle aussi être qualifiée
-- explicitement par le nom de la table mise à jour.
--
-- sweep_my_expired_vouchers() était déjà touchée par ce bug depuis son
-- application initiale (20260902220000_add_vouchers.sql) — c'est la
-- fonction utilisée par le sweep paresseux sur les 3 pages voyageur
-- (apps/web/lib/vouchers.ts), donc en production, en échec silencieux
-- côté serveur (l'erreur est catchée et loggée par sweepExpiredVouchers(),
-- jamais montrée au voyageur, mais aucun avoir n'est jamais passé en
-- refund_pending par ce chemin depuis son déploiement).

create or replace function public.sweep_my_expired_vouchers()
returns table (voucher_id uuid, amount_fcfa integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    with expired as (
      update public.vouchers
      set status = 'refund_pending',
          refund_pending_amount_fcfa = vouchers.amount_fcfa,
          refund_pending_at = now()
      where user_id = auth.uid()
        and status = 'active'
        and expires_at <= now()
      returning vouchers.id, vouchers.amount_fcfa
    )
    select expired.id, expired.amount_fcfa from expired;
end;
$$;

create or replace function public.sweep_all_expired_vouchers()
returns table (voucher_id uuid, amount_fcfa integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    with expired as (
      update public.vouchers
      set status = 'refund_pending',
          refund_pending_amount_fcfa = vouchers.amount_fcfa,
          refund_pending_at = now()
      where status = 'active'
        and expires_at <= now()
      returning vouchers.id, vouchers.amount_fcfa
    )
    select expired.id, expired.amount_fcfa from expired;
end;
$$;

-- Grants inchangés (create or replace préserve une signature identique) :
-- sweep_my_expired_vouchers reste "to authenticated",
-- sweep_all_expired_vouchers reste "to service_role" uniquement.
