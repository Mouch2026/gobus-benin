"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";

export type BookingState = { error: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createBooking(
  _prevState: BookingState,
  formData: FormData
): Promise<BookingState> {
  const tripId = String(formData.get("tripId") ?? "");

  if (!UUID_RE.test(tripId)) {
    return { error: "Ce trajet n'existe pas." };
  }

  const user = await requireUser(`/recherche/${tripId}`);

  const seatCount = Number(formData.get("seatCount"));
  const passengerName = String(formData.get("passengerName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!Number.isInteger(seatCount) || seatCount <= 0) {
    return { error: "Le nombre de places doit être un nombre entier positif." };
  }
  if (!passengerName) {
    return { error: "Merci de renseigner le nom du voyageur." };
  }
  if (!phone) {
    return { error: "Merci de renseigner un numéro de téléphone." };
  }

  const supabase = await createClient();

  // Never trust a client-computed total — re-read the trip's current price
  // ourselves, exactly like the back-office trip form never trusts a
  // client-supplied available_seats.
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("price_fcfa")
    .eq("id", tripId)
    .maybeSingle();

  if (tripError || !trip) {
    return { error: "Ce trajet n'existe pas ou n'est plus disponible." };
  }

  const totalPriceFcfa = trip.price_fcfa * seatCount;

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      trip_id: tripId,
      user_id: user.sub,
      seat_count: seatCount,
      total_price_fcfa: totalPriceFcfa,
    })
    .select("id")
    .single();

  if (bookingError || !booking) {
    // 23514 = check_violation, raised by reserve_trip_seats when there
    // aren't enough seats left (or, in principle, a price mismatch — but
    // totalPriceFcfa is computed honestly above, so in practice this is
    // always the seats case for a real user).
    if (bookingError?.code === "23514") {
      return { error: "Plus assez de places disponibles sur ce trajet. Réessayez avec moins de places." };
    }
    console.error("Impossible de créer la réservation :", bookingError?.message);
    return { error: "Impossible de créer votre réservation. Réessayez." };
  }

  const { error: passengerError } = await supabase
    .from("passengers")
    .insert({ booking_id: booking.id, full_name: passengerName, phone });

  if (passengerError) {
    // The booking itself succeeded and already holds the seats — don't
    // leave the traveler stuck with no way forward. They can still pay;
    // the missing passenger detail is a real gap but not one to invent a
    // rollback for here (bookings has no delete policy by design — seat
    // release goes through the cancellation path, not a raw delete).
    console.error("Réservation créée mais passager non enregistré :", passengerError.message);
  }

  redirect(`/reservation/${booking.id}/paiement`);
}
