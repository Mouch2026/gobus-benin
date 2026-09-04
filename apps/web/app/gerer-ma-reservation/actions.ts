"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type PassengerSummary = {
  id: string;
  full_name: string;
  seat_number: string | null;
};

export type PaymentSummary = {
  base_amount_fcfa: number;
  status: string;
};

export type BookingSummary = {
  id: string;
  booking_reference: string;
  leg: "outbound" | "return" | null;
  status: string;
  total_price_fcfa: number;
  trips: {
    departure_at: string;
    arrival_at: string | null;
    bus_number: string;
    routes: { origin_city: string; destination_city: string };
  } | null;
  passengers: PassengerSummary[];
  payments: PaymentSummary[];
};

type BookingWithGroup = BookingSummary & { booking_group_id: string | null; phone: string | null };

export type LookupState =
  | { error: string | null; booking: null; siblingBooking: null }
  | { error: null; booking: BookingSummary; siblingBooking: BookingSummary | null };

// Public, no-auth lookup — a visitor proves they know a booking by
// supplying its reference AND the phone attached to it. Never
// distinguishes "reference doesn't exist" from "reference exists but
// phone doesn't match": both collapse into the exact same generic
// message, decided from a single query, so there's no logical or timing
// side-channel to tell them apart.
export async function lookupBooking(
  _prevState: LookupState,
  formData: FormData
): Promise<LookupState> {
  const reference = String(formData.get("reference") ?? "").trim().toUpperCase();
  const phone = String(formData.get("phone") ?? "").trim().replace(/\s+/g, "");

  if (!reference || !phone) {
    return {
      error: "Merci de renseigner la référence et le numéro de téléphone.",
      booking: null,
      siblingBooking: null,
    };
  }

  // One round-trip decides everything: `booking` is null if the reference
  // doesn't exist; the phone comparison below is false if it exists but
  // belongs to someone else. Both fall through to the exact same branch.
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, booking_reference, booking_group_id, leg, status, total_price_fcfa, phone, trips(departure_at, arrival_at, bus_number, routes(origin_city, destination_city)), passengers(id, full_name, seat_number), payments(base_amount_fcfa, status)"
    )
    .eq("booking_reference", reference)
    .maybeSingle<BookingWithGroup>();

  const phoneMatches = booking?.phone?.replace(/\s+/g, "") === phone;

  if (!booking || !phoneMatches) {
    return {
      error: "Aucune réservation ne correspond à ces informations.",
      booking: null,
      siblingBooking: null,
    };
  }

  let siblingBooking: BookingSummary | null = null;
  if (booking.booking_group_id) {
    // No separate phone check on the sibling leg: belonging to the same
    // booking_group_id as an already-proven booking is sufficient trust —
    // create_round_trip_booking() inserts the same phone on both legs at
    // creation time anyway.
    const { data } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, booking_reference, leg, status, total_price_fcfa, trips(departure_at, arrival_at, bus_number, routes(origin_city, destination_city)), passengers(id, full_name, seat_number), payments(base_amount_fcfa, status)"
      )
      .eq("booking_group_id", booking.booking_group_id)
      .neq("id", booking.id)
      .maybeSingle<BookingSummary>();
    siblingBooking = data;
  }

  const { booking_group_id: _groupId, phone: _phone, ...bookingSummary } = booking;

  return { error: null, booking: bookingSummary, siblingBooking };
}
