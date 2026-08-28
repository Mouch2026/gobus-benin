import { supabase } from "@/lib/supabase";
import { formatFcfa } from "shared";
import { EmptyState, PageShell, SEAT_CLASS_LABELS, formatDepartureDateTime } from "../_shared";
import { BookingForm } from "./BookingForm";

type TripDetail = {
  id: string;
  departure_at: string;
  seat_class: string;
  price_fcfa: number;
  available_seats: number;
  routes: { origin_city: string; destination_city: string };
  companies: { name: string };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getTrip(tripId: string): Promise<TripDetail | null> {
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

  return data as unknown as TripDetail | null;
}

export default async function TripDetailPage(props: PageProps<"/recherche/[tripId]">) {
  const { tripId } = await props.params;
  const trip = await getTrip(tripId);

  if (!trip) {
    return (
      <PageShell title="Trajet introuvable">
        <EmptyState>
          Ce trajet n&apos;existe pas ou n&apos;est plus disponible. Merci de relancer une
          recherche depuis la page d&apos;accueil.
        </EmptyState>
      </PageShell>
    );
  }

  return (
    <PageShell title={`${trip.routes.origin_city} → ${trip.routes.destination_city}`}>
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
            {trip.companies.name}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-zinc-500 dark:text-zinc-400">Trajet</dt>
            <dd className="text-zinc-950 dark:text-zinc-50">
              {trip.routes.origin_city} → {trip.routes.destination_city}
            </dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Départ</dt>
            <dd className="text-zinc-950 dark:text-zinc-50">
              {formatDepartureDateTime(trip.departure_at)}
            </dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Classe</dt>
            <dd className="text-zinc-950 dark:text-zinc-50">
              {SEAT_CLASS_LABELS[trip.seat_class] ?? trip.seat_class}
            </dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Prix unitaire</dt>
            <dd className="text-zinc-950 dark:text-zinc-50">{formatFcfa(trip.price_fcfa)}</dd>
            <dt className="text-zinc-500 dark:text-zinc-400">Places disponibles</dt>
            <dd className="text-zinc-950 dark:text-zinc-50">{trip.available_seats}</dd>
          </dl>
        </div>

        <BookingForm unitPriceFcfa={trip.price_fcfa} availableSeats={trip.available_seats} />
      </div>
    </PageShell>
  );
}
