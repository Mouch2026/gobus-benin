import "server-only";
import { buildTripCancellationPayload } from "./buildTripCancellationPayload";
import { sendTripCancellationEmail } from "./channels/tripCancellationEmail";
import { logNotification } from "./notificationLog";
import type { TripCancellationPayload } from "./types";

// Même forme non bloquante que sendBookingConfirmation : appelée après un
// remboursement déjà effectué (refund_and_cancel_booking), un échec
// d'envoi ne doit jamais faire échouer l'annulation du trajet elle-même.
// Restructurée en deux temps (construction du payload, puis envoi) pour
// ne journaliser dans notification_log qu'une fois le destinataire
// (userId) réellement connu — si la construction échoue avant, il n'y a
// personne à journaliser.
export async function sendTripCancellationNotification(target: {
  bookingId: string;
}): Promise<void> {
  let payload: TripCancellationPayload;
  try {
    payload = await buildTripCancellationPayload(target);
  } catch (error) {
    console.error("Impossible d'envoyer la notification d'annulation de trajet :", error);
    return;
  }

  let status: "sent" | "failed" = "sent";
  let errorMessage: string | null = null;
  try {
    await sendTripCancellationEmail(payload);
    // Demain : await sendTripCancellationWhatsApp(payload);
  } catch (error) {
    console.error("Impossible d'envoyer la notification d'annulation de trajet :", error);
    status = "failed";
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  await logNotification({
    userId: payload.userId,
    type: "trip_cancellation",
    bookingId: target.bookingId,
    status,
    errorMessage,
  });
}
