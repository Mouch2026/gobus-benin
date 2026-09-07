import "server-only";
import { supabaseAdmin } from "./supabaseAdmin";
import type { TripCancellationPayload } from "./types";

type BookingRow = {
  id: string;
  booking_reference: string;
  user_id: string;
  trips: {
    departure_at: string;
    routes: { origin_city: string; destination_city: string };
    companies: { name: string };
  };
  payments: { status: string }[];
};

const BOOKING_SELECT =
  "id, booking_reference, user_id, " +
  "trips(departure_at, routes(origin_city, destination_city), companies(name)), " +
  "payments(status)";

// Utilise exclusivement supabaseAdmin (service_role), comme
// buildBookingConfirmationPayload — appelée depuis cancelTrip
// (apps/backoffice), qui n'a aucune session voyageur du tout, seulement
// une session compagnie. L'avoir lui-même a déjà été émis
// (issue_voucher_and_cancel_booking) par le moment où cette fonction est
// appelée — elle ne fait que lire le résultat pour le restituer au
// voyageur. Depuis le passage au système d'avoir : ne lit plus un
// paiement 'refunded' mais l'avoir créé via origin_booking_id.
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

  const voucherIssuedPayment = booking.payments.find((p) => p.status === "voucher_issued");
  if (!voucherIssuedPayment) {
    throw new Error("Aucun paiement passé en avoir trouvé — la réservation n'a pas encore été traitée");
  }

  const { data: voucher, error: voucherError } = await supabaseAdmin
    .from("vouchers")
    .select("amount_fcfa, expires_at")
    .eq("origin_booking_id", booking.id)
    .maybeSingle<{ amount_fcfa: number; expires_at: string }>();

  if (voucherError || !voucher) {
    throw new Error(
      `Impossible de retrouver l'avoir émis pour la réservation ${booking.booking_reference} : ${voucherError?.message}`
    );
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
    userId: booking.user_id,
    recipientEmail: userData.user.email,
    bookingReference: booking.booking_reference,
    companyName: booking.trips.companies.name,
    originCity: booking.trips.routes.origin_city,
    destinationCity: booking.trips.routes.destination_city,
    departureAt: booking.trips.departure_at,
    voucherAmountFcfa: voucher.amount_fcfa,
    voucherExpiresAt: voucher.expires_at,
    manageUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/gerer-ma-reservation`,
  };
}
