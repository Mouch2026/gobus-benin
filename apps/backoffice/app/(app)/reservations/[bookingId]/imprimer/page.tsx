import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../../../_components";
import { formatDepartureDateTime } from "../../../_shared";
import { PrintButton } from "./PrintButton";

type BookingForPrint = {
  booking_reference: string;
  total_price_fcfa: number;
  trips: {
    departure_at: string;
    bus_number: string;
    routes: { origin_city: string; destination_city: string };
  };
  passengers: { id: string; full_name: string; seat_number: string | null }[];
};

async function getOwnedBookingForPrint(
  bookingId: string,
  companyId: string
): Promise<BookingForPrint | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "booking_reference, total_price_fcfa, trips(departure_at, bus_number, routes(origin_city, destination_city)), passengers(id, full_name, seat_number)"
    )
    .eq("id", bookingId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger la réservation :", error.message);
    return null;
  }

  return data as unknown as BookingForPrint | null;
}

// Vue imprimable simple (mise en page navigateur, window.print() — pas de
// nouvelle dépendance PDF). Le chrome de nav (header/sidebar) se masque
// via print:hidden sur _app-shell.tsx, partagé par toute l'app — cette
// page reste dans le groupe (app) existant, pas besoin d'un second groupe
// de routes.
export default async function PrintBookingPage(props: PageProps<"/reservations/[bookingId]/imprimer">) {
  const { bookingId } = await props.params;
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const booking = await getOwnedBookingForPrint(bookingId, result.company.id);

  if (!booking) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Cette réservation n&apos;existe pas ou ne vous appartient pas.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-8 print:max-w-none print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900 print:rounded-none print:border-0 print:p-0">
        <div className="mb-6 flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800 print:border-black">
          <span className="text-lg font-semibold text-zinc-950 dark:text-zinc-50 print:text-black">
            {result.company.name}
          </span>
          <span className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 print:text-black">
            Billet
          </span>
        </div>

        <div className="mb-6">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 print:text-black">
            Référence de réservation
          </p>
          <p className="text-xl font-bold text-zinc-950 dark:text-zinc-50 print:text-black">
            {booking.booking_reference}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 print:text-black">Trajet</p>
            <p className="font-medium text-zinc-950 dark:text-zinc-50 print:text-black">
              {booking.trips.routes.origin_city} → {booking.trips.routes.destination_city}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 print:text-black">Départ</p>
            <p className="font-medium text-zinc-950 dark:text-zinc-50 print:text-black">
              {formatDepartureDateTime(booking.trips.departure_at)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 print:text-black">Bus</p>
            <p className="font-medium text-zinc-950 dark:text-zinc-50 print:text-black">
              {booking.trips.bus_number}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 print:text-black">Montant total</p>
            <p className="font-medium text-zinc-950 dark:text-zinc-50 print:text-black">
              {formatFcfa(booking.total_price_fcfa)}
            </p>
          </div>
        </div>

        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400 print:border-black print:text-black">
              <th className="py-2 font-medium">Passager</th>
              <th className="py-2 font-medium">Siège</th>
            </tr>
          </thead>
          <tbody>
            {booking.passengers.map((passenger) => (
              <tr
                key={passenger.id}
                className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800 print:border-black"
              >
                <td className="py-2 text-zinc-700 dark:text-zinc-300 print:text-black">
                  {passenger.full_name}
                </td>
                <td className="py-2 text-zinc-700 dark:text-zinc-300 print:text-black">
                  {passenger.seat_number ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
