import Link from "next/link";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { sweepExpiredVouchers } from "@/lib/vouchers";
import { calculatePointsEarned, calculateServiceFees, formatFcfa } from "shared";
import { simulatePayment } from "./actions";
import { SubmitButton } from "./SubmitButton";

type ActiveVoucher = {
  id: string;
  amount_fcfa: number;
  expires_at: string;
};

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

type BookingWithTrip = {
  id: string;
  booking_reference: string;
  status: string;
  seat_count: number;
  total_price_fcfa: number;
  trips: { departure_at: string; routes: { origin_city: string; destination_city: string } } | null;
};

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="max-w-sm rounded-2xl border border-border bg-surface p-6 text-muted">
        {children}
      </p>
      <Link href="/" className="font-semibold text-primary hover:underline">
        ← Retour à l&apos;accueil
      </Link>
    </div>
  );
}

export default async function PaiementPage(props: PageProps<"/reservation/[bookingId]/paiement">) {
  const { bookingId } = await props.params;
  const user = await requireUser(`/reservation/${bookingId}/paiement`);

  const supabase = await createClient();

  // Filtré par user_id en plus de RLS (bookings_select_own_or_company) —
  // même précaution "ne pas s'appuyer sur RLS seul" déjà appliquée côté
  // back-office (filtrage explicite par company_id).
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, booking_reference, status, seat_count, total_price_fcfa, trips(departure_at, routes(origin_city, destination_city))"
    )
    .eq("id", bookingId)
    .eq("user_id", user.sub)
    .maybeSingle<BookingWithTrip>();

  if (error) {
    console.error("Impossible de charger la réservation :", error.message);
  }

  if (!booking) {
    return <Message>Cette réservation n&apos;existe pas.</Message>;
  }

  if (booking.status === "cancelled") {
    return <Message>Cette réservation a été annulée.</Message>;
  }

  if (booking.status === "confirmed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="max-w-sm rounded-2xl border border-border bg-surface p-6 text-muted">
          Cette réservation est déjà payée.
        </p>
        <Link
          href={`/reservation/${booking.id}/succes`}
          className="font-semibold text-primary hover:underline"
        >
          Voir la confirmation →
        </Link>
      </div>
    );
  }

  const { platformFeeFcfa, transactionFeeFcfa, totalFcfa } = calculateServiceFees(
    booking.total_price_fcfa
  );
  const pointsEarned = calculatePointsEarned(booking.total_price_fcfa);
  const simulatePaymentForBooking = simulatePayment.bind(null, bookingId);

  // Purge d'abord les avoirs de cet utilisateur qui viennent d'expirer
  // (sweep paresseux — voir apps/web/lib/vouchers.ts) avant de lister ceux
  // encore actifs, pour ne jamais proposer un avoir déjà passé en file
  // d'attente de remboursement.
  await sweepExpiredVouchers();
  const { data: activeVouchers } = await supabase
    .from("vouchers")
    .select("id, amount_fcfa, expires_at")
    .eq("user_id", user.sub)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: true })
    .returns<ActiveVoucher[]>();
  const vouchers = activeVouchers ?? [];
  const selectedVoucher = vouchers[0] ?? null;
  const voucherAppliedFcfa = selectedVoucher
    ? Math.min(selectedVoucher.amount_fcfa, totalFcfa)
    : 0;
  const amountToPayFcfa = totalFcfa - voucherAppliedFcfa;

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <h1 className="font-display text-2xl font-extrabold text-foreground">Paiement</h1>
        {booking.trips ? (
          <p className="mt-1 text-sm text-muted">
            {booking.trips.routes.origin_city} → {booking.trips.routes.destination_city} ·{" "}
            {booking.seat_count} place{booking.seat_count > 1 ? "s" : ""}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 border-t border-b border-border py-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Prix du billet</span>
            <span className="text-foreground">{formatFcfa(booking.total_price_fcfa)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Frais de plateforme</span>
            <span className="text-foreground">{formatFcfa(platformFeeFcfa)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Frais de transaction</span>
            <span className="text-foreground">{formatFcfa(transactionFeeFcfa)}</span>
          </div>
          {voucherAppliedFcfa > 0 ? (
            <div className="flex items-center justify-between text-primary">
              <span>Avoir appliqué</span>
              <span>− {formatFcfa(voucherAppliedFcfa)}</span>
            </div>
          ) : null}
          <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
            <span className="font-semibold text-foreground">
              {voucherAppliedFcfa > 0 ? "Total à payer" : "Total"}
            </span>
            <span className="font-display text-xl font-extrabold text-foreground">
              {formatFcfa(amountToPayFcfa)}
            </span>
          </div>
        </div>

        <p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-muted">
          Vous gagnerez <span className="font-semibold text-foreground">{pointsEarned} GoBus Points</span>{" "}
          après ce paiement.
        </p>

        <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-muted">
          Simulation — le vrai paiement (FedaPay) n&apos;est pas encore branché. Ce bouton confirme
          votre billet directement, sans paiement réel.
        </p>

        <form action={simulatePaymentForBooking} className="mt-4 flex flex-col gap-3">
          {vouchers.length === 1 && selectedVoucher ? (
            <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm text-foreground">
              <input
                type="checkbox"
                name="voucherId"
                value={selectedVoucher.id}
                defaultChecked
                className="mt-0.5"
              />
              <span>
                Utiliser mon avoir de{" "}
                <span className="font-semibold">{formatFcfa(selectedVoucher.amount_fcfa)}</span>{" "}
                <span className="text-muted">
                  (valable jusqu&apos;au {formatExpiry(selectedVoucher.expires_at)})
                </span>
              </span>
            </label>
          ) : null}

          {vouchers.length > 1 ? (
            <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm text-foreground">
              <legend className="px-1 text-xs font-semibold text-muted">Avoir à utiliser</legend>
              {vouchers.map((v, index) => (
                <label key={v.id} className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="voucherId"
                    value={v.id}
                    defaultChecked={index === 0}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-semibold">{formatFcfa(v.amount_fcfa)}</span>{" "}
                    <span className="text-muted">(valable jusqu&apos;au {formatExpiry(v.expires_at)})</span>
                  </span>
                </label>
              ))}
              <label className="flex items-start gap-2">
                <input type="radio" name="voucherId" value="" className="mt-0.5" />
                <span className="text-muted">Ne pas utiliser d&apos;avoir</span>
              </label>
            </fieldset>
          ) : null}

          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
