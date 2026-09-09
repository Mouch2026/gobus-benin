import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../_components";
import {
  BOOKING_DISPLAY_STATUS_LABELS,
  BOOKING_DISPLAY_STATUS_STYLES,
  PAYMENT_STATUS_LABELS,
  FIELD_CLASSES,
  LABEL_CLASSES,
  deriveBookingDisplayStatus,
  formatDepartureDateTime,
  type BookingDisplayStatus,
} from "../_shared";
import { parseReservationFilters, filterBookings, type BookingOverviewRow } from "./filterBookings";
import { CancelBookingButton } from "./CancelBookingButton";

// service_role, même convention que toutes les vues company-scoped de ce
// back-office : get_company_bookings_overview n'est granted qu'à
// service_role, la portée par compagnie est déjà garantie par
// requireCompany() avant cet appel.
async function getBookingsOverview(companyId: string): Promise<BookingOverviewRow[]> {
  const { data, error } = await supabaseAdmin.rpc("get_company_bookings_overview", {
    p_company_id: companyId,
  });

  if (error) {
    console.error("Impossible de charger les réservations :", error.message);
    return [];
  }

  return data ?? [];
}

const STATUS_OPTIONS: BookingDisplayStatus[] = ["confirmed", "pending", "cancelled", "refunded"];
const PAYMENT_OPTIONS = Object.keys(PAYMENT_STATUS_LABELS);

export default async function ReservationsPage(props: PageProps<"/reservations">) {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const searchParams = await props.searchParams;
  const filters = parseReservationFilters(searchParams);

  const allBookings = await getBookingsOverview(result.company.id);
  const bookings = filterBookings(allBookings, filters);

  // L'export réutilise exactement ces mêmes paramètres — ce que
  // l'utilisateur voit à l'écran est ce qu'il obtient dans le CSV.
  const exportParams = new URLSearchParams();
  if (filters.q) exportParams.set("q", filters.q);
  if (filters.status) exportParams.set("status", filters.status);
  if (filters.payment) exportParams.set("payment", filters.payment);
  if (filters.from) exportParams.set("from", filters.from);
  if (filters.to) exportParams.set("to", filters.to);
  const exportHref = `/reservations/export${exportParams.size > 0 ? `?${exportParams}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">Réservations</h2>
        <a
          href={exportHref}
          className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ⭳ Exporter
        </a>
      </div>

      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <label htmlFor="q" className={LABEL_CLASSES}>
            Recherche
          </label>
          <input
            id="q"
            name="q"
            type="text"
            placeholder="Référence, nom, téléphone…"
            defaultValue={filters.q ?? ""}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className={LABEL_CLASSES}>
            Statut
          </label>
          <select id="status" name="status" defaultValue={filters.status ?? ""} className={FIELD_CLASSES}>
            <option value="">Tous</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {BOOKING_DISPLAY_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="payment" className={LABEL_CLASSES}>
            Paiement
          </label>
          <select id="payment" name="payment" defaultValue={filters.payment ?? ""} className={FIELD_CLASSES}>
            <option value="">Tous</option>
            {PAYMENT_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {PAYMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="from" className={LABEL_CLASSES}>
            Voyage du
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={filters.from ?? ""}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="to" className={LABEL_CLASSES}>
            au
          </label>
          <input id="to" name="to" type="date" defaultValue={filters.to ?? ""} className={FIELD_CLASSES} />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Filtrer
          </button>
          <Link
            href="/reservations"
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Réinitialiser
          </Link>
        </div>
      </form>

      {bookings.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {allBookings.length === 0
            ? "Aucune réservation pour le moment."
            : "Aucune réservation ne correspond à ces filtres."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full min-w-[960px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-3 font-medium">Réf</th>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Voyage</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Paiement</th>
                <th className="px-4 py-3 font-medium">Statut</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => {
                const displayStatus = deriveBookingDisplayStatus(
                  booking.booking_status,
                  booking.voucher_status
                );
                const canCancel =
                  booking.booking_status === "confirmed" &&
                  new Date(booking.departure_at).getTime() > Date.now();

                return (
                  <tr
                    key={booking.booking_id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {booking.booking_reference}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {booking.passenger_names || "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      {booking.origin_city} → {booking.destination_city}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatDepartureDateTime(booking.departure_at)}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {booking.latest_payment_status
                        ? PAYMENT_STATUS_LABELS[booking.latest_payment_status] ??
                          booking.latest_payment_status
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${BOOKING_DISPLAY_STATUS_STYLES[displayStatus]}`}
                      >
                        {BOOKING_DISPLAY_STATUS_LABELS[displayStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <Link
                          href={`/reservations/${booking.booking_id}`}
                          className="text-xs font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                        >
                          Voir
                        </Link>
                        <Link
                          href={`/reservations/${booking.booking_id}/modifier`}
                          className="text-xs font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                        >
                          Modifier
                        </Link>
                        <Link
                          href={`/reservations/${booking.booking_id}/imprimer`}
                          className="text-xs font-medium text-zinc-700 hover:underline dark:text-zinc-300"
                        >
                          Imprimer
                        </Link>
                        {canCancel ? <CancelBookingButton bookingId={booking.booking_id} /> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
