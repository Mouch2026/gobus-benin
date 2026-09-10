"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendBookingConfirmation } from "shared/src/lib/notifications/sendBookingConfirmation";

type PaymentForTokenPayment = {
  id: string;
  booking_id: string;
  status: string;
  payment_token_expires_at: string | null;
  bookings: { status: string; trips: { departure_at: string } | null } | null;
};

// Depuis le chantier "paiements scindés" : le jeton identifie une PART de
// paiement (payments.payment_token), pas la réservation entière — cette
// action ne fait que confirmer CETTE part. record_payment_part_received
// (SQL) décide seul si la somme des parts reçues atteint désormais
// total_price_fcfa ; ce n'est QUE dans ce cas que la réservation passe à
// 'confirmed' et que la confirmation est envoyée — jamais avant, même si
// cette part-ci est payée avec succès (voir le plan, réponse au point 3).
export async function payViaToken(token: string): Promise<void> {
  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("id, booking_id, status, payment_token_expires_at, bookings(status, trips(departure_at))")
    .eq("payment_token", token)
    .maybeSingle<PaymentForTokenPayment>();

  if (
    !payment ||
    payment.status !== "pending" ||
    !payment.payment_token_expires_at ||
    new Date(payment.payment_token_expires_at) <= new Date() ||
    !payment.bookings ||
    payment.bookings.status === "cancelled"
  ) {
    redirect(`/paiement-securise/${token}`);
  }

  const booking = payment!.bookings!;

  if (booking.trips && new Date(booking.trips.departure_at).getTime() <= Date.now()) {
    // Aucune autre part n'a encore été confirmée à ce stade (cette part
    // est encore 'pending') — une simple annulation directe suffit, comme
    // pour le flux voyageur normal. Si d'autres parts de cette réservation
    // sont déjà 'received'/'approved', cancel_booking_by_company reste la
    // voie pour les récupérer sous forme d'avoir — hors de portée d'un
    // client sans session sur cette page.
    await supabaseAdmin.from("bookings").update({ status: "cancelled" }).eq("id", payment!.booking_id);
    redirect(`/paiement-securise/${token}`);
  }

  const { data: result, error: rpcError } = await supabaseAdmin
    .rpc("record_payment_part_received", { p_payment_id: payment!.id })
    .single<{ booking_confirmed: boolean }>();

  if (rpcError || !result) {
    console.error("Impossible de valider cette part de paiement :", rpcError?.message);
    redirect(`/paiement-securise/${token}`);
  }

  if (result!.booking_confirmed) {
    await sendBookingConfirmation({ bookingId: payment!.booking_id });
    redirect(`/paiement-securise/${token}/succes`);
  }

  redirect(`/paiement-securise/${token}/en-attente`);
}
