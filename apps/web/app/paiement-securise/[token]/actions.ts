"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateServiceFees } from "shared";
import { sendBookingConfirmation } from "shared/src/lib/notifications/sendBookingConfirmation";

type BookingForTokenPayment = {
  id: string;
  status: string;
  total_price_fcfa: number;
  payment_token_expires_at: string | null;
  trips: { departure_at: string } | null;
};

// Pas de requireUser() ici — c'est tout le sens de cette page : le client
// n'a pas de session, seul le jeton (déjà vérifié une première fois par
// la page elle-même) fait foi. Revérifié intégralement ici (jamais
// confiance dans le seul rendu de la page précédente) : jeton, statut
// 'pending', expiration, trajet pas parti — même esprit que la
// revalidation déjà en place sur le flux authentifié
// (simulatePayment, apps/web/app/reservation/[bookingId]/paiement/actions.ts).
export async function payViaToken(token: string): Promise<void> {
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("id, status, total_price_fcfa, payment_token_expires_at, trips(departure_at)")
    .eq("payment_token", token)
    .maybeSingle<BookingForTokenPayment>();

  if (
    !booking ||
    booking.status !== "pending" ||
    !booking.payment_token_expires_at ||
    new Date(booking.payment_token_expires_at) <= new Date()
  ) {
    // Message générique affiché par la page elle-même (jeton introuvable,
    // déjà utilisé ou expiré — jamais distingué ici, pas d'oracle).
    redirect(`/paiement-securise/${token}`);
  }

  // Le trajet a pu partir depuis l'envoi du lien — aucun paiement approuvé
  // n'existe encore à ce stade, une simple annulation suffit et libère le
  // siège via le trigger existant (même logique que simulatePayment).
  if (booking.trips && new Date(booking.trips.departure_at).getTime() <= Date.now()) {
    await supabaseAdmin.from("bookings").update({ status: "cancelled" }).eq("id", booking.id);
    redirect(`/paiement-securise/${token}`);
  }

  const baseAmountFcfa = booking.total_price_fcfa;
  const { platformFeeFcfa, transactionFeeFcfa } = calculateServiceFees(baseAmountFcfa);

  // Aucun avoir/point possible sur ce paiement : le compte du client vient
  // d'être créé (ou n'a jamais eu l'occasion d'en accumuler dans ce
  // contexte) — voucher_id/voucher_amount_fcfa/points_redeemed_fcfa
  // restent à leurs valeurs par défaut (null/0).
  const { data: payment, error: insertError } = await supabaseAdmin
    .from("payments")
    .insert({
      booking_id: booking.id,
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
    redirect(`/paiement-securise/${token}`);
  }

  // Update séparé (pas dans l'insert) pour déclencher
  // award_points_on_payment_approved (before update of status), qui
  // compare old.status <> 'approved' — inexistant à l'insert. Même
  // séquence que simulatePayment.
  await supabaseAdmin
    .from("payments")
    .update({ status: "approved", paid_at: new Date().toISOString() })
    .eq("id", payment.id);

  await supabaseAdmin.from("bookings").update({ status: "confirmed" }).eq("id", booking.id);

  // sendBookingConfirmation est générique (juste un bookingId) — déjà
  // utilisée pour les réservations créées par le voyageur lui-même,
  // réutilisée telle quelle ici sans aucune modification.
  await sendBookingConfirmation({ bookingId: booking.id });

  redirect(`/paiement-securise/${token}/succes`);
}
