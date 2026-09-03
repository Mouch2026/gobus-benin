-- Sweep planifié (pg_cron + pg_net + Edge Function expire-vouchers) en
-- complément du sweep paresseux (sweep_my_expired_vouchers, inchangée,
-- toujours appelée depuis apps/web/lib/vouchers.ts). Le sweep paresseux
-- ne traite un avoir expiré que si le voyageur revisite une page
-- pertinente ; celui-ci traite tous les avoirs expirés de tous les
-- voyageurs, indépendamment du trafic.

-- ============================================================
-- 1. sweep_all_expired_vouchers() — service_role uniquement, jamais
--    grant à authenticated/anon (traite les avoirs de tout le monde,
--    contrairement à sweep_my_expired_vouchers qui reste scopée à
--    auth.uid() et inchangée).
-- ============================================================

create function public.sweep_all_expired_vouchers()
returns table (voucher_id uuid, amount_fcfa integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- La clause "where status = 'active'" est ce qui garantit qu'un avoir
  -- n'est jamais traité deux fois même si le sweep paresseux et ce sweep
  -- planifié tournaient au même instant : l'UPDATE qui gagne la course
  -- bascule le statut hors de 'active' ; l'autre n'affecte alors 0 ligne
  -- pour cet avoir — sémantique MVCC standard, pas de verrou explicite à
  -- ajouter.
  return query
    with expired as (
      update public.vouchers
      set status = 'refund_pending',
          refund_pending_amount_fcfa = vouchers.amount_fcfa,
          refund_pending_at = now()
      where status = 'active'
        and expires_at <= now()
      returning id, amount_fcfa
    )
    select id, amount_fcfa from expired;
end;
$$;

revoke execute on function public.sweep_all_expired_vouchers() from public;
grant execute on function public.sweep_all_expired_vouchers() to service_role;
-- Pas de grant à authenticated/anon : un accès direct exposerait/
-- modifierait les avoirs d'autrui. Seule l'Edge Function
-- expire-vouchers (via le client service_role) doit l'appeler.

-- ============================================================
-- 2. Extensions + programmation
--
-- Disponibilité de pg_cron/pg_net confirmée en direct sur ce projet
-- (pg_available_extensions, lecture seule) avant d'écrire cette
-- migration — pas une supposition.
-- ============================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Fréquence : toutes les 15 minutes — un avoir expiré attend au plus 15
-- minutes avant son passage en refund_pending + l'e-mail, indépendamment
-- du trafic voyageur. Coût négligeable (requête SQL rapide, un appel HTTP
-- local vers l'Edge Function).
--
-- project_url / service_role_key / cron_secret : lus depuis Supabase
-- Vault (vault.decrypted_secrets), jamais en dur ici. Les
-- vault.create_secret(...) correspondants sont exécutés une seule fois,
-- manuellement, dans le SQL Editor du dashboard — jamais dans un fichier
-- de migration commité (ils contiendraient la vraie service_role key et
-- le vrai secret cron). Voir le plan de ce chantier pour les commandes
-- exactes à coller.
--
-- x-cron-secret est la SEULE vraie protection de cette fonction contre un
-- appel externe non autorisé : verify_jwt est désactivé pour
-- expire-vouchers (supabase/config.toml) car il n'aurait rien protégé de
-- plus (la clé anon, publique, est un JWT valide) — voir
-- supabase/functions/expire-vouchers/index.ts, qui vérifie ce même
-- secret (CRON_SECRET, déclaré via `supabase secrets set`) avant toute
-- autre action. Authorization/apikey conservés par prudence (certaines
-- configurations de passerelle Supabase s'y attendent malgré
-- verify_jwt=false), mais ne remplacent pas ce secret.
select cron.schedule(
  'expire-vouchers-every-15-minutes',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/expire-vouchers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
