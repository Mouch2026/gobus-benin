import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SEAT_CLASS_LABELS } from "@/app/recherche/_shared";
import type { BookingConfirmationLeg, BookingConfirmationPayload } from "./types";

type BookingRow = {
  id: string;
  booking_reference: string;
  leg: "outbound" | "return" | null;
  user_id: string;
  phone: string | null;
  trips: {
    departure_at: string;
    arrival_at: string | null;
    bus_number: string;
    seat_class: string;
    routes: { origin_city: string; destination_city: string };
    companies: { name: string; logo_url: string | null };
  };
  passengers: { full_name: string; seat_number: string | null }[];
  payments: {
    base_amount_fcfa: number;
    platform_fee_fcfa: number;
    transaction_fee_fcfa: number;
    amount_fcfa: number;
  }[];
};

const BOOKING_SELECT =
  "id, booking_reference, leg, user_id, phone, " +
  "trips(departure_at, arrival_at, bus_number, seat_class, routes(origin_city, destination_city), companies(name, logo_url)), " +
  "passengers(full_name, seat_number), " +
  "payments(base_amount_fcfa, platform_fee_fcfa, transaction_fee_fcfa, amount_fcfa)";

function toLeg(booking: BookingRow): BookingConfirmationLeg {
  // Une seule ligne payments "approved" existe à ce stade (le paiement qui
  // vient de déclencher cet envoi) — payments() peut en théorie renvoyer
  // plusieurs lignes historiques, la plus récente est la bonne.
  const payment = booking.payments.at(-1);
  if (!payment) {
    throw new Error(`Aucun paiement trouvé pour la réservation ${booking.booking_reference}`);
  }

  return {
    legLabel: booking.leg === "outbound" ? "Aller" : booking.leg === "return" ? "Retour" : null,
    bookingReference: booking.booking_reference,
    companyName: booking.trips.companies.name,
    companyLogoUrl: booking.trips.companies.logo_url,
    originCity: booking.trips.routes.origin_city,
    destinationCity: booking.trips.routes.destination_city,
    departureAt: booking.trips.departure_at,
    arrivalAt: booking.trips.arrival_at,
    busNumber: booking.trips.bus_number,
    seatClassLabel: SEAT_CLASS_LABELS[booking.trips.seat_class] ?? booking.trips.seat_class,
    passengers: booking.passengers.map((p) => ({ fullName: p.full_name, seatNumber: p.seat_number })),
    price: {
      baseAmountFcfa: payment.base_amount_fcfa,
      platformFeeFcfa: payment.platform_fee_fcfa,
      transactionFeeFcfa: payment.transaction_fee_fcfa,
      totalFcfa: payment.amount_fcfa,
    },
  };
}

// Utilise exclusivement supabaseAdmin (service_role), jamais le client de
// requête cookie-based (lib/supabase/server.ts) : cette fonction doit
// rester appelable depuis un contexte sans session voyageur du tout — un
// futur webhook FedaPay serveur-à-serveur, en particulier — sans aucune
// réécriture. Les deux Server Actions de paiement actuelles écrivent déjà
// payments/bookings via ce même client ; lire avec lui juste après
// n'affaiblit rien (le paiement vient d'être approuvé par ce code même).
export async function buildBookingConfirmationPayload(
  target: { bookingId: string } | { bookingGroupId: string }
): Promise<BookingConfirmationPayload> {
  const query = supabaseAdmin.from("bookings").select(BOOKING_SELECT);

  const { data, error } =
    "bookingId" in target
      ? await query.eq("id", target.bookingId).returns<BookingRow[]>()
      : await query
          .eq("booking_group_id", target.bookingGroupId)
          .order("leg", { ascending: true }) // 'outbound' < 'return' alphabétiquement : aller avant retour
          .returns<BookingRow[]>();

  if (error) throw new Error(`Impossible de charger la réservation : ${error.message}`);
  if (!data || data.length === 0) throw new Error("Réservation introuvable pour l'envoi de confirmation");

  const legs = data.map(toLeg);
  const totalPaidFcfa = legs.reduce((sum, leg) => sum + leg.price.totalFcfa, 0);

  const userId = data[0].user_id;
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData.user?.email) {
    throw new Error(`Impossible de récupérer l'email du voyageur ${userId} : ${userError?.message}`);
  }

  return {
    recipientEmail: userData.user.email,
    phone: data[0].phone,
    legs,
    totalPaidFcfa,
    manageUrl: `${process.env.NEXT_PUBLIC_WEB_URL}/gerer-ma-reservation`,
  };
}
