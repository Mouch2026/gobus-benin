"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateServiceFees } from "shared";
import { redeemPromoCode } from "shared/src/lib/redeemPromoCode";
import { sendBookingConfirmation } from "shared/src/lib/notifications/sendBookingConfirmation";
import { sendVoucherRefundPendingNotification } from "shared/src/lib/notifications/sendVoucherRefundPendingNotification";

export type PaymentState = { error: string | null };

type BookingForPayment = {
  id: string;
  status: string;
  company_id: string;
  total_price_fcfa: number;
  trips: { departure_at: string } | null;
};

// SIMULÉ — à remplacer par une vraie intégration FedaPay (create-payment /
// payment-webhook, voir CLAUDE.md) une fois branchée, pour l'abonnement
// compagnie et les billets voyageurs en même temps.
//
// Chantier atomicité (2026-09-19) : avoir, points, insertion du paiement,
// approbation et passage à 'confirmed' vivent désormais dans une seule
// fonction Postgres verrouillée, simulate_single_booking_payment
// (supabase/migrations/20260919140000_add_simulate_single_booking_payment.sql)
// — verrou posé sur la réservation AVANT tout calcul, comme
// record_payment_part_received (qu'elle appelle en interne pour la
// fermeture, jamais réimplémentée ici). Un second appel concurrent sur
// la même réservation reçoit une erreur claire (errcode 23514, message
// "déjà payée"), jamais un double paiement silencieux.
//
// Signature compatible useActionState (prevState, formData) — nécessaire
// depuis le chantier des codes promo : un code invalide doit afficher un
// message, contrairement à l'avoir/aux points (identité-scopés, jamais
// saisis à la main, jamais en échec côté client).
export async function simulatePayment(
  bookingId: string,
  _prevState: PaymentState,
  formData: FormData
): Promise<PaymentState> {
  const user = await requireUser(`/reservation/${bookingId}/paiement`);

  // Relu via le client SSR authentifié, pas service_role : RLS
  // (bookings_select_own_or_company) garantit déjà que cette réservation
  // appartient bien à `user` — pas de vérification manuelle à dupliquer.
  const supabase = await createClient();
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, status, company_id, total_price_fcfa, trips(departure_at)")
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

  // Code promo éventuellement saisi — prend la même place que la remise
  // agent (chantier 3b-1) dans le calcul : réduit uniquement le prix du
  // billet, jamais les frais, calculés ci-dessous sur le prix PLEIN.
  // Voir redeemPromoCode.ts pour l'ordre des vérifications et les
  // messages. Un échec ici renvoie l'erreur au formulaire sans rien
  // écrire d'autre — aucun avoir/point n'est encore réclamé à ce stade.
  let promoCodeId: string | null = null;
  let discountPercent = 0;
  let discountAmountFcfa = 0;

  const promoCodeRaw = String(formData.get("promoCode") ?? "").trim();
  if (promoCodeRaw) {
    const promoResult = await redeemPromoCode({
      userId: user.sub,
      bookingId,
      companyId: booking.company_id,
      code: promoCodeRaw,
      baseAmountFcfa,
    });

    if (!promoResult.ok) {
      return { error: promoResult.error };
    }

    promoCodeId = promoResult.promoCodeId;
    discountPercent = promoResult.discountPercent;
    discountAmountFcfa = promoResult.discountAmountFcfa;
  }

  const { platformFeeFcfa, transactionFeeFcfa } = calculateServiceFees(baseAmountFcfa);

  // Avoir/points éventuellement sélectionnés sur la page — jamais
  // confiance dans un montant envoyé par le client, seul l'id de l'avoir
  // est transmis, relu et réclamé à l'intérieur de la fonction verrouillée
  // ci-dessous, jamais côté client. Tout (verrou de la réservation, avoir,
  // points, insertion, approbation, passage confirmed) se fait dans une
  // seule transaction — voir simulate_single_booking_payment.
  const voucherIdRaw = formData.get("voucherId");
  const usePoints = formData.get("usePoints") === "1";

  const { data: result, error: paymentError } = await supabaseAdmin
    .rpc("simulate_single_booking_payment", {
      p_booking_id: bookingId,
      p_user_id: user.sub,
      p_platform_fee_fcfa: platformFeeFcfa,
      p_transaction_fee_fcfa: transactionFeeFcfa,
      p_discount_percent: discountPercent,
      p_discount_amount_fcfa: discountAmountFcfa,
      p_promo_code_id: promoCodeId,
      p_voucher_id: voucherIdRaw ? String(voucherIdRaw) : null,
      p_use_points: usePoints,
    })
    .single<{
      payment_id: string;
      claimed_voucher_id: string | null;
      applied_voucher_fcfa: number;
      points_redeemed_fcfa: number;
      leftover_voucher_fcfa: number;
    }>();

  if (paymentError) {
    // 23514 = check_violation : la fonction lève ses propres erreurs
    // métier avec un message déjà rédigé pour l'utilisateur ("déjà payée
    // ou n'est plus disponible" — le perdant d'une course entre deux
    // clics rapprochés tombe précisément ici), remonté tel quel plutôt
    // que masqué par un message générique.
    if (paymentError.code === "23514") {
      return { error: paymentError.message };
    }
    console.error("Impossible de créer le paiement :", paymentError.message);
    redirect(`/reservation/${bookingId}/paiement`);
  }

  const claimedVoucherId = result!.claimed_voucher_id;
  const leftoverVoucherFcfa = result!.leftover_voucher_fcfa;

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
