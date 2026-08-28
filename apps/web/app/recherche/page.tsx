import type { ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatFcfa } from "shared";

type TripSearchResult = {
  id: string;
  departure_at: string;
  seat_class: string;
  price_fcfa: number;
  available_seats: number;
  routes: { origin_city: string; destination_city: string };
  companies: { name: string };
};

const SEAT_CLASS_LABELS: Record<string, string> = {
  standard: "Standard",
  vip: "VIP",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

function formatDepartureTime(departureAt: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(departureAt));
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

function ResultsPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <main className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{title}</h1>
          <Link
            href="/"
            className="whitespace-nowrap text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← Nouvelle recherche
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-zinc-200 bg-white p-6 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
      {children}
    </p>
  );
}

export default async function RecherchePage(props: PageProps<"/recherche">) {
  const params = await props.searchParams;
  const origin = firstValue(params.origin);
  const destination = firstValue(params.destination);
  const date = firstValue(params.date);

  if (!origin || !destination || !date || !isValidDate(date)) {
    return (
      <ResultsPageShell title="Résultats de recherche">
        <EmptyState>
          Recherche invalide. Merci de relancer une recherche depuis la page d&apos;accueil.
        </EmptyState>
      </ResultsPageShell>
    );
  }

  const results = await searchTrips(origin, destination, date);

  return (
    <ResultsPageShell title={`${origin} → ${destination}`}>
      {results.length === 0 ? (
        <EmptyState>
          Aucun trajet trouvé pour {origin} → {destination} le {formatSearchDate(date)}.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {results.map((trip) => (
            <li
              key={trip.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div>
                <p className="font-medium text-zinc-950 dark:text-zinc-50">
                  {trip.companies.name}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Départ {formatDepartureTime(trip.departure_at)} ·{" "}
                  {SEAT_CLASS_LABELS[trip.seat_class] ?? trip.seat_class} ·{" "}
                  {trip.available_seats} place{trip.available_seats > 1 ? "s" : ""} disponible
                  {trip.available_seats > 1 ? "s" : ""}
                </p>
              </div>
              <p className="whitespace-nowrap text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                {formatFcfa(trip.price_fcfa)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </ResultsPageShell>
  );
}
