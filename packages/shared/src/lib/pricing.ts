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
