// Type et constantes du sélecteur de gare, sans "server-only" : l'îlot
// client (_station-select.tsx) en a besoin. La résolution côté serveur
// (lecture des gares, du cookie, de l'agence) vit dans station-selection.ts.

export type StationOption = { id: string; name: string; city: string };

// Nom du cookie portant le choix de gare, et sentinelle « toutes les
// gares ». La sentinelle est stockée explicitement plutôt que d'effacer
// le cookie : sinon un agent qui élargit volontairement sa vue serait
// silencieusement ramené à la gare de son agence à la navigation
// suivante.
export const STATION_COOKIE = "gare";
export const ALL_STATIONS = "toutes";

export function stationLabel(station: StationOption): string {
  return station.name === station.city ? station.name : `${station.name} · ${station.city}`;
}
