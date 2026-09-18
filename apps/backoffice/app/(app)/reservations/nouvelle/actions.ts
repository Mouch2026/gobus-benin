"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { findExistingUserByEmail } from "@/lib/customers";
import {
  verifySupervisorOnSite,
  createResolvedApprovalRequest,
  createPendingApprovalRequest,
  notifySupervisors,
} from "@/lib/supervisorApproval";
import { finalizeCounterBookingPayment } from "./finalizeCounterBookingPayment";

export type NewBookingState = { error: string | null };

const MAX_PARTS = 4;
const VALID_METHODS = new Set(["mtn_money", "moov_money", "card", "cash"]);
// Chantier 3c : au-delà de ce seuil, un agent (jamais un owner/
// agency_manager — ils SONT le superviseur) a besoin d'une validation.
const DISCOUNT_APPROVAL_THRESHOLD_PERCENT = 10;

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

// Ne lit JAMAIS la gare sélectionnée dans la topbar : c'est un filtre
// d'affichage des trajets, pas un rattachement. L'imputation d'une
// réservation reste l'agence de l'agent, quelle que soit la gare qu'il
// consultait au moment de la créer.
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

  // Remise agent, en pourcentage — jamais un montant saisi directement,
  // pour que le pourcentage réellement accordé reste traçable (chantier
  // 3c, audit log) même si le prix du trajet change plus tard.
  const discountPercentRaw = String(formData.get("discountPercent") ?? "").trim();
  const discountPercent = discountPercentRaw ? Number(discountPercentRaw) : 0;
  if (!Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return { error: "La remise doit être un pourcentage entier entre 0 et 100." };
  }

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

  // Chantier 3c — un owner/agency_manager EST le superviseur : la porte
  // ne s'applique qu'à un agent. Vérifiée indépendamment de ce que le
  // formulaire affichait côté navigateur.
  const requiresApproval = access.role === "agent" && discountPercent > DISCOUNT_APPROVAL_THRESHOLD_PERCENT;
  const approvalMode = String(formData.get("approvalMode") ?? "");
  let onSiteSupervisorUserId: string | null = null;

  if (requiresApproval) {
    if (approvalMode !== "on_site" && approvalMode !== "remote") {
      return { error: "Une remise de plus de 10% nécessite une validation. Merci de choisir un mode." };
    }
    if (approvalMode === "on_site") {
      // Vérifiée AVANT toute écriture : un mot de passe incorrect ne doit
      // laisser aucune réservation orpheline derrière lui.
      const verification = await verifySupervisorOnSite({
        companyId: access.company.id,
        agencyId: access.agency!.id, // un agent a toujours une agence (company_members_agency_matches_role)
        email: String(formData.get("supervisorEmail") ?? ""),
        password: String(formData.get("supervisorPassword") ?? ""),
      });
      if (!verification.ok) {
        return { error: verification.error };
      }
      onSiteSupervisorUserId = verification.supervisorUserId;
    }
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

  // Le siège est déjà retenu au nom de ce client (RPC ci-dessus) — tout
  // ce qui suit décide seulement QUAND (et par qui) le paiement est
  // effectivement inséré. finalizeCounterBookingPayment fait le calcul
  // des frais, l'application avoir/points et l'écriture des paiements —
  // jamais dupliquée, appelée soit ici, soit plus tard par
  // validations/actions.ts::reviewApprovalRequest.
  if (requiresApproval) {
    const discountFcfa = Math.round((totalPriceFcfa * discountPercent) / 100);
    const agencyId = access.agency!.id;
    const discountPayload = {
      discountPercent,
      discountAmountFcfa: discountFcfa,
      paymentParts: parts,
      voucherId: voucherIdRaw || null,
      usePoints,
    };

    if (approvalMode === "on_site") {
      await createResolvedApprovalRequest({
        companyId: access.company.id,
        agencyId,
        requestedBy: access.user.sub,
        actionType: "discount",
        bookingId,
        reviewedBy: onSiteSupervisorUserId!,
        discount: discountPayload,
      });

      const result = await finalizeCounterBookingPayment({
        bookingId,
        userId,
        discountPercent,
        discountGrantedBy: onSiteSupervisorUserId!,
        voucherIdRaw,
        usePoints,
        parts,
      });
      if (result.error) {
        return { error: result.error };
      }
      redirect(`/reservations/${bookingId}`);
    }

    // À distance : rien de plus n'est écrit tant que ce n'est pas validé —
    // le bandeau d'attente sur /reservations/[bookingId] prend le relais.
    await createPendingApprovalRequest({
      companyId: access.company.id,
      agencyId,
      requestedBy: access.user.sub,
      actionType: "discount",
      bookingId,
      discount: discountPayload,
    });

    const { data: bookingRow } = await supabaseAdmin
      .from("bookings")
      .select("booking_reference")
      .eq("id", bookingId)
      .single<{ booking_reference: string }>();

    await notifySupervisors({
      companyId: access.company.id,
      agencyId,
      title: "Validation requise — remise",
      body: `Remise ${discountPercent}% (${discountFcfa} FCFA) sur ${bookingRow?.booking_reference ?? bookingId}.`,
    });

    redirect(`/reservations/${bookingId}`);
  }

  const result = await finalizeCounterBookingPayment({
    bookingId,
    userId,
    discountPercent,
    discountGrantedBy: discountPercent > 0 ? access.user.sub : null,
    voucherIdRaw,
    usePoints,
    parts,
  });
  if (result.error) {
    return { error: result.error };
  }

  redirect(`/reservations/${bookingId}`);
}
