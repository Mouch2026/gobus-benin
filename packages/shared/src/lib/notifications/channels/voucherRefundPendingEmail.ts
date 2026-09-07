import "server-only";
import { Resend } from "resend";
import type { VoucherRefundPendingPayload } from "../types";

const PRIMARY = "#F2A900";
const TEXT = "#1a1a1a";
const MUTED = "#6b7280";

function formatFcfa(amount: number): string {
  return new Intl.NumberFormat("fr-BJ", { maximumFractionDigits: 0 }).format(amount) + " FCFA";
}

// Gabarit distinct de emailTemplate.ts et tripCancellationEmail.ts — un
// seul texte pour les deux façons d'arriver ici (avoir expiré sans
// utilisation, ou reliquat après utilisation sur une réservation moins
// chère) : le voyageur n'a pas besoin de savoir laquelle, seulement
// combien lui revient et sous quel délai.
function renderVoucherRefundPendingEmailHtml(payload: VoucherRefundPendingPayload): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px 0;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:${PRIMARY};padding:24px;text-align:center;">
        <p style="margin:0;color:#1a1a1a;font-size:18px;font-weight:800;">GoBus Bénin</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 4px;color:${TEXT};font-size:20px;font-weight:800;">
          Votre avoir passe en remboursement
        </p>
        <p style="margin:0 0 20px;color:${MUTED};font-size:14px;">
          L'avoir associé à votre réservation ${payload.originBookingReference} n'a pas été
          utilisé (ou seulement en partie) dans le délai de 24h. Son solde va vous être
          remboursé.
        </p>

        <div style="border-radius:12px;background:${PRIMARY}1a;padding:16px 20px;">
          <p style="margin:0 0 4px;color:${TEXT};font-size:15px;font-weight:700;">
            ${formatFcfa(payload.amountFcfa)} en attente de remboursement.
          </p>
          <p style="margin:0;color:${TEXT};font-size:13px;">
            Délai indicatif : 7 jours.
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

export async function sendVoucherRefundPendingEmail(payload: VoucherRefundPendingPayload): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: payload.recipientEmail,
    subject: `Votre avoir passe en remboursement — ${payload.originBookingReference}`,
    html: renderVoucherRefundPendingEmailHtml(payload),
  });

  if (error) {
    throw new Error(`Resend a refusé l'envoi (avoir en attente de remboursement) : ${error.message}`);
  }
}
