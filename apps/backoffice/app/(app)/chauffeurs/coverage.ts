import { estimateTripDurationHours } from "@/lib/duration";
import { getBeninDateStringFor } from "@/lib/benin-time";
import { deriveDriverDayStatus, type DriverDayStatus } from "../_shared";

// Forme brute renvoyée par get_driver_month_coverage (supabase/migrations/
// 20260924090000_add_driver_unavailability.sql) — une ligne par trajet OU
// par indisponibilité touchant le mois, jamais explosée jour par jour côté
// SQL (voir le plan du chantier B pour pourquoi cette expansion reste en
// TypeScript).
export type CoverageRow = {
  kind: "trip" | "unavailability";
  trip_id: string | null;
  departure_at: string | null;
  arrival_at: string | null;
  distance_km: number | null;
  bus_number: string | null;
  origin_city: string | null;
  destination_city: string | null;
  unavailability_id: string | null;
  start_date: string | null;
  end_date: string | null;
  reason: string | null;
};

export type DayTrip = { tripId: string; originCity: string; destinationCity: string; busNumber: string };
export type DayUnavailability = { id: string; reason: string; startDate: string; endDate: string };

export type DayCoverage = {
  date: string;
  status: DriverDayStatus;
  trips: DayTrip[];
  unavailabilities: DayUnavailability[];
};

// Étend chaque ligne brute (trajet ou indisponibilité) sur l'ensemble des
// jours calendaires du mois affiché qu'elle touche, puis dérive le statut
// de chaque jour. Un trajet sans arrival_at utilise la même estimation
// (60 km/h / repli 4h, estimateTripDurationHours) que le statut "En
// mission" du chantier A — jamais une troisième valeur inventée à part.
export function computeDayCoverage(monthDates: string[], rows: CoverageRow[]): Map<string, DayCoverage> {
  const byDate = new Map<string, DayCoverage>();
  for (const date of monthDates) {
    byDate.set(date, { date, status: "disponible", trips: [], unavailabilities: [] });
  }

  for (const row of rows) {
    if (row.kind === "trip" && row.departure_at && row.trip_id) {
      const startDate = getBeninDateStringFor(new Date(row.departure_at));
      const endMs = row.arrival_at
        ? new Date(row.arrival_at).getTime()
        : new Date(row.departure_at).getTime() + estimateTripDurationHours(row.distance_km) * 3600_000;
      const endDate = getBeninDateStringFor(new Date(endMs));

      for (const date of monthDates) {
        if (date >= startDate && date <= endDate) {
          byDate.get(date)?.trips.push({
            tripId: row.trip_id,
            originCity: row.origin_city ?? "",
            destinationCity: row.destination_city ?? "",
            busNumber: row.bus_number ?? "",
          });
        }
      }
    } else if (row.kind === "unavailability" && row.start_date && row.end_date && row.unavailability_id) {
      for (const date of monthDates) {
        if (date >= row.start_date && date <= row.end_date) {
          byDate.get(date)?.unavailabilities.push({
            id: row.unavailability_id,
            reason: row.reason ?? "",
            startDate: row.start_date,
            endDate: row.end_date,
          });
        }
      }
    }
  }

  for (const day of byDate.values()) {
    day.status = deriveDriverDayStatus(day.trips.length > 0, day.unavailabilities.length > 0);
  }

  return byDate;
}

// Périodes d'indisponibilité distinctes touchant le mois (dédupliquées
// par id) — pour la liste "périodes déclarées" sous le calendrier
// individuel, à partir des mêmes lignes brutes déjà chargées.
export function distinctUnavailabilities(rows: CoverageRow[]): DayUnavailability[] {
  const byId = new Map<string, DayUnavailability>();
  for (const row of rows) {
    if (row.kind === "unavailability" && row.unavailability_id && row.start_date && row.end_date) {
      byId.set(row.unavailability_id, {
        id: row.unavailability_id,
        reason: row.reason ?? "",
        startDate: row.start_date,
        endDate: row.end_date,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
}
