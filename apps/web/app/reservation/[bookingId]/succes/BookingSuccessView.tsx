import Link from "next/link";
import { formatFcfa } from "shared";
import { DurationBadge, formatDepartureDateTime, formatDepartureTime } from "../../../recherche/_shared";

export type BookingSuccessData = {
  id: string;
  booking_reference: string;
  total_price_fcfa: number;
  trips: {
    departure_at: string;
    arrival_at: string | null;
    bus_number: string;
    routes: { origin_city: string; destination_city: string };
  } | null;
  passengers: { id: string; full_name: string; seat_number: string | null }[];
};

// Extrait de /reservation/[bookingId]/succes pour être réutilisé par
// /paiement-securise/[token]/succes (chantier "Nouvelle réservation" côté
// compagnie) : même présentation quelle que soit la façon dont le
// voyageur y arrive (session authentifiée ou jeton de paiement) — seule
// la récupération des données (et la présence ou non d'un bouton
// d'annulation, propre au flux authentifié) diffère entre les deux pages
// appelantes.
export function BookingSuccessView({
  booking,
  qrSvg,
  pointsEarned,
  cancelSlot,
}: {
  booking: BookingSuccessData;
  qrSvg: string;
  pointsEarned: number | null;
  cancelSlot?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
        <span className="text-4xl">🎉</span>
        <h1 className="mt-3 font-display text-2xl font-extrabold text-foreground">
          Réservation confirmée
        </h1>
        <p className="mt-1 text-sm text-muted">
          Référence : <span className="font-semibold text-foreground">{booking.booking_reference}</span>
        </p>

        <div
          className="mx-auto mt-4 w-fit rounded-xl bg-white p-3"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />

        {booking.trips ? (
          <>
            <p className="mt-4 text-foreground">
              {booking.trips.routes.origin_city} → {booking.trips.routes.destination_city}
            </p>
            {booking.trips.arrival_at ? (
              <div className="mt-2 flex flex-col items-center gap-1">
                <DurationBadge
                  departureAt={booking.trips.departure_at}
                  arrivalAt={booking.trips.arrival_at}
                />
                <p className="text-sm text-muted">
                  {formatDepartureTime(booking.trips.departure_at)} →{" "}
                  {formatDepartureTime(booking.trips.arrival_at)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                Départ {formatDepartureDateTime(booking.trips.departure_at)}
              </p>
            )}
            <p className="text-sm text-muted">Bus n° {booking.trips.bus_number}</p>
          </>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-left text-sm">
          {booking.passengers.map((passenger) => (
            <div key={passenger.id} className="flex items-center justify-between">
              <span className="text-foreground">{passenger.full_name}</span>
              <span className="text-muted">
                {passenger.seat_number ? `Siège ${passenger.seat_number}` : "—"}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-muted">Montant payé</span>
            <span className="text-foreground">{formatFcfa(booking.total_price_fcfa)}</span>
          </div>
        </div>

        {pointsEarned !== null ? (
          <p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-foreground">
            + {pointsEarned} GoBus Points crédités
          </p>
        ) : null}

        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          Retour à l&apos;accueil
        </Link>

        {cancelSlot}
      </div>
    </div>
  );
}
