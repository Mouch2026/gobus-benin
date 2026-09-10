"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateServiceFees } from "shared";
import { applyVoucherAndPoints } from "shared/src/lib/applyVoucherAndPoints";
import { sendBookingConfirmation } from "shared/src/lib/notifications/sendBookingConfirmation";
import { sendBookingPaymentLinkNotification } from "shared/src/lib/notifications/sendBookingPaymentLinkNotification";

export type NewBookingState = { error: string | null };

const PAYMENT_TOKEN_MAX_VALIDITY_MS = 48 * 60 * 60 * 1000; // 48h
const MAX_PARTS = 4;
const LINK_METHODS = new Set(["mtn_money", "moov_money", "card"]);
const VALID_METHODS = new Set(["mtn_money", "moov_money", "card", "cash"]);

// Utilisée par findOrCreateDiscreetCustomer (email déjà pris) ET par
// lookupCustomer (étape "Recherche du client") — jamais dupliquée : les
// deux ont besoin de la même correspondance exacte, jamais d'un filtre
// ?email= (voir la règle CLAUDE.md sur auth.admin.listUsers/getUserByEmail).
async function findExistingUserByEmail(email: string): Promise<string | null> {
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  if (listError) {
    throw new Error(`Impossible de vérifier l'utilisateur existant : ${listError.message}`);
  }
  const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return existing?.id ?? null;
}

// Trouve le compte voyageur existant pour cet email, ou en crée un
// "discret" (mot de passe aléatoire jamais stocké/loggé/envoyé — ce
// client ne se connectera jamais par ce biais). email_confirm: true, même
// patron que compte/inscription et partenaires/inscription.
async function findOrCreateDiscreetCustomer(email: string): Promise<string> {
  const password = randomBytes(24).toString("base64");

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) return data.user.id;

  if (error.code !== "email_exists") {
    throw new Error(`Impossible de créer le compte client : ${error.message}`);
  }

  const existingId = await findExistingUserByEmail(email);
  if (!existingId) {
    throw new Error("Impossible de retrouver le compte client existant pour cet email.");
  }
  return existingId;
}

export type CustomerLookupResult =
  | { existing: false }
  | {
      existing: true;
      vouchers: { id: string; amountFcfa: number; expiresAt: string }[];
      pointsBalance: number;
    };

// Étape "Recherche du client" : ne sert QU'à afficher les avoirs/points
// éventuels d'un client déjà existant, pour que la compagnie puisse les
// appliquer sur cette nouvelle réservation (même règle de disponibilité
// que le parcours voyageur normal — status='active' et expires_at futur).
// Ne renvoie jamais le userId au client : createBookingForCustomer
// re-résout systématiquement le compte lui-même via
// findOrCreateDiscreetCustomer, jamais depuis une valeur transmise par le
// formulaire — un id client n'est jamais une donnée de confiance venant
// du navigateur.
export async function lookupCustomer(email: string): Promise<CustomerLookupResult> {
  const access = await requireCompany();
  if (!access.ok) return { existing: false };

  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes("@")) return { existing: false };

  let userId: string | null;
  try {
    userId = await findExistingUserByEmail(trimmed);
  } catch (err) {
    console.error("Impossible de rechercher le client :", err);
    return { existing: false };
  }

  if (!userId) return { existing: false };

  const { data: vouchers } = await supabaseAdmin
    .from("vouchers")
    .select("id, amount_fcfa, expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString());

  const { data: balanceRow } = await supabaseAdmin
    .from("points_balance")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle<{ balance: number }>();

  return {
    existing: true,
    vouchers: (vouchers ?? []).map((v) => ({
      id: v.id,
      amountFcfa: v.amount_fcfa,
      expiresAt: v.expires_at,
    })),
    pointsBalance: balanceRow?.balance ?? 0,
  };
}

type PartInput = { mode: "mtn_money" | "moov_money" | "card" | "cash"; amountFcfa: number };

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

  // Zippé par position AVANT filtrage des lignes vides : les champs
  // seatNumber-<i> sont nommés par l'index du champ nom correspondant, un
  // filter() sur les noms seul romprait cet alignement dès qu'une ligne du
  // milieu est laissée vide.
  const rawNames = formData.getAll("passengerName") as string[];
  const passengerNames: string[] = [];
  const requestedSeats: (string | null)[] = [];
  rawNames.forEach((raw, i) => {
    const name = raw.trim();
    if (!name) return;
    passengerNames.push(name);
    const seat = String(formData.get(`seatNumber-${i}`) ?? "").trim();
    requestedSeats.push(seat || null);
  });

  const voucherIdRaw = String(formData.get("voucherId") ?? "").trim();
  const usePoints = formData.get("usePoints") === "1";

  // Parts de paiement — même zippage par index que les passagers, une
  // ligne du formulaire laissée vide (amount vide) est simplement ignorée.
  const parts: PartInput[] = [];
  for (let i = 0; i < MAX_PARTS; i++) {
    const rawAmount = String(formData.get(`partAmount-${i}`) ?? "").trim();
    if (!rawAmount) continue;
    const amountFcfa = Number(rawAmount);
    const mode = String(formData.get(`partMode-${i}`) ?? "");
    if (!VALID_METHODS.has(mode) || !Number.isFinite(amountFcfa) || amountFcfa <= 0) {
      return { error: "Répartition du paiement invalide." };
    }
    parts.push({ mode: mode as PartInput["mode"], amountFcfa });
  }

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
  if (parts.length === 0) {
    return { error: "Merci de renseigner au moins un moyen de paiement." };
  }

  // Departure_at + price_fcfa nécessaires pour plafonner l'expiration des
  // jetons et calculer le prix total attendu — lu via le client de
  // session (RLS), scopé à la compagnie appelante comme partout ailleurs
  // dans ce back-office.
  const supabase = await createClient();
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("departure_at, price_fcfa")
    .eq("id", tripId)
    .eq("company_id", access.company.id)
    .maybeSingle();

  if (tripError || !trip) {
    return { error: "Ce trajet n'existe pas ou ne vous appartient pas." };
  }

  // La somme des parts doit égaler EXACTEMENT le prix total du billet
  // (contrainte explicite de ce chantier) — jamais les frais de service,
  // l'avoir ou les points, qui sont une réduction séparée appliquée à la
  // première part seulement (voir plus bas). Vérifié AVANT de créer quoi
  // que ce soit, pour ne jamais laisser une réservation orpheline sur une
  // erreur de saisie.
  const totalPriceFcfa = trip.price_fcfa * passengerNames.length;
  const partsSum = parts.reduce((sum, p) => sum + p.amountFcfa, 0);
  if (partsSum !== totalPriceFcfa) {
    return {
      error: `La somme des moyens de paiement (${partsSum} FCFA) ne correspond pas au prix total (${totalPriceFcfa} FCFA).`,
    };
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
      p_requested_seats: requestedSeats,
    }
  );

  if (bookingError) {
    console.error("Impossible de créer la réservation :", bookingError.message);
    if (bookingError.code === "23514") {
      return { error: bookingError.message };
    }
    return { error: "Impossible de créer cette réservation. Réessayez." };
  }

  // Frais de service calculés UNE SEULE FOIS pour toute la réservation,
  // jamais répartis entre les parts — attachés à la première part
  // enregistrée ci-dessous, quel que soit son mode.
  const { platformFeeFcfa, transactionFeeFcfa, totalFcfa } = calculateServiceFees(totalPriceFcfa);

  // Avoir/points d'un client déjà existant (étape "Recherche du client") —
  // même logique EXACTE que le parcours voyageur normal
  // (packages/shared/src/lib/applyVoucherAndPoints.ts, jamais dupliquée),
  // appliqués une seule fois, également attachés à la première part.
  // Pour un nouveau client, voucherId est vide et usePoints est
  // nécessairement false (aucune UI ne les propose) — l'appel reste sûr,
  // il ne fait rien.
  const { claimedVoucherId, appliedVoucherFcfa, pointsRedeemedFcfa } = await applyVoucherAndPoints({
    userId,
    bookingId,
    baseAmountFcfa: totalPriceFcfa,
    totalFcfa,
    voucherId: voucherIdRaw || null,
    usePoints,
  });

  let bookingConfirmedDuringCreation = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isFirst = i === 0;
    const isCash = part.mode === "cash";

    const insertPayload: Record<string, unknown> = {
      booking_id: bookingId,
      base_amount_fcfa: part.amountFcfa,
      platform_fee_fcfa: isFirst ? platformFeeFcfa : 0,
      transaction_fee_fcfa: isFirst && !isCash ? transactionFeeFcfa : 0,
      provider: isCash ? "manual" : "simulated",
      method: part.mode,
      status: "pending",
    };
    if (isFirst) {
      insertPayload.platform_fee_collected = !isCash;
      insertPayload.voucher_id = claimedVoucherId;
      insertPayload.voucher_amount_fcfa = appliedVoucherFcfa;
      insertPayload.points_redeemed_fcfa = pointsRedeemedFcfa;
    }

    let paymentToken: string | null = null;
    let paymentTokenExpiresAt: string | null = null;
    if (LINK_METHODS.has(part.mode)) {
      // Un jeton PAR PART (pas par réservation) — Mobile Money et Carte
      // suivent désormais toutes deux ce même mécanisme de lien.
      paymentToken = randomBytes(32).toString("hex");
      paymentTokenExpiresAt = new Date(
        Math.min(Date.now() + PAYMENT_TOKEN_MAX_VALIDITY_MS, new Date(trip.departure_at).getTime())
      ).toISOString();
      insertPayload.payment_token = paymentToken;
      insertPayload.payment_token_expires_at = paymentTokenExpiresAt;
    }

    const { data: payment, error: insertError } = await supabaseAdmin
      .from("payments")
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError || !payment) {
      console.error("Réservation créée mais une part de paiement n'a pas pu être enregistrée :", insertError?.message);
      return {
        error: "Réservation créée mais le paiement n'a pas pu être entièrement enregistré. Contactez le support.",
      };
    }

    if (isCash) {
      // Espèces : auto-attesté par la compagnie, reçu immédiatement.
      // record_payment_part_received est le SEUL endroit qui décide si la
      // somme des parts reçues atteint désormais total_price_fcfa — voir
      // le plan pour la justification complète (jamais de crédit de
      // points ni de confirmation avant que ce soit réellement le cas).
      const { data: result, error: rpcError } = await supabaseAdmin
        .rpc("record_payment_part_received", { p_payment_id: payment.id })
        .single<{ booking_confirmed: boolean }>();

      if (rpcError) {
        console.error("Impossible de valider la part espèces :", rpcError.message);
        return { error: "Réservation créée mais le paiement en espèces n'a pas pu être validé. Contactez le support." };
      }
      if (result?.booking_confirmed) {
        bookingConfirmedDuringCreation = true;
      }
    } else {
      // Mobile Money / Carte : jamais auto-attesté, jamais approuvé ici —
      // seul le client, en cliquant son lien, peut faire avancer cette
      // part (voir apps/web/app/paiement-securise/[token]/actions.ts).
      await sendBookingPaymentLinkNotification({ paymentId: payment.id });
    }
  }

  if (bookingConfirmedDuringCreation) {
    await sendBookingConfirmation({ bookingId });
  }

  redirect(`/reservations/${bookingId}`);
}
