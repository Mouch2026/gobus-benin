"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";

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

  // requireUser() is called for its authentication side effect only — the
  // RPC derives the acting user from auth.uid() internally (security
  // invoker), never from a client-supplied id.
  await requireUser(
    `/reservation/aller-retour/nouveau?outbound=${outboundTripId}&return=${returnTripId}`
  );

  const seatCount = Number(formData.get("seatCount"));
  const passengerName = String(formData.get("passengerName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  if (!Number.isInteger(seatCount) || seatCount <= 0) {
    return { error: "Le nombre de places doit être un nombre entier positif." };
  }
  if (!passengerName) {
    return { error: "Merci de renseigner le nom du voyageur." };
  }
  if (!phone) {
    return { error: "Merci de renseigner un numéro de téléphone." };
  }

  const supabase = await createClient();

  // Single RPC call = single Postgres transaction: if the return leg fails
  // (not enough seats, invalid trip, wrong date order), the outbound leg
  // already inserted inside the same function call is rolled back
  // automatically — never a half-created round trip. See
  // create_round_trip_booking() in
  // supabase/migrations/20260830010000_add_round_trip_bookings.sql.
  const { data, error } = await supabase
    .rpc("create_round_trip_booking", {
      p_outbound_trip_id: outboundTripId,
      p_return_trip_id: returnTripId,
      p_seat_count: seatCount,
      p_passenger_name: passengerName,
      p_passenger_phone: phone,
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

  redirect(`/reservation/aller-retour/${data.booking_group_id}/paiement`);
}
