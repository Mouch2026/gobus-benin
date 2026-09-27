"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendBookingPaymentLinkNotification } from "shared/src/lib/notifications/sendBookingPaymentLinkNotification";
import { logAuditEvent } from "shared/src/lib/auditLog";

export type ReportDelayState = { error: string | null; success: boolean };

// Aucune permission dédiée : "n'importe quel membre actif de la
// compagnie peut signaler" (spec du chantier), même niveau que
// boarding.validate — seule la vraie appartenance compagnie (vérifiée par
// requireCompany() puis par report_trip_delay() elle-même côté serveur)
// protège cette action.
export async function reportTripDelay(
  _prevState: ReportDelayState,
  formData: FormData
): Promise<ReportDelayState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const tripId = String(formData.get("tripId") ?? "");
  const delayMinutes = Number(formData.get("delayMinutes"));
  const reason = String(formData.get("reason") ?? "").trim() || null;

  if (!Number.isInteger(delayMinutes) || delayMinutes < 0) {
    return { error: "Le retard doit être un nombre entier de minutes, positif ou nul.", success: false };
  }

  const { data, error } = await supabaseAdmin
    .rpc("report_trip_delay", {
      p_trip_id: tripId,
      p_company_id: access.company.id,
      p_actor_id: access.user.sub,
      p_delay_minutes: delayMinutes,
      p_reason: reason,
    })
    .maybeSingle<{ id: string; trip_id: string; company_id: string; notified_agency_ids: string[] }>();

  if (error || !data) {
    console.error("Impossible d'enregistrer le signalement de retard :", error?.message);
    return { error: error?.message ?? "Impossible d'enregistrer ce signalement. Réessayez.", success: false };
  }

  await logAuditEvent({
    action: "trip_delay_reported",
    bookingId: null,
    companyId: data.company_id,
    acteurId: access.user.sub,
    agencyId: access.agency?.id ?? null,
    payload: { tripId: data.trip_id, delayMinutes, reason, notifiedAgencyIds: data.notified_agency_ids },
  });

  revalidatePath("/mon-tableau-de-bord");
  return { error: null, success: true };
}

export type RelaunchPaymentLinkState = { error: string | null; success: boolean };

// Relance UNIQUEMENT : renvoie le même lien/jeton, ne le régénère jamais
// (voir le plan — payment_token/payment_token_expires_at sont posés à la
// création du paiement, jamais recalculés ici). Un lien déjà expiré ne
// doit jamais être renvoyé tel quel.
export async function relaunchPaymentLink(
  _prevState: RelaunchPaymentLinkState,
  formData: FormData
): Promise<RelaunchPaymentLinkState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const paymentId = String(formData.get("paymentId") ?? "");

  const { data: payment, error } = await supabaseAdmin
    .from("payments")
    .select("id, status, payment_token_expires_at, bookings!inner(company_id)")
    .eq("id", paymentId)
    .eq("bookings.company_id", access.company.id)
    .maybeSingle<{ id: string; status: string; payment_token_expires_at: string | null }>();

  if (error || !payment) {
    return { error: "Paiement introuvable pour votre compagnie.", success: false };
  }
  if (payment.status !== "pending") {
    return { error: "Ce paiement n'est plus en attente.", success: false };
  }
  if (!payment.payment_token_expires_at || new Date(payment.payment_token_expires_at) <= new Date()) {
    return { error: "Le lien de paiement a expiré — il ne peut plus être relancé.", success: false };
  }

  await sendBookingPaymentLinkNotification({ paymentId: payment.id });

  return { error: null, success: true };
}
