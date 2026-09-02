import "server-only";
import { Resend } from "resend";
import { renderBookingConfirmationEmailHtml } from "./emailTemplate";
import type { BookingConfirmationPayload } from "../types";

// Instancié à l'appel plutôt qu'au chargement du module : RESEND_API_KEY
// est vide par défaut dans .env.local (clé réelle à fournir), et
// `new Resend("")` ne doit faire échouer que l'envoi lui-même — jamais le
// chargement de ce fichier (qui casserait tout le module, pas juste
// l'e-mail).
export async function sendBookingConfirmationEmail(
  payload: BookingConfirmationPayload
): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: payload.recipientEmail,
    subject: `Confirmation de réservation — ${payload.legs[0].bookingReference}`,
    html: renderBookingConfirmationEmailHtml(payload),
  });

  if (error) {
    throw new Error(`Resend a refusé l'envoi : ${error.message}`);
  }
}
