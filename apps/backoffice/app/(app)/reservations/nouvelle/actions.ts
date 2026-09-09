"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendBookingPaymentLinkNotification } from "shared/src/lib/notifications/sendBookingPaymentLinkNotification";

export type NewBookingState = { error: string | null };

const PAYMENT_TOKEN_MAX_VALIDITY_MS = 48 * 60 * 60 * 1000; // 48h

// Trouve le compte voyageur existant pour cet email, ou en crée un
// "discret" (mot de passe aléatoire jamais stocké/loggé/envoyé — ce
// client ne se connectera jamais par ce biais, seul le lien de paiement
// compte). email_confirm: true, même patron que compte/inscription et
// partenaires/inscription : aucun pipeline de confirmation n'existe sur
// ce projet.
async function findOrCreateDiscreetCustomer(email: string): Promise<string> {
  const password = randomBytes(24).toString("base64");

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) return data.user.id;

  // email_exists (status 422) — confirmé empiriquement avant d'écrire ce
  // code, pas supposé. Ne JAMAIS faire confiance à un filtre ?email= (voir
  // la règle CLAUDE.md sur auth.admin.listUsers/getUserByEmail) —
  // lister et vérifier la correspondance exacte soi-même.
  if (error.code !== "email_exists") {
    throw new Error(`Impossible de créer le compte client : ${error.message}`);
  }

  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    throw new Error(`Impossible de vérifier l'utilisateur existant : ${listError.message}`);
  }
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) {
    throw new Error("Impossible de retrouver le compte client existant pour cet email.");
  }
  return existing.id;
}

export async function createBookingForCustomer(
  _prevState: NewBookingState,
  formData: FormData
): Promise<NewBookingState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const tripId = String(formData.get("tripId") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const passengerNames = (formData.getAll("passengerName") as string[])
    .map((name) => name.trim())
    .filter(Boolean);

  if (!tripId) {
    return { error: "Merci de choisir un trajet." };
  }
  if (!email || !email.includes("@")) {
    return { error: "Merci de renseigner un e-mail valide pour le client." };
  }
  if (!phone) {
    return { error: "Merci de renseigner un numéro de téléphone." };
  }
  if (passengerNames.length === 0) {
    return { error: "Merci de renseigner au moins un passager." };
  }

  // Departure_at nécessaire pour plafonner l'expiration du jeton — lu via
  // le client de session (RLS), scopé à la compagnie appelante comme
  // partout ailleurs dans ce back-office.
  const supabase = await createClient();
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("departure_at")
    .eq("id", tripId)
    .eq("company_id", access.company.id)
    .maybeSingle();

  if (tripError || !trip) {
    return { error: "Ce trajet n'existe pas ou ne vous appartient pas." };
  }

  let userId: string;
  try {
    userId = await findOrCreateDiscreetCustomer(email);
  } catch (err) {
    console.error("Impossible de résoudre le compte client :", err);
    return { error: err instanceof Error ? err.message : "Impossible de créer le compte client." };
  }

  const { data: bookingId, error: bookingError } = await supabaseAdmin.rpc(
    "create_booking_for_company",
    {
      p_trip_id: tripId,
      p_seat_count: passengerNames.length,
      p_phone: phone,
      p_passenger_names: passengerNames,
      p_user_id: userId,
      p_company_id: access.company.id,
    }
  );

  if (bookingError) {
    console.error("Impossible de créer la réservation :", bookingError.message);
    if (bookingError.code === "23514") {
      return { error: bookingError.message };
    }
    return { error: "Impossible de créer cette réservation. Réessayez." };
  }

  // Jeton de paiement : 256 bits d'entropie (crypto.randomBytes, jamais
  // dérivé du booking_id/email), plafonné à 48h ET au départ du trajet —
  // voir le plan pour la justification complète de ce mécanisme.
  const paymentToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Math.min(Date.now() + PAYMENT_TOKEN_MAX_VALIDITY_MS, new Date(trip.departure_at).getTime())
  ).toISOString();

  const { error: tokenError } = await supabaseAdmin
    .from("bookings")
    .update({ payment_token: paymentToken, payment_token_expires_at: expiresAt })
    .eq("id", bookingId);

  if (tokenError) {
    console.error("Réservation créée mais le jeton de paiement n'a pas pu être enregistré :", tokenError.message);
    return { error: "Réservation créée mais le lien de paiement n'a pas pu être généré. Contactez le support." };
  }

  // Ne bloque jamais la création elle-même — même philosophie que
  // sendBookingConfirmation/sendTripCancellationNotification. Le lien
  // reste consultable manuellement sur la page de la réservation même si
  // cet envoi échoue (utile en particulier en développement, où
  // RESEND_API_KEY est vide).
  await sendBookingPaymentLinkNotification({ bookingId });

  redirect(`/reservations/${bookingId}`);
}
