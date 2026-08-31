"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";

export type RouteFormState = { error: string | null };

export async function createRoute(
  _prevState: RouteFormState,
  formData: FormData
): Promise<RouteFormState> {
  // Defense in depth: a Server Action is a public endpoint even though
  // only this page's form is meant to call it — same reasoning already
  // applied to requireUser()/requireCompany() elsewhere in this app.
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const originCity = String(formData.get("originCity") ?? "").trim();
  const destinationCity = String(formData.get("destinationCity") ?? "").trim();
  const distanceKmRaw = String(formData.get("distanceKm") ?? "");
  const durationMinutesRaw = String(formData.get("durationMinutes") ?? "").trim();
  const lineNumberRaw = String(formData.get("lineNumber") ?? "").trim();
  const lineNumber = lineNumberRaw || null;

  if (!originCity || !destinationCity) {
    return { error: "Merci de renseigner les deux villes." };
  }

  const distanceKm = Number(distanceKmRaw);
  if (!Number.isInteger(distanceKm) || distanceKm <= 0) {
    return { error: "La distance doit être un nombre entier positif de kilomètres." };
  }

  let durationMinutes: number | null = null;
  if (durationMinutesRaw) {
    durationMinutes = Number(durationMinutesRaw);
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      return { error: "La durée doit être un nombre entier positif de minutes (ou laissée vide)." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.from("routes").insert({
    company_id: access.company.id,
    origin_city: originCity,
    destination_city: destinationCity,
    distance_km: distanceKm,
    duration_minutes: durationMinutes,
    line_number: lineNumber,
  });

  if (error) {
    // 23505 = unique_violation on unique(company_id, origin_city, destination_city).
    if (error.code === "23505") {
      return { error: "Cette route existe déjà pour votre compagnie." };
    }
    console.error("Impossible de créer la route :", error.message);
    return { error: "Impossible de créer cette route. Réessayez." };
  }

  revalidatePath("/routes");
  return { error: null };
}
