"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";

export type AgencyFormState = { error: string | null };
export type EditAgencyState = { error: string | null; success: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// La gare choisie doit exister et être active — les gares sont une
// référence partagée curée par GoBus (jamais créée par une compagnie),
// donc on revalide toujours l'id reçu du formulaire contre stations.
async function assertActiveStation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  stationId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("stations")
    .select("id")
    .eq("id", stationId)
    .eq("is_active", true)
    .maybeSingle();
  return !!data;
}

export async function createAgency(
  _prevState: AgencyFormState,
  formData: FormData
): Promise<AgencyFormState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const stationId = String(formData.get("stationId") ?? "").trim();

  if (!name) {
    return { error: "Merci de renseigner un nom pour cette agence." };
  }
  if (!UUID_RE.test(stationId)) {
    return { error: "Merci de choisir une gare." };
  }

  const supabase = await createClient();

  if (!(await assertActiveStation(supabase, stationId))) {
    return { error: "Cette gare n'existe pas ou n'est plus active." };
  }

  const { error } = await supabase.from("agencies").insert({
    company_id: access.company.id,
    station_id: stationId,
    name,
  });

  if (error) {
    // 23505 = unique_violation on unique(company_id, station_id, name).
    if (error.code === "23505") {
      return { error: "Une agence porte déjà ce nom à cette gare." };
    }
    console.error("Impossible de créer l'agence :", error.message);
    return { error: "Impossible de créer cette agence. Réessayez." };
  }

  revalidatePath("/agences");
  return { error: null };
}

// Vérifie que l'agence appartient bien à la compagnie appelante — même
// patron que getOwnedTrip (trajets/[id]/actions.ts). RLS le garantit déjà
// côté écriture, mais on veut un message clair plutôt qu'un update à 0
// ligne silencieux.
async function assertOwnedAgency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agencyId: string,
  companyId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("agencies")
    .select("id")
    .eq("id", agencyId)
    .eq("company_id", companyId)
    .maybeSingle();
  return !!data;
}

export async function updateAgency(
  _prevState: EditAgencyState,
  formData: FormData
): Promise<EditAgencyState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const agencyId = String(formData.get("agencyId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const stationId = String(formData.get("stationId") ?? "").trim();

  if (!name) {
    return { error: "Merci de renseigner un nom pour cette agence.", success: false };
  }
  if (!UUID_RE.test(stationId)) {
    return { error: "Merci de choisir une gare.", success: false };
  }

  const supabase = await createClient();

  if (!(await assertOwnedAgency(supabase, agencyId, access.company.id))) {
    return { error: "Cette agence n'existe pas ou ne vous appartient pas.", success: false };
  }
  if (!(await assertActiveStation(supabase, stationId))) {
    return { error: "Cette gare n'existe pas ou n'est plus active.", success: false };
  }

  const { error } = await supabase
    .from("agencies")
    .update({ name, station_id: stationId })
    .eq("id", agencyId);

  if (error) {
    if (error.code === "23505") {
      return { error: "Une agence porte déjà ce nom à cette gare.", success: false };
    }
    console.error("Impossible de mettre à jour l'agence :", error.message);
    return { error: "Impossible de mettre à jour cette agence. Réessayez.", success: false };
  }

  revalidatePath("/agences");
  revalidatePath(`/agences/${agencyId}`);
  return { error: null, success: true };
}

export async function setAgencyActive(
  _prevState: EditAgencyState,
  formData: FormData
): Promise<EditAgencyState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const agencyId = String(formData.get("agencyId") ?? "").trim();
  const isActive = formData.get("isActive") === "1";

  const supabase = await createClient();

  if (!(await assertOwnedAgency(supabase, agencyId, access.company.id))) {
    return { error: "Cette agence n'existe pas ou ne vous appartient pas.", success: false };
  }

  const { error } = await supabase
    .from("agencies")
    .update({ is_active: isActive })
    .eq("id", agencyId);

  if (error) {
    console.error("Impossible de changer l'état de l'agence :", error.message);
    return { error: "Impossible de changer l'état de cette agence. Réessayez.", success: false };
  }

  revalidatePath("/agences");
  revalidatePath(`/agences/${agencyId}`);
  return { error: null, success: true };
}
