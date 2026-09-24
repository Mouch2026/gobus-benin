import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBeninDateString } from "@/lib/benin-time";
import { AccessBlockedMessage } from "../../../_components";
import { DRIVER_DAY_STATUS_LABELS, DRIVER_DAY_STATUS_STYLES, UNAVAILABILITY_REASON_LABELS } from "../../../_shared";
import { buildMonthGrid, allDatesInMonth, shiftMonth, monthLabel, WEEKDAY_LABELS } from "../../monthGrid";
import { computeDayCoverage, distinctUnavailabilities, type CoverageRow } from "../../coverage";
import { DeclareUnavailabilityForm } from "./DeclareUnavailabilityForm";
import { UnavailabilityRow } from "./UnavailabilityRow";

const MONTH_RE = /^\d{4}-\d{2}$/;

async function getOwnedDriver(driverId: string, companyId: string): Promise<{ id: string; full_name: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drivers")
    .select("id, full_name")
    .eq("id", driverId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) {
    console.error("Impossible de charger le chauffeur :", error.message);
    return null;
  }
  return data;
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

export default async function DriverAvailabilityPage(props: PageProps<"/chauffeurs/[id]/disponibilites">) {
  const { id } = await props.params;
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const driver = await getOwnedDriver(id, result.company.id);
  if (!driver) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Ce chauffeur n&apos;existe pas ou ne vous appartient pas.
        </p>
        <Link href="/chauffeurs" className="mt-4 inline-block font-medium text-zinc-950 hover:underline dark:text-zinc-50">
          ← Retour aux chauffeurs
        </Link>
      </div>
    );
  }

  const searchParams = await props.searchParams;
  const monthParam = typeof searchParams.month === "string" ? searchParams.month : null;
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : getBeninDateString().slice(0, 7);

  const rows = await getMonthCoverage(id, result.company.id, month);
  const monthDates = allDatesInMonth(month);
  const dayCoverage = computeDayCoverage(monthDates, rows);
  const weeks = buildMonthGrid(month);
  const periods = distinctUnavailabilities(rows);
  const canManage = can(result.role, "driverUnavailability.manage");

  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <div>
        <Link href={`/chauffeurs/${id}`} className="text-sm font-medium text-zinc-500 hover:underline dark:text-zinc-400">
          ← {driver.full_name}
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Disponibilités — {driver.full_name}
        </h1>
      </div>

      <div className="flex items-center justify-between">
        <Link
          href={`/chauffeurs/${id}/disponibilites?month=${prevMonth}`}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ← Mois précédent
        </Link>
        <span className="text-sm font-medium capitalize text-zinc-950 dark:text-zinc-50">{monthLabel(month)}</span>
        <Link
          href={`/chauffeurs/${id}/disponibilites?month=${nextMonth}`}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Mois suivant →
        </Link>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {WEEKDAY_LABELS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="mt-1 flex flex-col gap-1">
          {weeks.map((week, i) => (
            <div key={i} className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                const coverage = dayCoverage.get(day.date);
                const status = coverage?.status ?? "disponible";
                const title = [
                  ...(coverage?.trips.map((t) => `Trajet : ${t.originCity} → ${t.destinationCity} (bus ${t.busNumber})`) ?? []),
                  ...(coverage?.unavailabilities.map((u) => `Indisponibilité : ${UNAVAILABILITY_REASON_LABELS[u.reason] ?? u.reason}`) ?? []),
                ].join(" · ");

                return (
                  <div
                    key={day.date}
                    title={title || undefined}
                    className={`relative flex h-12 items-start justify-end overflow-hidden rounded p-1 text-xs font-medium ${
                      day.isCurrentMonth ? "" : "opacity-40"
                    } ${status === "conflit" ? "" : DRIVER_DAY_STATUS_STYLES[status]}`}
                  >
                    {status === "conflit" ? (
                      <>
                        <div className="absolute inset-x-0 top-0 h-1/2 bg-red-200 dark:bg-red-900" />
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-amber-200 dark:bg-amber-900" />
                      </>
                    ) : null}
                    <span className="relative text-zinc-900 dark:text-zinc-100">{day.dayOfMonth}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-4 border-t border-zinc-100 pt-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
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
            <span className="h-3 w-3 overflow-hidden rounded">
              <span className="block h-1/2 bg-red-200 dark:bg-red-900" />
              <span className="block h-1/2 bg-amber-200 dark:bg-amber-900" />
            </span>{" "}
            {DRIVER_DAY_STATUS_LABELS.conflit} — les deux se chevauchent, non bloqué
          </span>
        </div>
      </div>

      {canManage ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-semibold text-zinc-950 dark:text-zinc-50">Déclarer une indisponibilité</h2>
          <DeclareUnavailabilityForm driverId={id} />
        </div>
      ) : null}

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">Périodes déclarées ce mois</h2>
        {periods.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Aucune période d&apos;indisponibilité déclarée ce mois-ci.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {periods.map((period) => (
              <UnavailabilityRow key={period.id} driverId={id} period={period} canManage={canManage} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
