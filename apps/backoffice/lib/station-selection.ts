import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "./supabase/server";
import { requireCompany } from "./supabase/dal";
import { ALL_STATIONS, STATION_COOKIE, type StationOption } from "./stations";

// Gares : référence PARTAGÉE curée par GoBus, lisible publiquement
// (policy stations_select_public) — le client de session suffit. Même
// requête que getActiveStations() dans app/(app)/agences/page.tsx.
// Mémoïsée par requête (React cache()) comme requireCompany() : le
// layout ET la page appellent ces helpers, un seul aller-retour réel.
export const getActiveStations = cache(async (): Promise<StationOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stations")
    .select("id, name, city")
    .eq("is_active", true)
    .order("city", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Impossible de charger les gares :", error.message);
    return [];
  }
  return (data ?? []) as StationOption[];
});

// null = « toutes les gares » (aucun filtre).
//
// Résolution : cookie d'abord, puis la gare de l'agence du membre, puis
// rien. Le passage systématique par la liste des gares ACTIVES couvre
// d'un seul chemin le cookie périmé, la gare désactivée depuis, et le
// propriétaire (qui n'a pas d'agence) — jamais d'erreur, on retombe sur
// « toutes les gares ».
export const getSelectedStation = cache(async (): Promise<StationOption | null> => {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(STATION_COOKIE)?.value;

  if (cookieValue === ALL_STATIONS) {
    return null;
  }

  const stations = await getActiveStations();

  if (cookieValue) {
    return stations.find((s) => s.id === cookieValue) ?? null;
  }

  const access = await requireCompany();
  const agencyStationId = access.ok ? access.agency?.stationId : null;
  if (!agencyStationId) {
    return null;
  }
  return stations.find((s) => s.id === agencyStationId) ?? null;
});
