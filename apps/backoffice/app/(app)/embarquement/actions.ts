"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logAuditEvent } from "shared/src/lib/auditLog";

export type BoardingCandidate = {
  passengerId: string;
  fullName: string;
  seatNumber: string | null;
  bookingId: string;
  bookingReference: string;
  bookingStatus: string;
  tripId: string;
};

type PassengerWithBooking = {
  id: string;
  full_name: string;
  seat_number: string | null;
  bookings: {
    id: string;
    booking_reference: string;
    status: string;
    trip_id: string;
  } | null;
};

// Repli manuel, champ "Numéro de billet ou QR code" — le scan caméra
// alimente exactement le même champ (jsQR ne fait que remplir cette
// chaîne texte à la place du clavier). Une réservation peut avoir
// plusieurs passagers (bookings.seat_count > 1) : on renvoie toujours la
// liste complète des passagers de la réservation, l'agent choisit lequel
// embarque (ou c'est déjà le seul, cas très majoritaire).
export async function resolveByReference(
  rawReference: string
): Promise<{ error: string | null; candidates: BoardingCandidate[] }> {
  const access = await requireCompany();
  if (!access.ok) return { error: "Votre session ne permet plus cette action.", candidates: [] };
  if (requirePermission(access, "boarding.validate")) {
    return { error: "Vous n'avez pas la permission d'effectuer cette action.", candidates: [] };
  }

  const reference = rawReference.trim().toUpperCase();
  if (!reference) return { error: "Numéro de billet requis.", candidates: [] };

  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("id, booking_reference, status, trip_id, passengers(id, full_name, seat_number)")
    .eq("company_id", access.company.id)
    .eq("booking_reference", reference)
    .maybeSingle<{
      id: string;
      booking_reference: string;
      status: string;
      trip_id: string;
      passengers: { id: string; full_name: string; seat_number: string | null }[];
    }>();

  if (error) {
    console.error("Impossible de résoudre le billet :", error.message);
    return { error: "Recherche impossible. Réessayez.", candidates: [] };
  }

  if (!booking) {
    return { error: "Aucun billet trouvé pour ce numéro.", candidates: [] };
  }

  const candidates: BoardingCandidate[] = (booking.passengers ?? []).map((p) => ({
    passengerId: p.id,
    fullName: p.full_name,
    seatNumber: p.seat_number,
    bookingId: booking.id,
    bookingReference: booking.booking_reference,
    bookingStatus: booking.status,
    tripId: booking.trip_id,
  }));

  return { error: null, candidates };
}

// Recherche par nom/téléphone — même patron visuel que
// /gerer-ma-reservation (deux moyens de repli), mais sans sa contrainte
// anti-énumération : côté public, un seul match strict évite de révéler
// l'existence d'une réservation ; ici, contexte agent authentifié et de
// confiance, une recherche large à plusieurs résultats est légitime.
export async function searchByNameOrPhone(
  query: string
): Promise<{ error: string | null; candidates: BoardingCandidate[] }> {
  const access = await requireCompany();
  if (!access.ok) return { error: "Votre session ne permet plus cette action.", candidates: [] };
  if (requirePermission(access, "boarding.validate")) {
    return { error: "Vous n'avez pas la permission d'effectuer cette action.", candidates: [] };
  }

  const q = query.trim();
  if (q.length < 2) return { error: null, candidates: [] };

  const { data, error } = await supabaseAdmin
    .from("passengers")
    .select("id, full_name, seat_number, phone, bookings!inner(id, booking_reference, status, trip_id, company_id)")
    .eq("bookings.company_id", access.company.id)
    .or(`full_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(20);

  if (error) {
    console.error("Impossible de rechercher un passager :", error.message);
    return { error: "Recherche impossible. Réessayez.", candidates: [] };
  }

  const candidates: BoardingCandidate[] = ((data ?? []) as unknown as PassengerWithBooking[])
    .filter((p) => p.bookings !== null)
    .map((p) => ({
      passengerId: p.id,
      fullName: p.full_name,
      seatNumber: p.seat_number,
      bookingId: p.bookings!.id,
      bookingReference: p.bookings!.booking_reference,
      bookingStatus: p.bookings!.status,
      tripId: p.bookings!.trip_id,
    }));

  return { error: null, candidates };
}

export type ConfirmBoardingResult =
  | { status: "validated" }
  | { status: "already_validated"; previousValidatedAt: string; previousValidatedByName: string }
  | { status: "error"; message: string };

// Valide UN passager pour le trajet "en cours" sélectionné par l'agent —
// c'est validate_boarding() (SQL) qui fait toute la vérification
// atomique (compagnie -> trajet -> fenêtre -> statut -> déjà-validé) sous
// verrou, jamais dupliquée ici.
export async function confirmBoarding(
  passengerId: string,
  tripId: string,
  bookingId: string,
  method: "scan" | "manuel"
): Promise<ConfirmBoardingResult> {
  const access = await requireCompany();
  if (!access.ok) return { status: "error", message: "Votre session ne permet plus cette action." };
  if (requirePermission(access, "boarding.validate")) {
    return { status: "error", message: "Vous n'avez pas la permission d'effectuer cette action." };
  }

  const { data, error } = await supabaseAdmin
    .rpc("validate_boarding", {
      p_passenger_id: passengerId,
      p_trip_id: tripId,
      p_company_id: access.company.id,
      p_agency_id: access.agency?.id ?? null,
      p_actor_id: access.user.sub,
      p_method: method,
    })
    .maybeSingle<{
      already_validated: boolean;
      previous_validated_at: string | null;
      previous_validated_by_name: string | null;
    }>();

  if (error) {
    console.error("Impossible de valider l'embarquement :", error.message);
    // 23514 = check_violation : validate_boarding lève ses propres
    // erreurs métier avec ce code et un message déjà rédigé pour
    // l'utilisateur, remonté tel quel plutôt que masqué par un message
    // générique — même convention que cancelBooking.
    if (error.code === "23514") {
      return { status: "error", message: error.message };
    }
    return { status: "error", message: "Impossible de valider ce billet. Réessayez." };
  }

  if (!data) {
    return { status: "error", message: "Impossible de valider ce billet. Réessayez." };
  }

  if (data.already_validated) {
    return {
      status: "already_validated",
      previousValidatedAt: data.previous_validated_at!,
      previousValidatedByName: data.previous_validated_by_name!,
    };
  }

  await logAuditEvent({
    action: "boarding_validated",
    bookingId,
    companyId: access.company.id,
    acteurId: access.user.sub,
    agencyId: access.agency?.id ?? null,
    payload: { passengerId, tripId, method },
  });

  revalidatePath("/embarquement");
  return { status: "validated" };
}
