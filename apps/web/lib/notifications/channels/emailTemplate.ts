import type { BookingConfirmationLeg, BookingConfirmationPayload } from "../types";

// Styles inline partout : obligatoire pour un rendu correct dans les
// clients mail (pas de <style> externe fiable). Couleur signature "Or du
// Bénin" (#F2A900) — pas de rose/logo OUIGO.
const PRIMARY = "#F2A900";
const TEXT = "#1a1a1a";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

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

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

function renderLegSection(leg: BookingConfirmationLeg): string {
  const schedule = leg.arrivalAt
    ? `${formatTime(leg.departureAt)} → ${formatTime(leg.arrivalAt)} (${formatDateTime(leg.departureAt)})`
    : formatDateTime(leg.departureAt);

  const passengersRows = leg.passengers
    .map(
      (p) => `
        <tr>
          <td style="padding:6px 0;color:${TEXT};font-size:14px;">${p.fullName}</td>
          <td style="padding:6px 0;color:${MUTED};font-size:14px;text-align:right;">${
            p.seatNumber ? `Siège ${p.seatNumber}` : "—"
          }</td>
        </tr>`
    )
    .join("");

  return `
  <div style="border:1px solid ${BORDER};border-radius:12px;padding:20px;margin-bottom:16px;">
    ${leg.legLabel ? `<p style="margin:0 0 4px;color:${PRIMARY};font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Trajet ${leg.legLabel.toLowerCase()}</p>` : ""}
    <p style="margin:0 0 2px;color:${MUTED};font-size:13px;">Référence de réservation</p>
    <p style="margin:0 0 16px;color:${TEXT};font-size:20px;font-weight:800;">${leg.bookingReference}</p>

    <p style="margin:0 0 4px;color:${TEXT};font-size:16px;font-weight:700;">
      ${leg.originCity} → ${leg.destinationCity}
    </p>
    <p style="margin:0 0 12px;color:${MUTED};font-size:14px;">${schedule}</p>
    <p style="margin:0 0 16px;color:${MUTED};font-size:14px;">
      ${leg.companyName} · Bus n° ${leg.busNumber} · ${leg.seatClassLabel}
    </p>

    <table style="width:100%;border-collapse:collapse;border-top:1px solid ${BORDER};padding-top:8px;margin-top:8px;">
      ${passengersRows}
    </table>

    <table style="width:100%;border-collapse:collapse;border-top:1px solid ${BORDER};margin-top:12px;padding-top:8px;">
      <tr>
        <td style="padding-top:8px;color:${MUTED};font-size:13px;">Prix du billet</td>
        <td style="padding-top:8px;color:${TEXT};font-size:13px;text-align:right;">${formatFcfa(leg.price.baseAmountFcfa)}</td>
      </tr>
      <tr>
        <td style="color:${MUTED};font-size:13px;">Frais de service</td>
        <td style="color:${TEXT};font-size:13px;text-align:right;">${formatFcfa(
          leg.price.platformFeeFcfa + leg.price.transactionFeeFcfa
        )}</td>
      </tr>
      <tr>
        <td style="padding-top:6px;color:${TEXT};font-size:14px;font-weight:700;">Total</td>
        <td style="padding-top:6px;color:${TEXT};font-size:14px;font-weight:700;text-align:right;">${formatFcfa(
          leg.price.totalFcfa
        )}</td>
      </tr>
    </table>
  </div>`;
}

export function renderBookingConfirmationEmailHtml(payload: BookingConfirmationPayload): string {
  const legsHtml = payload.legs.map(renderLegSection).join("");
  const isRoundTrip = payload.legs.length > 1;

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px 0;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:${PRIMARY};padding:24px;text-align:center;">
        <p style="margin:0;color:#1a1a1a;font-size:18px;font-weight:800;">GoBus Bénin</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 4px;color:${TEXT};font-size:20px;font-weight:800;">Réservation confirmée</p>
        <p style="margin:0 0 24px;color:${MUTED};font-size:14px;">
          Merci pour votre réservation${isRoundTrip ? " aller-retour" : ""}. Voici votre confirmation.
        </p>

        ${legsHtml}

        ${
          isRoundTrip
            ? `<div style="display:flex;justify-content:space-between;padding:12px 4px;">
                 <span style="color:${TEXT};font-size:15px;font-weight:700;">Montant total payé</span>
                 <span style="color:${TEXT};font-size:15px;font-weight:700;">${formatFcfa(payload.totalPaidFcfa)}</span>
               </div>`
            : ""
        }

        <div style="text-align:center;margin-top:24px;">
          <a href="${payload.manageUrl}" style="display:inline-block;background:${PRIMARY};color:#1a1a1a;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;">
            Consulter ma réservation en ligne
          </a>
        </div>
      </div>
    </div>
  </div>`;
}
