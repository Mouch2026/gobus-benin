"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type CancelBookingState = { error: string | null };

// Annule UNE réservation confirmée (pas tout le trajet), scoped à la
// compagnie. cancel_booking_by_company réutilise issue_voucher_and_cancel_booking
// en interne (jamais dupliquée) — même règle que côté voyageur : avoir
// 24h, jamais de remboursement direct. Passe par service_role car
// cancel_booking_by_company n'est pas granted à authenticated (elle
// revérifie elle-même l'appartenance à la compagnie, comme
// mark_voucher_refund_processed).
export async function cancelBooking(
  _prevState: CancelBookingState,
  formData: FormData
): Promise<CancelBookingState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const bookingId = String(formData.get("bookingId") ?? "");
  if (!bookingId) {
    return { error: "Réservation invalide." };
  }

  const { error } = await supabaseAdmin.rpc("cancel_booking_by_company", {
    p_booking_id: bookingId,
    p_company_id: access.company.id,
  });

  if (error) {
    console.error("Impossible d'annuler la réservation :", error.message);
    // 23514 = check_violation : cancel_booking_by_company lève ses propres
    // erreurs métier avec ce code et un message déjà rédigé pour
    // l'utilisateur ("Ce trajet est déjà parti...", "Seule une réservation
    // confirmée..."), remonté tel quel plutôt que masqué par un message
    // générique.
    if (error.code === "23514") {
      return { error: error.message };
    }
    return { error: "Impossible d'annuler cette réservation. Réessayez." };
  }

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${bookingId}`);
  return { error: null };
}
