"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";

export type CancelBookingState = { error: string | null; refundedAmountFcfa: number | null };

// Partagé par les deux écrans de succès (aller simple et par leg sur un
// aller-retour) — un seul booking_id à la fois, jamais de connaissance de
// booking_group_id ici : annuler un leg ne touche jamais l'autre.
export async function cancelBooking(
  _prevState: CancelBookingState,
  formData: FormData
): Promise<CancelBookingState> {
  // Juste pour rediriger un visiteur déconnecté — la vraie vérification
  // de propriété se fait via auth.uid() à l'intérieur de cancel_booking()
  // (security definer), jamais confiée à un paramètre côté client.
  await requireUser();

  const bookingId = String(formData.get("bookingId") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("cancel_booking", { p_booking_id: bookingId })
    .single<{ refunded_amount_fcfa: number }>();

  if (error) {
    // Les messages levés par le RPC (23514 / check_violation) sont déjà
    // rédigés pour l'affichage direct au voyageur.
    console.error("Impossible d'annuler la réservation :", error.message);
    return { error: error.message, refundedAmountFcfa: null };
  }

  revalidatePath(`/reservation/${bookingId}/succes`);
  return { error: null, refundedAmountFcfa: data!.refunded_amount_fcfa };
}
