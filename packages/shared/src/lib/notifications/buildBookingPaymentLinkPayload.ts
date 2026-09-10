import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import type { BookingPaymentLinkPayload } from "./types";

type PaymentRow = {
  booking_id: string;
  method: string | null;
  amount_charged_fcfa: number;
  payment_token: string | null;
  payment_token_expires_at: string | null;
  bookings: {
    user_id: string;
    booking_reference: string;
    trips: {
      departure_at: string;
      companies: { name: string };
      routes: { origin_city: string; destination_city: string };
    };
  };
};

const PAYMENT_SELECT =
  "booking_id, method, amount_charged_fcfa, payment_token, payment_token_expires_at, " +
  "bookings(user_id, booking_reference, trips(departure_at, companies(name), routes(origin_city, destination_city)))";

const METHOD_LABELS: Record<string, string> = {
  mtn_money: "Mobile Money (MTN)",
  moov_money: "Mobile Money (Moov)",
  card: "Carte bancaire",
};

// Chaque PART de paiement "par lien" (Mobile Money ou Carte, depuis le
// chantier "paiements scindés") porte désormais son propre jeton
// (payments.payment_token) — cette fonction relit une part précise, pas
// la réservation entière, pour construire son lien et son montant.
// Même discipline que buildTripCancellationPayload/
// buildVoucherRefundPendingPayload : une seule source de vérité relue
// depuis la base, jamais des valeurs déjà en mémoire côté appelant.
export async function buildBookingPaymentLinkPayload(target: {
  paymentId: string;
}): Promise<BookingPaymentLinkPayload> {
  const { data: payment, error } = await supabaseAdmin
    .from("payments")
    .select(PAYMENT_SELECT)
    .eq("id", target.paymentId)
    .maybeSingle<PaymentRow>();

  if (error) throw new Error(`Impossible de charger le paiement : ${error.message}`);
  if (!payment) throw new Error("Paiement introuvable pour la notification de lien de paiement");
  if (!payment.payment_token || !payment.payment_token_expires_at) {
    throw new Error(
      `Paiement ${target.paymentId} sans jeton — notification envoyée trop tôt`
    );
  }

  const booking = payment.bookings;
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
    booking.user_id
  );
  if (userError || !userData.user?.email) {
    throw new Error(
      `Impossible de récupérer l'email du client ${booking.user_id} : ${userError?.message}`
    );
  }

  const paymentMethodLabel =
    (payment.method && METHOD_LABELS[payment.method]) || "Paiement en ligne";

  return {
    userId: booking.user_id,
    bookingId: payment.booking_id,
    recipientEmail: userData.user.email,
    bookingReference: booking.booking_reference,
    companyName: booking.trips.companies.name,
    originCity: booking.trips.routes.origin_city,
    destinationCity: booking.trips.routes.destination_city,
    departureAt: booking.trips.departure_at,
    paymentMethodLabel,
    // amount_charged_fcfa (colonne générée) reflète déjà, PART PAR PART,
    // base + frais de service - avoir - points s'ils sont attachés à
    // cette part précise — jamais recalculé ici.
    amountDueFcfa: payment.amount_charged_fcfa,
    paymentUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/paiement-securise/${payment.payment_token}`,
    expiresAt: payment.payment_token_expires_at,
  };
}
