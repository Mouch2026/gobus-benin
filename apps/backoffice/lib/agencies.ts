// Type et constante du sélecteur d'agence (tableau de bord agent), sans
// "server-only" : l'îlot client (mon-tableau-de-bord/AgencySelect.tsx) en
// a besoin. La résolution côté serveur vit dans agency-selection.ts.
//
// Contrairement au sélecteur de gare (station-selection.ts), il n'y a
// jamais de sentinelle "toutes les agences" : ce tableau de bord montre
// toujours EXACTEMENT une agence à la fois.

export type AgencyOption = { id: string; name: string; stationId: string };

export const AGENCY_COOKIE = "agence_tableau_de_bord";
