import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "../../_components";
import {
  DRIVER_DISPLAY_STATUS_LABELS,
  DRIVER_DISPLAY_STATUS_STYLES,
  deriveDriverStatus,
  formatDepartureDateTime,
} from "../../_shared";
import { EditDriverForm } from "./EditDriverForm";

type DriverDetail = {
  id: string;
  full_name: string;
  phone: string | null;
  license_number: string | null;
  is_active: boolean;
};

type CurrentTrip = {
  id: string;
  bus_number: string;
  departure_at: string;
  routes: { origin_city: string; destination_city: string };
};

type PastAssignment = {
  id: string;
  bus_number: string;
  departure_at: string;
  routes: { origin_city: string; destination_city: string };
};

async function getOwnedDriver(
  supabase: Awaited<ReturnType<typeof createClient>>,
  driverId: string,
  companyId: string
): Promise<DriverDetail | null> {
  const { data, error } = await supabase
    .from("drivers")
    .select("id, full_name, phone, license_number, is_active")
    .eq("id", driverId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger le chauffeur :", error.message);
    return null;
  }
  return data;
}

// Trajet dont l'intervalle [departure_at, coalesce(arrival_at,
// departure_at)] couvre l'instant présent — même règle exacte que
// get_company_drivers_overview, ici pour UN seul chauffeur plutôt que
// toute la liste.
async function getCurrentTrip(
  supabase: Awaited<ReturnType<typeof createClient>>,
  driverId: string,
  companyId: string
): Promise<CurrentTrip | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("trips")
    .select("id, bus_number, departure_at, arrival_at, routes!inner(origin_city, destination_city)")
    .eq("driver_id", driverId)
    .eq("company_id", companyId)
    .lte("departure_at", nowIso)
    .order("departure_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger le trajet en cours :", error.message);
    return null;
  }
  if (!data) return null;

  const coversNow = data.arrival_at ? new Date(data.arrival_at).getTime() >= Date.now() : true;
  return coversNow ? (data as unknown as CurrentTrip) : null;
}

// Historique simple des affectations passées — pas de statistiques km/
// ponctualité (hors de ce chantier), juste la liste triée.
async function getDriverTripHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  driverId: string,
  companyId: string
): Promise<PastAssignment[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("id, bus_number, departure_at, routes!inner(origin_city, destination_city)")
    .eq("driver_id", driverId)
    .eq("company_id", companyId)
    .lt("departure_at", new Date().toISOString())
    .order("departure_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Impossible de charger l'historique des affectations :", error.message);
    return [];
  }
  return (data ?? []) as unknown as PastAssignment[];
}

export default async function DriverDetailPage(props: PageProps<"/chauffeurs/[id]">) {
  const { id } = await props.params;
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const supabase = await createClient();
  const driver = await getOwnedDriver(supabase, id, result.company.id);

  if (!driver) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Ce chauffeur n&apos;existe pas ou ne vous appartient pas.
        </p>
        <Link
          href="/chauffeurs"
          className="mt-4 inline-block font-medium text-zinc-950 hover:underline dark:text-zinc-50"
        >
          ← Retour aux chauffeurs
        </Link>
      </div>
    );
  }

  const [currentTrip, history] = await Promise.all([
    getCurrentTrip(supabase, id, result.company.id),
    getDriverTripHistory(supabase, id, result.company.id),
  ]);
  const displayStatus = deriveDriverStatus(driver.is_active, currentTrip !== null);
  const canManage = can(result.role, "drivers.manage");

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{driver.full_name}</h1>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${DRIVER_DISPLAY_STATUS_STYLES[displayStatus]}`}
        >
          {DRIVER_DISPLAY_STATUS_LABELS[displayStatus]}
        </span>
      </div>

      {currentTrip ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          En mission : {currentTrip.routes.origin_city} → {currentTrip.routes.destination_city} ·{" "}
          {formatDepartureDateTime(currentTrip.departure_at)} · Bus {currentTrip.bus_number}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <EditDriverForm driver={driver} canManage={canManage} />
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Historique des affectations
        </h2>
        {history.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Aucune affectation passée.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((trip) => (
              <li
                key={trip.id}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="text-zinc-950 dark:text-zinc-50">
                  {trip.routes.origin_city} → {trip.routes.destination_city}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {formatDepartureDateTime(trip.departure_at)} · Bus {trip.bus_number}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/chauffeurs"
        className="font-medium text-zinc-950 hover:underline dark:text-zinc-50"
      >
        ← Retour aux chauffeurs
      </Link>
    </div>
  );
}
