import Link from "next/link";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { generateTicketQrSvg } from "@/lib/qrcode";
import { formatFcfa } from "shared";

type BookingWithTrip = {
  id: string;
  leg: "outbound" | "return";
  booking_reference: string;
  status: string;
  seat_count: number;
  total_price_fcfa: number;
  trips: { departure_at: string; routes: { origin_city: string; destination_city: string } } | null;
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
      "id, leg, booking_reference, status, seat_count, total_price_fcfa, trips(departure_at, routes(origin_city, destination_city))"
    )
    .eq("booking_group_id", groupId)
    .eq("user_id", user.sub)
    .returns<BookingWithTrip[]>();

  if (!bookings || bookings.length !== 2) {
    return <Message>Cet aller-retour n&apos;existe pas.</Message>;
  }

  const outbound = bookings.find((b) => b.leg === "outbound")!;
  const returnLeg = bookings.find((b) => b.leg === "return")!;

  if (outbound.status !== "confirmed" || returnLeg.status !== "confirmed") {
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

        {legs.map(({ label, booking, qrSvg }) => (
          <div key={booking.id} className="mt-4 border-t border-border pt-4 text-left text-sm">
            <p className="font-semibold text-foreground">{label}</p>
            <p className="text-muted">
              Référence :{" "}
              <span className="font-semibold text-foreground">{booking.booking_reference}</span>
            </p>
            {booking.trips ? (
              <p className="text-muted">
                {booking.trips.routes.origin_city} → {booking.trips.routes.destination_city} ·{" "}
                {booking.seat_count} place{booking.seat_count > 1 ? "s" : ""}
              </p>
            ) : null}
            <div
              className="mx-auto mt-3 w-fit rounded-xl bg-white p-3"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          </div>
        ))}

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
