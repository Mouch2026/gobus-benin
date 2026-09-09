"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type EditBookingState = { error: string | null };

// Une seule fonction SQL atomique (update_booking_details) pour
// téléphone + noms + sièges : jamais d'état partiel si une étape échoue.
// La réassignation de siège y est protégée par un verrou explicite sur
// trips (voir la migration) — cette action ne fait que transmettre
// l'intention, jamais de logique de collision côté TS.
export async function updateBookingDetails(
  _prevState: EditBookingState,
  formData: FormData
): Promise<EditBookingState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const bookingId = String(formData.get("bookingId") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();
  const passengerIds = formData.getAll("passengerId") as string[];

  if (!bookingId || passengerIds.length === 0) {
    return { error: "Réservation invalide." };
  }

  // Le formulaire normal ne peut pas produire de doublon (une entrée
  // hidden par passager, dérivée d'une seule lecture DB) — mais rien ne
  // garantit qu'un appel direct à cette Server Action (contournant le
  // formulaire) respecte ça. Sans ce contrôle, un passenger_id répété
  // serait transmis tel quel à update_booking_details, qui le rejette
  // maintenant aussi (défense en profondeur, ceinture-bretelles) — mais
  // autant échouer tôt, avec un message clair, plutôt que de compter
  // uniquement sur l'aller-retour SQL.
  if (new Set(passengerIds).size !== passengerIds.length) {
    return { error: "La liste des passagers contient un doublon." };
  }

  const passengerUpdates = [];
  const seatNumbersInSubmission = new Set<string>();

  for (const passengerId of passengerIds) {
    const fullName = String(formData.get(`fullName-${passengerId}`) ?? "").trim();
    const seatNumberRaw = String(formData.get(`seatNumber-${passengerId}`) ?? "").trim();
    const seatNumber = seatNumberRaw || null;

    if (!fullName) {
      return { error: "Le nom de chaque passager est obligatoire." };
    }

    // Garde-fou côté formulaire (ne remplace pas la vérification atomique
    // côté SQL, qui reste la vraie garantie) : deux passagers de CETTE
    // MÊME soumission ne peuvent pas viser le même siège.
    if (seatNumber) {
      if (seatNumbersInSubmission.has(seatNumber)) {
        return { error: `Le siège ${seatNumber} est attribué à plusieurs passagers dans ce formulaire.` };
      }
      seatNumbersInSubmission.add(seatNumber);
    }

    passengerUpdates.push({ passenger_id: passengerId, full_name: fullName, seat_number: seatNumber });
  }

  const { error } = await supabaseAdmin.rpc("update_booking_details", {
    p_booking_id: bookingId,
    p_company_id: access.company.id,
    p_phone: phone,
    p_passenger_updates: passengerUpdates,
  });

  if (error) {
    console.error("Impossible de mettre à jour la réservation :", error.message);
    // 23514 = check_violation : update_booking_details lève ses propres
    // erreurs métier avec un message déjà rédigé pour l'utilisateur
    // ("Le siège X est déjà occupé", "Cette réservation ne peut plus être
    // modifiée"...), remonté tel quel.
    if (error.code === "23514") {
      return { error: error.message };
    }
    return { error: "Impossible de mettre à jour cette réservation. Réessayez." };
  }

  revalidatePath(`/reservations/${bookingId}`);
  revalidatePath(`/reservations/${bookingId}/modifier`);
  revalidatePath("/reservations");
  return { error: null };
}
