import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../../_components";
import {
  BOOKING_DISPLAY_STATUS_LABELS,
  BOOKING_DISPLAY_STATUS_STYLES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
  deriveBookingDisplayStatus,
  formatDepartureDateTime,
} from "../../_shared";

type BookingDetail = {
  id: string;
  booking_reference: string;
  phone: string | null;
  status: string;
  total_price_fcfa: number;
  created_at: string;
  trips: {
    departure_at: string;
    bus_number: string;
    routes: { origin_city: string; destination_city: string };
  };
  passengers: { id: string; full_name: string; seat_number: string | null }[];
};

type PaymentRow = {
  id: string;
  provider: string;
  method: string | null;
  status: string;
  base_amount_fcfa: number;
  amount_charged_fcfa: number;
  voucher_amount_fcfa: number;
  points_redeemed_fcfa: number;
  paid_at: string | null;
  created_at: string;
  payment_token: string | null;
  payment_token_expires_at: string | null;
};

// Même patron que getOwnedTrip (trajets/[id]/page.tsx) : requête via le
// client de session, scopée explicitement par company_id — pas de
// nouvelle fonction SQL nécessaire pour une lecture aussi directe.
async function getOwnedBooking(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string,
  companyId: string
): Promise<{ booking: BookingDetail; voucherStatus: string | null } | null> {
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_reference, phone, status, total_price_fcfa, created_at, trips(departure_at, bus_number, routes(origin_city, destination_city)), passengers(id, full_name, seat_number)"
    )
    .eq("id", bookingId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger la réservation :", error.message);
    return null;
  }
  if (!booking) return null;

  const { data: voucher } = await supabase
    .from("vouchers")
    .select("status")
    .eq("origin_booking_id", bookingId)
    .maybeSingle<{ status: string }>();

  return { booking: booking as unknown as BookingDetail, voucherStatus: voucher?.status ?? null };
}

async function getPaymentHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookingId: string
): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      "id, provider, method, status, base_amount_fcfa, amount_charged_fcfa, voucher_amount_fcfa, points_redeemed_fcfa, paid_at, created_at, payment_token, payment_token_expires_at"
    )
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Impossible de charger l'historique des paiements :", error.message);
    return [];
  }

  return data ?? [];
}

export default async function BookingDetailPage(props: PageProps<"/reservations/[bookingId]">) {
  const { bookingId } = await props.params;
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const supabase = await createClient();
  const owned = await getOwnedBooking(supabase, bookingId, result.company.id);

  if (!owned) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Cette réservation n&apos;existe pas ou ne vous appartient pas.
        </p>
        <Link href="/reservations" className="mt-4 inline-block font-medium text-zinc-950 hover:underline dark:text-zinc-50">
          ← Retour aux réservations
        </Link>
      </div>
    );
  }

  const { booking, voucherStatus } = owned;
  const payments = await getPaymentHistory(supabase, bookingId);
  const displayStatus = deriveBookingDisplayStatus(booking.status, voucherStatus);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          Réservation {booking.booking_reference}
        </h1>
        <div className="flex gap-3">
          <Link
            href={`/reservations/${booking.id}/modifier`}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Modifier
          </Link>
          <Link
            href={`/reservations/${booking.id}/imprimer`}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Imprimer
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <span className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
            {booking.trips.routes.origin_city} → {booking.trips.routes.destination_city}
          </span>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${BOOKING_DISPLAY_STATUS_STYLES[displayStatus]}`}
          >
            {BOOKING_DISPLAY_STATUS_LABELS[displayStatus]}
          </span>
        </div>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          {formatDepartureDateTime(booking.trips.departure_at)} · Bus {booking.trips.bus_number}
        </div>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          Téléphone de contact : {booking.phone ?? "—"}
        </div>
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          Total : {formatFcfa(booking.total_price_fcfa)}
        </div>
      </div>

      {/* Un jeton PAR PART de paiement (Mobile Money/Carte, chantier
          "paiements scindés") — une réservation peut avoir plusieurs liens
          encore en attente en même temps, chacun affiché séparément. */}
      {payments
        .filter((payment) => payment.payment_token && payment.status === "pending")
        .map((payment) => (
          <div
            key={payment.id}
            className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950"
          >
            <p className="font-medium text-amber-900 dark:text-amber-200">
              Part {payment.method === "card" ? "Carte bancaire" : "Mobile Money"} —{" "}
              {formatFcfa(payment.amount_charged_fcfa)} en attente
            </p>
            <p className="text-amber-800 dark:text-amber-300">
              Envoyé par e-mail au client. Si l&apos;envoi a échoué (ou pour le transmettre
              autrement), voici le lien direct :
            </p>
            <code className="break-all rounded-lg bg-white px-3 py-2 text-xs text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
              {`${process.env.NEXT_PUBLIC_WEB_URL}/paiement-securise/${payment.payment_token}`}
            </code>
            {payment.payment_token_expires_at ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Expire le {formatDepartureDateTime(payment.payment_token_expires_at)}.
              </p>
            ) : null}
          </div>
        ))}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">Passagers</h2>
        <div className="flex flex-col gap-2">
          {booking.passengers.map((passenger) => (
            <div
              key={passenger.id}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <span className="text-zinc-950 dark:text-zinc-50">{passenger.full_name}</span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {passenger.seat_number ? `Siège ${passenger.seat_number}` : "Siège non assigné"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Historique de paiement
        </h2>
        {payments.length === 0 ? (
          <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            Aucun paiement enregistré.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Fournisseur</th>
                  <th className="px-4 py-3 font-medium">Base</th>
                  <th className="px-4 py-3 font-medium">Avoir</th>
                  <th className="px-4 py-3 font-medium">Points</th>
                  <th className="px-4 py-3 font-medium">Payé</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                  >
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatDepartureDateTime(payment.paid_at ?? payment.created_at)}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {payment.provider === "simulated" ? "Simulé" : payment.provider}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {formatFcfa(payment.base_amount_fcfa)}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {payment.voucher_amount_fcfa > 0 ? `− ${formatFcfa(payment.voucher_amount_fcfa)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                      {payment.points_redeemed_fcfa > 0
                        ? `− ${formatFcfa(payment.points_redeemed_fcfa)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-950 dark:text-zinc-50">
                      {formatFcfa(payment.amount_charged_fcfa)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          PAYMENT_STATUS_STYLES[payment.status] ??
                          "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Link href="/reservations" className="font-medium text-zinc-950 hover:underline dark:text-zinc-50">
        ← Retour aux réservations
      </Link>
    </div>
  );
}
