import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateTicketQrSvg } from "@/lib/qrcode";
import { BookingSuccessView } from "../../../reservation/[bookingId]/succes/BookingSuccessView";

type BookingWithTrip = {
  id: string;
  booking_reference: string;
  status: string;
  total_price_fcfa: number;
  trips: {
    departure_at: string;
    arrival_at: string | null;
    bus_number: string;
    routes: { origin_city: string; destination_city: string };
  } | null;
  passengers: { id: string; full_name: string; seat_number: string | null }[];
};

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="max-w-sm rounded-2xl border border-border bg-surface p-6 text-muted">
        {children}
      </p>
      <Link href="/" className="font-semibold text-primary hover:underline">
        ← Retour à l&apos;accueil
      </Link>
    </div>
  );
}

// Page en lecture seule, sans requireUser() : le jeton reste valide pour
// CONSULTER la confirmation même après paiement (contrairement à la page
// de paiement elle-même, qui exige status='pending' — ici on n'exige que
// l'existence du jeton, jamais son expiration ni son statut, puisqu'aucune
// action financière n'est possible depuis cette page. Pas de bouton
// d'annulation ici (portée volontairement exclue, voir le plan) : ce
// client n'a pas de session pour appeler cancel_booking de toute façon.
//
// Depuis le chantier "paiements scindés" : le jeton identifie une PART de
// paiement, pas la réservation — on résout d'abord la réservation via
// cette part, puis on affiche exactement comme avant. Si la réservation
// est confirmée, TOUTES ses parts (y compris celle-ci) sont 'approved'
// par construction (record_payment_part_received les bascule ensemble) —
// pas besoin de revérifier le statut de cette part précise.
export default async function PaiementSecuriseSuccesPage(
  props: PageProps<"/paiement-securise/[token]/succes">
) {
  const { token } = await props.params;

  const { data: paymentRow } = await supabaseAdmin
    .from("payments")
    .select("booking_id")
    .eq("payment_token", token)
    .maybeSingle<{ booking_id: string }>();

  const { data: booking } = paymentRow
    ? await supabaseAdmin
        .from("bookings")
        .select(
          "id, booking_reference, status, total_price_fcfa, trips(departure_at, arrival_at, bus_number, routes(origin_city, destination_city)), passengers(id, full_name, seat_number)"
        )
        .eq("id", paymentRow.booking_id)
        .maybeSingle<BookingWithTrip>()
    : { data: null };

  if (!booking) {
    return <Message>Cette réservation n&apos;existe pas.</Message>;
  }

  if (booking.status !== "confirmed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="max-w-sm rounded-2xl border border-border bg-surface p-6 text-muted">
          Cette réservation n&apos;a pas encore été payée.
        </p>
        <Link
          href={`/paiement-securise/${token}`}
          className="font-semibold text-primary hover:underline"
        >
          Payer maintenant →
        </Link>
      </div>
    );
  }

  const { data: ledgerEntry } = await supabaseAdmin
    .from("points_ledger")
    .select("points_amount")
    .eq("booking_id", booking.id)
    .maybeSingle<{ points_amount: number }>();

  const qrSvg = await generateTicketQrSvg(booking.booking_reference);

  return (
    <BookingSuccessView booking={booking} qrSvg={qrSvg} pointsEarned={ledgerEntry?.points_amount ?? null} />
  );
}
