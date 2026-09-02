import Link from "next/link";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { generateTicketQrSvg } from "@/lib/qrcode";
import { formatFcfa } from "shared";
import { DurationBadge, formatDepartureDateTime, formatDepartureTime } from "../../../../recherche/_shared";
import { CancelBookingButton } from "../../../CancelBookingButton";

type BookingWithTrip = {
  id: string;
  leg: "outbound" | "return";
  booking_reference: string;
  status: string;
  seat_count: number;
  total_price_fcfa: number;
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

export default async function SuccesAllerRetourPage(
  props: PageProps<"/reservation/aller-retour/[groupId]/succes">
) {
  const { groupId } = await props.params;
  const user = await requireUser(`/reservation/aller-retour/${groupId}/succes`);

  const supabase = await createClient();

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, leg, booking_reference, status, seat_count, total_price_fcfa, trips(departure_at, arrival_at, bus_number, routes(origin_city, destination_city)), passengers(id, full_name, seat_number), payments(base_amount_fcfa, status)"
    )
    .eq("booking_group_id", groupId)
    .eq("user_id", user.sub)
    .returns<BookingWithTrip[]>();

  if (!bookings || bookings.length !== 2) {
    return <Message>Cet aller-retour n&apos;existe pas.</Message>;
  }

  const outbound = bookings.find((b) => b.leg === "outbound")!;
  const returnLeg = bookings.find((b) => b.leg === "return")!;

  // "pending" seul signifie "jamais payé" — un leg "cancelled" a bien été
  // payé puis annulé indépendamment de l'autre (voir cancel_booking()),
  // ce n'est pas "pas encore payé" et ne doit pas afficher cette invite à
  // payer.
  if (outbound.status === "pending" || returnLeg.status === "pending") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="max-w-sm rounded-2xl border border-border bg-surface p-6 text-muted">
          Cet aller-retour n&apos;a pas encore été payé.
        </p>
        <Link
          href={`/reservation/aller-retour/${groupId}/paiement`}
          className="font-semibold text-primary hover:underline"
        >
          Payer maintenant →
        </Link>
      </div>
    );
  }

  const totalPaidFcfa = outbound.total_price_fcfa + returnLeg.total_price_fcfa;

  // Points réellement crédités, lus directement dans points_ledger — pas
  // recalculés — pour chacun des deux paiements indépendants.
  const { data: ledgerEntries } = await supabase
    .from("points_ledger")
    .select("booking_id, points_amount")
    .in("booking_id", [outbound.id, returnLeg.id])
    .returns<{ booking_id: string; points_amount: number }[]>();

  const totalPointsEarned = (ledgerEntries ?? []).reduce((sum, entry) => sum + entry.points_amount, 0);

  const legs = await Promise.all(
    [
      { label: "Aller", booking: outbound },
      { label: "Retour", booking: returnLeg },
    ].map(async (leg) => ({ ...leg, qrSvg: await generateTicketQrSvg(leg.booking.booking_reference) }))
  );

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <span className="text-4xl">🎉</span>
        <h1 className="mt-3 font-display text-2xl font-extrabold text-foreground">
          Aller-retour confirmé
        </h1>

        {legs.map(({ label, booking, qrSvg }) => {
          // Prévisualisation par leg — chaque leg a son propre départ, son
          // propre paiement, et est annulable indépendamment de l'autre.
          const approvedPayment = booking.payments.find((p) => p.status === "approved");
          const departureAt = booking.trips ? new Date(booking.trips.departure_at).getTime() : 0;
          const canCancel =
            booking.status === "confirmed" &&
            booking.trips !== null &&
            departureAt > Date.now() &&
            !!approvedPayment;
          const refundPreviewFcfa =
            canCancel && departureAt - Date.now() > 30 * 60 * 1000 ? approvedPayment!.base_amount_fcfa : 0;

          return (
          <div key={booking.id} className="mt-4 border-t border-border pt-4 text-left text-sm">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-foreground">{label}</p>
              {booking.status === "cancelled" ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                  Annulée
                </span>
              ) : null}
            </div>
            <p className="text-muted">
              Référence :{" "}
              <span className="font-semibold text-foreground">{booking.booking_reference}</span>
            </p>
            {booking.trips ? (
              <>
                <p className="text-muted">
                  {booking.trips.routes.origin_city} → {booking.trips.routes.destination_city}
                </p>
                {booking.trips.arrival_at ? (
                  <div className="mt-1 flex flex-col items-center gap-1">
                    <DurationBadge
                      departureAt={booking.trips.departure_at}
                      arrivalAt={booking.trips.arrival_at}
                    />
                    <p className="text-muted">
                      {formatDepartureTime(booking.trips.departure_at)} →{" "}
                      {formatDepartureTime(booking.trips.arrival_at)}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted">
                    Départ {formatDepartureDateTime(booking.trips.departure_at)}
                  </p>
                )}
                <p className="text-muted">Bus n° {booking.trips.bus_number}</p>
              </>
            ) : null}
            <div className="mt-2 flex flex-col gap-1">
              {booking.passengers.map((passenger) => (
                <div key={passenger.id} className="flex items-center justify-between">
                  <span className="text-foreground">{passenger.full_name}</span>
                  <span className="text-muted">
                    {passenger.seat_number ? `Siège ${passenger.seat_number}` : "—"}
                  </span>
                </div>
              ))}
            </div>
            <div
              className="mx-auto mt-3 w-fit rounded-xl bg-white p-3"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            {canCancel ? (
              <CancelBookingButton bookingId={booking.id} refundPreviewFcfa={refundPreviewFcfa} />
            ) : null}
          </div>
          );
        })}

        <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm">
          <span className="text-muted">Montant total payé</span>
          <span className="text-foreground">{formatFcfa(totalPaidFcfa)}</span>
        </div>

        {ledgerEntries && ledgerEntries.length > 0 ? (
          <p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-foreground">
            + {totalPointsEarned} GoBus Points crédités
          </p>
        ) : null}

        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
