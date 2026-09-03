import Link from "next/link";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { sweepExpiredVouchers } from "@/lib/vouchers";
import { formatFcfa } from "shared";
import {
  EmptyState,
  PageShell,
  formatDepartureDateTime,
  formatDepartureTime,
} from "../../recherche/_shared";

type ActiveVoucher = {
  id: string;
  amount_fcfa: number;
  expires_at: string;
};

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

async function getActiveVouchers(userId: string): Promise<ActiveVoucher[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vouchers")
    .select("id, amount_fcfa, expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .returns<ActiveVoucher[]>();

  if (error) {
    console.error("Impossible de charger les avoirs :", error.message);
    return [];
  }

  return data ?? [];
}

type BookingRow = {
  id: string;
  booking_reference: string;
  status: string;
  total_price_fcfa: number;
  booking_group_id: string | null;
  leg: "outbound" | "return" | null;
  trips: {
    departure_at: string;
    arrival_at: string | null;
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
      "id, booking_reference, status, total_price_fcfa, booking_group_id, leg, trips!inner(departure_at, arrival_at, bus_number, routes(origin_city, destination_city))"
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

  // Couverture supplémentaire du sweep paresseux (voir aussi les pages de
  // paiement) — purge les avoirs de cet utilisateur qui viennent d'expirer
  // avant de lister ceux encore actifs.
  await sweepExpiredVouchers();
  const [bookings, activeVouchers] = await Promise.all([
    getUserBookings(user.sub),
    getActiveVouchers(user.sub),
  ]);

  return (
    <PageShell title="Mes réservations">
      {activeVouchers.length > 0 ? (
        <ul className="mb-6 flex flex-col gap-2">
          {activeVouchers.map((voucher) => (
            <li
              key={voucher.id}
              className="flex flex-col gap-1 rounded-2xl border border-primary/30 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="text-sm text-foreground">
                Vous avez un avoir de{" "}
                <span className="font-semibold">{formatFcfa(voucher.amount_fcfa)}</span>, valable
                jusqu&apos;au {formatExpiry(voucher.expires_at)}.
              </p>
              <Link href="/recherche" className="text-sm font-semibold text-primary hover:underline">
                Réserver un trajet →
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

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
                        {formatDepartureDateTime(booking.trips.departure_at)}
                        {booking.trips.arrival_at
                          ? ` → ${formatDepartureTime(booking.trips.arrival_at)}`
                          : ""}{" "}
                        · Bus n° {booking.trips.bus_number}
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
