import { supabase } from "@/lib/supabase";

// Partagé entre la page d'accueil (SearchWidget dans le bandeau hero) et
// /recherche (version compacte du même widget) — une seule source pour ces
// deux petites requêtes, plutôt que de les dupliquer.

export async function getOriginCities(): Promise<string[]> {
  const { data, error } = await supabase.from("routes").select("origin_city").order("origin_city");

  if (error) {
    console.error("Impossible de charger les départs :", error.message);
    return [];
  }

  return Array.from(new Set(data.map((route) => route.origin_city)));
}

export async function getDestinationCitiesForOrigin(origin: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("routes")
    .select("destination_city")
    .eq("origin_city", origin)
    .order("destination_city");

  if (error) {
    console.error("Impossible de charger les destinations :", error.message);
    return [];
  }

  return Array.from(new Set(data.map((route) => route.destination_city)));
}
