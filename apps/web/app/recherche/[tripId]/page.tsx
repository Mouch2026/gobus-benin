import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getOptionalUser } from "@/lib/supabase/dal";
import { formatFcfa } from "shared";
import {
  EmptyState,
  PageShell,
  RouteLine,
  SEAT_CLASS_LABELS,
  formatDepartureDateTime,
} from "../_shared";
import { BookingForm } from "./BookingForm";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(value).getTime());
}

type TripDetail = {
  id: string;
  departure_at: string;
  seat_class: string;
  price_fcfa: number;
  available_seats: number;
  routes: { origin_city: string; destination_city: string };
  companies: { name: string };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getTrip(tripId: string): Promise<TripDetail | null> {
  if (!UUID_RE.test(tripId)) return null;

  const { data, error } = await supabase
    .from("trips")
    .select(
      "id, departure_at, seat_class, price_fcfa, available_seats, routes!inner(origin_city, destination_city), companies!inner(name)"
    )
    .eq("id", tripId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger le trajet :", error.message);
    return null;
  }

  return data as unknown as TripDetail | null;
}

export default async function TripDetailPage(props: PageProps<"/recherche/[tripId]">) {
  const { tripId } = await props.params;
  const searchParams = await props.searchParams;
  const [trip, user] = await Promise.all([getTrip(tripId), getOptionalUser()]);

  const initialSeatCount = Number(firstValue(searchParams.seats));
  const initialPassengerNames = toArray(searchParams.name);
  const initialPhone = firstValue(searchParams.phone) ?? "";

  const returnDateParam = firstValue(searchParams.returnDate);
  const returnDate = returnDateParam && isValidDate(returnDateParam) ? returnDateParam : undefined;
  const adults = firstValue(searchParams.adults) ?? "1";
  const children = firstValue(searchParams.children) ?? "0";

  if (!trip) {
    return (
      <PageShell title="Trajet introuvable">
        <EmptyState>
          Ce trajet n&apos;existe pas ou n&apos;est plus disponible. Merci de relancer une
          recherche depuis la page d&apos;accueil.
        </EmptyState>
      </PageShell>
    );
  }

  return (
    <PageShell title={`${trip.routes.origin_city} → ${trip.routes.destination_city}`}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm font-semibold text-muted">{trip.companies.name}</span>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary-foreground">
              {SEAT_CLASS_LABELS[trip.seat_class] ?? trip.seat_class}
            </span>
          </div>

          <RouteLine
            origin={trip.routes.origin_city}
            destination={trip.routes.destination_city}
            departureLabel={formatDepartureDateTime(trip.departure_at)}
          />

          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-muted">
              {trip.available_seats} place{trip.available_seats > 1 ? "s" : ""} disponible
              {trip.available_seats > 1 ? "s" : ""}
            </span>
            <div className="text-right">
              <span className="block text-xs text-muted">Prix unitaire</span>
              <span className="font-display text-xl font-extrabold text-foreground">
                {formatFcfa(trip.price_fcfa)}
              </span>
            </div>
          </div>
        </div>

        {returnDate ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6">
            <p className="text-sm text-muted">
              Trajet aller sélectionné. Il vous reste à choisir votre trajet retour avant de
              réserver — un aller-retour est créé en une seule fois, jamais l&apos;un sans
              l&apos;autre.
            </p>
            <Link
              href={`/recherche?origin=${encodeURIComponent(trip.routes.destination_city)}&destination=${encodeURIComponent(trip.routes.origin_city)}&date=${returnDate}&adults=${adults}&children=${children}&outboundTripId=${trip.id}`}
              className="rounded-xl bg-primary px-4 py-3 text-center font-display font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Choisir mon trajet retour
            </Link>
          </div>
        ) : (
          <BookingForm
            tripId={trip.id}
            unitPriceFcfa={trip.price_fcfa}
            availableSeats={trip.available_seats}
            isLoggedIn={!!user}
            initialSeatCount={
              Number.isInteger(initialSeatCount) && initialSeatCount > 0 ? initialSeatCount : 1
            }
            initialPassengerNames={initialPassengerNames}
            initialPhone={initialPhone}
          />
        )}
      </div>
    </PageShell>
  );
}
