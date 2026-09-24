// Partagé entre la création (createTrip) et l'édition (updateTripDetails)
// d'un trajet — mêmes deux petits champs heures/minutes, même calcul de
// arrival_at, même règle de validation.

export type ArrivalComputation =
  | { ok: true; arrivalAt: string | null }
  | { ok: false; error: string };

// Les deux champs sont optionnels : si aucun n'est renseigné, arrival_at
// reste null (comportement actuel inchangé). Dès que l'un des deux est
// rempli, la durée totale doit être strictement positive — sinon le CHECK
// existant (arrival_at is null or arrival_at > departure_at) rejetterait
// une durée de 0 minute avec une erreur Postgres brute plutôt qu'un
// message clair.
export function computeArrivalAt(
  departureAt: string,
  hoursRaw: string,
  minutesRaw: string
): ArrivalComputation {
  const hoursProvided = hoursRaw.trim() !== "";
  const minutesProvided = minutesRaw.trim() !== "";

  if (!hoursProvided && !minutesProvided) {
    return { ok: true, arrivalAt: null };
  }

  const hours = hoursProvided ? Number(hoursRaw) : 0;
  const minutes = minutesProvided ? Number(minutesRaw) : 0;

  if (!Number.isInteger(hours) || hours < 0) {
    return {
      ok: false,
      error: "Les heures de la durée estimée doivent être un nombre entier positif ou nul.",
    };
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return {
      ok: false,
      error: "Les minutes de la durée estimée doivent être un nombre entier entre 0 et 59.",
    };
  }

  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes <= 0) {
    return { ok: false, error: "La durée estimée doit être supérieure à 0 minute." };
  }

  const arrivalAt = new Date(new Date(departureAt).getTime() + totalMinutes * 60_000).toISOString();
  return { ok: true, arrivalAt };
}

// Chantier B (disponibilités) : réplique côté TypeScript
// estimate_trip_duration_hours() (supabase/migrations/
// 20260924090000_add_driver_unavailability.sql) — nécessaire ici pour
// l'expansion jour-par-jour d'un mois (get_driver_month_coverage renvoie
// des bornes brutes, l'ensemble des jours touchés se calcule en TS, voir
// le plan du chantier B). Compromis assumé : la formule existe en double
// (SQL pour le statut temps réel sur toute une liste de chauffeurs, TS
// ici) — mêmes deux constantes, même justification (vitesse moyenne d'un
// bus interurbain au Bénin ≈ 60 km/h, repli 4h si distance inconnue),
// jamais une troisième valeur inventée séparément. Si l'une change,
// l'autre doit changer avec elle.
export function estimateTripDurationHours(distanceKm: number | null): number {
  return distanceKm !== null ? distanceKm / 60 : 4;
}

// Pour préremplir les deux champs en édition à partir d'un arrival_at déjà
// enregistré.
export function splitDuration(
  departureAt: string,
  arrivalAt: string | null
): { hours: string; minutes: string } {
  if (!arrivalAt) return { hours: "", minutes: "" };

  const totalMinutes = Math.round(
    (new Date(arrivalAt).getTime() - new Date(departureAt).getTime()) / 60_000
  );
  return {
    hours: String(Math.floor(totalMinutes / 60)),
    minutes: String(totalMinutes % 60),
  };
}
