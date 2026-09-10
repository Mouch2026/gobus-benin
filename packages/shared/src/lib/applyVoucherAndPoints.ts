import "server-only";
import { supabaseAdmin } from "./notifications/supabaseAdmin";

type ActiveVoucher = {
  id: string;
  amount_fcfa: number;
  status: string;
  expires_at: string;
};

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
// ailleurs (règle CLAUDE.md). Deux appelants : simulatePayment lui-même
// (refactoré pour appeler cette fonction) et createBookingForCustomer
// (back-office, nouveau — applique l'avoir/les points d'un client déjà
// existant sur une réservation créée pour lui).
//
// Non couvert par cette extraction : simulate_round_trip_payment (SQL),
// qui duplique une forme différente de cette même logique (répartition
// entre 2 legs aller-retour) — hors-sujet ici, signalé mais pas unifié.
export async function applyVoucherAndPoints(
  params: ApplyVoucherAndPointsParams
): Promise<ApplyVoucherAndPointsResult> {
  const { userId, bookingId, baseAmountFcfa, totalFcfa, voucherId, usePoints } = params;

  let voucherIdToApply: string | null = null;
  let voucherAmountFcfa = 0;

  if (voucherId) {
    const { data: voucher } = await supabaseAdmin
      .from("vouchers")
      .select("id, amount_fcfa, status, expires_at")
      .eq("id", voucherId)
      .eq("user_id", userId)
      .maybeSingle<ActiveVoucher>();

    if (voucher && voucher.status === "active" && new Date(voucher.expires_at) > new Date()) {
      voucherIdToApply = voucher.id;
      voucherAmountFcfa = voucher.amount_fcfa;
    }
  }

  let appliedVoucherFcfa = 0;
  let claimedVoucherId: string | null = null;
  let leftoverVoucherFcfa = 0;

  if (voucherIdToApply) {
    appliedVoucherFcfa = Math.min(voucherAmountFcfa, totalFcfa);
    const leftover = voucherAmountFcfa - appliedVoucherFcfa;
    leftoverVoucherFcfa = leftover;
    const now = new Date().toISOString();

    // Réclame l'avoir AVANT d'écrire le paiement — la clause "status =
    // 'active'" ferme la course avec une autre utilisation concurrente du
    // même avoir. Si la réclamation échoue (avoir déjà consommé/expiré
    // entre-temps), on retombe simplement sur 0 avoir, jamais une erreur
    // bloquante.
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
      leftoverVoucherFcfa = 0;
    }
  }

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
