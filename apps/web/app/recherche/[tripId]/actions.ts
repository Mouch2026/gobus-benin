"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "shared/src/lib/auditLog";

export type BookingState = { error: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createBooking(
  _prevState: BookingState,
  formData: FormData
): Promise<BookingState> {
  const tripId = String(formData.get("tripId") ?? "");

  if (!UUID_RE.test(tripId)) {
    return { error: "Ce trajet n'existe pas." };
  }

  // requireUser() est appelée pour son effet de bord d'authentification —
  // le RPC dérive l'utilisateur agissant via auth.uid() en interne, jamais
  // d'un id transmis par le client. La valeur de retour n'est reprise ici
  // que pour le journal d'audit (chantier 5), pas pour l'appel RPC.
  const user = await requireUser(`/recherche/${tripId}`);

  const seatCount = Number(formData.get("seatCount"));
  const passengerNames = formData.getAll("passengerName").map((name) => String(name).trim());
  const phone = String(formData.get("phone") ?? "").trim();

  if (!Number.isInteger(seatCount) || seatCount <= 0) {
    return { error: "Le nombre de places doit être un nombre entier positif." };
  }
  if (passengerNames.length !== seatCount || passengerNames.some((name) => !name)) {
    return { error: "Merci de renseigner le nom de chaque passager." };
  }
  if (!phone) {
    return { error: "Merci de renseigner un numéro de téléphone." };
  }

  const supabase = await createClient();

  // Single Postgres function call = single transaction: reserve_trip_seats
  // (already in place) locks the trip row, and assign_and_insert_passengers
  // assigns real seats while that lock is still held — this booking can
  // never collide with a concurrent one on the same trip. See
  // supabase/migrations/20260830030000_add_bus_layouts_and_seat_assignment.sql.
  const { data: bookingId, error } = await supabase.rpc("create_booking", {
    p_trip_id: tripId,
    p_seat_count: seatCount,
    p_phone: phone,
    p_passenger_names: passengerNames,
  });

  if (error || !bookingId) {
    // 23514 = check_violation, raised either by create_booking() itself
    // (déjà rédigé pour l'affichage direct, ex. "Ce trajet est déjà
    // parti...") ou par le trigger reserve_trip_seats à l'intérieur de
    // l'insert — celui-ci lève un message brut avec le trip_id
    // ("Plus assez de places disponibles sur ce trajet (trip_id=...)"),
    // jamais destiné à l'affichage tel quel, contrairement à
    // create_round_trip_booking qui le ré-emballe déjà côté SQL. Seul ce
    // cas précis est donc reformulé ici ; tout le reste (dont le nouveau
    // garde-fou de départ) est déjà rédigé pour le voyageur.
    if (error?.code === "23514") {
      if (error.message.startsWith("Plus assez de places disponibles sur ce trajet")) {
        return { error: "Plus assez de places disponibles sur ce trajet. Réessayez avec moins de places." };
      }
      return { error: error.message };
    }
    console.error("Impossible de créer la réservation :", error?.message);
    return { error: "Impossible de créer votre réservation. Réessayez." };
  }

  // Chantier 5 — company_id n'est pas renvoyé par create_booking, relu
  // séparément (RLS garantit déjà que cette réservation est bien la
  // sienne). Jamais bloquant : le journal est secondaire par rapport à
  // la réservation déjà créée.
  const { data: booking } = await supabase.from("bookings").select("company_id").eq("id", bookingId).maybeSingle<{ company_id: string }>();
  if (booking) {
    await logAuditEvent({
      action: "booking_created",
      bookingId,
      companyId: booking.company_id,
      acteurId: user.sub,
    });
  }

  redirect(`/reservation/${bookingId}/paiement`);
}
