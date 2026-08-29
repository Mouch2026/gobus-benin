import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../../_components";
import { SEAT_CLASS_LABELS, STATUS_LABELS, STATUS_STYLES, formatDepartureDateTime } from "../../_shared";
import { EditTripForm } from "./EditTripForm";

type TripDetail = {
  id: string;
  departure_at: string;
  seat_class: string;
  price_fcfa: number;
  total_seats: number;
  available_seats: number;
  status: string;
  routes: { origin_city: string; destination_city: string };
};

async function getOwnedTrip(tripId: string, companyId: string): Promise<TripDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, departure_at, seat_class, price_fcfa, total_seats, available_seats, status, routes!inner(origin_city, destination_city)"
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

export default async function TripDetailPage(props: PageProps<"/trajets/[id]">) {
  const { id } = await props.params;
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const trip = await getOwnedTrip(id, result.company.id);

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
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          {trip.routes.origin_city} → {trip.routes.destination_city}
        </h1>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← Trajets
        </Link>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-8">
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
      </main>
    </div>
  );
}
