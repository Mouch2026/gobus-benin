import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBeninDateStringFor } from "@/lib/benin-time";

export type PaymentMethod = "mtn_money" | "moov_money" | "card" | "cash";

export type MethodBreakdown = Record<PaymentMethod, { amountFcfa: number; count: number }>;

function emptyBreakdown(): MethodBreakdown {
  return {
    mtn_money: { amountFcfa: 0, count: 0 },
    moov_money: { amountFcfa: 0, count: 0 },
    card: { amountFcfa: 0, count: 0 },
    cash: { amountFcfa: 0, count: 0 },
  };
}

// Même requête exacte que getRevenueInPeriod (_dashboard-queries.ts),
// avec method en plus, réduite en mémoire par méthode — compagnie
// entière, donc aucune des limites rencontrées au chantier précédent
// pour "Ma session de caisse" (scopée à un agent) : un paiement espèces
// au guichet obtient bien sa propre ligne payments avec method='cash'.
export async function getRevenueByMethodInPeriod(companyId: string, from: Date, to: Date): Promise<MethodBreakdown> {
  const { data, error } = await supabaseAdmin
    .from("payments")
    .select("base_amount_fcfa, method, bookings!inner(company_id)")
    .eq("status", "approved")
    .eq("bookings.company_id", companyId)
    .gte("paid_at", from.toISOString())
    .lte("paid_at", to.toISOString());

  const breakdown = emptyBreakdown();
  if (error) {
    console.error("Impossible de charger la répartition des paiements :", error.message);
    return breakdown;
  }

  for (const row of data ?? []) {
    const method = row.method as PaymentMethod | null;
    if (!method || !(method in breakdown)) continue;
    breakdown[method].amountFcfa += row.base_amount_fcfa;
    breakdown[method].count += 1;
  }
  return breakdown;
}

// Voyageurs distincts (bookings.user_id) ayant réservé dans la fenêtre —
// status='confirmed' uniquement, jamais 'completed' (aucun code de ce
// projet ne pose jamais ce statut, vérifié exhaustivement au chantier
// précédent).
export async function getActiveClientsCount(companyId: string, from: Date, to: Date): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("status", "confirmed")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());

  if (error) {
    console.error("Impossible de compter les clients actifs :", error.message);
    return 0;
  }
  return new Set((data ?? []).map((r) => r.user_id)).size;
}

export type TopRoute = { originCity: string; destinationCity: string; count: number };

// Aucune requête équivalente n'existait déjà (vérifié) — regroupement en
// mémoire, même philosophie que le reste du Dashboard à ce volume.
export async function getTopRoutes(companyId: string, from: Date, to: Date, limit = 5): Promise<TopRoute[]> {
  const { data, error } = await supabaseAdmin
    .from("bookings")
    .select("id, trips!inner(routes!inner(origin_city, destination_city))")
    .eq("company_id", companyId)
    .eq("status", "confirmed")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());

  if (error) {
    console.error("Impossible de calculer les itinéraires les plus demandés :", error.message);
    return [];
  }

  const counts = new Map<string, TopRoute>();
  for (const row of (data ?? []) as unknown as { trips: { routes: { origin_city: string; destination_city: string } } }[]) {
    const { origin_city, destination_city } = row.trips.routes;
    const key = `${origin_city}→${destination_city}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { originCity: origin_city, destinationCity: destination_city, count: 1 });
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// Jours civils (Bénin) du mois ayant au moins un trajet NON annulé —
// simple présence, jamais pondérée par le nombre de trajets (lecture
// littérale de la spec : "un point par jour ayant au moins un trajet").
export async function getTripDatesInMonth(companyId: string, monthKey: string): Promise<Set<string>> {
  const [year, month] = monthKey.split("-").map(Number);
  // Offset ISO explicite (+01:00), jamais Date.UTC seul — même patron
  // exact que getBeninMidnightToday() (lib/benin-time.ts).
  const monthStart = new Date(`${monthKey}-01T00:00:00+01:00`);
  const nextMonthKey = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const nextMonthStart = new Date(`${nextMonthKey}-01T00:00:00+01:00`);

  const { data, error } = await supabaseAdmin
    .from("trips")
    .select("departure_at")
    .eq("company_id", companyId)
    .neq("status", "cancelled")
    .gte("departure_at", monthStart.toISOString())
    .lt("departure_at", nextMonthStart.toISOString());

  if (error) {
    console.error("Impossible de charger le calendrier des trajets :", error.message);
    return new Set();
  }

  return new Set((data ?? []).map((t) => getBeninDateStringFor(new Date(t.departure_at))));
}
