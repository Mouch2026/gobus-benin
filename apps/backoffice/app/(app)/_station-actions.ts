"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ALL_STATIONS, STATION_COOKIE } from "@/lib/stations";
import { getActiveStations } from "@/lib/station-selection";

// Pose le choix de gare dans un cookie de SESSION (aucun maxAge/expires) :
// il survit à la navigation entre pages, meurt avec le navigateur.
// httpOnly : l'îlot client n'a jamais besoin de le lire — le serveur rend
// directement la valeur courante dans le <select>.
//
// revalidatePath est indispensable, et doit porter sur le LAYOUT : poser
// un cookie ne rafraîchit rien tout seul, et une revalidation de type
// "page" ne suffit pas non plus — le sélecteur vit dans le layout partagé
// (app)/layout.tsx. Vérifié en navigateur : avec la seule revalidation de
// page, la liste se filtrait bien mais le <select> retombait sur
// « Toutes les gares » (layout resservi depuis le cache, donc rendu avec
// l'ancienne sélection).
export async function setSelectedStation(formData: FormData) {
  const requested = String(formData.get("stationId") ?? "");

  // On ne met jamais une valeur arbitraire dans le cookie, même si ce
  // n'est qu'un filtre d'affichage.
  let value = ALL_STATIONS;
  if (requested !== ALL_STATIONS) {
    const stations = await getActiveStations();
    if (!stations.some((s) => s.id === requested)) {
      return;
    }
    value = requested;
  }

  const cookieStore = await cookies();
  cookieStore.set(STATION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  revalidatePath("/", "layout");
}
