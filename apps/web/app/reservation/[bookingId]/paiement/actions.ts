"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateServiceFees } from "shared";
import { sendBookingConfirmation } from "shared/src/lib/notifications/sendBookingConfirmation";

type BookingForPayment = {
  id: string;
  status: string;
  total_price_fcfa: number;
};

// SIMULÉ — à remplacer par une vraie intégration FedaPay (create-payment /
// payment-webhook, voir CLAUDE.md) une fois branchée, pour l'abonnement
// compagnie et les billets voyageurs en même temps. Même mécanisme que
// apps/web/app/partenaires/paiement/actions.ts (insert 'pending' PUIS
// update 'approved', pour déclencher le trigger existant qui ne réagit
// qu'à un update de `status`).
export async function simulatePayment(bookingId: string): Promise<void> {
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
  const { platformFeeFcfa, transactionFeeFcfa } = calculateServiceFees(baseAmountFcfa);

  // payments reste volontairement "lecture seule pour le client" (RLS ne
  // définit qu'une policy select) — ces deux écritures passent par
  // service_role, comme pour l'abonnement compagnie, pas par un nouveau
  // GRANT insert pour authenticated.
  const { data: payment, error: insertError } = await supabaseAdmin
    .from("payments")
    .insert({
      booking_id: bookingId,
      base_amount_fcfa: baseAmountFcfa,
      platform_fee_fcfa: platformFeeFcfa,
      transaction_fee_fcfa: transactionFeeFcfa,
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
  // l'insert.
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

  redirect(`/reservation/${bookingId}/succes`);
}
