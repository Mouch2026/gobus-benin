"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOpenSession } from "@/lib/caisse";

export type CaisseActionState = { error: string | null };

// Ouvrir/clôturer/vider sa propre caisse est ouvert à tout membre AVEC
// une agence (agent ou agency_manager) — jamais un propriétaire, qui n'a
// structurellement pas d'agence (company_members_agency_matches_role).
// Pas de nouvelle permission : même principe que createBookingForCustomer/
// cancelBooking, scopé à SA PROPRE session, jamais celle d'un collègue.
export async function openSession(
  _prevState: CaisseActionState,
  _formData: FormData
): Promise<CaisseActionState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }
  if (!access.agency) {
    return { error: "Le propriétaire n'a pas d'agence associée — impossible d'ouvrir une session de caisse." };
  }

  const { error } = await supabaseAdmin.from("session_caisse").insert({
    employe_id: access.user.sub,
    company_id: access.company.id,
    agence_id: access.agency.id,
  });

  if (error) {
    // 23505 = unique_violation sur l'index partiel "une seule session
    // ouverte par employé".
    if (error.code === "23505") {
      return { error: "Vous avez déjà une session de caisse ouverte." };
    }
    console.error("Impossible d'ouvrir la session de caisse :", error.message);
    return { error: "Impossible d'ouvrir une session de caisse. Réessayez." };
  }

  revalidatePath("/caisse");
  return { error: null };
}

export async function recordCashDrop(
  _prevState: CaisseActionState,
  formData: FormData
): Promise<CaisseActionState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const montantRaw = String(formData.get("montantFcfa") ?? "").trim();
  const montantFcfa = Number(montantRaw);
  if (!Number.isInteger(montantFcfa) || montantFcfa <= 0) {
    return { error: "Merci de renseigner un montant entier positif." };
  }

  const session = await getOpenSession(access.user.sub);
  if (!session) {
    return { error: "Aucune session de caisse ouverte." };
  }

  const { data, error } = await supabaseAdmin.rpc("record_cash_drop", {
    p_session_id: session.id,
    p_employe_id: access.user.sub,
    p_montant_fcfa: montantFcfa,
  });

  if (error || !data) {
    console.error("Impossible d'enregistrer le vide-caisse :", error?.message);
    if (error?.code === "23514") {
      return { error: error.message };
    }
    return { error: "Impossible d'enregistrer ce vide-caisse. Réessayez." };
  }

  revalidatePath("/caisse");
  redirect(`/caisse/mouvements/${data}/imprimer`);
}

export async function updateCashCeiling(
  _prevState: CaisseActionState,
  formData: FormData
): Promise<CaisseActionState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "cashCeiling.manage");
  if (guardError) return guardError;
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const raw = String(formData.get("cashCeilingFcfa") ?? "").trim();
  // Champ vide = pas de plafond (aucun blocage) — jamais 0, qui
  // bloquerait tout paiement espèces dès le premier FCFA.
  let cashCeilingFcfa: number | null = null;
  if (raw) {
    cashCeilingFcfa = Number(raw);
    if (!Number.isInteger(cashCeilingFcfa) || cashCeilingFcfa <= 0) {
      return { error: "Le plafond doit être un entier positif, ou laissé vide pour aucun plafond." };
    }
  }

  const { error } = await supabaseAdmin
    .from("companies")
    .update({ cash_ceiling_fcfa: cashCeilingFcfa })
    .eq("id", access.company.id);

  if (error) {
    console.error("Impossible de mettre à jour le plafond de caisse :", error.message);
    return { error: "Impossible de mettre à jour le plafond. Réessayez." };
  }

  revalidatePath("/caisse");
  return { error: null };
}
