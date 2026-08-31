"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";

export type EditTripState = { error: string | null };

type TripForEdit = {
  id: string;
  company_id: string;
  departure_at: string;
  total_seats: number;
  available_seats: number;
  status: string;
  route_id: string;
};

async function getOwnedTrip(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  companyId: string
): Promise<TripForEdit | null> {
  const { data, error } = await supabase
    .from("trips")
    .select("id, company_id, departure_at, total_seats, available_seats, status, route_id")
    .eq("id", tripId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger le trajet :", error.message);
    return null;
  }

  return data;
}

export async function updateTripDetails(
  _prevState: EditTripState,
  formData: FormData
): Promise<EditTripState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const tripId = String(formData.get("tripId") ?? "");
  const priceRaw = String(formData.get("priceFcfa") ?? "");
  const totalSeatsRaw = String(formData.get("totalSeats") ?? "");
  const busNumber = String(formData.get("busNumber") ?? "").trim();

  const priceFcfa = Number(priceRaw);
  if (!Number.isInteger(priceFcfa) || priceFcfa < 0) {
    return { error: "Le prix doit être un nombre entier positif ou nul." };
  }

  if (!busNumber) {
    return { error: "Merci de renseigner le numéro du bus." };
  }

  const newTotalSeats = Number(totalSeatsRaw);
  if (!Number.isInteger(newTotalSeats) || newTotalSeats <= 0) {
    return { error: "Le nombre de places doit être un nombre entier positif." };
  }

  const supabase = await createClient();
  const trip = await getOwnedTrip(supabase, tripId, access.company.id);

  if (!trip) {
    return { error: "Ce trajet n'existe pas ou ne vous appartient pas." };
  }

  if (new Date(trip.departure_at).getTime() <= Date.now()) {
    return { error: "Ce trajet est déjà parti, il ne peut plus être modifié." };
  }

  // The real invariant to preserve when changing capacity is the number of
  // *already-booked* seats (total_seats - available_seats) — not just
  // available_seats <= total_seats (that constraint alone would still
  // pass if total_seats is dropped below what's already booked, as long
  // as available_seats isn't touched). booked must stay constant across
  // this edit; only the free/total split moves.
  const booked = trip.total_seats - trip.available_seats;
  if (newTotalSeats < booked) {
    return {
      error: `Vous ne pouvez pas réduire à moins de ${booked} places : ${booked} sont déjà réservées.`,
    };
  }
  const newAvailableSeats = newTotalSeats - booked;

  const { error: updateError } = await supabase
    .from("trips")
    .update({
      price_fcfa: priceFcfa,
      total_seats: newTotalSeats,
      available_seats: newAvailableSeats,
      bus_number: busNumber,
    })
    .eq("id", tripId);

  if (updateError) {
    // 23514 = check_violation — backstop against a genuine race (e.g. a
    // booking landing between our read above and this write). The
    // pre-check above should make this unreachable in the normal case.
    if (updateError.code === "23514") {
      return { error: "Une réservation vient d'être faite entre-temps. Réessayez." };
    }
    console.error("Impossible de mettre à jour le trajet :", updateError.message);
    return { error: "Impossible de mettre à jour ce trajet. Réessayez." };
  }

  revalidatePath(`/trajets/${tripId}`);
  revalidatePath("/");
  return { error: null };
}

// Départ/Arrivée/Distance/Numéro de ligne appartiennent à la route
// (routes), pas au trajet — un simple UPDATE sur la ligne routes partagée
// suffit à répercuter la correction sur TOUS les trajets qui la
// référencent, sans boucle ni duplication. Pas de garde-fou "trajet déjà
// parti" ici (contrairement à updateTripDetails) : la route est partagée
// entre potentiellement plusieurs trajets à des dates différentes, l'état
// de CE trajet précis n'a pas de sens comme condition pour bloquer une
// correction qui vaut aussi pour d'autres trajets encore à venir.
export async function updateTripRoute(
  _prevState: EditTripState,
  formData: FormData
): Promise<EditTripState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const tripId = String(formData.get("tripId") ?? "");
  const originCity = String(formData.get("originCity") ?? "").trim();
  const destinationCity = String(formData.get("destinationCity") ?? "").trim();
  const distanceKmRaw = String(formData.get("distanceKm") ?? "").trim();
  const lineNumberRaw = String(formData.get("lineNumber") ?? "").trim();

  if (!originCity || !destinationCity) {
    return { error: "Merci de renseigner les deux villes." };
  }

  let distanceKm: number | null = null;
  if (distanceKmRaw) {
    distanceKm = Number(distanceKmRaw);
    if (!Number.isInteger(distanceKm) || distanceKm <= 0) {
      return { error: "La distance doit être un nombre entier positif de kilomètres (ou laissée vide)." };
    }
  }
  const lineNumber = lineNumberRaw || null;

  const supabase = await createClient();
  const trip = await getOwnedTrip(supabase, tripId, access.company.id);

  if (!trip) {
    return { error: "Ce trajet n'existe pas ou ne vous appartient pas." };
  }

  const { error: updateError } = await supabase
    .from("routes")
    .update({
      origin_city: originCity,
      destination_city: destinationCity,
      distance_km: distanceKm,
      line_number: lineNumber,
    })
    .eq("id", trip.route_id);

  if (updateError) {
    // 23505 = unique_violation sur (company_id, origin_city,
    // destination_city) : la correction ferait correspondre cette route à
    // une autre route déjà existante de la même compagnie. On refuse
    // plutôt que de fusionner silencieusement ou d'échouer avec une
    // erreur Postgres brute — la compagnie garde le contrôle.
    if (updateError.code === "23505") {
      return {
        error:
          "Cette combinaison de villes correspond déjà à une autre route de votre compagnie. Modifiez cette autre route à la place, ou choisissez des noms de ville différents.",
      };
    }
    console.error("Impossible de mettre à jour la route :", updateError.message);
    return { error: "Impossible de mettre à jour cette route. Réessayez." };
  }

  revalidatePath(`/trajets/${tripId}`);
  revalidatePath("/");
  return { error: null };
}

export async function cancelTrip(
  _prevState: EditTripState,
  formData: FormData
): Promise<EditTripState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const tripId = String(formData.get("tripId") ?? "");

  const supabase = await createClient();
  const trip = await getOwnedTrip(supabase, tripId, access.company.id);

  if (!trip) {
    return { error: "Ce trajet n'existe pas ou ne vous appartient pas." };
  }

  if (trip.status === "cancelled" || trip.status === "completed") {
    return { error: "Ce trajet ne peut plus être annulé." };
  }

  const { error: updateError } = await supabase
    .from("trips")
    .update({ status: "cancelled" })
    .eq("id", tripId);

  if (updateError) {
    console.error("Impossible d'annuler le trajet :", updateError.message);
    return { error: "Impossible d'annuler ce trajet. Réessayez." };
  }

  revalidatePath(`/trajets/${tripId}`);
  revalidatePath("/");
  return { error: null };
}
