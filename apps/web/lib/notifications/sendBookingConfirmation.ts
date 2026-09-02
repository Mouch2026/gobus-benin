import "server-only";
import { buildBookingConfirmationPayload } from "./buildBookingConfirmationPayload";
import { sendBookingConfirmationEmail } from "./channels/email";

// Point d'entrée générique : "envoyer une confirmation de réservation",
// pas "envoyer un e-mail". Un futur canal WhatsApp s'ajoute ici (une
// ligne de plus), sans toucher aux deux Server Actions de paiement qui
// appellent cette fonction — elles ne connaissent que "confirmation
// envoyée ou pas", jamais le détail des canaux.
export async function sendBookingConfirmation(
  target: { bookingId: string } | { bookingGroupId: string }
): Promise<void> {
  try {
    const payload = await buildBookingConfirmationPayload(target);
    await sendBookingConfirmationEmail(payload);
    // Demain : await sendBookingConfirmationWhatsApp(payload);
  } catch (error) {
    // Ne relance jamais : appelée après un paiement déjà approuvé, un
    // échec d'envoi ne doit jamais faire échouer la réservation elle-même.
    // Le try/catch vit ici (pas chez les appelants) précisément pour que
    // ceux-ci n'aient rien à dupliquer — juste un `await` avant leur
    // redirect().
    console.error("Impossible d'envoyer la confirmation de réservation :", error);
  }
}
