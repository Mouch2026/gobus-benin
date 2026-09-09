import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBeninDateString, getBeninMidnightToday } from "@/lib/benin-time";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "./_components";
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_STYLES, formatDepartureDateTime } from "./_shared";
import { BookingsChart } from "./_dashboard-chart";
import { RefreshButton } from "./_refresh-button";

type Period = "today" | "7d" | "30d";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Aujourd'hui",
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePeriod(raw: string | undefined): Period {
  return raw === "7d" || raw === "30d" ? raw : "today";
}

// "Aujourd'hui" = minuit au Bénin (Africa/Porto-Novo, UTC+1 fixe) →
// maintenant — jamais minuit UTC (getBeninMidnightToday, voir
// lib/benin-time.ts). "7/30 derniers jours" = fenêtre glissante de N×24h
// → maintenant, sans dépendance de fuseau (une durée, pas une date
// calendaire).
function getPeriodRange(period: Period): { from: Date; to: Date } {
  const to = new Date();
  let from: Date;
  if (period === "today") {
    from = getBeninMidnightToday();
  } else if (period === "7d") {
    from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else {
    from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return { from, to };
}

type RecentBooking = {
  id: string;
  booking_reference: string;
  status: string;
  total_price_fcfa: number;
  created_at: string;
};

type ConfirmedBookingRow = {
  id: string;
  created_at: string;
};

// Requêtes mono/deux-tables filtrées explicitement par company_id — pas
// besoin de nouvelle fonction SQL pour les cartes de stats, même
// raisonnement que le reste du Dashboard.

// Réservations confirmées de la période — sert à la fois de compte pour
// la carte "Réservations" ET de source pour le graphique par jour : une
// seule requête, deux usages, la carte et le total du graphique restent
// nécessairement cohérents entre eux.
async function getConfirmedBookingsInPeriod(
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

async function getCancelledBookingsCount(companyId: string, from: Date, to: Date): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "cancelled")
    .gte("updated_at", from.toISOString())
    .lte("updated_at", to.toISOString());

  if (error) {
    console.error("Impossible de compter les annulations :", error.message);
    return 0;
  }

  return count ?? 0;
}

// Revenu de LA COMPAGNIE (elle garde 100% du prix du billet), pas celui
// de la plateforme — somme de base_amount_fcfa, jamais amount_charged_fcfa
// ni les colonnes de frais. Même patron d'embed que rapports/page.tsx
// (bookings!inner(company_id) pour scoper par compagnie sans remonter par
// trips). paid_at est systématiquement posé au moment où status passe à
// 'approved' (vérifié dans tous les chemins de code existants).
async function getRevenueInPeriod(companyId: string, from: Date, to: Date): Promise<number> {
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
async function getOccupancyRateInPeriod(companyId: string, from: Date, to: Date): Promise<number | null> {
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

// Même fonction que /remboursements — un simple count sur la longueur du
// tableau retourné, pas de fonction SQL séparée pour ça. Non filtrée par
// période : état présent, pas historique.
async function getRefundPendingCount(companyId: string): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc("get_company_refund_pending_vouchers", {
    p_company_id: companyId,
  });

  if (error) {
    console.error("Impossible de compter les avoirs en attente :", error.message);
    return 0;
  }

  return data?.length ?? 0;
}

async function getRecentBookings(companyId: string): Promise<RecentBooking[]> {
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
function groupBookingsByDay(rows: ConfirmedBookingRow[]): { day: string; count: number }[] {
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

function StatCard({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  const content = (
    <>
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-display text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </span>
    </>
  );

  const className =
    "flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700";

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export default async function DashboardPage(props: PageProps<"/">) {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const { company } = result;

  const searchParams = await props.searchParams;
  const period = parsePeriod(firstValue(searchParams.period));
  const { from, to } = getPeriodRange(period);

  const [confirmedBookings, cancelledCount, revenueFcfa, occupancyRate, refundPendingCount, recentBookings] =
    await Promise.all([
      getConfirmedBookingsInPeriod(company.id, from, to),
      getCancelledBookingsCount(company.id, from, to),
      getRevenueInPeriod(company.id, from, to),
      getOccupancyRateInPeriod(company.id, from, to),
      getRefundPendingCount(company.id),
      getRecentBookings(company.id),
    ]);

  const chartData = groupBookingsByDay(confirmedBookings);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Dashboard</h1>

        <div className="flex gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((option) => (
            <Link
              key={option}
              href={`/?period=${option}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === option
                  ? "bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              }`}
            >
              {PERIOD_LABELS[option]}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Réservations" value={confirmedBookings.length} />
        <StatCard label="CA (période)" value={formatFcfa(revenueFcfa)} />
        <StatCard label="Annulations" value={cancelledCount} />
        <StatCard
          label="Taux de remplissage"
          value={occupancyRate === null ? "—" : `${Math.round(occupancyRate * 100)} %`}
        />
        <StatCard label="En attente" value={refundPendingCount} href="/remboursements" />
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Réservations par jour — {PERIOD_LABELS[period]}
        </h2>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          {chartData.length === 0 ? (
            <p className="text-zinc-500 dark:text-zinc-400">
              Aucune réservation confirmée sur cette période.
            </p>
          ) : (
            <BookingsChart data={chartData} />
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">Actions rapides</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/trajets/nouveau"
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            + Nouvelle réservation
          </Link>
          <a
            href={`/reservations/export?from=${getBeninDateString()}&to=${getBeninDateString()}`}
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            ⭳ Export du jour
          </a>
          <RefreshButton />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          5 réservations les plus récentes
        </h2>

        {recentBookings.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Aucune réservation pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[600px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">Réservation</th>
                  <th className="px-4 py-3 font-medium">Montant</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Créée le</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {booking.booking_reference}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatFcfa(booking.total_price_fcfa)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          BOOKING_STATUS_STYLES[booking.status] ??
                          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatDepartureDateTime(booking.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
