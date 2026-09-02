import "server-only";
import { Resend } from "resend";
import type { BookingConfirmationLeg } from "../types";

// Une notification = une compagnie + les legs qu'elle opère dans cette
// vente (1, ou 2 si elle assure à la fois l'aller et le retour) — jamais
// les legs d'une AUTRE compagnie, même au sein du même aller-retour (voir
// le regroupement par company_id dans sendBookingConfirmation.ts).
export type CompanySaleNotification = {
  companyEmail: string;
  companyName: string;
  travelerPhone: string | null;
  legs: BookingConfirmationLeg[];
};

const PRIMARY = "#F2A900";
const TEXT = "#1a1a1a";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

// Gabarit distinct de emailTemplate.ts (voyageur) : orienté opérationnel,
// pas commercial — référence, trajet, horaires, numéro de bus, nombre de
// places, noms des passagers, téléphone du voyageur. Jamais de prix ni de
// commission : il n'y en a pas sur ce projet (abonnement compagnie, pas de
// commission par billet — voir CLAUDE.md).
function renderCompanySaleEmailHtml(notification: CompanySaleNotification): string {
  const legsHtml = notification.legs
    .map((leg) => {
      const passengersList = leg.passengers.map((p) => p.fullName).join(", ");
      return `
      <div style="border:1px solid ${BORDER};border-radius:12px;padding:20px;margin-bottom:16px;">
        ${leg.legLabel ? `<p style="margin:0 0 4px;color:${PRIMARY};font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Trajet ${leg.legLabel.toLowerCase()}</p>` : ""}
        <p style="margin:0 0 2px;color:${MUTED};font-size:13px;">Référence de réservation</p>
        <p style="margin:0 0 16px;color:${TEXT};font-size:18px;font-weight:800;">${leg.bookingReference}</p>

        <p style="margin:0 0 4px;color:${TEXT};font-size:15px;font-weight:700;">
          ${leg.originCity} → ${leg.destinationCity}
        </p>
        <p style="margin:0 0 12px;color:${MUTED};font-size:14px;">${formatDateTime(leg.departureAt)} · Bus n° ${leg.busNumber}</p>

        <p style="margin:0 0 4px;color:${TEXT};font-size:14px;">
          <strong>${leg.passengers.length}</strong> place${leg.passengers.length > 1 ? "s" : ""} : ${passengersList}
        </p>
      </div>`;
    })
    .join("");

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px 0;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:${PRIMARY};padding:24px;text-align:center;">
        <p style="margin:0;color:#1a1a1a;font-size:18px;font-weight:800;">GoBus Bénin</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 4px;color:${TEXT};font-size:18px;font-weight:800;">Nouvelle vente confirmée</p>
        <p style="margin:0 0 24px;color:${MUTED};font-size:14px;">
          Bonjour ${notification.companyName}, un voyageur vient de réserver et payer.
        </p>

        ${legsHtml}

        <p style="margin:16px 0 0;color:${MUTED};font-size:13px;">
          Téléphone du voyageur : <span style="color:${TEXT};font-weight:600;">${
            notification.travelerPhone ?? "non renseigné"
          }</span>
        </p>
      </div>
    </div>
  </div>`;
}

export async function sendCompanySaleEmail(notification: CompanySaleNotification): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: notification.companyEmail,
    subject: `Nouvelle vente — ${notification.legs.map((leg) => leg.bookingReference).join(", ")}`,
    html: renderCompanySaleEmailHtml(notification),
  });

  if (error) {
    throw new Error(`Resend a refusé l'envoi (compagnie) : ${error.message}`);
  }
}
