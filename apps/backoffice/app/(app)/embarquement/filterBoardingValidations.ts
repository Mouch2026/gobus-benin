export type BoardingValidationRow = {
  validation_id: string;
  booking_id: string;
  booking_reference: string;
  origin_city: string;
  destination_city: string;
  departure_at: string;
  bus_number: string;
  full_name: string;
  seat_number: string | null;
  validated_at: string;
  method: "scan" | "manuel";
  validated_by_name: string;
  trip_id: string;
};

export type BoardingValidationFilters = {
  q: string | null;
  date: string | null; // "AAAA-MM-JJ", tel que soumis par <input type="date"> — jour de DÉPART, pas de validation
  trip: string | null; // trip_id
  bus: string | null; // bus_number
  method: "scan" | "manuel" | null;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Parse depuis les searchParams bruts de la page — un seul endroit qui
// définit la forme des filtres, partagé par la page et l'export CSV, même
// principe que parseReservationFilters.
export function parseBoardingValidationFilters(
  searchParams: Record<string, string | string[] | undefined>
): BoardingValidationFilters {
  const q = firstValue(searchParams.q)?.trim() || null;
  const date = firstValue(searchParams.date)?.trim() || null;
  const trip = firstValue(searchParams.trip)?.trim() || null;
  const bus = firstValue(searchParams.bus)?.trim() || null;
  const methodRaw = firstValue(searchParams.method);
  const method = methodRaw === "scan" || methodRaw === "manuel" ? methodRaw : null;
  return { q, date, trip, bus, method };
}

// Filtre en mémoire sur le résultat de get_company_boarding_validations_overview
// — pas de restriction de date par défaut (filters.date null) : la page
// est déjà un journal complet dès l'ouverture, l'agent restreint lui-même
// s'il le souhaite. Une seule implémentation, réutilisée par la page ET
// l'export CSV.
export function filterBoardingValidations(
  rows: BoardingValidationRow[],
  filters: BoardingValidationFilters
): BoardingValidationRow[] {
  // Ancré au fuseau du Bénin (+01:00 explicite), même principe que
  // filterBookings.ts — le jour choisi par l'agent, pas l'heure locale du
  // serveur.
  const dayStart = filters.date ? new Date(`${filters.date}T00:00:00+01:00`) : null;
  const dayEnd = filters.date ? new Date(`${filters.date}T23:59:59+01:00`) : null;

  return rows.filter((row) => {
    if (filters.trip && row.trip_id !== filters.trip) return false;
    if (filters.bus && row.bus_number !== filters.bus) return false;
    if (filters.method && row.method !== filters.method) return false;

    if (dayStart && dayEnd) {
      const departureAt = new Date(row.departure_at);
      if (departureAt < dayStart || departureAt > dayEnd) return false;
    }

    if (filters.q) {
      const q = filters.q.toLowerCase();
      const haystack =
        `${row.booking_reference} ${row.full_name} ${row.origin_city} ${row.destination_city}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}
