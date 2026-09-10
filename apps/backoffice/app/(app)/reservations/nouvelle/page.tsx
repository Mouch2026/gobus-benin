import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { AccessBlockedMessage } from "../../_components";
import { NewBookingForm, type BookableTrip } from "./NewBookingForm";

// Sièges du plan de bus d'un trajet, et ceux déjà occupés (toutes
// réservations non annulées confondues) — même patron exact que
// getSeatAvailability dans /reservations/[bookingId]/modifier/page.tsx,
// sans le paramètre bookingId à exclure puisqu'aucune réservation n'existe
// encore ici. Une requête par trajet (pas un join agrégé) : le nombre de
// trajets réservables affichés reste faible, et ceci reproduit fidèlement
// un patron déjà en production plutôt que d'introduire une requête
// nouvelle et non vérifiée.
async function getSeatAvailability(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string
): Promise<{ seatLabels: string[]; occupiedSeats: string[] }> {
  const { data: trip } = await supabase
    .from("trips")
    .select("bus_layouts(seat_labels)")
    .eq("id", tripId)
    .maybeSingle<{ bus_layouts: { seat_labels: string[] } | null }>();

  const { data: passengers } = await supabase
    .from("passengers")
    .select("seat_number, bookings!inner(status)")
    .eq("trip_id", tripId)
    .not("seat_number", "is", null);

  const occupiedSeats = (passengers ?? [])
    .filter((p) => (p.bookings as unknown as { status: string }).status !== "cancelled")
    .map((p) => p.seat_number as string);

  return { seatLabels: trip?.bus_layouts?.seat_labels ?? [], occupiedSeats };
}

// Même forme de requête que /voyages (routes!inner, mêmes champs) — pas
// une nouvelle recherche, juste des filtres en plus adaptés à "encore
// réservable" : départ futur (même convention que getUpcomingTripsCount
// du Dashboard), pas annulé, au moins une place libre. create_booking
// revérifie de toute façon le départ et le nombre de places au moment de
// la soumission — ces filtres ne sont qu'une aide au choix, pas la
// garantie réelle.
async function getBookableTrips(companyId: string): Promise<BookableTrip[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, departure_at, price_fcfa, available_seats, total_seats, routes!inner(origin_city, destination_city)"
    )
    .eq("company_id", companyId)
    .gt("departure_at", new Date().toISOString())
    .neq("status", "cancelled")
    .gt("available_seats", 0)
    .order("departure_at", { ascending: true });

  if (error) {
    console.error("Impossible de charger les trajets réservables :", error.message);
    return [];
  }

  const trips = (data ?? []) as unknown as Omit<BookableTrip, "seatLabels" | "occupiedSeats">[];

  return Promise.all(
    trips.map(async (trip) => {
      const { seatLabels, occupiedSeats } = await getSeatAvailability(supabase, trip.id);
      return { ...trip, seatLabels, occupiedSeats };
    })
  );
}

export default async function NewBookingPage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const trips = await getBookableTrips(result.company.id);

  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <h1 className="mb-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
        Nouvelle réservation
      </h1>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Pour un client qui ne peut pas réserver lui-même en ligne. Un lien de paiement sécurisé lui
        sera envoyé par e-mail — il n&apos;a besoin d&apos;aucun compte ni mot de passe.
      </p>

      {trips.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Aucun trajet encore réservable pour le moment (départ futur, non annulé, places
          disponibles).
        </p>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <NewBookingForm trips={trips} />
        </div>
      )}
    </div>
  );
}
