import type { SupabaseClient } from "@supabase/supabase-js";
import { getBeninDateStringFor } from "@/lib/benin-time";
import { UNAVAILABILITY_REASON_LABELS } from "../_shared";

export type DriverAssignmentResult =
  | { ok: true; driverId: string | null }
  | { ok: false; error: string };

// Résout et valide le driverId optionnel envoyé par le formulaire trajet
// (création ou édition) : chaîne vide -> null (aucun chauffeur assigné,
// ne bloque jamais la sauvegarde), sinon vérifie qu'il existe, est actif,
// et appartient à la compagnie, puis vérifie le chevauchement avec les
// autres trajets déjà assignés à ce chauffeur.
//
// Chevauchement : SEULEMENT si le trajet en cours d'affectation ET l'autre
// trajet comparé ont tous deux arrival_at renseigné — sinon on laisse
// passer sans vérifier. Limite connue, pas un oubli : sans heure
// d'arrivée sur l'un des deux trajets, il n'y a rien de calculable, et
// bloquer la saisie sur une hypothèse serait pire qu'un faux négatif
// occasionnel.
//
// Ce contrôle est un check-then-write en TypeScript, pas verrouillé
// atomiquement (contrairement à validate_boarding, chantier Embarquement)
// — deux affectations concurrentes du même chauffeur pourraient en théorie
// passer toutes les deux. Accepté comme limite connue : c'est une action
// de planification interne à faible fréquence (propriétaire/chef
// d'agence), pas un invariant anti-fraude.
export async function resolveAndValidateDriver(
  supabase: SupabaseClient,
  companyId: string,
  driverIdRaw: string,
  departureAt: string,
  arrivalAt: string | null,
  excludeTripId: string | null
): Promise<DriverAssignmentResult> {
  const driverId = driverIdRaw.trim() || null;
  if (!driverId) {
    return { ok: true, driverId: null };
  }

  const { data: driver } = await supabase
    .from("drivers")
    .select("id")
    .eq("id", driverId)
    .eq("company_id", companyId)
    .eq("is_active", true)
    .maybeSingle();

  if (!driver) {
    return { ok: false, error: "Ce chauffeur n'existe pas, n'est pas actif, ou ne vous appartient pas." };
  }

  if (arrivalAt) {
    let query = supabase
      .from("trips")
      .select("id, departure_at, arrival_at")
      .eq("driver_id", driverId)
      .eq("company_id", companyId)
      .not("arrival_at", "is", null);
    if (excludeTripId) {
      query = query.neq("id", excludeTripId);
    }

    const { data: otherTrips } = await query;
    const departureMs = new Date(departureAt).getTime();
    const arrivalMs = new Date(arrivalAt).getTime();

    const overlaps = (otherTrips ?? []).some((t: { departure_at: string; arrival_at: string | null }) => {
      const otherDepartureMs = new Date(t.departure_at).getTime();
      const otherArrivalMs = new Date(t.arrival_at as string).getTime();
      return departureMs < otherArrivalMs && otherDepartureMs < arrivalMs;
    });

    if (overlaps) {
      return { ok: false, error: "Ce chauffeur est déjà affecté à un autre trajet sur ce créneau horaire." };
    }
  }

  // Chantier B (disponibilités) : comparaison au niveau JOUR (Bénin), pas
  // à l'heure près — la date de départ du trajet jusqu'à sa date
  // d'arrivée si connue, sinon la date de départ seule. Volontairement
  // PAS d'estimation par distance ici (contrairement au statut affiché,
  // deriveDriverStatus/get_company_drivers_overview) : une approximation
  // n'a pas sa place dans un contrôle qui BLOQUE une affectation, sauf
  // dans un affichage informatif.
  const tripStartDate = getBeninDateStringFor(new Date(departureAt));
  const tripEndDate = arrivalAt ? getBeninDateStringFor(new Date(arrivalAt)) : tripStartDate;

  const { data: unavailabilities } = await supabase
    .from("driver_unavailability")
    .select("start_date, end_date, reason")
    .eq("driver_id", driverId)
    .eq("company_id", companyId)
    .lte("start_date", tripEndDate)
    .gte("end_date", tripStartDate);

  if (unavailabilities && unavailabilities.length > 0) {
    const u = unavailabilities[0] as { start_date: string; end_date: string; reason: string };
    const reasonLabel = UNAVAILABILITY_REASON_LABELS[u.reason] ?? u.reason;
    return {
      ok: false,
      error: `Ce chauffeur est déclaré indisponible (${reasonLabel}) du ${u.start_date} au ${u.end_date}.`,
    };
  }

  return { ok: true, driverId };
}
