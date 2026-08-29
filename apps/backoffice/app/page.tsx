import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "./_components";
import { logout } from "./actions";
import { formatFcfa } from "shared";

type CompanyTrip = {
  id: string;
  departure_at: string;
  seat_class: string;
  price_fcfa: number;
  available_seats: number;
  total_seats: number;
  status: string;
  routes: { origin_city: string; destination_city: string };
};

const SEAT_CLASS_LABELS: Record<string, string> = {
  standard: "Standard",
  vip: "VIP",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Programmé",
  in_progress: "En cours",
  completed: "Terminé",
  cancelled: "Annulé",
};

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_progress: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function formatDepartureDateTime(departureAt: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(departureAt));
}

async function getCompanyTrips(companyId: string): Promise<CompanyTrip[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, departure_at, seat_class, price_fcfa, available_seats, total_seats, status, routes!inner(origin_city, destination_city)"
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

  const { user, company, subscription } = result;
  const trips = await getCompanyTrips(company.id);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {company.name}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Connecté en tant que {String(user.email ?? user.sub)} · Abonnement {subscription.planName}
          </p>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Se déconnecter
          </button>
        </form>
      </header>

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
                  <th className="px-4 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((trip) => (
                  <tr
                    key={trip.id}
                    className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      {trip.routes.origin_city} → {trip.routes.destination_city}
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
