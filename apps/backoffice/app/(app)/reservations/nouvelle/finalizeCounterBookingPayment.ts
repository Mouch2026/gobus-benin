import "server-only";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateServiceFees } from "shared";
import { applyVoucherAndPoints } from "shared/src/lib/applyVoucherAndPoints";
import { sendBookingConfirmation } from "shared/src/lib/notifications/sendBookingConfirmation";
import { sendBookingPaymentLinkNotification } from "shared/src/lib/notifications/sendBookingPaymentLinkNotification";
import type { CounterPaymentPart } from "@/lib/supervisorApproval";

const PAYMENT_TOKEN_MAX_VALIDITY_MS = 48 * 60 * 60 * 1000; // 48h
const LINK_METHODS = new Set(["mtn_money", "moov_money", "card"]);

export type FinalizeCounterBookingPaymentParams = {
  bookingId: string;
  userId: string;
  discountPercent: number;
  discountGrantedBy: string | null;
  voucherIdRaw: string;
  usePoints: boolean;
  parts: CounterPaymentPart[];
};

// Extrait de createBookingForCustomer (chantier 3c) — appelée soit
// immédiatement (remise <= 10%, ou > 10% validée sur place), soit plus
// tard par validations/actions.ts::reviewApprovalRequest (validée à
// distance), jamais dupliquée. Ne recrée jamais la réservation ni ne
// revérifie la somme des parts — déjà fait avant l'appel, dans les deux
// cas, au moment de la création.
export async function finalizeCounterBookingPayment(
  params: FinalizeCounterBookingPaymentParams
): Promise<{ error: string | null }> {
  const { bookingId, userId, discountPercent, discountGrantedBy, voucherIdRaw, usePoints, parts } = params;

  // Relu ici plutôt que transmis par l'appelant : le chemin différé
  // (validation à distance) tourne minutes après la création, dans un
  // contexte serveur différent (l'action du superviseur, pas celle de
  // l'agent) — total_price_fcfa/departure_at viennent donc toujours de la
  // base, jamais d'une valeur mémorisée entre-temps.
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("total_price_fcfa, trips(departure_at)")
    .eq("id", bookingId)
    .single<{ total_price_fcfa: number; trips: { departure_at: string } | null }>();

  if (bookingError || !booking) {
    console.error("Impossible de relire la réservation à finaliser :", bookingError?.message);
    return { error: "Impossible de finaliser cette réservation. Contactez le support." };
  }

  const totalPriceFcfa = booking.total_price_fcfa;
  const departureAtMs = booking.trips
    ? new Date(booking.trips.departure_at).getTime()
    : Date.now() + PAYMENT_TOKEN_MAX_VALIDITY_MS;

  // Frais de service calculés UNE SEULE FOIS pour toute la réservation,
  // toujours sur le prix PLEIN — la remise ne s'applique jamais aux frais.
  const { platformFeeFcfa, transactionFeeFcfa } = calculateServiceFees(totalPriceFcfa);

  const discountFcfa = Math.round((totalPriceFcfa * discountPercent) / 100);
  const discountedBaseFcfa = totalPriceFcfa - discountFcfa;

  const { claimedVoucherId, appliedVoucherFcfa, pointsRedeemedFcfa } = await applyVoucherAndPoints({
    userId,
    bookingId,
    baseAmountFcfa: discountedBaseFcfa,
    totalFcfa: discountedBaseFcfa + platformFeeFcfa + transactionFeeFcfa,
    voucherId: voucherIdRaw || null,
    usePoints,
  });

  let bookingConfirmedDuringCreation = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isFirst = i === 0;
    const isCash = part.mode === "cash";

    const insertPayload: Record<string, unknown> = {
      booking_id: bookingId,
      base_amount_fcfa: part.amountFcfa,
      platform_fee_fcfa: isFirst ? platformFeeFcfa : 0,
      transaction_fee_fcfa: isFirst && !isCash ? transactionFeeFcfa : 0,
      provider: isCash ? "manual" : "simulated",
      method: part.mode,
      status: "pending",
    };
    if (isFirst) {
      insertPayload.platform_fee_collected = !isCash;
      insertPayload.discount_percent = discountPercent;
      insertPayload.discount_amount_fcfa = discountFcfa;
      insertPayload.discount_granted_by = discountGrantedBy;
      insertPayload.voucher_id = claimedVoucherId;
      insertPayload.voucher_amount_fcfa = appliedVoucherFcfa;
      insertPayload.points_redeemed_fcfa = pointsRedeemedFcfa;
    }

    if (LINK_METHODS.has(part.mode)) {
      // Un jeton PAR PART (pas par réservation).
      insertPayload.payment_token = randomBytes(32).toString("hex");
      insertPayload.payment_token_expires_at = new Date(
        Math.min(Date.now() + PAYMENT_TOKEN_MAX_VALIDITY_MS, departureAtMs)
      ).toISOString();
    }

    const { data: payment, error: insertError } = await supabaseAdmin
      .from("payments")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError || !payment) {
      console.error(
        "Réservation créée mais une part de paiement n'a pas pu être enregistrée :",
        insertError?.message
      );
      return {
        error: "Réservation créée mais le paiement n'a pas pu être entièrement enregistré. Contactez le support.",
      };
    }

    if (isCash) {
      // record_payment_part_received est le SEUL endroit qui décide si la
      // somme des parts reçues atteint désormais total_price_fcfa.
      const { data: result, error: rpcError } = await supabaseAdmin
        .rpc("record_payment_part_received", { p_payment_id: payment.id })
        .single<{ booking_confirmed: boolean }>();

      if (rpcError) {
        console.error("Impossible de valider la part espèces :", rpcError.message);
        return { error: "Réservation créée mais le paiement en espèces n'a pas pu être validé. Contactez le support." };
      }
      if (result?.booking_confirmed) {
        bookingConfirmedDuringCreation = true;
      }
    } else {
      await sendBookingPaymentLinkNotification({ paymentId: payment.id });
    }
  }

  if (bookingConfirmedDuringCreation) {
    await sendBookingConfirmation({ bookingId });
  }

  return { error: null };
}
