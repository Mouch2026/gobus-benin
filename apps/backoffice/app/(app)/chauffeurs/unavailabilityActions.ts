"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { getBeninDateStringFor } from "@/lib/benin-time";
import { logAuditEvent } from "shared/src/lib/auditLog";

export type UnavailabilityFormState = { error: string | null; warning?: string | null; success?: boolean };
export type EditUnavailabilityState = { error: string | null; success: boolean };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_REASONS = ["conge", "maladie", "indisponible"] as const;

function validateDates(startDate: string, endDate: string, reason: string): string | null {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return "Merci de renseigner une date de début et de fin valides.";
  }
  if (endDate < startDate) {
    return "La date de fin doit être postérieure ou égale à la date de début.";
  }
  if (!(VALID_REASONS as readonly string[]).includes(reason)) {
    return "Motif invalide.";
  }
  return null;
}

async function assertOwnedDriver(
  supabase: Awaited<ReturnType<typeof createClient>>,
  driverId: string,
  companyId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("drivers")
    .select("id")
    .eq("id", driverId)
    .eq("company_id", companyId)
    .maybeSingle();
  return !!data;
}

type ConflictingTrip = {
  departure_at: string;
  bus_number: string;
  routes: { origin_city: string; destination_city: string } | null;
};

// Trajets déjà affectés à ce chauffeur dont la date de départ (Bénin)
// tombe dans la période déclarée — comparaison en mémoire après un fetch
// scopé driver+compagnie (même patron que filterBookings.ts : pas besoin
// d'une RPC dédiée pour un avertissement, pas un contrôle bloquant).
async function findConflictingTrips(
  supabase: Awaited<ReturnType<typeof createClient>>,
  driverId: string,
  companyId: string,
  startDate: string,
  endDate: string
): Promise<ConflictingTrip[]> {
  const { data } = await supabase
    .from("trips")
    .select("departure_at, bus_number, routes(origin_city, destination_city)")
    .eq("driver_id", driverId)
    .eq("company_id", companyId);

  return ((data ?? []) as unknown as ConflictingTrip[]).filter((t) => {
    const day = getBeninDateStringFor(new Date(t.departure_at));
    return day >= startDate && day <= endDate;
  });
}

function formatConflictWarning(trips: ConflictingTrip[]): string {
  const list = trips
    .map((t) => {
      const day = getBeninDateStringFor(new Date(t.departure_at));
      const route = t.routes ? `${t.routes.origin_city} → ${t.routes.destination_city}` : "trajet";
      return `${day} — ${route} (bus ${t.bus_number})`;
    })
    .join(" ; ");
  return `${trips.length} trajet(s) déjà affecté(s) à ce chauffeur sur cette période, à réaffecter si besoin : ${list}`;
}

// N'empêche JAMAIS l'enregistrement de l'indisponibilité — un simple
// avertissement informatif si des trajets sont déjà affectés sur la
// période, à charge de la compagnie de réassigner manuellement.
export async function declareDriverUnavailability(
  _prevState: UnavailabilityFormState,
  formData: FormData
): Promise<UnavailabilityFormState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "driverUnavailability.manage");
  if (guardError) return guardError;
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const driverId = String(formData.get("driverId") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  const validationError = validateDates(startDate, endDate, reason);
  if (validationError) return { error: validationError };

  const supabase = await createClient();

  if (!(await assertOwnedDriver(supabase, driverId, access.company.id))) {
    return { error: "Ce chauffeur n'existe pas ou ne vous appartient pas." };
  }

  const { error } = await supabase.from("driver_unavailability").insert({
    driver_id: driverId,
    company_id: access.company.id,
    start_date: startDate,
    end_date: endDate,
    reason,
    created_by: access.user.sub,
  });

  if (error) {
    console.error("Impossible d'enregistrer l'indisponibilité :", error.message);
    return { error: "Impossible d'enregistrer cette indisponibilité. Réessayez." };
  }

  await logAuditEvent({
    action: "driver_unavailability_declared",
    bookingId: null,
    companyId: access.company.id,
    acteurId: access.user.sub,
    agencyId: access.agency?.id ?? null,
    payload: { driverId, startDate, endDate, reason },
  });

  revalidatePath(`/chauffeurs/${driverId}/disponibilites`);
  revalidatePath("/chauffeurs/disponibilites");

  const conflicting = await findConflictingTrips(supabase, driverId, access.company.id, startDate, endDate);
  if (conflicting.length > 0) {
    return { error: null, success: true, warning: formatConflictWarning(conflicting) };
  }

  return { error: null, success: true };
}

export async function updateDriverUnavailability(
  _prevState: EditUnavailabilityState,
  formData: FormData
): Promise<EditUnavailabilityState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "driverUnavailability.manage");
  if (guardError) return { ...guardError, success: false };
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const unavailabilityId = String(formData.get("unavailabilityId") ?? "").trim();
  const driverId = String(formData.get("driverId") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  const validationError = validateDates(startDate, endDate, reason);
  if (validationError) return { error: validationError, success: false };

  const supabase = await createClient();
  // RLS (driver_unavailability_write_manager) garantit déjà que cette
  // ligne appartient bien à la compagnie de l'appelant — même raisonnement
  // que setPromoCodeActive (codes-promo/actions.ts) : un update à 0 ligne
  // silencieux est suffisant ici, rien d'autre à valider avant l'écriture.
  const { error } = await supabase
    .from("driver_unavailability")
    .update({ start_date: startDate, end_date: endDate, reason })
    .eq("id", unavailabilityId)
    .eq("company_id", access.company.id);

  if (error) {
    console.error("Impossible de modifier l'indisponibilité :", error.message);
    return { error: "Impossible de modifier cette indisponibilité. Réessayez.", success: false };
  }

  await logAuditEvent({
    action: "driver_unavailability_modified",
    bookingId: null,
    companyId: access.company.id,
    acteurId: access.user.sub,
    agencyId: access.agency?.id ?? null,
    payload: { unavailabilityId, driverId, startDate, endDate, reason },
  });

  revalidatePath(`/chauffeurs/${driverId}/disponibilites`);
  revalidatePath("/chauffeurs/disponibilites");
  return { error: null, success: true };
}

export async function deleteDriverUnavailability(
  _prevState: EditUnavailabilityState,
  formData: FormData
): Promise<EditUnavailabilityState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "driverUnavailability.manage");
  if (guardError) return { ...guardError, success: false };
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const unavailabilityId = String(formData.get("unavailabilityId") ?? "").trim();
  const driverId = String(formData.get("driverId") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase
    .from("driver_unavailability")
    .delete()
    .eq("id", unavailabilityId)
    .eq("company_id", access.company.id);

  if (error) {
    console.error("Impossible de supprimer l'indisponibilité :", error.message);
    return { error: "Impossible de supprimer cette indisponibilité. Réessayez.", success: false };
  }

  await logAuditEvent({
    action: "driver_unavailability_deleted",
    bookingId: null,
    companyId: access.company.id,
    acteurId: access.user.sub,
    agencyId: access.agency?.id ?? null,
    payload: { unavailabilityId, driverId },
  });

  revalidatePath(`/chauffeurs/${driverId}/disponibilites`);
  revalidatePath("/chauffeurs/disponibilites");
  return { error: null, success: true };
}
