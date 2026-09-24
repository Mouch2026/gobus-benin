"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "shared/src/lib/auditLog";

export type DriverFormState = { error: string | null };
export type EditDriverState = { error: string | null; success: boolean };

// Vérifie que le chauffeur appartient bien à la compagnie appelante — même
// patron que assertOwnedAgency (agences/actions.ts). RLS le garantit déjà
// côté écriture, mais on veut un message clair plutôt qu'un update à 0
// ligne silencieux.
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

export async function createDriver(
  _prevState: DriverFormState,
  formData: FormData
): Promise<DriverFormState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "drivers.manage");
  if (guardError) return guardError;
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const licenseNumber = String(formData.get("licenseNumber") ?? "").trim() || null;

  if (!fullName) {
    return { error: "Merci de renseigner le nom du chauffeur." };
  }

  const supabase = await createClient();
  const { data: driver, error } = await supabase
    .from("drivers")
    .insert({ company_id: access.company.id, full_name: fullName, phone, license_number: licenseNumber })
    .select("id")
    .single();

  if (error || !driver) {
    console.error("Impossible de créer le chauffeur :", error?.message);
    return { error: "Impossible de créer ce chauffeur. Réessayez." };
  }

  await logAuditEvent({
    action: "driver_created",
    bookingId: null,
    companyId: access.company.id,
    acteurId: access.user.sub,
    agencyId: access.agency?.id ?? null,
    payload: { driverId: driver.id },
  });

  revalidatePath("/chauffeurs");
  // Page de création séparée (pas un formulaire inline comme agences) —
  // même UX que createTrip : rediriger vers la fiche du chauffeur créé
  // plutôt que laisser un formulaire vide sans confirmation visible.
  redirect(`/chauffeurs/${driver.id}`);
}

export async function updateDriver(
  _prevState: EditDriverState,
  formData: FormData
): Promise<EditDriverState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "drivers.manage");
  if (guardError) return { ...guardError, success: false };
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const driverId = String(formData.get("driverId") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const licenseNumber = String(formData.get("licenseNumber") ?? "").trim() || null;

  if (!fullName) {
    return { error: "Merci de renseigner le nom du chauffeur.", success: false };
  }

  const supabase = await createClient();

  if (!(await assertOwnedDriver(supabase, driverId, access.company.id))) {
    return { error: "Ce chauffeur n'existe pas ou ne vous appartient pas.", success: false };
  }

  const { error } = await supabase
    .from("drivers")
    .update({ full_name: fullName, phone, license_number: licenseNumber })
    .eq("id", driverId);

  if (error) {
    console.error("Impossible de mettre à jour le chauffeur :", error.message);
    return { error: "Impossible de mettre à jour ce chauffeur. Réessayez.", success: false };
  }

  await logAuditEvent({
    action: "driver_modified",
    bookingId: null,
    companyId: access.company.id,
    acteurId: access.user.sub,
    agencyId: access.agency?.id ?? null,
    payload: { driverId },
  });

  revalidatePath("/chauffeurs");
  revalidatePath(`/chauffeurs/${driverId}`);
  return { error: null, success: true };
}

export async function setDriverActive(
  _prevState: EditDriverState,
  formData: FormData
): Promise<EditDriverState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "drivers.manage");
  if (guardError) return { ...guardError, success: false };
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const driverId = String(formData.get("driverId") ?? "").trim();
  const isActive = formData.get("isActive") === "1";

  const supabase = await createClient();

  if (!(await assertOwnedDriver(supabase, driverId, access.company.id))) {
    return { error: "Ce chauffeur n'existe pas ou ne vous appartient pas.", success: false };
  }

  const { error } = await supabase.from("drivers").update({ is_active: isActive }).eq("id", driverId);

  if (error) {
    console.error("Impossible de changer l'état du chauffeur :", error.message);
    return { error: "Impossible de changer l'état de ce chauffeur. Réessayez.", success: false };
  }

  // Seule la désactivation est auditée explicitement (nom demandé par le
  // chantier) — une réactivation reste une simple bascule inverse du même
  // toggle, déjà couverte par "driver_modified" si on veut l'historique
  // complet ; ici on colle exactement à la liste demandée.
  if (!isActive) {
    await logAuditEvent({
      action: "driver_deactivated",
      bookingId: null,
      companyId: access.company.id,
      acteurId: access.user.sub,
      agencyId: access.agency?.id ?? null,
      payload: { driverId },
    });
  }

  revalidatePath("/chauffeurs");
  revalidatePath(`/chauffeurs/${driverId}`);
  return { error: null, success: true };
}

// Variante "fire-and-forget" pour le bouton inline de la liste
// /chauffeurs (Server Component, pas de useActionState) — un <form
// action={...}> lié directement à une Server Action doit renvoyer
// void/Promise<void>, contrairement à setDriverActive (pensée pour
// useActionState, qui renvoie un état). La fiche /chauffeurs/[id] utilise
// setDriverActive directement et affiche l'erreur éventuelle ; ici, en cas
// d'échec, revalidatePath n'a pas lieu et l'état affiché reste simplement
// l'ancien (pas pire qu'un lien mort, jamais une exception non gérée).
export async function toggleDriverActive(formData: FormData): Promise<void> {
  await setDriverActive({ error: null, success: false }, formData);
}
