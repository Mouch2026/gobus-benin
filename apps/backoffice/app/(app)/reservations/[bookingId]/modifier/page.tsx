import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "../../../_components";
import { EditBookingForm } from "./EditBookingForm";

type BookingForEdit = {
  id: string;
  phone: string | null;
  status: string;
  trip_id: string;
  passengers: { id: string; full_name: string; seat_number: string | null }[];
};

async function getOwnedBookingForEdit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  companyId: string
): Promise<BookingForEdit | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("id, phone, status, trip_id, passengers(id, full_name, seat_number)")
    .eq("id", bookingId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger la réservation :", error.message);
    return null;
  }

  return data as unknown as BookingForEdit | null;
}

// Sièges du plan de bus du trajet, et ceux déjà occupés par d'AUTRES
// réservations non annulées de ce même trajet — sert uniquement à
// construire une liste déroulante utile côté UI ; la vraie garantie
// anti-collision est dans update_booking_details (verrou + revérification
// côté serveur), pas ici.
async function getSeatAvailability(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  bookingId: string
): Promise<{ allSeats: string[]; takenByOthers: string[] }> {
  const { data: trip } = await supabase
    .from("trips")
    .select("bus_layouts(seat_labels)")
    .eq("id", tripId)
    .maybeSingle<{ bus_layouts: { seat_labels: string[] } | null }>();

  const { data: passengers } = await supabase
    .from("passengers")
    .select("seat_number, booking_id, bookings!inner(status)")
    .eq("trip_id", tripId)
    .not("seat_number", "is", null);

  const takenByOthers = (passengers ?? [])
    .filter(
      (p) =>
        p.booking_id !== bookingId &&
        (p.bookings as unknown as { status: string }).status !== "cancelled"
    )
    .map((p) => p.seat_number as string);

  return { allSeats: trip?.bus_layouts?.seat_labels ?? [], takenByOthers };
}

export default async function ModifyBookingPage(props: PageProps<"/reservations/[bookingId]/modifier">) {
  const { bookingId } = await props.params;
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const supabase = await createClient();
  const booking = await getOwnedBookingForEdit(supabase, bookingId, result.company.id);

  if (!booking) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Cette réservation n&apos;existe pas ou ne vous appartient pas.
        </p>
      </div>
    );
  }

  if (booking.status === "cancelled" || booking.status === "completed") {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Cette réservation est annulée ou terminée, elle ne peut plus être modifiée.
        </p>
        <Link
          href={`/reservations/${booking.id}`}
          className="mt-4 inline-block font-medium text-zinc-950 hover:underline dark:text-zinc-50"
        >
          ← Retour à la réservation
        </Link>
      </div>
    );
  }

  const { allSeats, takenByOthers } = await getSeatAvailability(supabase, booking.trip_id, booking.id);

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
        Modifier la réservation
      </h1>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <EditBookingForm booking={booking} allSeats={allSeats} takenByOthers={takenByOthers} />
      </div>
    </div>
  );
}
