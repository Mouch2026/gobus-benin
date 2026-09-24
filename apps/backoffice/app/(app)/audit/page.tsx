import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AccessBlockedMessage } from "../_components";
import { formatDepartureDateTime } from "../_shared";

type AuditFeedRow = {
  source: string;
  action: string;
  occurred_at: string;
  acteur_id: string | null;
  agency_id: string | null;
  booking_id: string | null;
  payload: Record<string, unknown> | null;
};

const SOURCE_LABELS: Record<string, string> = {
  audit_logs: "Réservation",
  mouvements_caisse: "Caisse",
  supervisor_approval_requests: "Validation",
  notification_log: "Notification",
};

const ACTION_LABELS: Record<string, string> = {
  booking_created: "Réservation créée",
  booking_modified: "Réservation modifiée",
  booking_cancelled: "Réservation annulée",
  ticket_print_requested: "Billet imprimé",
  discount_requested: "Remise demandée",
  cancellation_requested: "Annulation demandée",
  driver_created: "Chauffeur créé",
  driver_modified: "Chauffeur modifié",
  driver_deactivated: "Chauffeur désactivé",
  driver_assigned_to_trip: "Chauffeur affecté à un trajet",
  driver_unavailability_declared: "Indisponibilité déclarée",
  driver_unavailability_modified: "Indisponibilité modifiée",
  driver_unavailability_deleted: "Indisponibilité supprimée",
  driver_document_added: "Document de chauffeur ajouté",
  driver_document_deleted: "Document de chauffeur supprimé",
};

// Owner : toute la compagnie. Agency_manager : uniquement son agence —
// même scoping que /validations et /caisse, vérifié ici en code plutôt
// que par une policy (get_company_audit_feed n'est appelable que via
// service_role, comme les autres vues consolidées).
async function getAuditFeed(companyId: string, scopeAgencyId: string | null): Promise<AuditFeedRow[]> {
  const { data, error } = await supabaseAdmin.rpc("get_company_audit_feed", {
    p_company_id: companyId,
    p_agency_id: scopeAgencyId,
    p_limit: 200,
  });
  if (error) {
    console.error("Impossible de charger le journal d'audit :", error.message);
    return [];
  }
  return (data ?? []) as AuditFeedRow[];
}

async function getActorNames(companyId: string, userIds: string[]): Promise<Record<string, string>> {
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

async function getBookingReferences(bookingIds: string[]): Promise<Record<string, string>> {
  if (bookingIds.length === 0) return {};
  const { data } = await supabaseAdmin.from("bookings").select("id, booking_reference").in("id", bookingIds);

  const refs: Record<string, string> = {};
  for (const row of data ?? []) {
    refs[row.id] = row.booking_reference;
  }
  return refs;
}

export default async function AuditPage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }
  if (!can(result.role, "auditLog.view")) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Réservé au propriétaire ou à un responsable d&apos;agence.
        </p>
      </div>
    );
  }

  const scopeAgencyId = result.role === "agency_manager" ? (result.agency?.id ?? null) : null;
  const feed = await getAuditFeed(result.company.id, scopeAgencyId);

  const actorIds = [...new Set(feed.map((row) => row.acteur_id).filter((id): id is string => !!id))];
  const bookingIds = [...new Set(feed.map((row) => row.booking_id).filter((id): id is string => !!id))];
  const [actorNames, bookingReferences] = await Promise.all([
    getActorNames(result.company.id, actorIds),
    getBookingReferences(bookingIds),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
      <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Journal d&apos;audit</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Historique consolidé des réservations, mouvements de caisse, validations et notifications —{" "}
        {scopeAgencyId ? "limité à votre agence." : "toute la compagnie."}
      </p>

      {feed.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Aucun événement pour le moment.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Réservation</th>
                <th className="px-4 py-3 font-medium">Auteur</th>
              </tr>
            </thead>
            <tbody>
              {feed.map((row, index) => (
                <tr
                  key={`${row.source}-${row.occurred_at}-${index}`}
                  className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {formatDepartureDateTime(row.occurred_at)}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {SOURCE_LABELS[row.source] ?? row.source}
                  </td>
                  <td className="px-4 py-3 text-zinc-950 dark:text-zinc-50">
                    {ACTION_LABELS[row.action] ?? row.action}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {row.booking_id ? (bookingReferences[row.booking_id] ?? "—") : "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    {row.acteur_id ? (actorNames[row.acteur_id] ?? "Agent") : "—"}
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
