import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatFcfa } from "shared";
import { getDestinationCitiesForOrigin, getOriginCities } from "@/lib/routes";
import { SearchWidget } from "../SearchWidget";
import {
  CompanyLogo,
  DurationBadge,
  EmptyState,
  PageShell,
  RouteLine,
  SEAT_CLASS_LABELS,
  formatDepartureTime,
} from "./_shared";

type TripSearchResult = {
  id: string;
  departure_at: string;
  arrival_at: string | null;
  seat_class: string;
  price_fcfa: number;
  available_seats: number;
  routes: { origin_city: string; destination_city: string; line_number: string | null };
  companies: { name: string; logo_url: string | null };
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
      "id, departure_at, arrival_at, seat_class, price_fcfa, available_seats, routes!inner(origin_city, destination_city, line_number), companies!inner(name, logo_url)"
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
  const adults = firstValue(params.adults) ?? "1";
  const children = firstValue(params.children) ?? "0";
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

  const today = new Date().toISOString().split("T")[0];

  // Widget compact : préremplit avec la recherche en cours plutôt qu'un
  // formulaire vide. Suspendu pendant le choix du trajet retour
  // (outboundTripId) — la bannière "Trajet aller sélectionné" ci-dessous
  // gère déjà ce cas précis (villes inversées par rapport à une recherche
  // normale), un widget générique y ferait doublon/contresens.
  const showSearchWidget = !outboundTripId;
  const [originCities, destinationCitiesForOrigin] = await Promise.all([
    showSearchWidget ? getOriginCities() : Promise.resolve([]),
    showSearchWidget ? getDestinationCitiesForOrigin(origin) : Promise.resolve([]),
  ]);

  // Presence of outboundTripId means this search IS the return leg of a
  // round trip (the traveler already picked their outbound trip) — each
  // result here must lead to the combined round-trip confirmation page,
  // not to a plain one-way booking. Presence of returnDate alone (no
  // outboundTripId yet) means this is the OUTBOUND leg of a round trip —
  // each result must carry returnDate/adults/children forward so
  // /recherche/[tripId] knows to ask for a return trip next, instead of
  // going straight to a one-way BookingForm.
  const [results, outboundTrip] = await Promise.all([
    searchTrips(origin, destination, date),
    outboundTripId ? getOutboundTrip(outboundTripId) : Promise.resolve(null),
  ]);

  // Cette page sert aussi bien une recherche simple que l'un ou l'autre
  // des deux legs d'un aller-retour : returnDate (leg aller) ou
  // outboundTripId (leg retour) signalent tous les deux "aller-retour",
  // peu importe lequel des deux legs est affiché ici.
  const isRoundTrip = Boolean(returnDate) || Boolean(outboundTripId);
  const totalPassengers = Number(adults) + Number(children);

  return (
    <PageShell title={`${origin} → ${destination}`}>
      {showSearchWidget ? (
        <div className="mb-6 flex justify-center">
          <SearchWidget
            compact
            originCities={originCities}
            defaultOrigin={origin}
            initialDestinationCities={destinationCitiesForOrigin}
            initialDestination={destination}
            today={today}
            initialDate={date}
            initialReturnDate={returnDate && isValidDate(returnDate) ? returnDate : today}
            initialAdults={Number(adults)}
            initialChildren={Number(children)}
            initialTripType={returnDate ? "round-trip" : "one-way"}
          />
        </div>
      ) : null}

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
                ? `/reservation/aller-retour/nouveau?outbound=${outboundTripId}&return=${trip.id}&adults=${adults}&children=${children}`
                : returnDate
                  ? `/recherche/${trip.id}?returnDate=${returnDate}&adults=${adults}&children=${children}`
                  : `/recherche/${trip.id}`;

            return (
              <li key={trip.id}>
                <Link
                  href={href}
                  className="group flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary sm:flex-row sm:items-center"
                >
                  <CompanyLogo name={trip.companies.name} logoUrl={trip.companies.logo_url} />

                  <div className="flex flex-1 flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-muted">
                      <span>{trip.companies.name}</span>
                      {trip.routes.line_number ? (
                        <>
                          <span aria-hidden className="text-border">
                            ·
                          </span>
                          <span>Ligne {trip.routes.line_number}</span>
                        </>
                      ) : null}
                    </div>
                    {trip.arrival_at ? (
                      <div className="flex justify-center">
                        <DurationBadge departureAt={trip.departure_at} arrivalAt={trip.arrival_at} />
                      </div>
                    ) : null}
                    <RouteLine
                      origin={trip.routes.origin_city}
                      destination={trip.routes.destination_city}
                      departureLabel={
                        trip.arrival_at
                          ? formatDepartureTime(trip.departure_at)
                          : `Départ ${formatDepartureTime(trip.departure_at)}`
                      }
                      arrivalLabel={trip.arrival_at ? formatDepartureTime(trip.arrival_at) : undefined}
                    />
                    <span className="text-sm text-muted">
                      {SEAT_CLASS_LABELS[trip.seat_class] ?? trip.seat_class} · {trip.available_seats}{" "}
                      place{trip.available_seats > 1 ? "s" : ""} disponible
                      {trip.available_seats > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border pt-4 sm:flex-col sm:items-end sm:gap-1 sm:border-t-0 sm:pt-0">
                    <span className="font-display text-2xl font-extrabold text-foreground">
                      {formatFcfa(trip.price_fcfa)}
                    </span>
                    <span className="text-xs text-muted">
                      {totalPassengers} passager{totalPassengers > 1 ? "s" : ""}
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      {isRoundTrip ? "Aller-retour" : "Aller simple"}
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
