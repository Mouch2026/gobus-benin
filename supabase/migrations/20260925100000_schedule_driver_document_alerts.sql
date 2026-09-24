-- Chantier C : planification quotidienne de l'Edge Function
-- driver-document-expiry-alerts. Migration SÉPARÉE de
-- 20260925090000_add_driver_documents.sql : à pousser APRÈS avoir déployé
-- la fonction (`supabase functions deploy driver-document-expiry-alerts`)
-- et posé le secret BACKOFFICE_URL (`supabase secrets set
-- BACKOFFICE_URL=...`). Si le cron s'exécute avant, l'appel HTTP reçoit
-- simplement un 404 : aucun effet, aucune donnée perdue.
--
-- Même patron que expire-vouchers (20260902230000) : URL, clé service_role
-- et secret cron lus depuis Supabase Vault (project_url, service_role_key,
-- cron_secret, déjà créés pour expire-vouchers) — jamais en dur ici. Le
-- secret x-cron-secret est la SEULE vraie protection de la fonction
-- (verify_jwt = false, voir supabase/config.toml : la clé anon, publique,
-- est un JWT valide et n'aurait rien protégé de plus).
--
-- Fréquence : une fois par jour à 06:00 UTC = 07:00 à Porto-Novo (UTC+1,
-- sans changement d'heure). Contrairement aux avoirs (15 min), une alerte
-- de document se compte en jours : plus fréquent n'apporterait rien.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'driver-document-expiry-alerts-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/driver-document-expiry-alerts',
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
