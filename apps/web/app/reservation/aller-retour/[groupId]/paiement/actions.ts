"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendBookingConfirmation } from "shared/src/lib/notifications/sendBookingConfirmation";
import { sendVoucherRefundPendingNotification } from "shared/src/lib/notifications/sendVoucherRefundPendingNotification";

type BookingRow = { id: string; leg: string; status: string; user_id: string };

// SIMULÉ — même bandeau/mécanisme que le paiement d'un billet simple
// (apps/web/app/reservation/[bookingId]/paiement/actions.ts). La différence
// ici : les deux legs doivent être payés ensemble, atomiquement — voir
// simulate_round_trip_payment() dans
// supabase/migrations/20260902220000_add_vouchers.sql (signature étendue
// avec p_voucher_id).
export async function simulateRoundTripPayment(groupId: string, formData: FormData): Promise<void> {
  const user = await requireUser(`/reservation/aller-retour/${groupId}/paiement`);

  // Vérifie la propriété via le client SSR authentifié (RLS
  // bookings_select_own_or_company) — même précaution en deux temps que le
  // paiement simple : lecture scopée par RLS d'abord, écriture privilégiée
  // ensuite. simulate_round_trip_payment() est security definer et ne peut
  // pas lire auth.uid() (appelée via service_role) : elle revérifie
  // p_user_id en interne, mais ne doit jamais être appelable directement
  // par un compte authenticated (execute non accordé) — cette vérification
  // ici est donc la seule ligne de défense réellement basée sur la session
  // réelle du voyageur.
  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, leg, status, user_id")
    .eq("booking_group_id", groupId)
    .eq("user_id", user.sub)
    .returns<BookingRow[]>();

  if (!bookings || bookings.length !== 2 || bookings.some((b) => b.status !== "pending")) {
    // Pas d'erreur technique : la page de paiement sait déjà afficher
    // l'état correct (introuvable / déjà payé / annulé).
    redirect(`/reservation/aller-retour/${groupId}/paiement`);
  }

  // Avoir éventuellement sélectionné sur la page — la fonction SQL relit
  // et réclame elle-même l'avoir (ownership, statut, expiration) dans la
  // même transaction que l'écriture des paiements, donc rien à revérifier
  // ici au-delà de transmettre l'id brut. Une valeur vide (option "Ne pas
  // utiliser d'avoir") ou absente devient null.
  const voucherIdRaw = String(formData.get("voucherId") ?? "").trim();
  const voucherId = voucherIdRaw || null;

  const { error } = await supabaseAdmin.rpc("simulate_round_trip_payment", {
    p_booking_group_id: groupId,
    p_user_id: user.sub,
    p_voucher_id: voucherId,
  });

  if (error) {
    console.error("Impossible de payer l'aller-retour :", error.message);
    redirect(`/reservation/aller-retour/${groupId}/paiement`);
  }

  // Un seul e-mail pour les deux legs — voir sendBookingConfirmation() et
  // buildBookingConfirmationPayload.ts. Échec d'envoi jamais bloquant,
  // même raisonnement que le paiement simple.
  await sendBookingConfirmation({ bookingGroupId: groupId });

  // Si l'avoir appliqué dépassait le total combiné, la fonction SQL a déjà
  // mis le reliquat en refund_pending — reste à en informer le voyageur.
  // On ne connaît pas ce reliquat depuis ce code (calculé dans la
  // transaction SQL), donc on relit l'état actuel de l'avoir plutôt que de
  // le recalculer côté TS.
  if (voucherId) {
    const { data: voucher } = await supabaseAdmin
      .from("vouchers")
      .select("status, refund_notified_at")
      .eq("id", voucherId)
      .maybeSingle<{ status: string; refund_notified_at: string | null }>();

    if (voucher?.status === "refund_pending" && !voucher.refund_notified_at) {
      await sendVoucherRefundPendingNotification({ voucherId });
    }
  }

  redirect(`/reservation/aller-retour/${groupId}/succes`);
}
