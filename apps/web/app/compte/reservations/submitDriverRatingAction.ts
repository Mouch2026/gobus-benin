"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "shared/src/lib/auditLog";

export type SubmitDriverRatingState = { error: string | null; success: boolean };

// Même patron exact que cancelBookingAction.ts : requireUser() ne sert
// qu'à rediriger un visiteur déconnecté, la vraie vérification de
// propriété (et toute la règle d'éligibilité) se fait entièrement à
// l'intérieur de submit_driver_rating() (security definer) — jamais
// confiée à un paramètre côté client.
export async function submitDriverRating(
  _prevState: SubmitDriverRatingState,
  formData: FormData
): Promise<SubmitDriverRatingState> {
  const user = await requireUser();

  const bookingId = String(formData.get("bookingId") ?? "");
  const stars = Number(formData.get("stars"));
  const comment = String(formData.get("comment") ?? "").trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("submit_driver_rating", { p_booking_id: bookingId, p_stars: stars, p_comment: comment })
    .maybeSingle<{ id: string; company_id: string; driver_id: string }>();

  if (error) {
    // Le RPC rédige déjà un message clair pour chaque rejet métier
    // (23514) — 23505 est le seul cas sans message dédié : le filet de
    // sécurité de la contrainte unique(booking_id) sous concurrence
    // (deux clics quasi simultanés), pas un chemin normal.
    if (error.code === "23505") {
      return { error: "Vous avez déjà noté ce chauffeur pour cette réservation.", success: false };
    }
    console.error("Impossible d'enregistrer la note :", error.message);
    return { error: error.message, success: false };
  }

  if (data) {
    await logAuditEvent({
      action: "driver_rating_submitted",
      bookingId,
      companyId: data.company_id,
      acteurId: user.sub,
      payload: { driverId: data.driver_id, stars },
    });
  }

  revalidatePath("/compte/reservations");
  return { error: null, success: true };
}
