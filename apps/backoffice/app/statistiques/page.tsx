import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../_components";
import { Navigation } from "../_navigation";
import { STATUS_LABELS } from "../_shared";

type Stats = {
  tripsByStatus: Record<string, number>;
  bookingsCount: number;
  totalRevenueFcfa: number;
};

async function getStats(companyId: string): Promise<Stats> {
  const supabase = await createClient();

  // 1. Trips by status — a company's trip count stays modest, so a plain
  // select + in-memory tally is simpler and just as correct as a SQL
  // aggregate here, with nothing fragile to get wrong.
  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select("status")
    .eq("company_id", companyId);

  if (tripsError) {
    console.error("Impossible de charger les trajets :", tripsError.message);
  }

  const tripsByStatus: Record<string, number> = {};
  for (const trip of trips ?? []) {
    tripsByStatus[trip.status] = (tripsByStatus[trip.status] ?? 0) + 1;
  }

  // 2. Total bookings — a head-only count, no rows transferred.
  const { count: bookingsCount, error: bookingsError } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  if (bookingsError) {
    console.error("Impossible de compter les réservations :", bookingsError.message);
  }

  // 3. Total revenue — one embed via the real FK (payments.booking_id ->
  // bookings.id), filtered on the embedded bookings.company_id. Not a
  // double join through trips/companies — bookings!inner(company_id) must
  // appear in the select for the embedded filter below to apply. Summed
  // in application code rather than via a PostgREST aggregate function,
  // whose availability depends on the project's PostgREST version.
  const { data: approvedPayments, error: paymentsError } = await supabase
    .from("payments")
    .select("base_amount_fcfa, bookings!inner(company_id)")
    .eq("status", "approved")
    .eq("bookings.company_id", companyId);

  if (paymentsError) {
    console.error("Impossible de charger les paiements :", paymentsError.message);
  }

  const totalRevenueFcfa = (approvedPayments ?? []).reduce(
    (sum, payment) => sum + payment.base_amount_fcfa,
    0
  );

  return { tripsByStatus, bookingsCount: bookingsCount ?? 0, totalRevenueFcfa };
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-display text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </span>
    </div>
  );
}

export default async function StatistiquesPage() {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const stats = await getStats(result.company.id);
  const statusEntries = Object.entries(stats.tripsByStatus);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Navigation company={result.company} />

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-8">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Statistiques</h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Réservations" value={stats.bookingsCount} />
          <StatCard label="Revenu total" value={formatFcfa(stats.totalRevenueFcfa)} />
        </div>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Trajets par statut
          </h2>

          {statusEntries.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Aucun trajet pour le moment.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {statusEntries.map(([status, count]) => (
                <StatCard key={status} label={STATUS_LABELS[status] ?? status} value={count} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
