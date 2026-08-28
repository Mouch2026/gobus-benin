import type { SeatClass } from "../types";

const BASE_FARE_FCFA = 500;
const RATE_PER_KM_FCFA = 25;

const SEAT_CLASS_MULTIPLIER: Record<SeatClass, number> = {
  standard: 1,
  vip: 1.5,
};

export interface PricingInput {
  distanceKm: number;
  seatClass?: SeatClass;
}

export function calculateTripPrice({
  distanceKm,
  seatClass = "standard",
}: PricingInput): number {
  const multiplier = SEAT_CLASS_MULTIPLIER[seatClass];
  return Math.round((BASE_FARE_FCFA + distanceKm * RATE_PER_KM_FCFA) * multiplier);
}

export interface BookingTotalInput {
  unitPriceFcfa: number;
  seatCount: number;
}

// Mirrors the check in the `reserve_trip_seats` trigger
// (supabase/migrations/20260825060934_create_core_schema.sql), which is the
// actual source of truth: it re-validates total_price_fcfa server-side
// against trips.price_fcfa and rejects the insert if a client-sent total
// doesn't match. This function only exists so every client-side price
// preview (web, mobile, back-office) uses the same formula instead of each
// re-deriving it.
export function calculateBookingTotal({ unitPriceFcfa, seatCount }: BookingTotalInput): number {
  return unitPriceFcfa * seatCount;
}
