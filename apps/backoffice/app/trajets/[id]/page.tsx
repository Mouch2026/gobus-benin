import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../../_components";
import { Navigation } from "../../_navigation";
import {
  BOOKING_STATUS_LABELS,
  BOOKING_STATUS_STYLES,
  SEAT_CLASS_LABELS,
  STATUS_LABELS,
  STATUS_STYLES,
  formatDepartureDateTime,
} from "../../_shared";
import { EditTripForm } from "./EditTripForm";

type TripDetail = {
  id: string;
  departure_at: string;
  seat_class: string;
  price_fcfa: number;
  total_seats: number;
  available_seats: number;
  status: string;
  bus_layout_id: string;
  routes: { origin_city: string; destination_city: string };
};

type TripBooking = {
  id: string;
  booking_reference: string;
  seat_count: number;
  status: string;
  phone: string | null;
  passengers: { id: string; full_name: string; seat_number: string | null }[];
};

async function getOwnedTrip(tripId: string, companyId: string): Promise<TripDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, departure_at, seat_class, price_fcfa, total_seats, available_seats, status, bus_layout_id, routes!inner(origin_city, destination_city)"
    )
    .eq("id", tripId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger le trajet :", error.message);
    return null;
  }

  return data as unknown as TripDetail | null;
}

// company_id is denormalized onto bookings specifically so this filter
// doesn't need to join through trips — same rationale as elsewhere in this
// schema (set_booking_company_id).
async function getTripBookings(tripId: string, companyId: string): Promise<TripBooking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_reference, seat_count, status, phone, passengers(id, full_name, seat_number)")
    .eq("trip_id", tripId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Impossible de charger les réservations :", error.message);
    return [];
  }

  return (data ?? []) as unknown as TripBooking[];
}

export default async function TripDetailPage(props: PageProps<"/trajets/[id]">) {
  const { id } = await props.params;
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const [trip, bookings] = await Promise.all([
    getOwnedTrip(id, result.company.id),
    getTripBookings(id, result.company.id),
  ]);

  if (!trip) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 px-4 text-center dark:bg-black">
        <p className="max-w-sm rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Ce trajet n&apos;existe pas ou ne vous appartient pas.
        </p>
        <Link href="/" className="font-medium text-zinc-950 hover:underline dark:text-zinc-50">
          ← Retour aux trajets
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Navigation company={result.company} />

      <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-8">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          {trip.routes.origin_city} → {trip.routes.destination_city}
        </h1>
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {formatDepartureDateTime(trip.departure_at)} ·{" "}
              {SEAT_CLASS_LABELS[trip.seat_class] ?? trip.seat_class}
            </span>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                STATUS_STYLES[trip.status] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {STATUS_LABELS[trip.status] ?? trip.status}
            </span>
          </div>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            Prix actuel : {formatFcfa(trip.price_fcfa)} · {trip.available_seats}/{trip.total_seats}{" "}
            places disponibles
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <EditTripForm trip={trip} />
        </div>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Réservations
          </h2>

          {bookings.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Aucune réservation pour ce trajet.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium text-zinc-950 dark:text-zinc-50">
                      {booking.booking_reference}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        {booking.seat_count} place{booking.seat_count > 1 ? "s" : ""}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          BOOKING_STATUS_STYLES[booking.status] ??
                          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                      </span>
                    </span>
                  </div>

                  {booking.phone ? (
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Contact : {booking.phone}
                    </p>
                  ) : null}

                  {booking.passengers.length > 0 ? (
                    <ul className="mt-3 flex flex-col gap-1 border-t border-zinc-100 pt-3 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                      {booking.passengers.map((passenger) => (
                        <li key={passenger.id} className="flex items-center justify-between gap-4">
                          <span>{passenger.full_name}</span>
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {passenger.seat_number ? `Siège ${passenger.seat_number}` : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
