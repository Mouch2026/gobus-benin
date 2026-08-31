import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "./_components";
import { Navigation } from "./_navigation";
import { SEAT_CLASS_LABELS, STATUS_LABELS, STATUS_STYLES, formatDepartureDateTime } from "./_shared";
import { formatFcfa } from "shared";

type CompanyTrip = {
  id: string;
  departure_at: string;
  seat_class: string;
  price_fcfa: number;
  available_seats: number;
  total_seats: number;
  status: string;
  bus_number: string;
  routes: { origin_city: string; destination_city: string };
};

async function getCompanyTrips(companyId: string): Promise<CompanyTrip[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, departure_at, seat_class, price_fcfa, available_seats, total_seats, status, bus_number, routes!inner(origin_city, destination_city)"
    )
    .eq("company_id", companyId)
    .order("departure_at", { ascending: true });

  if (error) {
    console.error("Impossible de charger les trajets :", error.message);
    return [];
  }

  return (data ?? []) as unknown as CompanyTrip[];
}

export default async function BackofficeHome() {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const { company } = result;
  const trips = await getCompanyTrips(company.id);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Navigation company={company} />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="mb-4 text-xl font-semibold text-zinc-950 dark:text-zinc-50">Trajets</h2>

        {trips.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Aucun trajet programmé pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">Trajet</th>
                  <th className="px-4 py-3 font-medium">Départ</th>
                  <th className="px-4 py-3 font-medium">Classe</th>
                  <th className="px-4 py-3 font-medium">Prix</th>
                  <th className="px-4 py-3 font-medium">Places</th>
                  <th className="px-4 py-3 font-medium">Bus</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((trip) => (
                  <tr
                    key={trip.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td className="p-0">
                      <Link
                        href={`/trajets/${trip.id}`}
                        className="block px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50"
                      >
                        {trip.routes.origin_city} → {trip.routes.destination_city}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatDepartureDateTime(trip.departure_at)}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {SEAT_CLASS_LABELS[trip.seat_class] ?? trip.seat_class}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatFcfa(trip.price_fcfa)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {trip.available_seats} / {trip.total_seats}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{trip.bus_number}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          STATUS_STYLES[trip.status] ??
                          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {STATUS_LABELS[trip.status] ?? trip.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
