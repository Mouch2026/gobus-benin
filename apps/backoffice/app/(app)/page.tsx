import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "./_components";
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_STYLES, formatDepartureDateTime } from "./_shared";

type RecentBooking = {
  id: string;
  booking_reference: string;
  status: string;
  total_price_fcfa: number;
  created_at: string;
};

// Requêtes mono-table filtrées explicitement par company_id — pas besoin
// de nouvelle fonction SQL ici : le filtre est la seule chose qui compte
// pour la portée par compagnie (même raisonnement que les fonctions
// SQL service_role de ce chantier), et il n'y a qu'une seule table
// concernée à chaque fois, sans jointure.
async function getUpcomingTripsCount(companyId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("trips")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .gt("departure_at", new Date().toISOString())
    .neq("status", "cancelled");

  if (error) {
    console.error("Impossible de compter les trajets à venir :", error.message);
    return 0;
  }

  return count ?? 0;
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

// Même fonction que /remboursements — un simple count sur la longueur du
// tableau retourné, pas de fonction SQL séparée pour ça.
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

function DashboardCard({
  label,
  value,
  href,
}: {
  label: string;
  value: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
    >
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-display text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </span>
    </Link>
  );
}

export default async function DashboardPage() {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const { company } = result;

  const [upcomingTripsCount, recentBookings, refundPendingCount] = await Promise.all([
    getUpcomingTripsCount(company.id),
    getRecentBookings(company.id),
    getRefundPendingCount(company.id),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
      <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DashboardCard label="Trajets à venir" value={upcomingTripsCount} href="/voyages" />
        <DashboardCard
          label="Avoirs en attente de remboursement"
          value={refundPendingCount}
          href="/remboursements"
        />
        <DashboardCard
          label="Réservations récentes"
          value={recentBookings.length}
          href="/reservations"
        />
      </div>

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
