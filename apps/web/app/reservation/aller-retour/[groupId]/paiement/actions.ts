"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type BookingRow = { id: string; leg: string; status: string; user_id: string };

// SIMULÉ — même bandeau/mécanisme que le paiement d'un billet simple
// (apps/web/app/reservation/[bookingId]/paiement/actions.ts). La différence
// ici : les deux legs doivent être payés ensemble, atomiquement — voir
// simulate_round_trip_payment() dans
// supabase/migrations/20260830010000_add_round_trip_bookings.sql.
export async function simulateRoundTripPayment(groupId: string): Promise<void> {
  const user = await requireUser(`/reservation/aller-retour/${groupId}/paiement`);

  // Vérifie la propriété via le client SSR authentifié (RLS
  // bookings_select_own_or_company) — même précaution en deux temps que le
  // paiement simple : lecture scopée par RLS d'abord, écriture privilégiée
  // ensuite. simulate_round_trip_payment() est security definer et ne peut
  // pas lire auth.uid() (appelée via service_role) : elle revérifie
  // p_user_id en interne, mais ne doit jamais être appelable directement
  // par un compte authenticated (execute non accordé) — cette vérification
  // ici est donc la seule ligne de défense réellement basée sur la session
  // réelle du voyageur.
  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, leg, status, user_id")
    .eq("booking_group_id", groupId)
    .eq("user_id", user.sub)
    .returns<BookingRow[]>();

  if (!bookings || bookings.length !== 2 || bookings.some((b) => b.status !== "pending")) {
    // Pas d'erreur technique : la page de paiement sait déjà afficher
    // l'état correct (introuvable / déjà payé / annulé).
    redirect(`/reservation/aller-retour/${groupId}/paiement`);
  }

  const { error } = await supabaseAdmin.rpc("simulate_round_trip_payment", {
    p_booking_group_id: groupId,
    p_user_id: user.sub,
  });

  if (error) {
    console.error("Impossible de payer l'aller-retour :", error.message);
    redirect(`/reservation/aller-retour/${groupId}/paiement`);
  }

  redirect(`/reservation/aller-retour/${groupId}/succes`);
}
