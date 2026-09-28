import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { requireCompany } from "./supabase/dal";
import { AGENCY_COOKIE, type AgencyOption } from "./agencies";

// Agences actives de la compagnie — lues via le client de SESSION
// (agencies_select_owner est passée à is_company_member, voir
// 20260910140000_harden_trips_agencies_layouts_rls.sql) : owner,
// agency_manager et agent peuvent tous lister les agences de leur propre
// compagnie. Mémoïsée par requête comme getActiveStations().
export const getActiveAgencies = cache(async (companyId: string): Promise<AgencyOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agencies")
    .select("id, name, station_id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("Impossible de charger les agences :", error.message);
    return [];
  }
  return (data ?? []).map((a) => ({ id: a.id, name: a.name, stationId: a.station_id }));
});

// null = aucune agence à afficher (compagnie sans agence active).
//
// allowPreview : PARAMÉTRÉ explicitement par l'appelant plutôt que déduit
// ici de access.role — cette fonction est partagée par /pilotage ET
// /mon-tableau-de-bord (même cookie AGENCY_COOKIE), et un chef d'agence
// autorisé sur /pilotage doit pouvoir prévisualiser une autre agence là
// SANS que ce même cookie ne fuite dans SON PROPRE /mon-tableau-de-bord,
// qui doit continuer à montrer sa propre agence sans exception. Chaque
// appelant décide donc lui-même s'il autorise la prévisualisation :
// pilotage/page.tsx → canViewCompanyWideDashboards(access) ;
// mon-tableau-de-bord/page.tsx → access.role === "owner" (inchangé).
//
// Sans prévisualisation autorisée : toujours la propre agence du membre
// (agency_manager/agent), jamais le cookie. Avec : cookie validé contre
// la liste des agences actives, sinon la première par ordre alphabétique,
// sinon aucune — même logique qu'avant pour un owner.
export const getSelectedAgency = cache(async ({
  allowPreview,
}: {
  allowPreview: boolean;
}): Promise<AgencyOption | null> => {
  const access = await requireCompany();
  if (!access.ok) return null;

  if (!allowPreview) {
    return access.agency;
  }

  const agencies = await getActiveAgencies(access.company.id);
  if (agencies.length === 0) return null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(AGENCY_COOKIE)?.value;
  if (cookieValue) {
    const found = agencies.find((a) => a.id === cookieValue);
    if (found) return found;
  }
  return agencies[0];
});
