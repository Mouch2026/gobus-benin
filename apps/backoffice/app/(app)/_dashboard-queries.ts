import { supabaseAdmin } from "@/lib/supabase-admin";

// Extrait de page.tsx (Dashboard) pour être réutilisé par /pilotage —
// aucun changement de comportement. Requêtes mono/deux-tables filtrées
// explicitement par company_id, pas besoin de fonction SQL pour ce
// volume, même raisonnement que le reste du Dashboard.

export type RecentBooking = {
  id: string;
  booking_reference: string;
  status: string;
  total_price_fcfa: number;
  created_at: string;
};

export type ConfirmedBookingRow = {
  id: string;
  created_at: string;
};

// Réservations confirmées de la période — sert à la fois de compte pour
// la carte "Réservations" ET de source pour le graphique par jour : une
// seule requête, deux usages, la carte et le total du graphique restent
// nécessairement cohérents entre eux.
export async function getConfirmedBookingsInPeriod(
  companyId: string,
  from: Date,
  to: Date
): Promise<ConfirmedBookingRow[]> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("id, created_at")
    .eq("company_id", companyId)
    .eq("status", "confirmed")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());

  if (error) {
    console.error("Impossible de charger les réservations confirmées :", error.message);
    return [];
  }

  return data ?? [];
}

// Revenu de LA COMPAGNIE (elle garde 100% du prix du billet), pas celui
// de la plateforme — somme de base_amount_fcfa, jamais amount_charged_fcfa
// ni les colonnes de frais. Même patron d'embed que rapports/page.tsx
// (bookings!inner(company_id) pour scoper par compagnie sans remonter par
// trips). paid_at est systématiquement posé au moment où status passe à
// 'approved' (vérifié dans tous les chemins de code existants).
export async function getRevenueInPeriod(companyId: string, from: Date, to: Date): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("base_amount_fcfa, bookings!inner(company_id)")
    .eq("status", "approved")
    .eq("bookings.company_id", companyId)
    .gte("paid_at", from.toISOString())
    .lte("paid_at", to.toISOString());

  if (error) {
    console.error("Impossible de charger le CA de la période :", error.message);
    return 0;
  }

  return (data ?? []).reduce((sum, payment) => sum + payment.base_amount_fcfa, 0);
}

// Moyenne du taux de remplissage des trajets dont le DÉPART tombe dans la
// période (pas la date de réservation) — calculée en mémoire, même
// philosophie que rapports/page.tsx à ce volume.
export async function getOccupancyRateInPeriod(companyId: string, from: Date, to: Date): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("trips")
    .select("total_seats, available_seats")
    .eq("company_id", companyId)
    .gte("departure_at", from.toISOString())
    .lte("departure_at", to.toISOString());

  if (error) {
    console.error("Impossible de calculer le taux de remplissage :", error.message);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  const rates = data.map((trip) => (trip.total_seats - trip.available_seats) / trip.total_seats);
  return rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
}

export async function getRecentBookings(companyId: string): Promise<RecentBooking[]> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("id, booking_reference, status, total_price_fcfa, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Impossible de charger les réservations récentes :", error.message);
    return [];
  }

  return data ?? [];
}

// Regroupe les réservations confirmées par jour civil (UTC, cohérent avec
// les bornes de période ci-dessus) pour alimenter le graphique en barres.
export function groupBookingsByDay(rows: ConfirmedBookingRow[]): { day: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const day = row.created_at.slice(0, 10); // "AAAA-MM-JJ"
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, count]) => ({
      day: new Intl.DateTimeFormat("fr-BJ", { day: "2-digit", month: "2-digit" }).format(
        new Date(`${day}T00:00:00Z`)
      ),
      count,
    }));
}
