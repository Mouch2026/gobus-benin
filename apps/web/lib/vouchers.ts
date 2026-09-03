import { createClient } from "@/lib/supabase/server";
import { sendVoucherRefundPendingNotification } from "shared/src/lib/notifications/sendVoucherRefundPendingNotification";

// Sweep paresseux (pas de pg_cron sur ce projet — voir BACKLOG.md) :
// appelée en tête des pages où la présence d'un avoir compte (paiement
// simple, paiement aller-retour, /compte/reservations), elle fait passer
// les avoirs expirés de l'utilisateur courant à 'refund_pending' et
// notifie chacun. Sans appel de cette fonction sur une page pertinente,
// un avoir expiré reste 'active' en base jusqu'à la prochaine visite —
// compromis assumé, voir le plan de ce chantier.
export async function sweepExpiredVouchers(): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sweep_my_expired_vouchers");

  if (error) {
    // Non bloquant par nature : un échec ici ne doit jamais empêcher
    // l'affichage de la page qui l'a appelé.
    console.error("Impossible de purger les avoirs expirés :", error.message);
    return;
  }

  for (const row of data ?? []) {
    await sendVoucherRefundPendingNotification({ voucherId: row.voucher_id as string });
  }
}
