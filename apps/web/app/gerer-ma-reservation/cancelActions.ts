"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "shared/src/lib/auditLog";

export type CancelFromLookupState = {
  error: string | null;
  notOwned: boolean;
  voucherAmountFcfa: number | null;
  voucherExpiresAt: string | null;
};

const NOT_OWNED_MESSAGE = "Cette réservation ne vous appartient pas";

// Partagée par les boutons "Annuler" et "Modifier" de BookingActions.tsx —
// un champ caché "mode" (posé par lequel des deux a été cliqué) décide du
// seul point de divergence entre les deux : ce qui se passe après une
// annulation réussie.
export async function cancelBookingFromLookup(
  _prevState: CancelFromLookupState,
  formData: FormData
): Promise<CancelFromLookupState> {
  // /gerer-ma-reservation ne réinjecte pas référence/téléphone dans l'URL
  // de retour — décision explicite : le voyageur refait sa recherche une
  // fois connecté. La valeur de retour n'est reprise ici que pour le
  // journal d'audit (chantier 5).
  const user = await requireUser("/gerer-ma-reservation");

  const bookingId = String(formData.get("bookingId") ?? "");
  const mode = String(formData.get("mode") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("cancel_booking", { p_booking_id: bookingId })
    .single<{ voucher_amount_fcfa: number }>();

  if (error) {
    console.error("Impossible d'annuler la réservation (depuis /gerer-ma-reservation) :", error.message);
    return {
      error: error.message,
      notOwned: error.message === NOT_OWNED_MESSAGE,
      voucherAmountFcfa: null,
      voucherExpiresAt: null,
    };
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

  // Chantier 5 — placé AVANT le redirect() de la branche "modify" (qui
  // jette, tout code après lui dans cette branche ne s'exécuterait pas).
  const { data: booking } = await supabase.from("bookings").select("company_id").eq("id", bookingId).maybeSingle<{ company_id: string }>();
  if (booking) {
    await logAuditEvent({
      action: "booking_cancelled",
      bookingId,
      companyId: booking.company_id,
      acteurId: user.sub,
      payload: { voucher_amount_fcfa: data!.voucher_amount_fcfa, mode },
    });
  }

  if (mode === "modify") {
    redirect("/recherche");
  }

  return { error: null, notOwned: false, voucherAmountFcfa: data!.voucher_amount_fcfa, voucherExpiresAt };
}
