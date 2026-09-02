import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatFcfa } from "shared";
import { CompareIcon, PhoneIcon, QrCodeIcon, TicketIcon } from "@/lib/icons";
import { getDestinationCitiesForOrigin, getOriginCities } from "@/lib/routes";
import { SearchWidget } from "./SearchWidget";

const ORIGIN_CITY = "Cotonou";

type PopularDestination = {
  city: string;
  distanceKm: number;
  fromPriceFcfa: number | null;
};

async function getPopularDestinations(): Promise<PopularDestination[]> {
  const { data: routes, error: routesError } = await supabase
    .from("routes")
    .select("id, destination_city, distance_km")
    .eq("origin_city", ORIGIN_CITY)
    .order("destination_city");

  if (routesError) {
    console.error("Impossible de charger les trajets :", routesError.message);
    return [];
  }

  if (!routes || routes.length === 0) return [];

  // No aggregate query here (PostgREST's support for MIN()/GROUP BY isn't
  // guaranteed across setups) — fetch every trip for these routes and take
  // the minimum client-side. Fine at this scale (a handful of destinations).
  const routeIds = routes.map((route) => route.id);
  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("route_id, price_fcfa")
    .in("route_id", routeIds);

  if (tripsError) {
    console.error("Impossible de charger les prix :", tripsError.message);
  }

  const minPriceByRoute = new Map<string, number>();
  for (const trip of trips ?? []) {
    const current = minPriceByRoute.get(trip.route_id);
    if (current === undefined || trip.price_fcfa < current) {
      minPriceByRoute.set(trip.route_id, trip.price_fcfa);
    }
  }

  return routes.map((route) => ({
    city: route.destination_city,
    distanceKm: route.distance_km,
    fromPriceFcfa: minPriceByRoute.get(route.id) ?? null,
  }));
}

export default async function Home() {
  const [originCities, popularDestinations] = await Promise.all([
    getOriginCities(),
    getPopularDestinations(),
  ]);
  const defaultOrigin = originCities.includes(ORIGIN_CITY)
    ? ORIGIN_CITY
    : (originCities[0] ?? "");
  const initialDestinationCities = defaultOrigin
    ? await getDestinationCitiesForOrigin(defaultOrigin)
    : [];
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ---------- Hero + recherche ---------- */}
      <section className="relative overflow-hidden bg-foreground px-4 py-14 sm:py-20">
        <svg
          aria-hidden="true"
          viewBox="0 0 800 300"
          preserveAspectRatio="xMidYMid slice"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
        >
          <g stroke="var(--color-primary)" strokeWidth={1.5} fill="none">
            <circle cx="60" cy="60" r="3" fill="var(--color-primary)" stroke="none" />
            <path d="M60 60 L 260 40" strokeDasharray="2 8" />
            <circle cx="260" cy="40" r="3" fill="var(--color-primary)" stroke="none" />
            <path d="M260 40 L 480 100" strokeDasharray="2 8" />
            <circle cx="480" cy="100" r="3" fill="var(--color-on-ink)" stroke="none" />
            <circle cx="620" cy="230" r="3" fill="var(--color-primary)" stroke="none" />
            <path d="M480 100 L 620 230" strokeDasharray="2 8" />
            <path d="M620 230 L 760 210" strokeDasharray="2 8" />
            <circle cx="760" cy="210" r="3" fill="var(--color-on-ink)" stroke="none" />
          </g>
        </svg>

        <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-9 text-center">
          <div className="flex flex-col gap-3">
            <span className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-primary">
              GoBus Bénin
            </span>
            <h1 className="text-balance font-display text-4xl font-extrabold leading-tight text-on-ink sm:text-5xl">
              Où partez-vous ?
            </h1>
            <p className="text-lg text-on-ink-muted">Tous vos voyages en un seul endroit</p>
          </div>

          <SearchWidget
            originCities={originCities}
            defaultOrigin={defaultOrigin}
            initialDestinationCities={initialDestinationCities}
            today={today}
          />
        </div>
      </section>

      {/* ---------- Destinations populaires ---------- */}
      <section className="mx-auto w-full max-w-3xl px-4 py-16">
        <div className="mb-8 flex max-w-lg flex-col gap-2">
          <span className="font-mono text-xs font-medium uppercase tracking-wide text-primary-hover">
            Trajets disponibles
          </span>
          <h2 className="text-balance font-display text-2xl font-extrabold text-foreground sm:text-3xl">
            Nos trajets au départ de Cotonou
          </h2>
          <p className="text-muted">
            Chaque destination affichée a des départs réels, prêts à réserver.
          </p>
        </div>

        <div className="flex flex-wrap items-stretch gap-5">
          {popularDestinations.map((destination) => (
            <Link
              key={destination.city}
              href={`/recherche?origin=${encodeURIComponent(ORIGIN_CITY)}&destination=${encodeURIComponent(destination.city)}&date=${today}`}
              className="flex w-[17rem] flex-col gap-3.5 rounded-2xl border border-border p-6 transition-all hover:-translate-y-0.5 hover:border-primary"
            >
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                <span className="h-px flex-1 bg-[repeating-linear-gradient(to_right,var(--color-border)_0,var(--color-border)_3px,transparent_3px,transparent_6px)]" />
                <span>COT</span>
              </div>
              <span className="font-display text-2xl font-extrabold text-foreground">
                {destination.city}
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted">{destination.distanceKm} km</span>
                {destination.fromPriceFcfa !== null ? (
                  <span className="font-display text-lg font-bold text-foreground">
                    <span className="text-xs font-medium text-muted">Dès </span>
                    {formatFcfa(destination.fromPriceFcfa)}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}

          <div className="flex w-[17rem] flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
            <span className="font-display text-lg font-bold text-foreground">+ bientôt</span>
            <span>D&apos;autres compagnies ajoutent leurs trajets chaque semaine</span>
          </div>
        </div>
      </section>

      {/* ---------- Proposition de valeur ---------- */}
      <section className="mx-auto w-full max-w-3xl px-4 pb-20">
        <div className="mb-8 flex max-w-lg flex-col gap-2">
          <span className="font-mono text-xs font-medium uppercase tracking-wide text-primary-hover">
            Pourquoi GoBus
          </span>
          <h2 className="text-balance font-display text-2xl font-extrabold text-foreground sm:text-3xl">
            Pourquoi réserver avec GoBus ?
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-7 sm:grid-cols-3">
          <div className="flex flex-col gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <CompareIcon className="h-6 w-6 text-primary-hover" />
            </span>
            <h3 className="font-display text-base font-bold text-foreground">
              Toutes les compagnies, une seule recherche
            </h3>
            <p className="text-sm text-muted">
              Comparez en un instant les départs de plusieurs compagnies pour le même trajet,
              sans ouvrir dix onglets.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <PhoneIcon className="h-6 w-6 text-primary-hover" />
            </span>
            <h3 className="font-display text-base font-bold text-foreground">
              Payez comme vous en avez l&apos;habitude
            </h3>
            <p className="text-sm text-muted">
              MTN Mobile Money, Moov Money ou carte bancaire — votre place est confirmée
              immédiatement.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <TicketIcon className="h-6 w-6 text-primary-hover" />
            </span>
            <h3 className="font-display text-base font-bold text-foreground">
              Votre ticket, sans passer par la gare
            </h3>
            <p className="text-sm text-muted">
              Réservez et payez en ligne, montez directement à bord le jour du départ.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Application mobile ---------- */}
      <section className="mx-auto w-full max-w-3xl px-4 pb-20">
        <div className="grid grid-cols-1 items-center gap-10 sm:grid-cols-2">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-xs font-medium uppercase tracking-wide text-primary-hover">
                Application mobile
              </span>
              <h2 className="text-balance font-display text-2xl font-extrabold text-foreground sm:text-3xl">
                Notre application mobile
              </h2>
            </div>

            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <QrCodeIcon className="h-6 w-6 text-primary-hover" />
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-base font-bold text-foreground">
                  Billets électroniques avec QR code
                </h3>
                <p className="text-sm text-muted">
                  Déjà vrai aujourd&apos;hui sur le site : votre billet est généré avec un QR
                  code dès l&apos;achat. La même expérience arrive bientôt dans l&apos;application.
                </p>
              </div>
            </div>

            <span className="inline-flex w-fit items-center rounded-full border border-border px-3.5 py-1.5 text-xs font-semibold text-muted">
              Bientôt disponible
            </span>
          </div>

          <div className="flex justify-center sm:justify-end">
            <div className="flex h-56 w-40 flex-col items-center justify-center gap-3 rounded-[2rem] border-2 border-border bg-surface p-4">
              <span aria-hidden className="h-1 w-8 rounded-full bg-border" />
              <span className="flex h-20 w-20 items-center justify-center rounded-xl bg-primary/10">
                <QrCodeIcon className="h-11 w-11 text-primary-hover" />
              </span>
              <span className="text-center text-[11px] font-medium text-muted">
                Billet électronique
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
