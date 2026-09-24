import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { estimateTripDurationHours } from "@/lib/duration";
import { getBeninDateString } from "@/lib/benin-time";
import { DOCUMENT_TYPE_LABELS, isDocumentType } from "@/lib/driverDocuments";
import { AccessBlockedMessage } from "../../_components";
import {
  DOCUMENT_EXPIRY_STATUS_STYLES,
  DRIVER_DISPLAY_STATUS_LABELS,
  DRIVER_DISPLAY_STATUS_STYLES,
  STATUS_LABELS,
  STATUS_STYLES,
  deriveDocumentExpiryStatus,
  deriveDriverStatus,
  documentExpiryLabel,
  formatDepartureDateTime,
} from "../../_shared";
import { EditDriverForm } from "./EditDriverForm";
import { UploadDocumentForm } from "./documents/UploadDocumentForm";
import { DeleteDocumentButton } from "./documents/DeleteDocumentButton";

type DriverDocumentRow = {
  id: string;
  type: string;
  file_name: string;
  expiration_date: string | null;
};

// Sous RLS (driver_documents_select_manager) : un agent obtiendrait 0 ligne
// même s'il appelait cette requête — mais elle n'est de toute façon
// exécutée que pour driverDocuments.manage (voir la page).
async function getDriverDocuments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  driverId: string,
  companyId: string
): Promise<DriverDocumentRow[]> {
  const { data, error } = await supabase
    .from("driver_documents")
    .select("id, type, file_name, expiration_date")
    .eq("driver_id", driverId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Impossible de charger les documents :", error.message);
    return [];
  }
  return (data ?? []) as DriverDocumentRow[];
}

async function getDocumentAlertDays(companyId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("companies")
    .select("document_alert_days")
    .eq("id", companyId)
    .maybeSingle<{ document_alert_days: number }>();
  return data?.document_alert_days ?? 30;
}

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
  arrival_at: string | null;
  routes: { origin_city: string; destination_city: string; distance_km: number | null };
};

type PastAssignment = {
  trip_id: string;
  departure_at: string;
  origin_city: string;
  destination_city: string;
  bus_number: string;
  status: string;
  duration_hours: number;
  duration_is_estimated: boolean;
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
// departure_at + estimateTripDurationHours(distance_km)h)] couvre
// l'instant présent — même règle exacte que get_company_drivers_overview
// (chantier A, corrigée par 20260923090000), ici pour UN seul chauffeur
// plutôt que toute la liste. Correctif appliqué ici aussi : cette requête
// locale traitait auparavant "pas d'arrival_at" comme "en mission pour
// toujours" (jamais de fenêtre), une divergence avec la RPC de liste déjà
// corrigée — désormais la même estimation s'applique aux deux.
async function getCurrentTrip(
  supabase: Awaited<ReturnType<typeof createClient>>,
  driverId: string,
  companyId: string
): Promise<CurrentTrip | null> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("trips")
    .select("id, bus_number, departure_at, arrival_at, routes!inner(origin_city, destination_city, distance_km)")
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

  const trip = data as unknown as CurrentTrip;
  const endMs = trip.arrival_at
    ? new Date(trip.arrival_at).getTime()
    : new Date(trip.departure_at).getTime() + estimateTripDurationHours(trip.routes.distance_km) * 3600_000;
  return endMs >= Date.now() ? trip : null;
}

// Historique enrichi des affectations passées (chantier B) : date,
// itinéraire, bus, statut, durée (réelle si arrival_at connue, sinon
// estimée — voir get_driver_trip_history). AUCUNE métrique de
// ponctualité : aucune heure réelle de départ n'est tracée dans ce
// schéma, ce chiffre serait inventé.
async function getDriverTripHistory(driverId: string, companyId: string): Promise<PastAssignment[]> {
  const { data, error } = await supabaseAdmin.rpc("get_driver_trip_history", {
    p_driver_id: driverId,
    p_company_id: companyId,
  });

  if (error) {
    console.error("Impossible de charger l'historique des affectations :", error.message);
    return [];
  }
  return (data ?? []) as PastAssignment[];
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

  const canViewDocuments = can(result.role, "driverDocuments.manage");

  const [currentTrip, history, documents, alertDays] = await Promise.all([
    getCurrentTrip(supabase, id, result.company.id),
    getDriverTripHistory(id, result.company.id),
    canViewDocuments ? getDriverDocuments(supabase, id, result.company.id) : Promise.resolve([]),
    canViewDocuments ? getDocumentAlertDays(result.company.id) : Promise.resolve(30),
  ]);
  const displayStatus = deriveDriverStatus(driver.is_active, currentTrip !== null);
  const canManage = can(result.role, "drivers.manage");
  const today = getBeninDateString();

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

      <Link
        href={`/chauffeurs/${id}/disponibilites`}
        className="self-start rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Voir le calendrier de disponibilités →
      </Link>

      {currentTrip ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          En mission : {currentTrip.routes.origin_city} → {currentTrip.routes.destination_city} ·{" "}
          {formatDepartureDateTime(currentTrip.departure_at)} · Bus {currentTrip.bus_number}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <EditDriverForm driver={driver} canManage={canManage} />
      </div>

      {canViewDocuments ? (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">Documents</h2>
          <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
            Réservé au propriétaire et aux chefs d&apos;agence. Une alerte est envoyée quand un
            document atteint {alertDays} jour{alertDays > 1 ? "s" : ""} avant son expiration.
          </p>

          <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <UploadDocumentForm driverId={id} />
          </div>

          {documents.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Aucun document pour ce chauffeur.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {documents.map((doc) => {
                const expiry = deriveDocumentExpiryStatus(doc.expiration_date, alertDays, today);
                return (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="font-medium text-zinc-950 dark:text-zinc-50">
                        {isDocumentType(doc.type) ? DOCUMENT_TYPE_LABELS[doc.type] : doc.type}
                      </span>
                      <span className="truncate text-zinc-500 dark:text-zinc-400">
                        {doc.file_name}
                        {doc.expiration_date ? ` · expire le ${doc.expiration_date.split("-").reverse().join("/")}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${DOCUMENT_EXPIRY_STATUS_STYLES[expiry.status]}`}
                      >
                        {documentExpiryLabel(expiry.status, expiry.daysLeft)}
                      </span>
                      <a
                        href={`/chauffeurs/${id}/documents/${doc.id}/telecharger`}
                        className="text-xs font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                      >
                        Télécharger
                      </a>
                      <DeleteDocumentButton driverId={id} documentId={doc.id} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

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
            {history.map((trip) => {
              const hours = Math.floor(trip.duration_hours);
              const minutes = Math.round((trip.duration_hours - hours) * 60);
              const durationLabel = `${trip.duration_is_estimated ? "≈ " : ""}${hours}h${minutes > 0 ? String(minutes).padStart(2, "0") : ""}${
                trip.duration_is_estimated ? " (estimée)" : ""
              }`;
              return (
                <li
                  key={trip.trip_id}
                  className="flex flex-col gap-1 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-zinc-950 dark:text-zinc-50">
                      {trip.origin_city} → {trip.destination_city}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        STATUS_STYLES[trip.status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      }`}
                    >
                      {STATUS_LABELS[trip.status] ?? trip.status}
                    </span>
                  </div>
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {formatDepartureDateTime(trip.departure_at)} · Bus {trip.bus_number} · Durée {durationLabel}
                  </span>
                </li>
              );
            })}
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
