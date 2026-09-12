"use client";

import { usePathname } from "next/navigation";
import { ALL_STATIONS, stationLabel, type StationOption } from "@/lib/stations";
import { setSelectedStation } from "./_station-actions";

// Le filtre ne s'applique qu'à ces deux écrans — l'afficher ailleurs
// serait un contrôle mort qui laisserait croire que Réservations /
// Clients / Paiements / Dashboard sont filtrés eux aussi.
const FILTERED_PATHS = ["/voyages", "/reservations/nouvelle"];

// Îlot client minimal (même esprit que _live-clock.tsx) : il n'existe que
// pour se soumettre au changement, tout le reste est rendu côté serveur.
export function StationSelect({
  stations,
  selectedStationId,
}: {
  stations: StationOption[];
  selectedStationId: string | null;
}) {
  const pathname = usePathname();

  if (!FILTERED_PATHS.includes(pathname) || stations.length === 0) {
    return null;
  }

  return (
    <form action={setSelectedStation}>
      <label htmlFor="stationId" className="sr-only">
        Filtrer les trajets par gare
      </label>
      {/* key : un <select> non contrôlé ne re-synchronise pas son
          defaultValue lors d'un re-rendu RSC — sans ce remontage forcé,
          après avoir choisi une gare la liste se filtrait bien mais le
          sélecteur réaffichait « Toutes les gares » (vérifié en
          navigateur). */}
      <select
        key={selectedStationId ?? ALL_STATIONS}
        id="stationId"
        name="stationId"
        defaultValue={selectedStationId ?? ALL_STATIONS}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      >
        <option value={ALL_STATIONS}>Toutes les gares</option>
        {stations.map((station) => (
          <option key={station.id} value={station.id}>
            {stationLabel(station)}
          </option>
        ))}
      </select>
    </form>
  );
}
