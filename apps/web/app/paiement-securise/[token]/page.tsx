import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateServiceFees, formatFcfa } from "shared";
import { formatDepartureDateTime } from "../../recherche/_shared";
import { payViaToken } from "./actions";
import { SubmitButton } from "./SubmitButton";

type BookingForTokenPage = {
  id: string;
  booking_reference: string;
  status: string;
  total_price_fcfa: number;
  payment_token_expires_at: string | null;
  trips: { departure_at: string; bus_number: string; routes: { origin_city: string; destination_city: string } } | null;
  passengers: { id: string; full_name: string; seat_number: string | null }[];
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

// Aucun requireUser() ici — page volontairement publique (apps/web n'a de
// toute façon aucun proxy/middleware qui la rendrait autrement
// inaccessible). Le SEUL contrôle d'accès est le jeton lui-même :
// correspondance exacte, statut 'pending', non expiré — les trois
// ensemble. Jamais atteignable par le seul booking_id : cette route ne
// lit que le paramètre de jeton.
export default async function PaiementSecurisePage(props: PageProps<"/paiement-securise/[token]">) {
  const { token } = await props.params;

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select(
      "id, booking_reference, status, total_price_fcfa, payment_token_expires_at, trips(departure_at, bus_number, routes(origin_city, destination_city)), passengers(id, full_name, seat_number)"
    )
    .eq("payment_token", token)
    .maybeSingle<BookingForTokenPage>();

  // Message générique dans tous les cas (introuvable, déjà payée/annulée,
  // expiré) — jamais de distinction qui aiderait à deviner lequel de ces
  // cas s'est produit.
  const isUsable =
    !!booking &&
    booking.status === "pending" &&
    !!booking.payment_token_expires_at &&
    new Date(booking.payment_token_expires_at) > new Date();

  if (!isUsable) {
    return <Message>Ce lien de paiement est invalide ou a expiré.</Message>;
  }

  const { platformFeeFcfa, transactionFeeFcfa, totalFcfa } = calculateServiceFees(
    booking!.total_price_fcfa
  );
  const payViaTokenForBooking = payViaToken.bind(null, token);

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <h1 className="font-display text-2xl font-extrabold text-foreground">Paiement</h1>
        <p className="mt-1 text-sm text-muted">
          Référence : <span className="font-semibold text-foreground">{booking!.booking_reference}</span>
        </p>
        {booking!.trips ? (
          <p className="mt-1 text-sm text-muted">
            {booking!.trips.routes.origin_city} → {booking!.trips.routes.destination_city} ·{" "}
            {formatDepartureDateTime(booking!.trips.departure_at)}
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-2 border-t border-b border-border py-4 text-left text-sm">
          {booking!.passengers.map((passenger) => (
            <div key={passenger.id} className="flex items-center justify-between">
              <span className="text-foreground">{passenger.full_name}</span>
              <span className="text-muted">
                {passenger.seat_number ? `Siège ${passenger.seat_number}` : "—"}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-b border-border pb-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted">Prix du billet</span>
            <span className="text-foreground">{formatFcfa(booking!.total_price_fcfa)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Frais de plateforme</span>
            <span className="text-foreground">{formatFcfa(platformFeeFcfa)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">Frais de transaction</span>
            <span className="text-foreground">{formatFcfa(transactionFeeFcfa)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
            <span className="font-semibold text-foreground">Total</span>
            <span className="font-display text-xl font-extrabold text-foreground">
              {formatFcfa(totalFcfa)}
            </span>
          </div>
        </div>

        <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-muted">
          Simulation — le vrai paiement (FedaPay) n&apos;est pas encore branché. Ce bouton confirme
          votre billet directement, sans paiement réel.
        </p>

        <form action={payViaTokenForBooking} className="mt-4">
          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
