import { supabase } from "@/lib/supabase";
import { CalendarIcon, PinIcon, SearchIcon } from "@/lib/icons";

const ORIGIN_CITY = "Cotonou";

async function getDestinationCities(): Promise<string[]> {
  const { data, error } = await supabase
    .from("routes")
    .select("destination_city")
    .eq("origin_city", ORIGIN_CITY)
    .order("destination_city");

  if (error) {
    console.error("Impossible de charger les destinations :", error.message);
    return [];
  }

  return Array.from(new Set(data.map((route) => route.destination_city)));
}

export default async function Home() {
  const destinationCities = await getDestinationCities();
  const today = new Date().toISOString().split("T")[0];
  const hasDestinations = destinationCities.length > 0;

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-20 sm:py-28">
      <div className="flex w-full max-w-3xl flex-col items-center gap-10 text-center">
        <div className="flex flex-col gap-3">
          <span className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-primary">
            GoBus Bénin
          </span>
          <h1 className="text-balance font-display text-4xl font-extrabold leading-tight text-foreground sm:text-5xl">
            Où partez-vous ?
          </h1>
          <p className="text-lg text-muted">
            Tous vos voyages en un seul endroit
          </p>
        </div>

        <form
          action="/recherche"
          method="get"
          className="flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(20,17,11,0.04),0_12px_28px_-16px_rgba(20,17,11,0.25)] sm:flex-row sm:items-stretch"
        >
          <div className="flex flex-1 items-center gap-3 border-b border-border px-5 py-4 text-left sm:border-b-0 sm:border-r">
            <PinIcon className="h-5 w-5 shrink-0 text-muted" />
            <div className="flex flex-1 flex-col">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Départ
              </span>
              <span className="font-display text-base font-semibold text-foreground">
                {ORIGIN_CITY}
              </span>
              {/* Departure is fixed; only the hidden field is submitted. */}
              <input type="hidden" name="origin" value={ORIGIN_CITY} />
            </div>
          </div>

          <div className="flex flex-1 items-center gap-3 border-b border-border px-5 py-4 text-left sm:border-b-0 sm:border-r">
            <PinIcon className="h-5 w-5 shrink-0 text-muted" />
            <div className="flex flex-1 flex-col">
              <label
                htmlFor="destination"
                className="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Arrivée
              </label>
              <select
                id="destination"
                name="destination"
                required
                defaultValue=""
                disabled={!hasDestinations}
                className="bg-transparent font-display text-base font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>
                  {hasDestinations ? "Choisir une ville" : "Aucune destination disponible"}
                </option>
                {destinationCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-1 items-center gap-3 px-5 py-4 text-left">
            <CalendarIcon className="h-5 w-5 shrink-0 text-muted" />
            <div className="flex flex-1 flex-col">
              <label
                htmlFor="date"
                className="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Date
              </label>
              <input
                id="date"
                name="date"
                type="date"
                required
                min={today}
                className="bg-transparent font-display text-base font-semibold text-foreground [color-scheme:light]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!hasDestinations}
            className="flex items-center justify-center gap-2 bg-primary px-8 py-4 font-display text-base font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SearchIcon className="h-5 w-5" />
            Rechercher
          </button>
        </form>
      </div>
    </div>
  );
}
