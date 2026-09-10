import "server-only";
import { buildBookingPaymentLinkPayload } from "./buildBookingPaymentLinkPayload";
import { sendBookingPaymentLinkEmail } from "./channels/bookingPaymentLinkEmail";
import { logNotification } from "./notificationLog";
import type { BookingPaymentLinkPayload } from "./types";

// Même forme non bloquante que sendTripCancellationNotification : appelée
// une fois par PART de paiement "par lien" créée (Mobile Money ou Carte —
// une réservation scindée peut en avoir plusieurs, chacune avec son
// propre jeton) — un échec d'envoi ne doit jamais faire échouer la
// création de la réservation elle-même (déjà actée à ce stade). Pas de
// réclamation atomique ici (contrairement à
// sendVoucherRefundPendingNotification) : chaque part ne déclenche cette
// notification qu'une fois, jamais par un mécanisme concurrent (sweep,
// trigger) susceptible de la redéclencher.
export async function sendBookingPaymentLinkNotification(target: {
  paymentId: string;
}): Promise<void> {
  let payload: BookingPaymentLinkPayload;
  try {
    payload = await buildBookingPaymentLinkPayload(target);
  } catch (error) {
    console.error("Impossible d'envoyer la notification de lien de paiement :", error);
    return;
  }

  let status: "sent" | "failed" = "sent";
  let errorMessage: string | null = null;
  try {
    await sendBookingPaymentLinkEmail(payload);
  } catch (error) {
    console.error("Impossible d'envoyer la notification de lien de paiement :", error);
    status = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  await logNotification({
    userId: payload.userId,
    type: "booking_payment_link",
    bookingId: payload.bookingId,
    status,
    errorMessage,
  });
}
