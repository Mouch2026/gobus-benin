"use server";

import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logAuditEvent } from "shared/src/lib/auditLog";

// Journalisé au CLIC du bouton, pas au chargement de la page — voir le
// plan : un Server Component sans formulaire risquerait de compter des
// PREFETCHS de <Link> (Next.js précharge au survol) comme des demandes
// d'impression, alors que personne n'a rien demandé. Le clic est un
// signal d'intention réel. Fire-and-forget côté appelant (jamais attendu
// avant window.print()) — le journal est secondaire par rapport à
// l'impression elle-même.
export async function logPrintRequest(bookingId: string): Promise<void> {
  const access = await requireCompany();
  if (!access.ok) return;

  // Revérifie l'appartenance à la compagnie — défense en profondeur,
  // jamais fait confiance au seul fait que l'agent soit arrivé sur cette
  // page (même patron que updateBookingDetails/cancelBooking).
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .eq("company_id", access.company.id)
    .maybeSingle();
  if (!booking) return;

  await logAuditEvent({
    action: "ticket_print_requested",
    bookingId,
    companyId: access.company.id,
    acteurId: access.user.sub,
    agencyId: access.agency?.id ?? null,
  });
}
