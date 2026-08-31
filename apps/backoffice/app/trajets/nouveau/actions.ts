"use server";

import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type NewTripState = { error: string | null };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// Route saisie en texte libre côté formulaire — pas de sélecteur contraint
// à une liste. Réutilise la route existante si (company_id, origin_city,
// destination_city) correspond exactement, sinon en crée une à la volée
// (distance_km laissé vide, complétable depuis /routes). Deux soumissions
// concurrentes pour la même paire de villes peuvent toutes les deux
// dépasser le check-then-insert : ce n'est pas grave ici (contrairement à
// l'attribution de sièges, aucune ressource limitée n'est en jeu) — la
// contrainte unique existante (company_id, origin_city, destination_city)
// rejette la seconde insertion avec 23505, et on récupère alors la route
// que l'autre requête vient de créer plutôt que d'échouer.
async function getOrCreateRouteId(
  supabase: SupabaseClient,
  companyId: string,
  originCityRaw: string,
  destinationCityRaw: string
): Promise<string> {
  // Trim internalisé ici (pas seulement chez l'appelant) : le matching et
  // l'insertion doivent utiliser exactement les mêmes valeurs, et cette
  // fonction ne doit pas dépendre de la discipline de chaque futur
  // appelant. Pas de normalisation de casse : "Cotonou" et "cotonou"
  // restent reconnues comme deux villes distinctes (non demandé ici).
  const originCity = originCityRaw.trim();
  const destinationCity = destinationCityRaw.trim();

  const { data: existing } = await supabase
    .from("routes")
    .select("id")
    .eq("company_id", companyId)
    .eq("origin_city", originCity)
    .eq("destination_city", destinationCity)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("routes")
    .insert({
      company_id: companyId,
      origin_city: originCity,
      destination_city: destinationCity,
      distance_km: null,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      // Créée entre-temps par une soumission concurrente pour la même
      // paire de villes — la récupérer plutôt qu'échouer.
      const { data: raceWinner, error: raceError } = await supabase
        .from("routes")
        .select("id")
        .eq("company_id", companyId)
        .eq("origin_city", originCity)
        .eq("destination_city", destinationCity)
        .single();
      if (raceError || !raceWinner) throw insertError;
      return raceWinner.id;
    }
    throw insertError;
  }

  return inserted.id;
}

export async function createTrip(
  _prevState: NewTripState,
  formData: FormData
): Promise<NewTripState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const originCity = String(formData.get("originCity") ?? "").trim();
  const destinationCity = String(formData.get("destinationCity") ?? "").trim();
  const busLayoutId = String(formData.get("busLayoutId") ?? "").trim() || null;
  const seatClass = String(formData.get("seatClass") ?? "");
  const departureDate = String(formData.get("departureDate") ?? "");
  const departureTime = String(formData.get("departureTime") ?? "");
  const priceRaw = String(formData.get("priceFcfa") ?? "");
  const totalSeatsRaw = String(formData.get("totalSeats") ?? "");

  if (!originCity || !destinationCity) {
    return { error: "Merci de renseigner les deux villes." };
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

  let routeId: string;
  try {
    routeId = await getOrCreateRouteId(supabase, access.company.id, originCity, destinationCity);
  } catch (routeError) {
    console.error(
      "Impossible de trouver/créer la route :",
      routeError instanceof Error ? routeError.message : routeError
    );
    return { error: "Impossible de créer ce trajet. Réessayez." };
  }

  const { data: trip, error: insertError } = await supabase
    .from("trips")
    .insert({
      company_id: access.company.id,
      route_id: routeId,
      bus_layout_id: busLayoutId,
      seat_class: seatClass,
      departure_at: departureAt,
      price_fcfa: priceFcfa,
      // If busLayoutId is set, set_trip_seats_from_layout overrides both of
      // these from the layout's seat count regardless of what's submitted
      // here — never trusted from the client, same as company_id.
      total_seats: totalSeats,
      available_seats: totalSeats,
    })
    .select("id")
    .single();

  if (insertError || !trip) {
    console.error("Impossible de créer le trajet :", insertError?.message);
    return { error: "Impossible de créer ce trajet. Réessayez." };
  }

  redirect(`/trajets/${trip.id}`);
}
