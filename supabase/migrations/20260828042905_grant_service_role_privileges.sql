-- service_role bypasses RLS (BYPASSRLS role attribute) but, like anon and
-- authenticated, still needs ordinary Postgres GRANTs before it can touch a
-- table at all — discovered when an admin insert into `companies` failed
-- with "permission denied for table companies" even using the service_role
-- key. This project's tables were created without the GRANT ALL ... TO
-- service_role that Supabase normally bootstraps automatically.
--
-- service_role is only ever used from trusted server-side contexts (seed
-- scripts, and the future supabase/functions/create-payment and
-- payment-webhook Edge Functions), so — unlike the narrow, policy-matched
-- grants given to anon/authenticated in 20260828035948_add_missing_grants.sql
-- — it gets full privileges on every table, matching the standard Supabase
-- convention for this role.

grant all on
  public.companies,
  public.routes,
  public.trips,
  public.bookings,
  public.passengers,
  public.payments
to service_role;
