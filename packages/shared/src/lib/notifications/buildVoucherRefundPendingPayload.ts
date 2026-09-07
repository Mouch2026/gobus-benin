import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import type { VoucherRefundPendingPayload } from "./types";

type VoucherRow = {
  user_id: string;
  refund_pending_amount_fcfa: number | null;
  amount_fcfa: number;
  bookings: { booking_reference: string };
};

const VOUCHER_SELECT =
  "user_id, refund_pending_amount_fcfa, amount_fcfa, bookings!origin_booking_id(booking_reference)";

// Utilise exclusivement supabaseAdmin (service_role), même raisonnement
// que buildTripCancellationPayload — appelée aussi bien depuis le sweep
// paresseux (session voyageur ordinaire) que, potentiellement demain,
// depuis un contexte sans session (une tâche planifiée). Appelée une fois
// le passage en refund_pending déjà effectué (par sweep_my_expired_vouchers
// ou par l'application d'un avoir sur une réservation moins chère) — ne
// fait que lire le résultat pour le restituer au voyageur.
export async function buildVoucherRefundPendingPayload(target: {
  voucherId: string;
}): Promise<VoucherRefundPendingPayload> {
  const { data: voucher, error } = await supabaseAdmin
    .from("vouchers")
    .select(VOUCHER_SELECT)
    .eq("id", target.voucherId)
    .maybeSingle<VoucherRow>();

  if (error) throw new Error(`Impossible de charger l'avoir : ${error.message}`);
  if (!voucher) throw new Error("Avoir introuvable pour la notification de mise en attente");

  // refund_pending_amount_fcfa devrait toujours être renseigné à ce stade
  // (c'est justement l'événement qui déclenche cet envoi) — amount_fcfa en
  // repli reste correct par construction (jamais supérieur).
  const amountFcfa = voucher.refund_pending_amount_fcfa ?? voucher.amount_fcfa;

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
    voucher.user_id
  );
  if (userError || !userData.user?.email) {
    throw new Error(
      `Impossible de récupérer l'email du voyageur ${voucher.user_id} : ${userError?.message}`
    );
  }

  return {
    userId: voucher.user_id,
    recipientEmail: userData.user.email,
    amountFcfa,
    originBookingReference: voucher.bookings.booking_reference,
    manageUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/gerer-ma-reservation`,
  };
}
