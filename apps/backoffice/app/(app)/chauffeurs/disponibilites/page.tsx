import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBeninDateString } from "@/lib/benin-time";
import { AccessBlockedMessage } from "../../_components";
import { DRIVER_DAY_STATUS_LABELS, DRIVER_DAY_STATUS_STYLES } from "../../_shared";
import { allDatesInMonth, shiftMonth, monthLabel } from "../monthGrid";
import { computeDayCoverage, type CoverageRow } from "../coverage";

const MONTH_RE = /^\d{4}-\d{2}$/;

type DriverRow = { id: string; full_name: string };

async function getActiveDrivers(companyId: string): Promise<DriverRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("id, full_name")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("full_name", { ascending: true });
  if (error) {
    console.error("Impossible de charger les chauffeurs :", error.message);
    return [];
  }
  return data ?? [];
}

async function getMonthCoverage(driverId: string, companyId: string, monthKey: string): Promise<CoverageRow[]> {
  const { data, error } = await supabaseAdmin.rpc("get_driver_month_coverage", {
    p_driver_id: driverId,
    p_company_id: companyId,
    p_month: `${monthKey}-01`,
  });
  if (error) {
    console.error("Impossible de charger le calendrier du chauffeur :", error.message);
    return [];
  }
  return (data ?? []) as CoverageRow[];
}

export default async function CompanyAvailabilityPage(props: PageProps<"/chauffeurs/disponibilites">) {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const searchParams = await props.searchParams;
  const monthParam = typeof searchParams.month === "string" ? searchParams.month : null;
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : getBeninDateString().slice(0, 7);
  const monthDates = allDatesInMonth(month);

  const drivers = await getActiveDrivers(result.company.id);
  // Une compagnie a rarement plus d'une poignée de chauffeurs actifs — une
  // RPC par chauffeur (pas de RPC "tous chauffeurs, tout le mois" dédiée)
  // reste largement suffisant ici, même patron que le reste de la page.
  const coverageByDriver = await Promise.all(
    drivers.map(async (driver) => ({
      driver,
      coverage: computeDayCoverage(monthDates, await getMonthCoverage(driver.id, result.company.id, month)),
    }))
  );

  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h2 className="mb-4 text-xl font-semibold text-zinc-950 dark:text-zinc-50">Disponibilités — vue d&apos;ensemble</h2>

      <div className="mb-4 flex items-center justify-between">
        <Link
          href={`/chauffeurs/disponibilites?month=${prevMonth}`}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ← Mois précédent
        </Link>
        <span className="text-sm font-medium capitalize text-zinc-950 dark:text-zinc-50">{monthLabel(month)}</span>
        <Link
          href={`/chauffeurs/disponibilites?month=${nextMonth}`}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Mois suivant →
        </Link>
      </div>

      {drivers.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Aucun chauffeur actif pour le moment.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="sticky left-0 bg-white px-4 py-3 font-medium dark:bg-zinc-900">Chauffeur</th>
                {monthDates.map((date) => (
                  <th key={date} className="px-1 py-3 text-center font-medium">
                    {Number(date.slice(8, 10))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coverageByDriver.map(({ driver, coverage }) => (
                <tr key={driver.id} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800">
                  <td className="sticky left-0 whitespace-nowrap bg-white px-4 py-2 font-medium text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50">
                    <Link href={`/chauffeurs/${driver.id}/disponibilites`} className="hover:underline">
                      {driver.full_name}
                    </Link>
                  </td>
                  {monthDates.map((date) => {
                    const day = coverage.get(date);
                    const status = day?.status ?? "disponible";
                    const title = [
                      ...(day?.trips.map((t) => `Trajet : ${t.originCity} → ${t.destinationCity}`) ?? []),
                      ...(day?.unavailabilities.map((u) => `Indisponibilité (${u.reason})`) ?? []),
                    ].join(" · ");
                    return (
                      <td key={date} className="px-1 py-2 text-center" title={title || undefined}>
                        {status === "conflit" ? (
                          <span className="mx-auto flex h-4 w-4 flex-col overflow-hidden rounded">
                            <span className="block h-1/2 bg-red-200 dark:bg-red-900" />
                            <span className="block h-1/2 bg-amber-200 dark:bg-amber-900" />
                          </span>
                        ) : (
                          <span className={`mx-auto block h-4 w-4 rounded ${DRIVER_DAY_STATUS_STYLES[status]}`} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded ${DRIVER_DAY_STATUS_STYLES.disponible}`} /> {DRIVER_DAY_STATUS_LABELS.disponible}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded ${DRIVER_DAY_STATUS_STYLES.occupe}`} /> {DRIVER_DAY_STATUS_LABELS.occupe}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded ${DRIVER_DAY_STATUS_STYLES.indisponible}`} /> {DRIVER_DAY_STATUS_LABELS.indisponible}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex h-3 w-3 flex-col overflow-hidden rounded">
            <span className="block h-1/2 bg-red-200 dark:bg-red-900" />
            <span className="block h-1/2 bg-amber-200 dark:bg-amber-900" />
          </span>{" "}
          {DRIVER_DAY_STATUS_LABELS.conflit}
        </span>
      </div>
    </div>
  );
}
