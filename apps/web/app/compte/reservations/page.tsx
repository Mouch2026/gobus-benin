import Link from "next/link";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { sweepExpiredVouchers } from "@/lib/vouchers";
import { formatFcfa, estimateTripDurationHours } from "shared";
import { AccountShell } from "../_shared";
import { EmptyState, formatDepartureDateTime, formatDepartureTime } from "../../recherche/_shared";
import { NoterChauffeurButton } from "./NoterChauffeurButton";

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
    driver_id: string | null;
    routes: { origin_city: string; destination_city: string; distance_km: number | null };
  } | null;
  // La relation embarquée peut revenir en objet ou en tableau selon la
  // façon dont PostgREST résout l'unicité — même prudence déjà documentée
  // dans expire-vouchers/index.ts, jamais supposer une seule forme.
  driver_ratings: { id: string } | { id: string }[] | null;
};

// Éligibilité affichée = confort d'UI seulement ("le masquage n'est
// jamais la protection", voir permissions.ts côté back-office) — la
// vraie garantie est entièrement dans submit_driver_rating() (RPC), qui
// revérifie tout elle-même. Un trajet est "terminé" comme partout
// ailleurs dans ce projet : réel (arrival_at) si connu, sinon estimé via
// estimateTripDurationHours — jamais une troisième règle inventée.
function isEligibleForRating(booking: BookingRow): boolean {
  if (booking.status !== "confirmed" || !booking.trips || !booking.trips.driver_id) return false;
  const alreadyRated = Array.isArray(booking.driver_ratings)
    ? booking.driver_ratings.length > 0
    : booking.driver_ratings !== null;
  if (alreadyRated) return false;

  const { departure_at, arrival_at, routes } = booking.trips;
  const tripEndMs = arrival_at
    ? new Date(arrival_at).getTime()
    : new Date(departure_at).getTime() + estimateTripDurationHours(routes.distance_km) * 3600_000;
  return Date.now() >= tripEndMs;
}

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
      "id, booking_reference, status, total_price_fcfa, booking_group_id, leg, trips!inner(departure_at, arrival_at, bus_number, driver_id, routes(origin_city, destination_city, distance_km)), driver_ratings(id)"
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
  // paiement et /compte/paiements) — purge les avoirs de cet utilisateur
  // qui viennent d'expirer. Le détail des avoirs (montant, expiration,
  // statut) est désormais centralisé sur /compte/paiements — pas de
  // bannière dupliquée ici, pour éviter deux sources divergentes de la
  // même donnée.
  await sweepExpiredVouchers();
  const bookings = await getUserBookings(user.sub);

  return (
    <AccountShell active="/compte/reservations" title="Mes réservations">
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

            // Le bouton "Noter mon chauffeur" reste HORS du <Link> : un
            // <form>/<button> imbriqué dans un lien est invalide en HTML
            // (éléments interactifs imbriqués), donc rendu en frère dans
            // le même <li> plutôt qu'à l'intérieur.
            return (
              <li key={booking.id} className="flex flex-col gap-2">
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
                {isEligibleForRating(booking) ? (
                  <NoterChauffeurButton bookingId={booking.id} />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </AccountShell>
  );
}
