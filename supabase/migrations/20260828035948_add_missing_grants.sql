-- RLS policies restrict *rows*, but PostgREST still requires an ordinary
-- Postgres GRANT before a role may touch a table at all — RLS alone does
-- not imply access. 20260825060934_create_core_schema.sql defined the
-- policies but never granted the underlying table privileges, so anon and
-- authenticated currently get "permission denied" on every table. This
-- migration adds exactly the grants those existing policies assume,
-- without widening what they actually allow (the policies still gate every
-- row).

-- anon: public read-only access to the publicly browsable catalog.
grant select on public.companies, public.routes, public.trips to anon;

-- authenticated: same public read access, plus the write surface the
-- "_owner" policies (companies/routes/trips) and the customer/company
-- policies (bookings, passengers, payments) already scope by row.
grant select on public.companies, public.routes, public.trips to authenticated;
grant insert, update, delete on public.companies, public.routes, public.trips to authenticated;
grant select, insert, update on public.bookings, public.passengers to authenticated;
grant select on public.payments to authenticated;

-- No grants at all for anon on bookings/passengers/payments: those tables
-- must stay invisible to unauthenticated requests, not merely
-- policy-filtered to zero rows.
