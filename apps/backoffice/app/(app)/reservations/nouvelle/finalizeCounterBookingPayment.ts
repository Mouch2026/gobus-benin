import "server-only";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOpenSession } from "@/lib/caisse";
import { notifySupervisors } from "@/lib/supervisorApproval";
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
  // Chantier 4 — jamais le client : la part cash de CETTE réservation se
  // rattache à la session de caisse de cet agent. Pour une remise validée
  // à distance (chantier 3c), c'est l'agent D'ORIGINE
  // (supervisor_approval_requests.requested_by), pas le superviseur qui
  // approuve des minutes plus tard.
  agentUserId: string;
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
  const { bookingId, userId, agentUserId, discountPercent, discountGrantedBy, voucherIdRaw, usePoints, parts } =
    params;

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

  // Chantier 4 — résolue une seule fois, pas par part : toutes les parts
  // cash d'une même réservation se rattachent à la même session. Non
  // résolue du tout s'il n'y a aucune part cash (évite une requête
  // inutile pour un paiement 100% carte/mobile money).
  const openSession = parts.some((p) => p.mode === "cash") ? await getOpenSession(agentUserId) : null;

  let bookingConfirmedDuringCreation = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isFirst = i === 0;
    const isCash = part.mode === "cash";

    if (isCash && !openSession) {
      // Aucune écriture pour cette part — jamais de paiement orphelin
      // pour cette cause précise (contrairement à un franchissement de
      // plafond, qui ne peut être détecté qu'après coup, voir plus bas).
      return { error: "Ouvrez une session de caisse avant d'accepter un paiement en espèces." };
    }

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
      // record_cash_payment_received verrouille la session, vérifie le
      // plafond, enregistre le mouvement, PUIS appelle
      // record_payment_part_received (inchangée) dans la même
      // transaction — voir le plan, point 2.
      const { data: result, error: rpcError } = await supabaseAdmin
        .rpc("record_cash_payment_received", { p_payment_id: payment.id, p_session_id: openSession!.id })
        .single<{ booking_confirmed: boolean }>();

      if (rpcError) {
        // 23514 = check_violation : plafond atteint, ou session
        // introuvable/déjà close entre-temps — message métier déjà
        // rédigé, remonté tel quel (même convention que cancelBooking),
        // jamais le générique "contactez le support" pour ce cas précis.
        if (rpcError.code === "23514") {
          if (rpcError.message.startsWith("Plafond de caisse atteint")) {
            await notifySupervisors({
              companyId: openSession!.companyId,
              agencyId: openSession!.agenceId,
              title: "Plafond de caisse atteint",
              body: `Un paiement en espèces a été refusé — ${rpcError.message}`,
              type: "cash_ceiling_reached",
              actionHref: "/caisse",
            });
          }
          return { error: rpcError.message };
        }
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
