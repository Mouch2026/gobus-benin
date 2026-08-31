import Link from "next/link";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { formatFcfa } from "shared";
import { EmptyState, PageShell, formatDepartureDateTime } from "../../recherche/_shared";

type BookingRow = {
  id: string;
  booking_reference: string;
  status: string;
  total_price_fcfa: number;
  booking_group_id: string | null;
  leg: "outbound" | "return" | null;
  trips: {
    departure_at: string;
    bus_number: string;
    routes: { origin_city: string; destination_city: string };
  } | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente de paiement",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  completed: "Terminée",
};

const LEG_LABELS: Record<string, string> = {
  outbound: "Aller",
  return: "Retour",
};

async function getUserBookings(userId: string): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_reference, status, total_price_fcfa, booking_group_id, leg, trips!inner(departure_at, bus_number, routes(origin_city, destination_city))"
    )
    .eq("user_id", userId)
    // Verified live against this project's PostgREST: ordering by a
    // to-one embedded resource's column (trips(departure_at)) works —
    // soonest departure first.
    .order("trips(departure_at)", { ascending: true });

  if (error) {
    console.error("Impossible de charger les réservations :", error.message);
    return [];
  }

  return (data ?? []) as unknown as BookingRow[];
}

export default async function MesReservationsPage() {
  const user = await requireUser("/compte/reservations");
  const bookings = await getUserBookings(user.sub);

  return (
    <PageShell title="Mes réservations">
      {bookings.length === 0 ? (
        <EmptyState>
          Vous n&apos;avez pas encore de réservation.{" "}
          <Link href="/" className="font-semibold text-primary hover:underline">
            Rechercher un trajet →
          </Link>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {bookings.map((booking) => {
            const href = booking.booking_group_id
              ? `/reservation/aller-retour/${booking.booking_group_id}/succes`
              : `/reservation/${booking.id}/succes`;

            return (
              <li key={booking.id}>
                <Link
                  href={href}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{booking.booking_reference}</span>
                      {booking.leg ? (
                        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                          {LEG_LABELS[booking.leg] ?? booking.leg}
                        </span>
                      ) : null}
                    </div>
                    {booking.trips ? (
                      <span className="text-sm text-muted">
                        {booking.trips.routes.origin_city} → {booking.trips.routes.destination_city} ·{" "}
                        {formatDepartureDateTime(booking.trips.departure_at)} · Bus n°{" "}
                        {booking.trips.bus_number}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted">
                      {STATUS_LABELS[booking.status] ?? booking.status}
                    </span>
                    <span className="font-display text-lg font-extrabold text-foreground">
                      {formatFcfa(booking.total_price_fcfa)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
