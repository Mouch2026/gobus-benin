import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AccessBlockedMessage } from "../_components";
import { Navigation } from "../_navigation";
import { formatDepartureDateTime } from "../_shared";

type PassengerBookingRow = {
  full_name: string;
  phone: string | null;
  email: string | null;
  departure_at: string;
};

type ClientRow = {
  email: string;
  fullName: string;
  phone: string | null;
  bookingCount: number;
  lastTripAt: string;
};

// Même fonction et même appel service_role que /reservations
// (get_company_passenger_bookings n'est granted qu'à service_role, la
// portée par compagnie est garantie par requireCompany() avant cet
// appel) — voir le plan : une fonction SQL dédiée regroupant déjà côté
// base de données referait le même join à 4 tables pour un gain marginal,
// alors que ce regroupement par email est trivial et suffisant en TS pur
// au volume actuel d'une compagnie régionale.
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

// Une ligne par passager (pas par booking) : un booking à plusieurs
// passagers compte donc plusieurs fois dans bookingCount — acceptable
// comme mesure large de "nombre de réservations" liées à ce client, pas
// un nombre strict de bookings distincts.
function groupByEmail(rows: PassengerBookingRow[]): ClientRow[] {
  const clients = new Map<string, ClientRow>();

  for (const row of rows) {
    if (!row.email) continue;

    const existing = clients.get(row.email);
    if (!existing) {
      clients.set(row.email, {
        email: row.email,
        fullName: row.full_name,
        phone: row.phone,
        bookingCount: 1,
        lastTripAt: row.departure_at,
      });
    } else {
      existing.bookingCount += 1;
      if (row.departure_at > existing.lastTripAt) {
        existing.lastTripAt = row.departure_at;
      }
    }
  }

  return Array.from(clients.values()).sort((a, b) => (a.lastTripAt < b.lastTripAt ? 1 : -1));
}

export default async function ClientsPage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const rows = await getPassengerBookings(result.company.id);
  const clients = groupByEmail(rows);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Navigation company={result.company} />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <h2 className="mb-4 text-xl font-semibold text-zinc-950 dark:text-zinc-50">Clients</h2>

        {clients.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Aucun client pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">Nom</th>
                  <th className="px-4 py-3 font-medium">Téléphone</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Réservations</th>
                  <th className="px-4 py-3 font-medium">Dernier trajet</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr
                    key={client.email}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      {client.fullName}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {client.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{client.email}</td>
                    <td className="px-4 py-3 tabular-nums text-zinc-700 dark:text-zinc-300">
                      {client.bookingCount}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatDepartureDateTime(client.lastTripAt)}
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
