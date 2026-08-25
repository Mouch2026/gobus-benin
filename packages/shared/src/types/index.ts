export type SeatClass = "standard" | "vip";

export interface Trip {
  id: string;
  originCity: string;
  destinationCity: string;
  distanceKm: number;
  departureTime: string;
}

export interface Booking {
  id: string;
  tripId: string;
  seatClass: SeatClass;
  passengerName: string;
  priceFcfa: number;
}
