import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatFcfa } from "shared";
import { formatDepartureDateTime } from "../../recherche/_shared";
import { payViaToken } from "./actions";
import { SubmitButton } from "./SubmitButton";

const METHOD_LABELS: Record<string, string> = {
  mtn_money: "Mobile Money (MTN)",
  moov_money: "Mobile Money (Moov)",
  card: "Carte bancaire",
};

type PaymentForTokenPage = {
  id: string;
  status: string;
  method: string | null;
  base_amount_fcfa: number;
  platform_fee_fcfa: number;
  transaction_fee_fcfa: number;
  voucher_amount_fcfa: number;
  points_redeemed_fcfa: number;
  amount_charged_fcfa: number;
  payment_token_expires_at: string | null;
  bookings: {
    booking_reference: string;
    trips: { departure_at: string; routes: { origin_city: string; destination_city: string } } | null;
    passengers: { id: string; full_name: string; seat_number: string | null }[];
  } | null;
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

// Aucun requireUser() ici — page volontairement publique. Le SEUL
// contrôle d'accès est le jeton lui-même : correspondance exacte, statut
// 'pending', non expiré — les trois ensemble. Jamais atteignable par le
// seul booking_id.
//
// Depuis le chantier "paiements scindés" : le jeton identifie une PART de
// paiement (payments.payment_token), pas la réservation entière — une
// réservation peut avoir plusieurs parts "par lien" (Mobile Money ET
// Carte), chacune avec son propre montant déjà calculé et stocké
// (amount_charged_fcfa) — plus besoin de recalculer calculateServiceFees
// ici, les frais/avoir/points de CETTE part (s'il y en a) sont déjà dedans.
export default async function PaiementSecurisePage(props: PageProps<"/paiement-securise/[token]">) {
  const { token } = await props.params;

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select(
      "id, status, method, base_amount_fcfa, platform_fee_fcfa, transaction_fee_fcfa, voucher_amount_fcfa, points_redeemed_fcfa, amount_charged_fcfa, payment_token_expires_at, bookings(booking_reference, trips(departure_at, routes(origin_city, destination_city)), passengers(id, full_name, seat_number))"
    )
    .eq("payment_token", token)
    .maybeSingle<PaymentForTokenPage>();

  // Message générique dans tous les cas (introuvable, déjà payée/annulée,
  // expiré) — jamais de distinction qui aiderait à deviner lequel de ces
  // cas s'est produit.
  const isUsable =
    !!payment &&
    payment.status === "pending" &&
    !!payment.payment_token_expires_at &&
    new Date(payment.payment_token_expires_at) > new Date();

  if (!isUsable) {
    return <Message>Ce lien de paiement est invalide ou a expiré.</Message>;
  }

  const booking = payment!.bookings;
  const payViaTokenForPayment = payViaToken.bind(null, token);
  const methodLabel = (payment!.method && METHOD_LABELS[payment!.method]) || "Paiement en ligne";

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <h1 className="font-display text-2xl font-extrabold text-foreground">Paiement</h1>
        <p className="mt-1 text-sm text-muted">{methodLabel}</p>
        {booking ? (
          <p className="mt-1 text-sm text-muted">
            Référence : <span className="font-semibold text-foreground">{booking.booking_reference}</span>
          </p>
        ) : null}
        {booking?.trips ? (
          <p className="mt-1 text-sm text-muted">
            {booking.trips.routes.origin_city} → {booking.trips.routes.destination_city} ·{" "}
            {formatDepartureDateTime(booking.trips.departure_at)}
          </p>
        ) : null}

        {booking ? (
          <div className="mt-4 flex flex-col gap-2 border-t border-b border-border py-4 text-left text-sm">
            {booking.passengers.map((passenger) => (
              <div key={passenger.id} className="flex items-center justify-between">
                <span className="text-foreground">{passenger.full_name}</span>
                <span className="text-muted">
                  {passenger.seat_number ? `Siège ${passenger.seat_number}` : "—"}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 border-b border-border pb-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Cette part du billet</span>
            <span className="text-foreground">{formatFcfa(payment!.base_amount_fcfa)}</span>
          </div>
          {payment!.platform_fee_fcfa > 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-muted">Frais de plateforme</span>
              <span className="text-foreground">{formatFcfa(payment!.platform_fee_fcfa)}</span>
            </div>
          ) : null}
          {payment!.transaction_fee_fcfa > 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-muted">Frais de transaction</span>
              <span className="text-foreground">{formatFcfa(payment!.transaction_fee_fcfa)}</span>
            </div>
          ) : null}
          {payment!.voucher_amount_fcfa > 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-muted">Avoir appliqué</span>
              <span className="text-foreground">− {formatFcfa(payment!.voucher_amount_fcfa)}</span>
            </div>
          ) : null}
          {payment!.points_redeemed_fcfa > 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-muted">Points GoBus</span>
              <span className="text-foreground">− {formatFcfa(payment!.points_redeemed_fcfa)}</span>
            </div>
          ) : null}
          <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
            <span className="font-semibold text-foreground">À payer maintenant</span>
            <span className="font-display text-xl font-extrabold text-foreground">
              {formatFcfa(payment!.amount_charged_fcfa)}
            </span>
          </div>
        </div>

        <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-muted">
          Simulation — le vrai paiement (FedaPay) n&apos;est pas encore branché. Ce bouton confirme
          cette part directement, sans paiement réel.
        </p>

        <form action={payViaTokenForPayment} className="mt-4">
          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
