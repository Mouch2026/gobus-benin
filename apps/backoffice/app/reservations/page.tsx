import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AccessBlockedMessage } from "../_components";
import { Navigation } from "../_navigation";
import { formatDepartureDateTime, BOOKING_STATUS_LABELS, BOOKING_STATUS_STYLES } from "../_shared";

type PassengerBookingRow = {
  passenger_id: string;
  full_name: string;
  seat_number: string | null;
  phone: string | null;
  email: string | null;
  booking_reference: string;
  booking_status: string;
  origin_city: string;
  destination_city: string;
  departure_at: string;
  bus_number: string;
};

// service_role, pas le client de session — get_company_passenger_bookings
// n'est granted qu'à service_role (voir la migration) : elle joint jusqu'à
// auth.users pour l'email en une seule requête groupée, plutôt qu'une
// boucle admin.getUserById() par ligne. La portée par compagnie est déjà
// garantie ici par requireCompany() avant cet appel — la fonction SQL
// elle-même ne revérifie pas la propriété (service_role n'a pas de
// auth.uid()).
async function getPassengerBookings(companyId: string): Promise<PassengerBookingRow[]> {
  const { data, error } = await supabaseAdmin.rpc("get_company_passenger_bookings", {
    p_company_id: companyId,
  });

  if (error) {
    console.error("Impossible de charger les réservations :", error.message);
    return [];
  }

  return data ?? [];
}

export default async function ReservationsPage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const rows = await getPassengerBookings(result.company.id);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Navigation company={result.company} />

      <main className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-4 text-xl font-semibold text-zinc-950 dark:text-zinc-50">Réservations</h2>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Aucune réservation pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[860px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">Trajet</th>
                  <th className="px-4 py-3 font-medium">Départ</th>
                  <th className="px-4 py-3 font-medium">Bus</th>
                  <th className="px-4 py-3 font-medium">Nom</th>
                  <th className="px-4 py-3 font-medium">Téléphone</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Siège</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.passenger_id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      {row.origin_city} → {row.destination_city}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatDepartureDateTime(row.departure_at)}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{row.bus_number}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{row.full_name}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{row.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{row.email ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {row.seat_number ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          BOOKING_STATUS_STYLES[row.booking_status] ??
                          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {BOOKING_STATUS_LABELS[row.booking_status] ?? row.booking_status}
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
