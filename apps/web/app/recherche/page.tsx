import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatFcfa } from "shared";
import { EmptyState, PageShell, RouteLine, SEAT_CLASS_LABELS, formatDepartureTime } from "./_shared";

type TripSearchResult = {
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

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function formatSearchDate(date: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "long",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(`${date}T12:00:00Z`));
}

async function searchTrips(
  origin: string,
  destination: string,
  date: string
): Promise<TripSearchResult[]> {
  // Day boundaries treated as plain UTC (no dedicated timezone convention
  // for stored data yet); Africa/Porto-Novo (UTC+1, no DST) only enters
  // display formatting below.
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = new Date(new Date(startOfDay).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, departure_at, seat_class, price_fcfa, available_seats, routes!inner(origin_city, destination_city), companies!inner(name)"
    )
    .eq("routes.origin_city", origin)
    .eq("routes.destination_city", destination)
    .gte("departure_at", startOfDay)
    .lt("departure_at", endOfDay)
    .order("price_fcfa", { ascending: true });

  if (error) {
    console.error("Impossible de charger les résultats de recherche :", error.message);
    return [];
  }

  return (data ?? []) as unknown as TripSearchResult[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OutboundSummary = {
  id: string;
  departure_at: string;
  routes: { origin_city: string; destination_city: string };
};

async function getOutboundTrip(tripId: string): Promise<OutboundSummary | null> {
  if (!UUID_RE.test(tripId)) return null;

  const { data, error } = await supabase
    .from("trips")
    .select("id, departure_at, routes!inner(origin_city, destination_city)")
    .eq("id", tripId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger le trajet aller :", error.message);
    return null;
  }

  return data as unknown as OutboundSummary | null;
}

export default async function RecherchePage(props: PageProps<"/recherche">) {
  const params = await props.searchParams;
  const origin = firstValue(params.origin);
  const destination = firstValue(params.destination);
  const date = firstValue(params.date);
  const returnDate = firstValue(params.returnDate);
  const passengers = firstValue(params.passengers) ?? "1";
  const outboundTripId = firstValue(params.outboundTripId);

  if (!origin || !destination || !date || !isValidDate(date)) {
    return (
      <PageShell title="Résultats de recherche">
        <EmptyState>
          Recherche invalide. Merci de relancer une recherche depuis la page d&apos;accueil.
        </EmptyState>
      </PageShell>
    );
  }

  // Presence of outboundTripId means this search IS the return leg of a
  // round trip (the traveler already picked their outbound trip) — each
  // result here must lead to the combined round-trip confirmation page,
  // not to a plain one-way booking. Presence of returnDate alone (no
  // outboundTripId yet) means this is the OUTBOUND leg of a round trip —
  // each result must carry returnDate/passengers forward so
  // /recherche/[tripId] knows to ask for a return trip next, instead of
  // going straight to a one-way BookingForm.
  const [results, outboundTrip] = await Promise.all([
    searchTrips(origin, destination, date),
    outboundTripId ? getOutboundTrip(outboundTripId) : Promise.resolve(null),
  ]);

  return (
    <PageShell title={`${origin} → ${destination}`}>
      {outboundTripId && outboundTrip ? (
        <p className="mb-4 rounded-xl bg-primary/10 px-4 py-3 text-sm text-muted">
          Trajet aller sélectionné :{" "}
          <span className="font-semibold text-foreground">
            {outboundTrip.routes.origin_city} → {outboundTrip.routes.destination_city}
          </span>{" "}
          le {formatDepartureTime(outboundTrip.departure_at)} — choisissez maintenant votre trajet
          retour.
        </p>
      ) : null}

      {results.length === 0 ? (
        <EmptyState>
          Aucun trajet trouvé pour {origin} → {destination} le {formatSearchDate(date)}.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {results.map((trip) => {
            const href =
              outboundTripId && outboundTrip
                ? `/reservation/aller-retour/nouveau?outbound=${outboundTripId}&return=${trip.id}&passengers=${passengers}`
                : returnDate
                  ? `/recherche/${trip.id}?returnDate=${returnDate}&passengers=${passengers}`
                  : `/recherche/${trip.id}`;

            return (
              <li key={trip.id}>
                <Link
                  href={href}
                  className="group flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary sm:flex-row sm:items-center sm:justify-between"
                >
                <div className="flex flex-1 flex-col gap-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted">
                    <span>{trip.companies.name}</span>
                    <span aria-hidden className="text-border">
                      ·
                    </span>
                    <span>{SEAT_CLASS_LABELS[trip.seat_class] ?? trip.seat_class}</span>
                  </div>
                  <RouteLine
                    origin={trip.routes.origin_city}
                    destination={trip.routes.destination_city}
                    departureLabel={`Départ ${formatDepartureTime(trip.departure_at)}`}
                  />
                  <span className="text-sm text-muted">
                    {trip.available_seats} place{trip.available_seats > 1 ? "s" : ""} disponible
                    {trip.available_seats > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-3 border-t border-border pt-4 sm:flex-col sm:items-end sm:gap-1 sm:border-t-0 sm:pt-0">
                  <span className="font-display text-2xl font-extrabold text-foreground">
                    {formatFcfa(trip.price_fcfa)}
                  </span>
                  <span className="text-sm font-semibold text-primary group-hover:underline">
                    Voir le trajet →
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
