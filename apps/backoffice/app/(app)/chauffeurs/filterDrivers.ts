import { deriveDriverStatus, type DriverDisplayStatus } from "../_shared";

export type DriverOverviewRow = {
  driver_id: string;
  full_name: string;
  phone: string | null;
  license_number: string | null;
  is_active: boolean;
  current_trip_id: string | null;
  current_bus_number: string | null;
  current_origin_city: string | null;
  current_destination_city: string | null;
  current_departure_at: string | null;
};

export type DriverFilters = {
  q: string | null;
  status: DriverDisplayStatus | null;
};

const VALID_STATUSES: DriverDisplayStatus[] = ["en_mission", "disponible", "archive"];

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Parse depuis les searchParams bruts de la page — même patron exact que
// parseReservationFilters/parseBoardingValidationFilters : un seul endroit
// qui définit la forme des filtres.
export function parseDriverFilters(
  searchParams: Record<string, string | string[] | undefined>
): DriverFilters {
  const q = firstValue(searchParams.q)?.trim() || null;
  const statusRaw = firstValue(searchParams.status);
  const status = VALID_STATUSES.includes(statusRaw as DriverDisplayStatus)
    ? (statusRaw as DriverDisplayStatus)
    : null;
  return { q, status };
}

// Filtre en mémoire sur le résultat de get_company_drivers_overview — même
// principe que filterBookings.ts : une seule implémentation, réutilisée
// telle quelle par la page.
export function filterDrivers(rows: DriverOverviewRow[], filters: DriverFilters): DriverOverviewRow[] {
  return rows.filter((row) => {
    if (filters.status) {
      const display = deriveDriverStatus(row.is_active, row.current_trip_id !== null);
      if (display !== filters.status) return false;
    }

    if (filters.q) {
      const q = filters.q.toLowerCase();
      const haystack = `${row.full_name} ${row.phone ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}
