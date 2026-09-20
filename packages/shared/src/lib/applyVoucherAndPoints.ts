import "server-only";
import { supabaseAdmin } from "./notifications/supabaseAdmin";

export type ApplyVoucherAndPointsParams = {
  userId: string;
  bookingId: string;
  baseAmountFcfa: number;
  // Plafond de l'avoir — le total réellement payable (base + frais de
  // service), jamais plus. Identique à `totalFcfa` dans simulatePayment.
  totalFcfa: number;
  voucherId: string | null;
  usePoints: boolean;
};

export type ApplyVoucherAndPointsResult = {
  claimedVoucherId: string | null;
  appliedVoucherFcfa: number;
  pointsRedeemedFcfa: number;
  // Part de l'avoir qui dépassait le montant dû, mise en attente de
  // remboursement (vouchers.status = 'refund_pending') plutôt
  // qu'appliquée — 0 si aucun avoir claimé ou si l'avoir a été
  // intégralement absorbé. Sert au seul appelant qui doit encore notifier
  // le client de ce reliquat (simulatePayment).
  leftoverVoucherFcfa: number;
};

// Extrait tel quel de simulatePayment
// (apps/web/app/reservation/[bookingId]/paiement/actions.ts) — même
// séquence, mêmes garanties anti-course, jamais dupliqué une seconde fois
// ailleurs (règle CLAUDE.md). Deux appelants : createBookingForCustomer
// (back-office — applique l'avoir/les points d'un client déjà existant
// sur une réservation créée pour lui) et, indirectement, la réclamation
// d'avoir de simulate_single_booking_payment (SQL) via la fonction
// partagée claim_voucher_for_booking ci-dessous — simulatePayment
// lui-même n'appelle plus applyVoucherAndPoints depuis le chantier
// d'atomicité (2026-09-19), il appelle directement la fonction SQL.
//
// La réclamation d'avoir elle-même vit désormais dans
// claim_voucher_for_booking (supabase/migrations/
// 20260919140000_add_simulate_single_booking_payment.sql) — appelée ici
// via rpc() plutôt que dupliquée en TypeScript, exactement pour éviter
// la duplication entre couches signalée sur ce chantier (avant cette
// extraction, simulate_round_trip_payment dupliquait déjà une forme
// différente de cette même logique en SQL sans jamais être unifiée).
export async function applyVoucherAndPoints(
  params: ApplyVoucherAndPointsParams
): Promise<ApplyVoucherAndPointsResult> {
  const { userId, bookingId, baseAmountFcfa, totalFcfa, voucherId, usePoints } = params;

  const { data: voucherResult, error: voucherError } = await supabaseAdmin
    .rpc("claim_voucher_for_booking", {
      p_voucher_id: voucherId,
      p_user_id: userId,
      p_booking_id: bookingId,
      p_max_fcfa: totalFcfa,
    })
    .single<{ claimed_voucher_id: string | null; applied_fcfa: number; leftover_fcfa: number }>();

  if (voucherError) {
    console.error("Impossible de réclamer l'avoir :", voucherError.message);
  }

  const claimedVoucherId = voucherResult?.claimed_voucher_id ?? null;
  const appliedVoucherFcfa = voucherResult?.applied_fcfa ?? 0;
  const leftoverVoucherFcfa = voucherResult?.leftover_fcfa ?? 0;

  // GoBus Points — priorité 2, seulement sur le reliquat du prix du
  // billet après l'avoir (jamais les frais de service), plafonné au
  // solde disponible.
  let pointsRedeemedFcfa = 0;

  if (usePoints) {
    const voucherAppliedToBaseFcfa = Math.min(appliedVoucherFcfa, baseAmountFcfa);
    const remainingBaseAfterVoucher = baseAmountFcfa - voucherAppliedToBaseFcfa;

    if (remainingBaseAfterVoucher > 0) {
      const { data: balanceRow } = await supabaseAdmin
        .from("points_balance")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle<{ balance: number }>();

      const pointsToRedeem = Math.min(remainingBaseAfterVoucher, balanceRow?.balance ?? 0);

      if (pointsToRedeem > 0) {
        // L'insert EST la réclamation atomique : le trigger
        // apply_points_ledger_entry lit le solde réel sous verrou, et
        // lève une exception (qui annule cet insert, rien d'autre) si ce
        // solde ne suffit plus — relu au moment de l'écriture, pas la
        // valeur ci-dessus qui peut être légèrement périmée. Jamais
        // bloquant : en cas d'échec, on retombe sur 0 point appliqué,
        // même philosophie que l'avoir déjà consommé.
        const { error: pointsError } = await supabaseAdmin.from("points_ledger").insert({
          booking_id: bookingId,
          user_id: userId,
          points_amount: -pointsToRedeem,
          reason: "booking_redemption",
        });

        if (!pointsError) {
          pointsRedeemedFcfa = pointsToRedeem;
        } else {
          console.error("Impossible d'appliquer les points :", pointsError.message);
        }
      }
    }
  }

  return { claimedVoucherId, appliedVoucherFcfa, pointsRedeemedFcfa, leftoverVoucherFcfa };
}
