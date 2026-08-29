"use server";

import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";

export type NewTripState = { error: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export async function createTrip(
  _prevState: NewTripState,
  formData: FormData
): Promise<NewTripState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const routeId = String(formData.get("routeId") ?? "");
  const seatClass = String(formData.get("seatClass") ?? "");
  const departureDate = String(formData.get("departureDate") ?? "");
  const departureTime = String(formData.get("departureTime") ?? "");
  const priceRaw = String(formData.get("priceFcfa") ?? "");
  const totalSeatsRaw = String(formData.get("totalSeats") ?? "");

  if (!routeId) {
    return { error: "Merci de choisir une route." };
  }
  if (seatClass !== "standard" && seatClass !== "vip") {
    return { error: "Classe invalide." };
  }
  if (!DATE_RE.test(departureDate) || Number.isNaN(new Date(departureDate).getTime())) {
    return { error: "Date de départ invalide." };
  }
  if (!TIME_RE.test(departureTime)) {
    return { error: "Heure de départ invalide." };
  }

  const priceFcfa = Number(priceRaw);
  if (!Number.isInteger(priceFcfa) || priceFcfa < 0) {
    return { error: "Le prix doit être un nombre entier positif ou nul." };
  }

  const totalSeats = Number(totalSeatsRaw);
  if (!Number.isInteger(totalSeats) || totalSeats <= 0) {
    return { error: "Le nombre de places doit être un nombre entier positif." };
  }

  // Anchored to Africa/Porto-Novo (UTC+1, no DST) via an explicit offset,
  // built directly from the raw form strings — never through a Date
  // object first, so no runtime's local timezone (browser or server) can
  // ever get silently baked in. Same precaution as
  // scripts/seed.ts's tomorrowAt8amBenin(), same reason.
  const departureAt = `${departureDate}T${departureTime}:00+01:00`;

  if (new Date(departureAt).getTime() <= Date.now()) {
    return { error: "La date de départ doit être dans le futur." };
  }

  const supabase = await createClient();

  // Friendlier error than the generic RLS rejection if the route belongs
  // to another company — the trigger + RLS combo would reject it either
  // way (see supabase/migrations/20260829123607_add_trip_company_id_trigger.sql),
  // this is purely about the message shown.
  const { data: route, error: routeError } = await supabase
    .from("routes")
    .select("id")
    .eq("id", routeId)
    .eq("company_id", access.company.id)
    .maybeSingle();

  if (routeError || !route) {
    return { error: "Cette route n'existe pas ou ne vous appartient pas." };
  }

  const { data: trip, error: insertError } = await supabase
    .from("trips")
    .insert({
      company_id: access.company.id,
      route_id: routeId,
      seat_class: seatClass,
      departure_at: departureAt,
      price_fcfa: priceFcfa,
      total_seats: totalSeats,
      available_seats: totalSeats, // no bookings exist yet on a brand-new trip
    })
    .select("id")
    .single();

  if (insertError || !trip) {
    console.error("Impossible de créer le trajet :", insertError?.message);
    return { error: "Impossible de créer ce trajet. Réessayez." };
  }

  redirect(`/trajets/${trip.id}`);
}
