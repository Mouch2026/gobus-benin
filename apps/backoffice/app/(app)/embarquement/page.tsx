import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase/server";
import { getSelectedStation } from "@/lib/station-selection";
import { filterTripsByStation } from "../_station-filter";
import { AccessBlockedMessage } from "../_components";
import { FIELD_CLASSES, LABEL_CLASSES, formatDepartureDateTime } from "../_shared";
import {
  parseBoardingValidationFilters,
  filterBoardingValidations,
  type BoardingValidationRow,
} from "./filterBoardingValidations";
import { BoardingValidationPanel } from "./BoardingValidationPanel";

type SelectableTrip = {
  id: string;
  departure_at: string;
  bus_number: string;
  routes: { origin_city: string; destination_city: string; origin_station_id: string | null; destination_station_id: string | null };
};

// Trajets sélectionnables comme "trajet en cours" — même filtre par gare
// que /voyages (affichage seulement, jamais une restriction de sécurité),
// restreint aux trajets pas encore terminés/annulés : un trajet déjà
// completed/cancelled ne peut de toute façon jamais réussir
// validate_boarding (fenêtre de temps ou statut réservation).
async function getSelectableTrips(companyId: string): Promise<SelectableTrip[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, departure_at, bus_number, routes!inner(origin_city, destination_city, origin_station_id, destination_station_id)"
    )
    .eq("company_id", companyId)
    .in("status", ["scheduled", "in_progress"])
    .order("departure_at", { ascending: true });

  if (error) {
    console.error("Impossible de charger les trajets :", error.message);
    return [];
  }

  return (data ?? []) as unknown as SelectableTrip[];
}

async function getBoardingValidationsOverview(companyId: string): Promise<BoardingValidationRow[]> {
  const { data, error } = await supabaseAdmin.rpc("get_company_boarding_validations_overview", {
    p_company_id: companyId,
  });

  if (error) {
    console.error("Impossible de charger les validations d'embarquement :", error.message);
    return [];
  }

  return (data ?? []) as BoardingValidationRow[];
}

const METHOD_LABELS: Record<"scan" | "manuel", string> = {
  scan: "Scan",
  manuel: "Manuel",
};

const METHOD_STYLES: Record<"scan" | "manuel", string> = {
  scan: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  manuel: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export default async function EmbarquementPage(props: PageProps<"/embarquement">) {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }
  if (requirePermission(result, "boarding.validate")) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Vous n&apos;avez pas la permission d&apos;accéder à cette page.
        </p>
      </div>
    );
  }

  const searchParams = await props.searchParams;
  const filters = parseBoardingValidationFilters(searchParams);
  const selectedTripId = typeof searchParams.trip === "string" ? searchParams.trip : null;

  const [allTrips, selectedStation, allValidations] = await Promise.all([
    getSelectableTrips(result.company.id),
    getSelectedStation(),
    getBoardingValidationsOverview(result.company.id),
  ]);
  const { visible: trips } = filterTripsByStation(allTrips, selectedStation);
  const validations = filterBoardingValidations(allValidations, filters);

  // Trajets distincts déjà validés au moins une fois, pour le filtre
  // "Voyage" du tableau — jamais une deuxième requête, dérivé de ce
  // qu'on a déjà chargé.
  const tripOptions = Array.from(
    new Map(
      allValidations.map((v) => [
        v.trip_id,
        `${v.origin_city} → ${v.destination_city} · ${formatDepartureDateTime(v.departure_at)}`,
      ])
    )
  );
  const busOptions = Array.from(new Set(allValidations.map((v) => v.bus_number))).sort();

  const exportParams = new URLSearchParams();
  if (filters.q) exportParams.set("q", filters.q);
  if (filters.date) exportParams.set("date", filters.date);
  if (filters.trip) exportParams.set("trip", filters.trip);
  if (filters.bus) exportParams.set("bus", filters.bus);
  if (filters.method) exportParams.set("method", filters.method);
  const exportHref = `/embarquement/export${exportParams.size > 0 ? `?${exportParams}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h2 className="mb-4 text-xl font-semibold text-zinc-950 dark:text-zinc-50">Embarquement</h2>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <label htmlFor="trip-select" className={LABEL_CLASSES}>
            Trajet en cours
          </label>
          <select id="trip-select" name="trip" defaultValue={selectedTripId ?? ""} className={FIELD_CLASSES}>
            <option value="">— Choisir un trajet —</option>
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.routes.origin_city} → {trip.routes.destination_city} ·{" "}
                {formatDepartureDateTime(trip.departure_at)} · Bus {trip.bus_number}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Choisir ce trajet
        </button>
      </form>

      <div className="mb-8">
        <BoardingValidationPanel tripId={selectedTripId} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Validations</h3>
        <a
          href={exportHref}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ⭳ Exporter
        </a>
      </div>

      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <label htmlFor="q" className={LABEL_CLASSES}>
            Recherche
          </label>
          <input
            id="q"
            name="q"
            type="text"
            placeholder="Numéro, client, voyage…"
            defaultValue={filters.q ?? ""}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="date" className={LABEL_CLASSES}>
            Date de départ
          </label>
          <input id="date" name="date" type="date" defaultValue={filters.date ?? ""} className={FIELD_CLASSES} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="trip-filter" className={LABEL_CLASSES}>
            Voyage
          </label>
          <select id="trip-filter" name="trip" defaultValue={filters.trip ?? ""} className={FIELD_CLASSES}>
            <option value="">Tous</option>
            {tripOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="bus" className={LABEL_CLASSES}>
            Bus
          </label>
          <select id="bus" name="bus" defaultValue={filters.bus ?? ""} className={FIELD_CLASSES}>
            <option value="">Tous</option>
            {busOptions.map((bus) => (
              <option key={bus} value={bus}>
                {bus}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="method" className={LABEL_CLASSES}>
            Statut
          </label>
          <select id="method" name="method" defaultValue={filters.method ?? ""} className={FIELD_CLASSES}>
            <option value="">Tous</option>
            <option value="scan">{METHOD_LABELS.scan}</option>
            <option value="manuel">{METHOD_LABELS.manuel}</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Filtrer
          </button>
          <Link
            href="/embarquement"
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Réinitialiser
          </Link>
        </div>
      </form>

      {validations.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {allValidations.length === 0
            ? "Aucune validation pour le moment."
            : "Aucune validation ne correspond à ces filtres."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Billet</th>
                <th className="px-4 py-3 font-medium">Voyage</th>
                <th className="px-4 py-3 font-medium">Passager</th>
                <th className="px-4 py-3 font-medium">Date/Heure</th>
                <th className="px-4 py-3 font-medium">Bus</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {validations.map((v) => (
                <tr
                  key={v.validation_id}
                  className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {v.validation_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{v.booking_reference}</td>
                  <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                    {v.origin_city} → {v.destination_city}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {v.full_name}
                    {v.seat_number ? ` · Siège ${v.seat_number}` : ""}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                    {new Date(v.validated_at).toLocaleString("fr-BJ", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Africa/Porto-Novo",
                    })}
                  </td>
                  <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{v.bus_number}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${METHOD_STYLES[v.method]}`}
                    >
                      {METHOD_LABELS[v.method]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/reservations/${v.booking_id}`}
                      className="text-xs font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                    >
                      Voir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
