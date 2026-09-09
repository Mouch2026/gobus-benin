import "server-only";
import { buildBookingPaymentLinkPayload } from "./buildBookingPaymentLinkPayload";
import { sendBookingPaymentLinkEmail } from "./channels/bookingPaymentLinkEmail";
import { logNotification } from "./notificationLog";
import type { BookingPaymentLinkPayload } from "./types";

// Même forme non bloquante que sendTripCancellationNotification : appelée
// une seule fois, juste après que le back-office a créé la réservation et
// généré le jeton de paiement — un échec d'envoi ne doit jamais faire
// échouer la création de la réservation elle-même (déjà actée à ce
// stade). Pas de réclamation atomique ici (contrairement à
// sendVoucherRefundPendingNotification) : cette notification n'est
// déclenchée qu'une fois, par un seul appelant, jamais par un mécanisme
// concurrent (sweep, trigger) susceptible de la redéclencher.
export async function sendBookingPaymentLinkNotification(target: {
  bookingId: string;
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
    bookingId: target.bookingId,
    status,
    errorMessage,
  });
}
