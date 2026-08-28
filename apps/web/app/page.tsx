import { supabase } from "@/lib/supabase";

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-black">
      <main className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm dark:bg-zinc-900">
        <h1 className="mb-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
          GoBus Bénin
        </h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          Recherchez et réservez votre trajet en bus.
        </p>

        <form action="/recherche" method="get" className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="origin"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Départ
            </label>
            <input
              id="origin"
              value={ORIGIN_CITY}
              disabled
              className="rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
            />
            {/* `disabled` inputs are not submitted, so the fixed origin is
                sent separately via this hidden field. */}
            <input type="hidden" name="origin" value={ORIGIN_CITY} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="destination"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Arrivée
            </label>
            <select
              id="destination"
              name="destination"
              required
              defaultValue=""
              disabled={destinationCities.length === 0}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="" disabled>
                {destinationCities.length > 0
                  ? "Choisir une ville"
                  : "Aucune destination disponible"}
              </option>
              {destinationCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="date"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Date de départ
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              min={today}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>

          <button
            type="submit"
            disabled={destinationCities.length === 0}
            className="mt-2 rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Rechercher
          </button>
        </form>
      </main>
    </div>
  );
}
