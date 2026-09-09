import { deriveBookingDisplayStatus, type BookingDisplayStatus } from "../_shared";

export type BookingOverviewRow = {
  booking_id: string;
  booking_reference: string;
  passenger_names: string;
  phone: string | null;
  origin_city: string;
  destination_city: string;
  departure_at: string;
  bus_number: string;
  booking_status: string;
  voucher_status: string | null;
  latest_payment_status: string | null;
  total_price_fcfa: number;
  created_at: string;
};

export type ReservationFilters = {
  q: string | null;
  status: BookingDisplayStatus | null;
  payment: string | null;
  from: string | null; // "AAAA-MM-JJ", tel que soumis par <input type="date">
  to: string | null;
};

const VALID_DISPLAY_STATUSES: BookingDisplayStatus[] = [
  "confirmed",
  "pending",
  "cancelled",
  "refunded",
];

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Parse depuis les searchParams bruts d'une page ("q", "status",
// "payment", "from", "to") — un seul endroit qui définit la forme des
// filtres, partagé par la page et l'export CSV.
export function parseReservationFilters(
  searchParams: Record<string, string | string[] | undefined>
): ReservationFilters {
  const q = firstValue(searchParams.q)?.trim() || null;
  const statusRaw = firstValue(searchParams.status);
  const status = VALID_DISPLAY_STATUSES.includes(statusRaw as BookingDisplayStatus)
    ? (statusRaw as BookingDisplayStatus)
    : null;
  const payment = firstValue(searchParams.payment)?.trim() || null;
  const from = firstValue(searchParams.from)?.trim() || null;
  const to = firstValue(searchParams.to)?.trim() || null;
  return { q, status, payment, from, to };
}

// Filtre en mémoire sur le résultat de get_company_bookings_overview —
// une seule implémentation, réutilisée telle quelle par la page ET la
// route d'export : jamais deux définitions de "ce qu'un filtre veut
// dire" qui pourraient diverger l'une de l'autre.
export function filterBookings(
  rows: BookingOverviewRow[],
  filters: ReservationFilters
): BookingOverviewRow[] {
  // Bornes ancrées au fuseau du Bénin (+01:00 explicite), jamais l'heure
  // locale du serveur — même principe que getBeninMidnightToday, mais ici
  // ce sont des dates choisies par l'utilisateur, pas "aujourd'hui".
  const fromDate = filters.from ? new Date(`${filters.from}T00:00:00+01:00`) : null;
  const toDate = filters.to ? new Date(`${filters.to}T23:59:59+01:00`) : null;

  return rows.filter((row) => {
    if (filters.status) {
      const display = deriveBookingDisplayStatus(row.booking_status, row.voucher_status);
      if (display !== filters.status) return false;
    }

    if (filters.payment && row.latest_payment_status !== filters.payment) {
      return false;
    }

    const departureAt = new Date(row.departure_at);
    if (fromDate && departureAt < fromDate) return false;
    if (toDate && departureAt > toDate) return false;

    if (filters.q) {
      const q = filters.q.toLowerCase();
      const haystack =
        `${row.booking_reference} ${row.passenger_names} ${row.phone ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}
