import "server-only";
import { calculateServiceFees } from "../pricing";
import { supabaseAdmin } from "./supabaseAdmin";
import type { BookingPaymentLinkPayload } from "./types";

type BookingRow = {
  user_id: string;
  booking_reference: string;
  total_price_fcfa: number;
  payment_token: string | null;
  payment_token_expires_at: string | null;
  trips: {
    departure_at: string;
    companies: { name: string };
    routes: { origin_city: string; destination_city: string };
  };
};

const BOOKING_SELECT =
  "user_id, booking_reference, total_price_fcfa, payment_token, payment_token_expires_at, " +
  "trips(departure_at, companies(name), routes(origin_city, destination_city))";

// Re-lit tout depuis la réservation elle-même (même discipline que
// buildTripCancellationPayload/buildVoucherRefundPendingPayload) plutôt
// que de faire confiance à des valeurs déjà en mémoire côté appelant —
// une seule source de vérité. Le jeton et son expiration ont déjà été
// écrits sur bookings au moment de la création par le back-office ; cette
// fonction ne fait que les relire pour construire l'URL du lien.
export async function buildBookingPaymentLinkPayload(target: {
  bookingId: string;
}): Promise<BookingPaymentLinkPayload> {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", target.bookingId)
    .maybeSingle<BookingRow>();

  if (error) throw new Error(`Impossible de charger la réservation : ${error.message}`);
  if (!booking) throw new Error("Réservation introuvable pour la notification de lien de paiement");
  if (!booking.payment_token || !booking.payment_token_expires_at) {
    throw new Error(
      `Réservation ${booking.booking_reference} sans jeton de paiement — notification envoyée trop tôt`
    );
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
    booking.user_id
  );
  if (userError || !userData.user?.email) {
    throw new Error(
      `Impossible de récupérer l'email du client ${booking.user_id} : ${userError?.message}`
    );
  }

  // Aucun paiement n'existe encore à ce stade (la réservation vient
  // d'être créée, pas encore payée) — le montant dû se calcule donc à
  // partir du prix de base, jamais recalculé autrement que via
  // calculateServiceFees (packages/shared/src/lib/pricing.ts).
  const { totalFcfa } = calculateServiceFees(booking.total_price_fcfa);

  return {
    userId: booking.user_id,
    recipientEmail: userData.user.email,
    bookingReference: booking.booking_reference,
    companyName: booking.trips.companies.name,
    originCity: booking.trips.routes.origin_city,
    destinationCity: booking.trips.routes.destination_city,
    departureAt: booking.trips.departure_at,
    amountDueFcfa: totalFcfa,
    paymentUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/paiement-securise/${booking.payment_token}`,
    expiresAt: booking.payment_token_expires_at,
  };
}
