import Link from "next/link";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { sweepExpiredVouchers } from "@/lib/vouchers";
import { calculatePointsEarned, calculateServiceFees, formatFcfa } from "shared";
import { simulateRoundTripPayment } from "./actions";
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
  leg: "outbound" | "return";
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

export default async function PaiementAllerRetourPage(
  props: PageProps<"/reservation/aller-retour/[groupId]/paiement">
) {
  const { groupId } = await props.params;
  const user = await requireUser(`/reservation/aller-retour/${groupId}/paiement`);

  const supabase = await createClient();

  // Filtré par user_id en plus de RLS (bookings_select_own_or_company) —
  // même précaution que la page de paiement simple.
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select(
      "id, leg, status, seat_count, total_price_fcfa, trips(departure_at, routes(origin_city, destination_city))"
    )
    .eq("booking_group_id", groupId)
    .eq("user_id", user.sub)
    .order("leg", { ascending: false }) // "outbound" avant "return"
    .returns<BookingWithTrip[]>();

  if (error) {
    console.error("Impossible de charger l'aller-retour :", error.message);
  }

  if (!bookings || bookings.length !== 2) {
    return <Message>Cet aller-retour n&apos;existe pas.</Message>;
  }

  const outbound = bookings.find((b) => b.leg === "outbound")!;
  const returnLeg = bookings.find((b) => b.leg === "return")!;

  if (outbound.status === "cancelled" || returnLeg.status === "cancelled") {
    return <Message>Cet aller-retour a été annulé.</Message>;
  }

  if (outbound.status === "confirmed" && returnLeg.status === "confirmed") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="max-w-sm rounded-2xl border border-border bg-surface p-6 text-muted">
          Cet aller-retour est déjà payé.
        </p>
        <Link
          href={`/reservation/aller-retour/${groupId}/succes`}
          className="font-semibold text-primary hover:underline"
        >
          Voir la confirmation →
        </Link>
      </div>
    );
  }

  const outboundFees = calculateServiceFees(outbound.total_price_fcfa);
  const returnFees = calculateServiceFees(returnLeg.total_price_fcfa);
  const totalFcfa = outboundFees.totalFcfa + returnFees.totalFcfa;
  const pointsEarned =
    calculatePointsEarned(outbound.total_price_fcfa) + calculatePointsEarned(returnLeg.total_price_fcfa);

  const simulatePaymentForGroup = simulateRoundTripPayment.bind(null, groupId);

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
        <h1 className="font-display text-2xl font-extrabold text-foreground">
          Paiement — Aller-retour
        </h1>

        {[
          { label: "Aller", booking: outbound, fees: outboundFees },
          { label: "Retour", booking: returnLeg, fees: returnFees },
        ].map(({ label, booking, fees }) => (
          <div key={booking.id} className="mt-4 border-t border-border pt-4 text-sm">
            {booking.trips ? (
              <p className="text-muted">
                <span className="font-semibold text-foreground">{label}</span> —{" "}
                {booking.trips.routes.origin_city} → {booking.trips.routes.destination_city} ·{" "}
                {booking.seat_count} place{booking.seat_count > 1 ? "s" : ""}
              </p>
            ) : null}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted">Prix du billet</span>
              <span className="text-foreground">{formatFcfa(booking.total_price_fcfa)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Frais de plateforme</span>
              <span className="text-foreground">{formatFcfa(fees.platformFeeFcfa)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Frais de transaction</span>
              <span className="text-foreground">{formatFcfa(fees.transactionFeeFcfa)}</span>
            </div>
          </div>
        ))}

        {voucherAppliedFcfa > 0 ? (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-primary">
            <span>Avoir appliqué</span>
            <span>− {formatFcfa(voucherAppliedFcfa)}</span>
          </div>
        ) : null}

        <div
          className={`flex items-center justify-between pt-3 ${voucherAppliedFcfa > 0 ? "" : "mt-4 border-t border-border"}`}
        >
          <span className="font-semibold text-foreground">
            {voucherAppliedFcfa > 0 ? "Total à payer" : "Total"}
          </span>
          <span className="font-display text-xl font-extrabold text-foreground">
            {formatFcfa(amountToPayFcfa)}
          </span>
        </div>

        <p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-muted">
          Vous gagnerez <span className="font-semibold text-foreground">{pointsEarned} GoBus Points</span>{" "}
          après ce paiement.
        </p>

        <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-muted">
          Simulation — le vrai paiement (FedaPay) n&apos;est pas encore branché. Ce bouton confirme
          votre aller ET votre retour ensemble, sans paiement réel.
        </p>

        <form action={simulatePaymentForGroup} className="mt-4 flex flex-col gap-3">
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
