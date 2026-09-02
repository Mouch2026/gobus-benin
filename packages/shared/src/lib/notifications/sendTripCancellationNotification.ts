import "server-only";
import { buildTripCancellationPayload } from "./buildTripCancellationPayload";
import { sendTripCancellationEmail } from "./channels/tripCancellationEmail";

// Même forme non bloquante que sendBookingConfirmation : appelée après un
// remboursement déjà effectué (refund_and_cancel_booking), un échec
// d'envoi ne doit jamais faire échouer l'annulation du trajet elle-même.
export async function sendTripCancellationNotification(target: {
  bookingId: string;
}): Promise<void> {
  try {
    const payload = await buildTripCancellationPayload(target);
    await sendTripCancellationEmail(payload);
    // Demain : await sendTripCancellationWhatsApp(payload);
  } catch (error) {
    console.error("Impossible d'envoyer la notification d'annulation de trajet :", error);
  }
}
