"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "shared/src/lib/auditLog";

export type RoundTripBookingState = { error: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RpcResult = {
  booking_group_id: string;
  outbound_booking_id: string;
  return_booking_id: string;
};

export async function createRoundTripBooking(
  _prevState: RoundTripBookingState,
  formData: FormData
): Promise<RoundTripBookingState> {
  const outboundTripId = String(formData.get("outboundTripId") ?? "");
  const returnTripId = String(formData.get("returnTripId") ?? "");

  if (!UUID_RE.test(outboundTripId) || !UUID_RE.test(returnTripId)) {
    return { error: "Ce trajet n'existe pas." };
  }

  // requireUser() est appelée pour son effet de bord d'authentification —
  // le RPC dérive l'utilisateur agissant via auth.uid() en interne
  // (security invoker), jamais d'un id transmis par le client. La valeur
  // de retour n'est reprise ici que pour le journal d'audit (chantier 5).
  const user = await requireUser(
    `/reservation/aller-retour/nouveau?outbound=${outboundTripId}&return=${returnTripId}`
  );

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

  // Single RPC call = single Postgres transaction: if the return leg fails
  // (not enough seats, invalid trip, wrong date order), the outbound leg
  // already inserted inside the same function call is rolled back
  // automatically — never a half-created round trip. The same passenger
  // names are used for both legs (the same travelers go both ways). See
  // create_round_trip_booking() in
  // supabase/migrations/20260830030000_add_bus_layouts_and_seat_assignment.sql.
  const { data, error } = await supabase
    .rpc("create_round_trip_booking", {
      p_outbound_trip_id: outboundTripId,
      p_return_trip_id: returnTripId,
      p_seat_count: seatCount,
      p_phone: phone,
      p_passenger_names: passengerNames,
    })
    .single<RpcResult>();

  if (error || !data) {
    // 23514 = check_violation, raised by create_round_trip_booking()
    // itself — every message it raises via this errcode (trajet
    // introuvable, même trajet aller/retour, retour avant l'aller, pas
    // assez de places sur l'aller OU sur le retour spécifiquement) is
    // already written for display, so relaying it verbatim is correct
    // here — nothing was actually created either way.
    if (error?.code === "23514") {
      return { error: error.message };
    }
    console.error("Impossible de créer l'aller-retour :", error?.message);
    return { error: "Impossible de créer votre réservation. Réessayez." };
  }

  // Chantier 5 — une ligne PAR jambe : outbound_booking_id et
  // return_booking_id sont deux réservations distinctes (bookings), pas
  // une seule. company_id relu séparément, comme pour la réservation
  // simple.
  const { data: legs } = await supabase
    .from("bookings")
    .select("id, company_id")
    .in("id", [data.outbound_booking_id, data.return_booking_id]);
  for (const leg of legs ?? []) {
    await logAuditEvent({
      action: "booking_created",
      bookingId: leg.id,
      companyId: leg.company_id,
      acteurId: user.sub,
      payload: { booking_group_id: data.booking_group_id },
    });
  }

  redirect(`/reservation/aller-retour/${data.booking_group_id}/paiement`);
}
