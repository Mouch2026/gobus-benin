import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@6.25.0";

// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY : injectées automatiquement
// par la plateforme dans toute Edge Function déployée, jamais à déclarer
// via `supabase secrets set`. RESEND_API_KEY / RESEND_FROM_EMAIL / WEB_URL :
// propres à ce projet, à déclarer manuellement (voir le plan de ce
// chantier / BACKLOG.md).
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PRIMARY = "#F2A900";
const TEXT = "#1a1a1a";
const MUTED = "#6b7280";

function formatFcfa(amount: number): string {
  return new Intl.NumberFormat("fr-BJ", { maximumFractionDigits: 0 }).format(amount) + " FCFA";
}

// Duplication délibérée et minimale du gabarit de
// packages/shared/src/lib/notifications/channels/voucherRefundPendingEmail.ts
// — ce fichier importe "server-only" (échoue systématiquement hors
// Next.js), donc pas d'import direct possible depuis une Edge Function :
// même limitation déjà rencontrée et actée pour SEAT_CLASS_LABELS lors du
// déplacement de lib/notifications vers packages/shared. On duplique le
// strict nécessaire (le rendu HTML + le texte), pas toute l'architecture
// de packages/shared/notifications.
function renderVoucherRefundPendingEmailHtml(
  amountFcfa: number,
  originBookingReference: string,
  manageUrl: string
): string {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px 0;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      <div style="background:${PRIMARY};padding:24px;text-align:center;">
        <p style="margin:0;color:#1a1a1a;font-size:18px;font-weight:800;">GoBus Bénin</p>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 4px;color:${TEXT};font-size:20px;font-weight:800;">Votre avoir passe en remboursement</p>
        <p style="margin:0 0 20px;color:${MUTED};font-size:14px;">
          L'avoir associé à votre réservation ${originBookingReference} n'a pas été utilisé
          (ou seulement en partie) dans le délai de 24h. Son solde va vous être remboursé.
        </p>
        <div style="border-radius:12px;background:${PRIMARY}1a;padding:16px 20px;">
          <p style="margin:0 0 4px;color:${TEXT};font-size:15px;font-weight:700;">
            ${formatFcfa(amountFcfa)} en attente de remboursement.
          </p>
          <p style="margin:0;color:${TEXT};font-size:13px;">Délai indicatif : 7 jours.</p>
        </div>
        <div style="text-align:center;margin-top:24px;">
          <a href="${manageUrl}" style="display:inline-block;background:${PRIMARY};color:#1a1a1a;text-decoration:none;font-weight:700;font-size:14px;padding:12px 24px;border-radius:10px;">
            Consulter mes réservations
          </a>
        </div>
      </div>
    </div>
  </div>`;
}

type ClaimedVoucher = {
  id: string;
  user_id: string;
  bookings: { booking_reference: string } | { booking_reference: string }[] | null;
};

Deno.serve(async (req) => {
  // Seul rempart réel contre un appel externe non autorisé : verify_jwt
  // est désactivé pour cette fonction (voir supabase/config.toml) car il
  // n'aurait rien protégé de plus ici — la clé anon, publique par
  // construction, est un JWT valide et l'aurait satisfait, alors que le
  // code ci-dessous s'exécute de toute façon avec les pleins pouvoirs
  // service_role quel que soit l'appelant. CRON_SECRET est un secret
  // propre à cette fonction (supabase secrets set CRON_SECRET=...),
  // envoyé par le cron.schedule de la migration via l'en-tête
  // x-cron-secret (valeur lue depuis Supabase Vault côté SQL) — jamais la
  // clé anon/service_role elle-même. Vérifié avant toute autre action :
  // pas de RPC, pas d'appel Resend, si le secret est absent ou incorrect.
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: expired, error } = await supabaseAdmin.rpc("sweep_all_expired_vouchers");

  if (error) {
    console.error("sweep_all_expired_vouchers a échoué :", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
  const manageUrl = `${Deno.env.get("WEB_URL")}/gerer-ma-reservation`;
  let sent = 0;
  let skipped = 0;

  for (const row of expired ?? []) {
    // Même idiome de réclamation atomique que
    // sendVoucherRefundPendingNotification.ts côté Next.js : si
    // refund_notified_at est déjà renseigné (le sweep paresseux ou une
    // application d'avoir avec reliquat l'a déjà envoyé entre-temps), cet
    // update ne touche aucune ligne et on n'envoie rien de plus.
    const { data: claimed } = await supabaseAdmin
      .from("vouchers")
      .update({ refund_notified_at: new Date().toISOString() })
      .eq("id", row.voucher_id)
      .is("refund_notified_at", null)
      .select("id, user_id, bookings!origin_booking_id(booking_reference)")
      .maybeSingle<ClaimedVoucher>();

    if (!claimed) {
      skipped++;
      continue;
    }

    // La relation embarquée peut revenir en objet ou en tableau selon la
    // façon dont PostgREST résout l'unicité — gérer les deux plutôt que de
    // supposer une seule forme.
    const bookingReference = Array.isArray(claimed.bookings)
      ? claimed.bookings[0]?.booking_reference
      : claimed.bookings?.booking_reference;

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      claimed.user_id
    );
    if (userError || !userData.user?.email) {
      console.error(`Email introuvable pour le voyageur ${claimed.user_id} :`, userError?.message);
      continue;
    }

    const { error: sendError } = await resend.emails.send({
      from: Deno.env.get("RESEND_FROM_EMAIL")!,
      to: userData.user.email,
      subject: `Votre avoir passe en remboursement — ${bookingReference ?? ""}`,
      html: renderVoucherRefundPendingEmailHtml(row.amount_fcfa, bookingReference ?? "", manageUrl),
    });

    if (sendError) {
      console.error(`Envoi Resend échoué pour l'avoir ${row.voucher_id} :`, sendError.message);
    } else {
      sent++;
    }
  }

  return new Response(JSON.stringify({ processed: expired?.length ?? 0, sent, skipped }), {
    headers: { "Content-Type": "application/json" },
  });
});
