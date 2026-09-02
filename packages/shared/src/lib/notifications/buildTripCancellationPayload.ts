import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import type { TripCancellationPayload } from "./types";

type BookingRow = {
  booking_reference: string;
  user_id: string;
  trips: {
    departure_at: string;
    routes: { origin_city: string; destination_city: string };
    companies: { name: string };
  };
  payments: { refunded_amount_fcfa: number | null; status: string }[];
};

const BOOKING_SELECT =
  "booking_reference, user_id, " +
  "trips(departure_at, routes(origin_city, destination_city), companies(name)), " +
  "payments(refunded_amount_fcfa, status)";

// Utilise exclusivement supabaseAdmin (service_role), comme
// buildBookingConfirmationPayload — appelée depuis cancelTrip
// (apps/backoffice), qui n'a aucune session voyageur du tout, seulement
// une session compagnie. Le remboursement lui-même a déjà été effectué
// (refund_and_cancel_booking) par le moment où cette fonction est
// appelée — elle ne fait que lire le résultat pour le restituer au
// voyageur.
export async function buildTripCancellationPayload(target: {
  bookingId: string;
}): Promise<TripCancellationPayload> {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", target.bookingId)
    .maybeSingle<BookingRow>();

  if (error) throw new Error(`Impossible de charger la réservation : ${error.message}`);
  if (!booking) throw new Error("Réservation introuvable pour la notification d'annulation");

  const refundedPayment = booking.payments.find((p) => p.status === "refunded");
  if (!refundedPayment) {
    throw new Error("Aucun paiement remboursé trouvé — la réservation n'a pas encore été traitée");
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
    booking.user_id
  );
  if (userError || !userData.user?.email) {
    throw new Error(
      `Impossible de récupérer l'email du voyageur ${booking.user_id} : ${userError?.message}`
    );
  }

  return {
    recipientEmail: userData.user.email,
    bookingReference: booking.booking_reference,
    companyName: booking.trips.companies.name,
    originCity: booking.trips.routes.origin_city,
    destinationCity: booking.trips.routes.destination_city,
    departureAt: booking.trips.departure_at,
    refundedAmountFcfa: refundedPayment.refunded_amount_fcfa ?? 0,
    manageUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/gerer-ma-reservation`,
  };
}
