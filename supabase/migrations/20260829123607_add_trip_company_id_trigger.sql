-- trips.company_id consistency (mirrors set_booking_company_id in
-- 20260825060934_create_core_schema.sql, same rationale).
--
-- Gap found while building trip creation in the back-office: nothing
-- currently stops a trip from being inserted with a company_id that
-- doesn't match the actual owner of its route_id. This trigger derives
-- company_id from routes instead of trusting client input.
--
-- Combined with the existing "trips_insert_owner" RLS policy
-- (with check (is_company_owner(company_id))), this also closes a
-- real access-control gap, not just a data-consistency one: if a company
-- submits another company's route_id, this trigger sets company_id to
-- that route's *actual* owner — and the RLS check then rejects the
-- insert, since the submitting user isn't that owner. Without this
-- trigger, a client-supplied company_id could otherwise pass RLS while
-- pointing at a route it doesn't own.

create function public.set_trip_company_id()
returns trigger
language plpgsql
as $$
begin
  select company_id into new.company_id
  from public.routes
  where id = new.route_id;
  return new;
end;
$$;

create trigger set_trip_company_id before insert or update of route_id on public.trips
  for each row execute function public.set_trip_company_id();
