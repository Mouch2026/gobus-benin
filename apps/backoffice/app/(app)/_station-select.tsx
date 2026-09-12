"use client";

import { ALL_STATIONS, stationLabel, type StationOption } from "@/lib/stations";
import { setSelectedStation } from "./_station-actions";

// Visible sur TOUS les écrans, mais ne FILTRE que /voyages et
// /reservations/nouvelle : ailleurs il ne fait que mémoriser le choix
// (cookie), pour que la sélection soit toujours celle attendue au retour
// sur Voyages. C'est aussi ce qui rend la topbar stable d'un écran à
// l'autre, au lieu de voir le sélecteur apparaître et disparaître.
//
// Îlot client minimal (même esprit que _live-clock.tsx) : il n'existe que
// pour se soumettre au changement, tout le reste est rendu côté serveur.
export function StationSelect({
  stations,
  selectedStationId,
}: {
  stations: StationOption[];
  selectedStationId: string | null;
}) {
  if (stations.length === 0) {
    return null;
  }

  return (
    <form action={setSelectedStation} className="flex items-center gap-2">
      <label
        htmlFor="stationId"
        className="text-sm text-zinc-500 dark:text-zinc-400"
        title="Filtre les écrans de trajets (Voyages, nouvelle réservation) sur les départs ou arrivées de cette gare. Les autres écrans ne sont pas filtrés."
      >
        Gare :
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
