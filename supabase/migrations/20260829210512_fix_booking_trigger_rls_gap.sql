-- Bug found via the first-ever real end-to-end booking test in this
-- project (nothing had ever inserted into public.bookings before now).
--
-- Root cause, confirmed empirically (not guessed): reserve_trip_seats(),
-- adjust_trip_seats_on_booking_status_change() and
-- generate_booking_reference() are plain `language plpgsql` functions with
-- no `security definer` — they run under the CALLING role's own RLS
-- context, not the trigger owner's. A traveler booking a seat is, by
-- definition, never the trip's owning company, and trips_update_owner
-- restricts UPDATE to is_company_owner(company_id). So
-- reserve_trip_seats()'s internal
-- `update trips set available_seats = ... where id = ...` was silently
-- filtered by RLS to zero matching rows for any real traveler — not a
-- permission error, just "0 rows affected" — which the function then
-- (correctly, given what it could see) reported as "not enough seats",
-- regardless of the trip's actual availability.
--
-- Verified directly: the exact same insert failed with 23514 for an
-- ordinary traveler against a freshly created trip with 10/10 seats free,
-- and succeeded for the trip's own company-owner account — the only
-- difference between the two calls was is_company_owner(company_id).
--
-- Fix: security definer + a locked search_path, same pattern already used
-- for is_company_owner() in the core migration, on every trigger function
-- that needs to touch trips.available_seats or check booking_reference
-- uniqueness across the whole table on behalf of a caller who isn't
-- necessarily the company owner. None of these take user-controlled
-- table/column names or run dynamic SQL, so this doesn't introduce a new
-- class of risk beyond what is_company_owner() already accepts.
--
-- generate_booking_reference() gets the same fix for a related but softer
-- reason: its own "does this candidate already exist" pre-check
-- (`select 1 from bookings where booking_reference = candidate`) was only
-- ever checking rows visible under bookings_select_own_or_company —
-- i.e. never seeing other travelers' bookings — so it could return a
-- candidate that in fact already existed. The column's UNIQUE constraint
-- was always the real correctness guarantee (per that function's own
-- comment), so this never risked a duplicate reference reaching the
-- table — just more avoidable retries on collision.

alter function public.reserve_trip_seats()
  security definer set search_path = public;

alter function public.adjust_trip_seats_on_booking_status_change()
  security definer set search_path = public;

alter function public.generate_booking_reference()
  security definer set search_path = public;
