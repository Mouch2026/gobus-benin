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
// agency_manager/agent voient TOUJOURS leur propre agence, sans jamais
// passer par le cookie — un sélecteur n'a de sens que pour un owner, qui
// n'a par construction aucune agence propre (company_members_agency_matches_role
// interdit agency_id sur une ligne 'owner'). Pour lui : cookie validé
// contre la liste des agences actives, sinon la première par ordre
// alphabétique, sinon aucune.
export const getSelectedAgency = cache(async (): Promise<AgencyOption | null> => {
  const access = await requireCompany();
  if (!access.ok) return null;

  if (access.role !== "owner") {
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
