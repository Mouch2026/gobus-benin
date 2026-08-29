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

// Traveler-side service fees, on top of the base price the company sets
// and keeps in full (no commission is taken from companies — see
// supabase/migrations/20260829020406_add_subscription_billing.sql for the
// subscription model that replaces it). Named constants, not inlined
// percentages, so the rates can change without touching the calculation
// logic — mirrored in payments.base_amount_fcfa /
// payments.platform_fee_fcfa / payments.transaction_fee_fcfa
// (supabase/migrations/20260829020408_add_payment_fee_breakdown.sql).
export const PLATFORM_FEE_RATE = 0.027; // ~2.7%, platform revenue
export const TRANSACTION_FEE_RATE = 0.013; // ~1.3%, passed through to the payment provider

export interface ServiceFees {
  platformFeeFcfa: number;
  transactionFeeFcfa: number;
  totalFcfa: number;
}

export function calculateServiceFees(baseAmountFcfa: number): ServiceFees {
  const platformFeeFcfa = Math.round(baseAmountFcfa * PLATFORM_FEE_RATE);
  const transactionFeeFcfa = Math.round(baseAmountFcfa * TRANSACTION_FEE_RATE);
  return {
    platformFeeFcfa,
    transactionFeeFcfa,
    totalFcfa: baseAmountFcfa + platformFeeFcfa + transactionFeeFcfa,
  };
}

// GoBus Points: 1 point per 100 FCFA of *base* price (bookings.total_price_fcfa,
// before service fees) — the traveler isn't rewarded on the platform's own
// fees. The real award happens server-side in the
// award_points_on_payment_approved trigger (see
// supabase/migrations/*_add_points_program.sql) at the moment a payment is
// approved; this function only exists so the client-side "you'll earn N
// points" preview uses the same rate. No SQL trigger can import this file,
// so the rate is duplicated there — if it ever changes, change it in both
// places.
export const POINTS_PER_FCFA_SPENT = 1 / 100;

export function calculatePointsEarned(baseAmountFcfa: number): number {
  return Math.floor(baseAmountFcfa * POINTS_PER_FCFA_SPENT);
}
