"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";

export type CancelBookingState = {
  error: string | null;
  voucherAmountFcfa: number | null;
  voucherExpiresAt: string | null;
};

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
    .single<{ voucher_amount_fcfa: number }>();

  if (error) {
    // Les messages levés par le RPC (23514 / check_violation) sont déjà
    // rédigés pour l'affichage direct au voyageur.
    console.error("Impossible d'annuler la réservation :", error.message);
    return { error: error.message, voucherAmountFcfa: null, voucherExpiresAt: null };
  }

  // cancel_booking() ne renvoie que le montant — l'avoir lui-même vient
  // d'être créé (issue_voucher_and_cancel_booking), on relit sa date
  // d'expiration pour l'afficher au voyageur (RLS le limite déjà à ses
  // propres avoirs).
  let voucherExpiresAt: string | null = null;
  if (data!.voucher_amount_fcfa > 0) {
    const { data: voucher } = await supabase
      .from("vouchers")
      .select("expires_at")
      .eq("origin_booking_id", bookingId)
      .maybeSingle<{ expires_at: string }>();
    voucherExpiresAt = voucher?.expires_at ?? null;
  }

  revalidatePath(`/reservation/${bookingId}/succes`);
  return { error: null, voucherAmountFcfa: data!.voucher_amount_fcfa, voucherExpiresAt };
}
