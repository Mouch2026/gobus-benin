"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveApprovalRequest } from "@/lib/supervisorApproval";
import { finalizeCounterBookingPayment } from "../reservations/nouvelle/finalizeCounterBookingPayment";

export type ReviewRequestState = { error: string | null };

// Approuve ou refuse une demande créée à distance. La résolution
// elle-même (update conditionnel where status='pending') est dans
// supervisorApproval.ts — ici, uniquement ce qui suit une résolution
// RÉUSSIE : finaliser le paiement (remise) ou annuler pour de vrai
// (annulation), jamais dupliqué avec le chemin "sur place" qui appelle
// exactement les mêmes fonctions immédiatement après vérification du
// mot de passe.
export async function reviewApprovalRequest(
  _prevState: ReviewRequestState,
  formData: FormData
): Promise<ReviewRequestState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "supervisorApprovals.manage");
  if (guardError) return guardError;
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const requestId = String(formData.get("requestId") ?? "");
  const decisionRaw = String(formData.get("decision") ?? "");
  if (!requestId || (decisionRaw !== "approved" && decisionRaw !== "rejected")) {
    return { error: "Demande invalide." };
  }
  const decision = decisionRaw as "approved" | "rejected";

  const scopeAgencyId = access.role === "agency_manager" ? (access.agency?.id ?? null) : null;

  const resolution = await resolveApprovalRequest({
    requestId,
    decision,
    reviewerId: access.user.sub,
    companyId: access.company.id,
    scopeAgencyId,
  });

  if (!resolution.ok) {
    return { error: resolution.error };
  }

  const { request } = resolution;

  if (request.action_type === "cancellation") {
    if (decision === "approved") {
      const { error } = await supabaseAdmin.rpc("cancel_booking_by_company", {
        p_booking_id: request.booking_id,
        p_company_id: access.company.id,
      });
      if (error) {
        console.error("Impossible d'annuler la réservation approuvée :", error.message);
        return { error: "Demande approuvée mais l'annulation a échoué. Contactez le support." };
      }
    }
    // Refusée : rien à faire, la réservation n'a jamais été touchée.
  } else {
    // 'discount'
    if (decision === "approved") {
      // Relit userId de la réservation — jamais transmis par le formulaire.
      const { data: booking } = await supabaseAdmin
        .from("bookings")
        .select("user_id")
        .eq("id", request.booking_id)
        .single<{ user_id: string }>();

      if (!booking) {
        return { error: "Réservation introuvable pour cette demande." };
      }

      const result = await finalizeCounterBookingPayment({
        bookingId: request.booking_id,
        userId: booking.user_id,
        discountPercent: request.discount_percent ?? 0,
        discountGrantedBy: access.user.sub, // le superviseur qui approuve, pas l'agent
        voucherIdRaw: request.voucher_id ?? "",
        usePoints: request.use_points ?? false,
        parts: request.payment_parts ?? [],
      });
      if (result.error) {
        return { error: result.error };
      }
    } else {
      // Refusée : la réservation tenue en attente est annulée (aucun
      // paiement n'a jamais été inséré — même effet que l'expiration).
      const { error } = await supabaseAdmin.rpc("issue_voucher_and_cancel_booking", {
        p_booking_id: request.booking_id,
      });
      if (error) {
        console.error("Impossible d'annuler la réservation refusée :", error.message);
        return { error: "Demande refusée mais l'annulation a échoué. Contactez le support." };
      }
    }
  }

  revalidatePath("/validations");
  revalidatePath(`/reservations/${request.booking_id}`);
  revalidatePath("/reservations");
  return { error: null };
}
