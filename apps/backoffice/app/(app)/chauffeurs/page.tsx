import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AccessBlockedMessage } from "../_components";
import {
  DRIVER_DISPLAY_STATUS_LABELS,
  DRIVER_DISPLAY_STATUS_STYLES,
  FIELD_CLASSES,
  LABEL_CLASSES,
  deriveDriverStatus,
  formatDepartureDateTime,
  type DriverDisplayStatus,
} from "../_shared";
import { parseDriverFilters, filterDrivers, type DriverOverviewRow } from "./filterDrivers";
import { toggleDriverActive } from "./actions";
import { DocumentAlertForm } from "./DocumentAlertForm";

// Lu directement (comme getCashCeiling sur /caisse) : document_alert_days
// n'est pas porté par CompanyAccessResult.
async function getDocumentAlertDays(companyId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("companies")
    .select("document_alert_days")
    .eq("id", companyId)
    .maybeSingle<{ document_alert_days: number }>();
  return data?.document_alert_days ?? 30;
}

// service_role, même convention que toutes les vues company-scoped du
// back-office (get_company_bookings_overview, get_company_boarding_validations_overview,
// ...) : la portée par compagnie est déjà garantie par requireCompany()
// avant cet appel.
async function getDriversOverview(companyId: string): Promise<DriverOverviewRow[]> {
  const { data, error } = await supabaseAdmin.rpc("get_company_drivers_overview", {
    p_company_id: companyId,
  });

  if (error) {
    console.error("Impossible de charger les chauffeurs :", error.message);
    return [];
  }

  return (data ?? []) as DriverOverviewRow[];
}

const STATUS_OPTIONS: DriverDisplayStatus[] = ["disponible", "en_mission", "archive"];

export default async function ChauffeursPage(props: PageProps<"/chauffeurs">) {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const searchParams = await props.searchParams;
  const filters = parseDriverFilters(searchParams);
  const canManage = can(result.role, "drivers.manage");
  const canConfigureAlerts = can(result.role, "documentAlerts.manage");

  const [allDrivers, alertDays] = await Promise.all([
    getDriversOverview(result.company.id),
    canConfigureAlerts ? getDocumentAlertDays(result.company.id) : Promise.resolve(30),
  ]);
  const drivers = filterDrivers(allDrivers, filters);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {canConfigureAlerts ? (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">Alertes de documents</h2>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            Le propriétaire et les chefs d&apos;agence sont prévenus (cloche + e-mail), une seule fois,
            quand un document de chauffeur (permis, carte d&apos;identité…) atteint ce nombre de jours
            avant son expiration.
          </p>
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <DocumentAlertForm currentDays={alertDays} />
          </div>
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">Chauffeurs</h2>
        {canManage ? (
          <Link
            href="/chauffeurs/nouveau"
            className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            + Ajouter un chauffeur
          </Link>
        ) : null}
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
            placeholder="Nom, téléphone…"
            defaultValue={filters.q ?? ""}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className={LABEL_CLASSES}>
            Statut
          </label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className={FIELD_CLASSES}>
            <option value="">Tous</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {DRIVER_DISPLAY_STATUS_LABELS[status]}
              </option>
            ))}
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
            href="/chauffeurs"
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Réinitialiser
          </Link>
        </div>
      </form>

      {drivers.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {allDrivers.length === 0
            ? "Aucun chauffeur pour le moment."
            : "Aucun chauffeur ne correspond à ces filtres."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">Nom</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Bus</th>
                <th className="px-4 py-3 font-medium">Voyage</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => {
                const displayStatus = deriveDriverStatus(driver.is_active, driver.current_trip_id !== null);
                return (
                  <tr
                    key={driver.driver_id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                      {driver.driver_id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      {driver.full_name}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{driver.phone ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${DRIVER_DISPLAY_STATUS_STYLES[displayStatus]}`}
                      >
                        {DRIVER_DISPLAY_STATUS_LABELS[displayStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {driver.current_bus_number ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {driver.current_trip_id
                        ? `${driver.current_origin_city} → ${driver.current_destination_city} · ${formatDepartureDateTime(driver.current_departure_at!)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/chauffeurs/${driver.driver_id}`}
                          className="text-xs font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                        >
                          {canManage ? "Éditer" : "Voir"}
                        </Link>
                        {canManage ? (
                          <form action={toggleDriverActive}>
                            <input type="hidden" name="driverId" value={driver.driver_id} />
                            <input type="hidden" name="isActive" value={driver.is_active ? "0" : "1"} />
                            <button
                              type="submit"
                              className="text-xs font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                            >
                              {driver.is_active ? "Désactiver" : "Réactiver"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
