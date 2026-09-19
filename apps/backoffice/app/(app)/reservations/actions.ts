"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  verifySupervisorOnSite,
  createResolvedApprovalRequest,
  createPendingApprovalRequest,
  notifySupervisors,
  sweepExpiredApprovalRequests,
} from "@/lib/supervisorApproval";
import { logAuditEvent } from "shared/src/lib/auditLog";

export type CancelBookingState = { error: string | null };

// Chantier 3c — en dessous de ce délai avant départ, un agent (jamais un
// owner/agency_manager, ils SONT le superviseur) a besoin d'une
// validation pour annuler.
const CANCELLATION_APPROVAL_WINDOW_MS = 2 * 60 * 60 * 1000; // 2h

// Annule UNE réservation confirmée (pas tout le trajet), scoped à la
// compagnie. cancel_booking_by_company réutilise issue_voucher_and_cancel_booking
// en interne (jamais dupliquée) — même règle que côté voyageur : avoir
// 24h, jamais de remboursement direct. Passe par service_role car
// cancel_booking_by_company n'est pas granted à authenticated (elle
// revérifie elle-même l'appartenance à la compagnie, comme
// mark_voucher_refund_processed).
export async function cancelBooking(
  _prevState: CancelBookingState,
  formData: FormData
): Promise<CancelBookingState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const bookingId = String(formData.get("bookingId") ?? "");
  if (!bookingId) {
    return { error: "Réservation invalide." };
  }

  // Relu indépendamment de ce que le bouton affichait côté navigateur —
  // jamais de confiance dans le délai calculé côté client.
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("company_id, trips(departure_at)")
    .eq("id", bookingId)
    .maybeSingle<{ company_id: string; trips: { departure_at: string } | null }>();

  if (!booking || booking.company_id !== access.company.id) {
    return { error: "Cette réservation n'existe pas ou ne vous appartient pas." };
  }

  const departureAt = booking.trips?.departure_at;
  const withinApprovalWindow =
    !!departureAt && new Date(departureAt).getTime() - Date.now() < CANCELLATION_APPROVAL_WINDOW_MS;
  const requiresApproval = access.role === "agent" && withinApprovalWindow;

  if (requiresApproval) {
    const approvalMode = String(formData.get("approvalMode") ?? "");
    if (approvalMode !== "on_site" && approvalMode !== "remote") {
      return {
        error: "Une annulation à moins de 2h du départ nécessite une validation. Merci de choisir un mode.",
      };
    }
    const agencyId = access.agency!.id; // un agent a toujours une agence

    if (approvalMode === "on_site") {
      const verification = await verifySupervisorOnSite({
        companyId: access.company.id,
        agencyId,
        email: String(formData.get("supervisorEmail") ?? ""),
        password: String(formData.get("supervisorPassword") ?? ""),
      });
      if (!verification.ok) {
        return { error: verification.error };
      }

      await createResolvedApprovalRequest({
        companyId: access.company.id,
        agencyId,
        requestedBy: access.user.sub,
        actionType: "cancellation",
        bookingId,
        reviewedBy: verification.supervisorUserId,
      });

      return finishCancellation(bookingId, access.company.id, access.user.sub, agencyId);
    }

    // À distance : rien n'est touché sur la réservation — c'est ce qui
    // garde le siège occupé tant que ce n'est pas validé.
    const created = await createPendingApprovalRequest({
      companyId: access.company.id,
      agencyId,
      requestedBy: access.user.sub,
      actionType: "cancellation",
      bookingId,
    });
    if (!created) {
      return { error: "Une demande est déjà en attente pour cette réservation." };
    }

    const { data: bookingRow } = await supabaseAdmin
      .from("bookings")
      .select("booking_reference")
      .eq("id", bookingId)
      .single<{ booking_reference: string }>();

    await notifySupervisors({
      companyId: access.company.id,
      agencyId,
      title: "Validation requise — annulation",
      body: `Annulation de ${bookingRow?.booking_reference ?? bookingId}, départ imminent.`,
      type: "supervisor_approval_requested",
      actionHref: "/validations",
    });

    revalidatePath("/reservations");
    revalidatePath(`/reservations/${bookingId}`);
    return { error: null };
  }

  return finishCancellation(bookingId, access.company.id, access.user.sub, access.agency?.id ?? null);
}

// acteurId/agencyId : couvre à la fois l'annulation directe (agent, sans
// validation requise) ET l'annulation validée sur place — un seul point
// d'écriture pour le journal d'audit (chantier 5), quel que soit lequel
// des deux appels ci-dessus a mené ici.
async function finishCancellation(
  bookingId: string,
  companyId: string,
  acteurId: string,
  agencyId: string | null
): Promise<CancelBookingState> {
  const { error } = await supabaseAdmin.rpc("cancel_booking_by_company", {
    p_booking_id: bookingId,
    p_company_id: companyId,
  });

  if (error) {
    console.error("Impossible d'annuler la réservation :", error.message);
    // 23514 = check_violation : cancel_booking_by_company lève ses propres
    // erreurs métier avec ce code et un message déjà rédigé pour
    // l'utilisateur ("Ce trajet est déjà parti...", "Seule une réservation
    // confirmée..."), remonté tel quel plutôt que masqué par un message
    // générique.
    if (error.code === "23514") {
      return { error: error.message };
    }
    return { error: "Impossible d'annuler cette réservation. Réessayez." };
  }

  await logAuditEvent({
    action: "booking_cancelled",
    bookingId,
    companyId,
    acteurId,
    agencyId,
  });

  revalidatePath("/reservations");
  revalidatePath(`/reservations/${bookingId}`);
  return { error: null };
}

// Lue par ApprovalWaitingBanner.tsx (poll côté client) — jamais via le
// client de session : cette réservation n'appartient pas forcément à
// l'utilisateur qui poll au sens RLS classique (un superviseur peut
// résoudre la demande depuis un autre poste), donc scoping fait ici
// explicitement plutôt que par une policy.
export async function getApprovalRequestStatus(
  bookingId: string
): Promise<{ status: "pending" | "approved" | "rejected" | "expired" } | null> {
  const access = await requireCompany();
  if (!access.ok) return null;

  await sweepExpiredApprovalRequests();

  const { data } = await supabaseAdmin
    .from("supervisor_approval_requests")
    .select("status")
    .eq("booking_id", bookingId)
    .eq("company_id", access.company.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ status: "pending" | "approved" | "rejected" | "expired" }>();

  return data ?? null;
}
