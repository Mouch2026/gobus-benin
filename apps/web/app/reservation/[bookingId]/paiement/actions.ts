"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateServiceFees } from "shared";
import { applyVoucherAndPoints } from "shared/src/lib/applyVoucherAndPoints";
import { sendBookingConfirmation } from "shared/src/lib/notifications/sendBookingConfirmation";
import { sendVoucherRefundPendingNotification } from "shared/src/lib/notifications/sendVoucherRefundPendingNotification";

type BookingForPayment = {
  id: string;
  status: string;
  total_price_fcfa: number;
  trips: { departure_at: string } | null;
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
    .select("id, status, total_price_fcfa, trips(departure_at)")
    .eq("id", bookingId)
    .eq("user_id", user.sub)
    .maybeSingle<BookingForPayment>();

  if (!booking || booking.status !== "pending") {
    // Pas d'erreur technique : la page de paiement sait déjà afficher
    // l'état correct (introuvable / déjà payée / annulée).
    redirect(`/reservation/${bookingId}/paiement`);
  }

  // Le trajet a pu partir pendant que le voyageur restait sur cette page
  // (create_booking garantit seulement qu'il n'était pas encore parti au
  // moment de la création). Aucun paiement n'a encore été approuvé à ce
  // stade — rien à rembourser, pas d'avoir à émettre — une simple
  // annulation directe suffit et libère le siège via le trigger existant
  // adjust_trip_seats_on_booking_status_change.
  if (booking.trips && new Date(booking.trips.departure_at).getTime() <= Date.now()) {
    await supabaseAdmin.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
    redirect(`/reservation/${bookingId}/paiement`);
  }

  const baseAmountFcfa = booking.total_price_fcfa;
  const { platformFeeFcfa, transactionFeeFcfa, totalFcfa } = calculateServiceFees(baseAmountFcfa);

  // Avoir éventuellement sélectionné sur la page — jamais confiance dans
  // un montant envoyé par le client, seul l'id est utilisé pour relire
  // l'état réel de l'avoir au moment du paiement. Logique d'application
  // (réclamation atomique de l'avoir + rachat de points plafonné)
  // extraite dans applyVoucherAndPoints — réutilisée telle quelle par le
  // back-office pour un client déjà existant, jamais dupliquée une
  // seconde fois.
  const voucherIdRaw = formData.get("voucherId");
  const usePoints = formData.get("usePoints") === "1";

  const { claimedVoucherId, appliedVoucherFcfa, pointsRedeemedFcfa, leftoverVoucherFcfa } = await applyVoucherAndPoints({
    userId: user.sub,
    bookingId,
    baseAmountFcfa,
    totalFcfa,
    voucherId: voucherIdRaw ? String(voucherIdRaw) : null,
    usePoints,
  });

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
      points_redeemed_fcfa: pointsRedeemedFcfa,
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
  if (claimedVoucherId && leftoverVoucherFcfa > 0) {
    await sendVoucherRefundPendingNotification({ voucherId: claimedVoucherId });
  }

  redirect(`/reservation/${bookingId}/succes`);
}
