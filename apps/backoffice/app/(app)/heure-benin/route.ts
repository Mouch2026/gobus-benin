import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/dal";
import { getBeninTimeString } from "@/lib/benin-time";

// Interrogé une fois par minute par l'horloge de la topbar
// (_live-clock.tsx) pour rafraîchir l'heure béninoise affichée. L'heure
// n'est pas une donnée scopée à une compagnie (identique pour tout le
// monde) : requireUser() suffit, pas besoin du coût de
// get_company_access() (requireCompany()) à chaque tick.
export async function GET() {
  await requireUser();
  return NextResponse.json({ time: getBeninTimeString() });
}
