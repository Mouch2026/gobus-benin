import "server-only";
import { buildVoucherRefundPendingPayload } from "./buildVoucherRefundPendingPayload";
import { sendVoucherRefundPendingEmail } from "./channels/voucherRefundPendingEmail";
import { logNotification } from "./notificationLog";
import { supabaseAdmin } from "./supabaseAdmin";
import type { VoucherRefundPendingPayload } from "./types";

// Même forme non bloquante que sendBookingConfirmation/
// sendTripCancellationNotification : appelée après que le sweep (ou
// l'application d'un avoir sur une réservation moins chère) a déjà écrit
// le passage en refund_pending — un échec d'envoi ne doit jamais faire
// échouer cette transition. Restructurée en deux temps (construction du
// payload, puis envoi) pour ne journaliser qu'une fois userId connu.
export async function sendVoucherRefundPendingNotification(target: {
  voucherId: string;
}): Promise<void> {
  // Réclame l'envoi de façon atomique (même idiome que la réclamation
  // d'un avoir à l'application) : si refund_notified_at est déjà
  // renseigné, cet update ne touche aucune ligne et on n'envoie rien de
  // plus — protège contre un rappel en double du sweep ou de
  // l'application d'un avoir sur ce même voucherId.
  let claimed: { id: string } | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("vouchers")
      .update({ refund_notified_at: new Date().toISOString() })
      .eq("id", target.voucherId)
      .is("refund_notified_at", null)
      .select("id")
      .maybeSingle();
    claimed = data;
  } catch (error) {
    console.error("Impossible de réclamer l'envoi de l'avoir en attente de remboursement :", error);
    return;
  }

  if (!claimed) return;

  let payload: VoucherRefundPendingPayload;
  try {
    payload = await buildVoucherRefundPendingPayload(target);
  } catch (error) {
    console.error("Impossible d'envoyer la notification d'avoir en attente de remboursement :", error);
    return;
  }

  let status: "sent" | "failed" = "sent";
  let errorMessage: string | null = null;
  try {
    await sendVoucherRefundPendingEmail(payload);
  } catch (error) {
    console.error("Impossible d'envoyer la notification d'avoir en attente de remboursement :", error);
    status = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  await logNotification({
    userId: payload.userId,
    type: "voucher_refund_pending",
    voucherId: target.voucherId,
    status,
    errorMessage,
  });
}
