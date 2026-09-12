import type { StationOption } from "@/lib/stations";

// Filtre d'AFFICHAGE des trajets par gare, partagé par /voyages et le
// sélecteur de trajet de /reservations/nouvelle. Fonction pure appliquée
// en mémoire aux lignes déjà chargées — même patron que filterBookings.ts.
//
// Ce n'est JAMAIS une restriction de sécurité : la gare consultée est
// libre (un agent peut regarder n'importe quelle gare du réseau), et
// l'imputation d'une réservation reste l'agence de l'agent.

export type TripRouteStations = {
  origin_station_id: string | null;
  destination_station_id: string | null;
};

export function tripMatchesStation(route: TripRouteStations, station: StationOption): boolean {
  return route.origin_station_id === station.id || route.destination_station_id === station.id;
}

// Une route dont un station_id est null n'est rattachable à aucune gare :
// le trigger set_route_station_ids n'a trouvé aucune gare portant le nom
// de la ville saisie. Pas de repli sur le texte libre ici — ce serait du
// code mort par construction (si le texte avait matché une gare, le
// station_id ne serait pas null).
export function isOrphanRoute(route: TripRouteStations): boolean {
  return route.origin_station_id === null || route.destination_station_id === null;
}

// hiddenOrphanCount : trajets écartés par le filtre UNIQUEMENT parce que
// leur route n'a pas de gare renseignée — à signaler à l'écran plutôt
// que de les laisser disparaître sans explication.
export function filterTripsByStation<T extends { routes: TripRouteStations }>(
  trips: T[],
  station: StationOption | null
): { visible: T[]; hiddenOrphanCount: number } {
  if (!station) {
    return { visible: trips, hiddenOrphanCount: 0 };
  }

  const visible: T[] = [];
  let hiddenOrphanCount = 0;

  for (const trip of trips) {
    if (tripMatchesStation(trip.routes, station)) {
      visible.push(trip);
    } else if (isOrphanRoute(trip.routes)) {
      hiddenOrphanCount++;
    }
  }

  return { visible, hiddenOrphanCount };
}
