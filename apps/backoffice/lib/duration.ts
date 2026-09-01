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
