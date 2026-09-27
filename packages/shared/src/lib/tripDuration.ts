// Réplique côté TypeScript de estimate_trip_duration_hours() (supabase/
// migrations/20260924090000_add_driver_unavailability.sql) — JAMAIS une
// vraie donnée de fin de trajet, seulement une approximation d'affichage
// pour un trajet sans arrival_at connue. Vitesse moyenne d'un bus
// interurbain au Bénin ≈ 60 km/h, repli 4h si la distance est inconnue —
// mêmes deux constantes des deux côtés (SQL et TS), jamais une troisième
// valeur inventée séparément. Si l'une change, l'autre doit changer avec
// elle.
//
// Déplacée ici (depuis apps/backoffice/lib/duration.ts, chantier B) au
// moment où une DEUXIÈME app (apps/web, chantier évaluation des
// chauffeurs) en a eu besoin : la dupliquer une troisième fois n'était
// plus défendable — packages/shared est déjà importé par les deux apps.
export function estimateTripDurationHours(distanceKm: number | null): number {
  return distanceKm !== null ? distanceKm / 60 : 4;
}
