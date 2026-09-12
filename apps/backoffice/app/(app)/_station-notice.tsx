import { ALL_STATIONS } from "@/lib/stations";
import { setSelectedStation } from "./_station-actions";

// Le choix de gare vit dans un cookie, pas dans l'URL : « revenir à
// toutes les gares » est donc une soumission de la Server Action, pas un
// <Link>. Server Component — aucun JS nécessaire pour ce bouton.
export function ShowAllStationsButton({ label = "Voir toutes les gares" }: { label?: string }) {
  return (
    <form action={setSelectedStation} className="inline">
      <input type="hidden" name="stationId" value={ALL_STATIONS} />
      <button
        type="submit"
        className="font-medium text-zinc-950 underline hover:no-underline dark:text-zinc-50"
      >
        {label}
      </button>
    </form>
  );
}

// Une route sans gare renseignée (station_id null) n'est rattachable à
// aucune gare : elle est écartée du filtre, mais jamais en silence.
export function OrphanTripsNotice({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }

  const plural = count > 1 ? "s" : "";

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {count} trajet{plural} non affiché{plural} : gare non renseignée sur la route.{" "}
      <ShowAllStationsButton />
    </div>
  );
}

export function OrphanRouteBadge() {
  return (
    <span
      title="Aucune gare ne correspond aux villes de cette route — ce trajet n'apparaît sous aucune gare précise."
      className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      gare non renseignée
    </span>
  );
}
