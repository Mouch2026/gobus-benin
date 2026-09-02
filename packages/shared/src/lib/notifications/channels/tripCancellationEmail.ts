import "server-only";
import { Resend } from "resend";
import type { TripCancellationPayload } from "../types";

const PRIMARY = "#F2A900";
const TEXT = "#1a1a1a";
const MUTED = "#6b7280";

function formatFcfa(amount: number): string {
  return new Intl.NumberFormat("fr-BJ", { maximumFractionDigits: 0 }).format(amount) + " FCFA";
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

// Gabarit distinct de emailTemplate.ts (confirmation) — pas un
// détournement. Ton clairement différent : ceci annonce une mauvaise
// nouvelle (trajet annulé par la compagnie), pas une confirmation
// enthousiaste.
function renderTripCancellationEmailHtml(payload: TripCancellationPayload): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px 0;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:${PRIMARY};padding:24px;text-align:center;">
        <p style="margin:0;color:#1a1a1a;font-size:18px;font-weight:800;">GoBus Bénin</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 4px;color:${TEXT};font-size:20px;font-weight:800;">
          Votre trajet a été annulé
        </p>
        <p style="margin:0 0 20px;color:${MUTED};font-size:14px;">
          La compagnie ${payload.companyName} a annulé ce trajet. Voici les détails et votre
          remboursement.
        </p>

        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
          <p style="margin:0 0 2px;color:${MUTED};font-size:13px;">Référence de réservation</p>
          <p style="margin:0 0 16px;color:${TEXT};font-size:18px;font-weight:800;">${payload.bookingReference}</p>

          <p style="margin:0 0 4px;color:${TEXT};font-size:15px;font-weight:700;">
            ${payload.originCity} → ${payload.destinationCity}
          </p>
          <p style="margin:0;color:${MUTED};font-size:14px;">${formatDateTime(payload.departureAt)}</p>
        </div>

        <div style="border-radius:12px;background:${PRIMARY}1a;padding:16px 20px;">
          <p style="margin:0;color:${TEXT};font-size:15px;font-weight:700;">
            ${formatFcfa(payload.refundedAmountFcfa)} vous ont été remboursés intégralement.
          </p>
        </div>

        <div style="text-align:center;margin-top:24px;">
          <a href="${payload.manageUrl}" style="display:inline-block;background:${PRIMARY};color:#1a1a1a;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;">
            Consulter mes réservations
          </a>
        </div>
      </div>
    </div>
  </div>`;
}

export async function sendTripCancellationEmail(payload: TripCancellationPayload): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: payload.recipientEmail,
    subject: `Trajet annulé — ${payload.bookingReference}`,
    html: renderTripCancellationEmailHtml(payload),
  });

  if (error) {
    throw new Error(`Resend a refusé l'envoi (annulation de trajet) : ${error.message}`);
  }
}
