import Link from "next/link";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { generateTicketQrSvg } from "@/lib/qrcode";
import { CancelBookingButton } from "../../CancelBookingButton";
import { BookingSuccessView } from "./BookingSuccessView";

type BookingWithTrip = {
  id: string;
  booking_reference: string;
  status: string;
  seat_count: number;
  total_price_fcfa: number;
  phone: string | null;
  trips: {
    departure_at: string;
    arrival_at: string | null;
    bus_number: string;
    routes: { origin_city: string; destination_city: string };
  } | null;
  passengers: { id: string; full_name: string; seat_number: string | null }[];
  payments: { base_amount_fcfa: number; status: string }[];
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

export default async function SuccesPage(props: PageProps<"/reservation/[bookingId]/succes">) {
  const { bookingId } = await props.params;
  const user = await requireUser(`/reservation/${bookingId}/succes`);

  const supabase = await createClient();

  const { data: booking } = await supabase
    .from("bookings")
    .select(
      "id, booking_reference, status, seat_count, total_price_fcfa, phone, trips(departure_at, arrival_at, bus_number, routes(origin_city, destination_city)), passengers(id, full_name, seat_number), payments(base_amount_fcfa, status)"
    )
    .eq("id", bookingId)
    .eq("user_id", user.sub)
    .maybeSingle<BookingWithTrip>();

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
          href={`/reservation/${booking.id}/paiement`}
          className="font-semibold text-primary hover:underline"
        >
          Payer maintenant →
        </Link>
      </div>
    );
  }

  // Le nombre de points affiché est lu directement dans points_ledger (pas
  // recalculé) — il correspond exactement à ce qui a réellement été
  // crédité par award_points_on_payment_approved, même si le taux venait à
  // changer entre-temps.
  const { data: ledgerEntry } = await supabase
    .from("points_ledger")
    .select("points_amount")
    .eq("booking_id", bookingId)
    .maybeSingle<{ points_amount: number }>();

  const qrSvg = await generateTicketQrSvg(booking.booking_reference);

  // Prévisualisation uniquement — cancel_booking() recalcule strictement
  // la même règle côté serveur au moment de l'annulation réelle. Calculé
  // ici (Server Component), jamais côté client. Plus de condition de
  // délai : un avoir de base_amount_fcfa est toujours accordé tant que le
  // trajet n'est pas déjà parti.
  const approvedPayment = booking.payments.find((p) => p.status === "approved");
  const departureAt = booking.trips ? new Date(booking.trips.departure_at).getTime() : 0;
  const canCancel = booking.trips !== null && departureAt > Date.now() && !!approvedPayment;
  const voucherPreviewFcfa = canCancel ? approvedPayment!.base_amount_fcfa : 0;

  return (
    <BookingSuccessView
      booking={booking}
      qrSvg={qrSvg}
      pointsEarned={ledgerEntry?.points_amount ?? null}
      cancelSlot={
        canCancel ? (
          <CancelBookingButton bookingId={booking.id} voucherPreviewFcfa={voucherPreviewFcfa} />
        ) : null
      }
    />
  );
}
