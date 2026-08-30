import { supabase } from "@/lib/supabase";
import { getOptionalUser } from "@/lib/supabase/dal";
import {
  EmptyState,
  PageShell,
  RouteLine,
  SEAT_CLASS_LABELS,
  formatDepartureDateTime,
} from "../../../recherche/_shared";
import { RoundTripBookingForm } from "./RoundTripBookingForm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TripSummary = {
  id: string;
  departure_at: string;
  seat_class: string;
  price_fcfa: number;
  available_seats: number;
  routes: { origin_city: string; destination_city: string };
  companies: { name: string };
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function getTrip(tripId: string): Promise<TripSummary | null> {
  if (!UUID_RE.test(tripId)) return null;

  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, departure_at, seat_class, price_fcfa, available_seats, routes!inner(origin_city, destination_city), companies!inner(name)"
    )
    .eq("id", tripId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger le trajet :", error.message);
    return null;
  }

  return data as unknown as TripSummary | null;
}

function TripCard({ label, trip }: { label: string; trip: TripSummary }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-foreground">
          {SEAT_CLASS_LABELS[trip.seat_class] ?? trip.seat_class}
        </span>
      </div>
      <RouteLine
        origin={trip.routes.origin_city}
        destination={trip.routes.destination_city}
        departureLabel={formatDepartureDateTime(trip.departure_at)}
      />
      <div className="flex items-center justify-between border-t border-border pt-3 text-sm text-muted">
        <span>{trip.companies.name}</span>
        <span>
          {trip.available_seats} place{trip.available_seats > 1 ? "s" : ""} disponible
          {trip.available_seats > 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

export default async function NouveauAllerRetourPage(
  props: PageProps<"/reservation/aller-retour/nouveau">
) {
  const searchParams = await props.searchParams;
  const outboundTripId = firstValue(searchParams.outbound);
  const returnTripId = firstValue(searchParams.return);

  const initialSeatCount = Number(firstValue(searchParams.seats));
  const initialPassengerName = firstValue(searchParams.name) ?? "";
  const initialPhone = firstValue(searchParams.phone) ?? "";

  if (!outboundTripId || !returnTripId) {
    return (
      <PageShell title="Aller-retour">
        <EmptyState>
          Sélection incomplète. Merci de relancer une recherche depuis la page d&apos;accueil.
        </EmptyState>
      </PageShell>
    );
  }

  const [outboundTrip, returnTrip, user] = await Promise.all([
    getTrip(outboundTripId),
    getTrip(returnTripId),
    getOptionalUser(),
  ]);

  if (!outboundTrip || !returnTrip) {
    return (
      <PageShell title="Aller-retour">
        <EmptyState>
          L&apos;un des deux trajets n&apos;existe plus. Merci de relancer une recherche depuis la
          page d&apos;accueil.
        </EmptyState>
      </PageShell>
    );
  }

  const maxSeats = Math.min(outboundTrip.available_seats, returnTrip.available_seats);

  return (
    <PageShell
      title={`${outboundTrip.routes.origin_city} ⇄ ${outboundTrip.routes.destination_city}`}
    >
      <div className="flex flex-col gap-4">
        <TripCard label="Aller" trip={outboundTrip} />
        <TripCard label="Retour" trip={returnTrip} />

        <RoundTripBookingForm
          outboundTripId={outboundTrip.id}
          returnTripId={returnTrip.id}
          outboundUnitPriceFcfa={outboundTrip.price_fcfa}
          returnUnitPriceFcfa={returnTrip.price_fcfa}
          maxSeats={maxSeats}
          isLoggedIn={!!user}
          initialSeatCount={
            Number.isInteger(initialSeatCount) && initialSeatCount > 0 ? initialSeatCount : 1
          }
          initialPassengerName={initialPassengerName}
          initialPhone={initialPhone}
        />
      </div>
    </PageShell>
  );
}
