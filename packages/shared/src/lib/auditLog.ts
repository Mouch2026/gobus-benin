import "server-only";
import { supabaseAdmin } from "./notifications/supabaseAdmin";

// Chantier 5 : journal d'audit unifié (création/modification/annulation
// de réservation, demande d'impression de billet) — même patron exact
// que notificationLog.ts::logNotification (même supabaseAdmin partagé,
// utilisable depuis apps/web ET apps/backoffice). Écriture explicite
// depuis chaque site plutôt qu'un trigger : voir le plan pour pourquoi
// (auth.uid() ne reflète pas l'agent quand un appel passe par
// service_role, ce qui est le cas pour la moitié des sites d'écriture).

export type AuditAction =
  | "booking_created"
  | "booking_modified"
  | "booking_cancelled"
  | "ticket_print_requested"
  // Chantier 6 (verrouillage d'écran) : premier type d'événement sans
  // réservation associée — audit_logs.booking_id est nullable depuis
  // cette migration précisément pour ce cas.
  | "session_swap"
  // Chantier abonnement : même forme que session_swap (companyId +
  // acteurId, ni booking ni agence) — aucun changement de schéma requis.
  | "subscription_plan_changed";

// Le journal est secondaire par rapport à l'action réelle qu'il
// enregistre — ne doit jamais faire échouer l'appelant.
export async function logAuditEvent(entry: {
  action: AuditAction;
  bookingId: string | null;
  companyId: string;
  acteurId: string;
  agencyId?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      action: entry.action,
      booking_id: entry.bookingId,
      company_id: entry.companyId,
      acteur_id: entry.acteurId,
      agency_id: entry.agencyId ?? null,
      payload: entry.payload ?? null,
    });
    if (error) throw error;
  } catch (error) {
    console.error("Impossible d'écrire dans audit_logs :", error);
  }
}
