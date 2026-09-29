"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireCompany } from "@/lib/supabase/dal";
import { canViewCompanyWideDashboards } from "@/lib/permissions";
import { AGENCY_COOKIE } from "@/lib/agencies";
import { getActiveAgencies } from "@/lib/agency-selection";

// Owner OU chef d'agence autorisé sur "/" (canViewCompanyWideDashboards)
// — tout autre agency_manager/agent voit directement sa propre agence
// (agency-selection.ts), aucun sélecteur ne leur est jamais rendu.
// Cookie de SESSION (pas de maxAge), même choix que setSelectedStation.
//
// Relocalisé depuis mon-tableau-de-bord/agency-actions.ts (chantier
// "pilotage") pour être partagé par "/" ET /mon-tableau-de-bord — même
// précédent que _station-select.tsx/_station-actions.ts, déjà à la
// racine du groupe de routes (app) pour la même raison. /pilotage
// consommait aussi ce sélecteur avant le chantier "un seul tableau de
// bord compagnie entière" ; il n'est plus qu'une redirection vers "/",
// donc plus un second consommateur distinct. Deux consommateurs connus
// statiquement : une revalidation explicite de chacun des deux suffit,
// pas besoin du traitement "layout" plus général de _station-actions.ts
// (dont le sélecteur apparaît sur TOUS les écrans).
export async function setSelectedAgency(formData: FormData) {
  const access = await requireCompany();
  if (!access.ok || !canViewCompanyWideDashboards(access)) return;

  const requested = String(formData.get("agencyId") ?? "");
  const agencies = await getActiveAgencies(access.company.id);
  if (!agencies.some((a) => a.id === requested)) return;

  const cookieStore = await cookies();
  cookieStore.set(AGENCY_COOKIE, requested, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/mon-tableau-de-bord");
  // "/" porte désormais tout le contenu de l'ancien /pilotage (chantier
  // "un seul tableau de bord compagnie entière") — c'est cette page qui
  // affiche le sélecteur d'agence, plus jamais /pilotage (simple
  // redirection, sans données à revalider).
  revalidatePath("/");
}
