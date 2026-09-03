"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateServiceFees } from "shared";
import { sendBookingConfirmation } from "shared/src/lib/notifications/sendBookingConfirmation";
import { sendVoucherRefundPendingNotification } from "shared/src/lib/notifications/sendVoucherRefundPendingNotification";

type BookingForPayment = {
  id: string;
  status: string;
  total_price_fcfa: number;
};

type ActiveVoucher = {
  id: string;
  amount_fcfa: number;
  status: string;
  expires_at: string;
};

// SIMULÉ — à remplacer par une vraie intégration FedaPay (create-payment /
// payment-webhook, voir CLAUDE.md) une fois branchée, pour l'abonnement
// compagnie et les billets voyageurs en même temps. Même mécanisme que
// apps/web/app/partenaires/paiement/actions.ts (insert 'pending' PUIS
// update 'approved', pour déclencher le trigger existant qui ne réagit
// qu'à un update de `status`).
export async function simulatePayment(bookingId: string, formData: FormData): Promise<void> {
  const user = await requireUser(`/reservation/${bookingId}/paiement`);

  // Relu via le client SSR authentifié, pas service_role : RLS
  // (bookings_select_own_or_company) garantit déjà que cette réservation
  // appartient bien à `user` — pas de vérification manuelle à dupliquer.
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, total_price_fcfa")
    .eq("id", bookingId)
    .eq("user_id", user.sub)
    .maybeSingle<BookingForPayment>();

  if (!booking || booking.status !== "pending") {
    // Pas d'erreur technique : la page de paiement sait déjà afficher
    // l'état correct (introuvable / déjà payée / annulée).
    redirect(`/reservation/${bookingId}/paiement`);
  }

  const baseAmountFcfa = booking.total_price_fcfa;
  const { platformFeeFcfa, transactionFeeFcfa, totalFcfa } = calculateServiceFees(baseAmountFcfa);

  // Avoir éventuellement sélectionné sur la page — jamais confiance dans
  // un montant envoyé par le client, seul l'id est utilisé pour relire
  // l'état réel de l'avoir au moment du paiement.
  const voucherIdRaw = formData.get("voucherId");
  let voucherIdToApply: string | null = null;
  let voucherAmountFcfa = 0;

  if (voucherIdRaw) {
    const { data: voucher } = await supabase
      .from("vouchers")
      .select("id, amount_fcfa, status, expires_at")
      .eq("id", String(voucherIdRaw))
      .eq("user_id", user.sub)
      .maybeSingle<ActiveVoucher>();

    if (voucher && voucher.status === "active" && new Date(voucher.expires_at) > new Date()) {
      voucherIdToApply = voucher.id;
      voucherAmountFcfa = voucher.amount_fcfa;
    }
  }

  let appliedVoucherFcfa = 0;
  let claimedVoucherId: string | null = null;

  if (voucherIdToApply) {
    appliedVoucherFcfa = Math.min(voucherAmountFcfa, totalFcfa);
    const leftover = voucherAmountFcfa - appliedVoucherFcfa;
    const now = new Date().toISOString();

    // Réclame l'avoir AVANT d'écrire le paiement — la clause "status =
    // 'active'" ferme la course avec une autre utilisation concurrente du
    // même avoir (un autre onglet, une double soumission). Si la
    // réclamation échoue (avoir déjà consommé/expiré entre-temps), on
    // retombe simplement sur un paiement plein tarif sans avoir, jamais
    // une erreur bloquante.
    const { data: claimed } = await supabaseAdmin
      .from("vouchers")
      .update(
        leftover > 0
          ? {
              status: "refund_pending",
              consumed_booking_id: bookingId,
              consumed_at: now,
              refund_pending_amount_fcfa: leftover,
              refund_pending_at: now,
            }
          : { status: "used", consumed_booking_id: bookingId, consumed_at: now }
      )
      .eq("id", voucherIdToApply)
      .eq("status", "active")
      .select("id")
      .maybeSingle();

    if (claimed) {
      claimedVoucherId = claimed.id;
    } else {
      appliedVoucherFcfa = 0;
    }
  }

  // payments reste volontairement "lecture seule pour le client" (RLS ne
  // définit qu'une policy select) — ces deux écritures passent par
  // service_role, comme pour l'abonnement compagnie, pas par un nouveau
  // GRANT insert pour authenticated.
  //
  // Note : le paiement restant entièrement simulé (pas de FedaPay branché),
  // "payer la différence positive" ne déclenche aujourd'hui aucune charge
  // réelle distincte — amount_charged_fcfa (colonne générée) est calculé
  // et stocké correctement dès maintenant pour que la bascule vers FedaPay
  // n'ait qu'à lire cette colonne, pas à la recalculer.
  const { data: payment, error: insertError } = await supabaseAdmin
    .from("payments")
    .insert({
      booking_id: bookingId,
      base_amount_fcfa: baseAmountFcfa,
      platform_fee_fcfa: platformFeeFcfa,
      transaction_fee_fcfa: transactionFeeFcfa,
      voucher_id: claimedVoucherId,
      voucher_amount_fcfa: appliedVoucherFcfa,
      provider: "simulated",
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !payment) {
    console.error("Impossible de créer le paiement :", insertError?.message);
    redirect(`/reservation/${bookingId}/paiement`);
  }

  // Ce update déclenche award_points_on_payment_approved (before update of
  // status on payments) — pas l'insert ci-dessus, qui passe status en
  // 'pending' d'abord pour la même raison que côté abonnement compagnie :
  // le trigger compare old.status <> 'approved', qui n'existe pas à
  // l'insert. Toujours calculé sur bookings.total_price_fcfa (prix
  // nominal), inchangé par l'avoir éventuellement appliqué.
  await supabaseAdmin
    .from("payments")
    .update({ status: "approved", paid_at: new Date().toISOString() })
    .eq("id", payment.id);

  // Complète le cycle de vie de la réservation — rien d'autre ne la ferait
  // avancer sinon, elle resterait 'pending' indéfiniment malgré le
  // paiement approuvé.
  await supabaseAdmin.from("bookings").update({ status: "confirmed" }).eq("id", bookingId);

  // Un échec d'envoi ne doit jamais bloquer une réservation déjà payée —
  // sendBookingConfirmation() avale ses propres erreurs (voir son
  // commentaire), rien à gérer ici au-delà de l'await.
  await sendBookingConfirmation({ bookingId });

  // Avoir appliqué à une réservation moins chère : le reliquat vient d'être
  // mis en attente de remboursement ci-dessus, il reste à en informer le
  // voyageur (gabarit distinct de la confirmation de réservation).
  if (claimedVoucherId && voucherAmountFcfa - appliedVoucherFcfa > 0) {
    await sendVoucherRefundPendingNotification({ voucherId: claimedVoucherId });
  }

  redirect(`/reservation/${bookingId}/succes`);
}
