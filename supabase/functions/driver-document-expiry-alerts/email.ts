// Rendu de l'e-mail récapitulatif d'expiration de documents de chauffeurs.
// Module pur (aucune dépendance Deno/Supabase) : importable aussi bien par
// index.ts que par un test exécuté hors Deno.
//
// Duplication délibérée et minimale du style de expire-vouchers/index.ts :
// packages/shared importe "server-only" et n'est pas importable depuis une
// Edge Function.

const PRIMARY = "#F2A900";
const TEXT = "#1a1a1a";
const MUTED = "#6b7280";
const DANGER = "#b91c1c";

export type ExpiringDocument = {
  alert_driver_id: string;
  driver_name: string;
  doc_type: string;
  doc_expiration_date: string; // "AAAA-MM-JJ"
  days_left: number; // négatif si déjà expiré
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  permis: "Permis",
  carte_identite: "Carte d'identité",
  certificat: "Certificat",
  autre: "Document",
};

// Le nom du chauffeur est saisi librement dans le back-office : il est
// injecté dans du HTML, il DOIT être échappé.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

function describeTiming(daysLeft: number): string {
  if (daysLeft < 0) return `expiré depuis ${Math.abs(daysLeft)} j`;
  if (daysLeft === 0) return "expire aujourd'hui";
  return `expire dans ${daysLeft} j`;
}

export function renderExpiryEmailHtml(
  companyName: string,
  documents: ExpiringDocument[],
  backofficeUrl: string | null
): string {
  const rows = documents
    .map((doc) => {
      const expired = doc.days_left < 0;
      const label = DOC_TYPE_LABELS[doc.doc_type] ?? "Document";
      const name = escapeHtml(doc.driver_name);
      const link = backofficeUrl
        ? `<a href="${escapeHtml(backofficeUrl)}/chauffeurs/${encodeURIComponent(doc.alert_driver_id)}" style="color:${TEXT};font-weight:700;">${name}</a>`
        : `<strong>${name}</strong>`;
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;color:${TEXT};font-size:14px;">
            ${label} — ${link}
            <br /><span style="color:${expired ? DANGER : MUTED};font-size:13px;">
              ${formatDate(doc.doc_expiration_date)} (${describeTiming(doc.days_left)})
            </span>
          </td>
        </tr>`;
    })
    .join("");

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px 0;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:${PRIMARY};padding:24px;text-align:center;">
        <p style="margin:0;color:#1a1a1a;font-size:18px;font-weight:800;">GoBus Bénin</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 4px;color:${TEXT};font-size:20px;font-weight:800;">Documents de chauffeurs à renouveler</p>
        <p style="margin:0 0 20px;color:${MUTED};font-size:14px;">
          ${documents.length} document(s) de ${escapeHtml(companyName)} ont atteint le seuil d'alerte d'expiration.
        </p>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
      </div>
    </div>
  </div>`;
}
