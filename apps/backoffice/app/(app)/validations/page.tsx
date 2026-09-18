import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sweepExpiredApprovalRequests } from "@/lib/supervisorApproval";
import { AccessBlockedMessage } from "../_components";
import { formatFcfa } from "shared";
import { formatDepartureDateTime } from "../_shared";
import { ReviewRequestButtons } from "./ReviewRequestButtons";

type PendingRequest = {
  id: string;
  action_type: "discount" | "cancellation";
  requested_by: string;
  discount_percent: number | null;
  discount_amount_fcfa: number | null;
  created_at: string;
  bookings: {
    booking_reference: string;
    trips: { departure_at: string; routes: { origin_city: string; destination_city: string } } | null;
  } | null;
};

// Owner : toute la compagnie. Agency_manager : uniquement son agence —
// vérifié ici en code, pas seulement par can() (qui ne fait qu'autoriser
// l'ACCÈS à la page, pas le PÉRIMÈTRE des lignes visibles).
async function getPendingRequests(companyId: string, scopeAgencyId: string | null): Promise<PendingRequest[]> {
  let query = supabaseAdmin
    .from("supervisor_approval_requests")
    .select(
      "id, action_type, requested_by, discount_percent, discount_amount_fcfa, created_at, bookings(booking_reference, trips(departure_at, routes(origin_city, destination_city)))"
    )
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (scopeAgencyId) {
    query = query.eq("agency_id", scopeAgencyId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Impossible de charger les demandes de validation :", error.message);
    return [];
  }
  return (data ?? []) as unknown as PendingRequest[];
}

async function getRequesterNames(companyId: string, userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const { data } = await supabaseAdmin
    .from("company_members")
    .select("user_id, full_name")
    .eq("company_id", companyId)
    .in("user_id", userIds);

  const names: Record<string, string> = {};
  for (const row of data ?? []) {
    names[row.user_id] = row.full_name ?? "Agent";
  }
  return names;
}

export default async function ValidationsPage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }
  if (!can(result.role, "supervisorApprovals.manage")) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Réservé au propriétaire ou à un responsable d&apos;agence.
        </p>
      </div>
    );
  }

  await sweepExpiredApprovalRequests();

  const scopeAgencyId = result.role === "agency_manager" ? (result.agency?.id ?? null) : null;
  const requests = await getPendingRequests(result.company.id, scopeAgencyId);
  const requesterNames = await getRequesterNames(
    result.company.id,
    requests.map((r) => r.requested_by)
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Validations en attente</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Remises de plus de 10% et annulations à moins de 2h du départ demandées à distance par un
        agent — expirent automatiquement après 10 minutes sans réponse.
      </p>

      {requests.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Aucune demande en attente.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((req) => {
            const trip = req.bookings?.trips;
            return (
              <div
                key={req.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-zinc-950 dark:text-zinc-50">
                    {req.action_type === "discount"
                      ? `Remise ${req.discount_percent}% (${formatFcfa(req.discount_amount_fcfa ?? 0)})`
                      : "Annulation"}{" "}
                    — {req.bookings?.booking_reference ?? "réservation inconnue"}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    Demandé par {requesterNames[req.requested_by] ?? "Agent"}
                  </span>
                </div>
                {trip ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {trip.routes.origin_city} → {trip.routes.destination_city} — départ{" "}
                    {formatDepartureDateTime(trip.departure_at)}
                  </p>
                ) : null}
                <ReviewRequestButtons requestId={req.id} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
