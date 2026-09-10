import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatFcfa } from "shared";

type PaymentRow = {
  booking_id: string;
  bookings: { booking_reference: string; total_price_fcfa: number } | null;
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

// Atteinte uniquement quand cette part vient d'être confirmée avec succès
// MAIS que la somme des parts reçues de la réservation n'atteint pas
// encore total_price_fcfa (paiement scindé, encore incomplet) — voir
// record_payment_part_received. Page en lecture seule, sans action
// financière possible : rien à payer ici, seulement informer.
export default async function PaiementSecuriseEnAttentePage(
  props: PageProps<"/paiement-securise/[token]/en-attente">
) {
  const { token } = await props.params;

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("booking_id, bookings(booking_reference, total_price_fcfa)")
    .eq("payment_token", token)
    .maybeSingle<PaymentRow>();

  if (!payment || !payment.bookings) {
    return <Message>Cette réservation n&apos;existe pas.</Message>;
  }

  const { data: receivedRows } = await supabaseAdmin
    .from("payments")
    .select("base_amount_fcfa")
    .eq("booking_id", payment.booking_id)
    .in("status", ["received", "approved"]);

  const receivedSum = (receivedRows ?? []).reduce((sum, row) => sum + row.base_amount_fcfa, 0);
  const remainingFcfa = Math.max(payment.bookings.total_price_fcfa - receivedSum, 0);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <h1 className="font-display text-2xl font-extrabold text-foreground">Paiement reçu</h1>
        <p className="mt-2 text-sm text-muted">
          Référence :{" "}
          <span className="font-semibold text-foreground">{payment.bookings.booking_reference}</span>
        </p>
        <p className="mt-4 text-sm text-muted">
          Cette part de votre paiement a bien été enregistrée. Votre réservation sera confirmée dès
          réception du reste du paiement, réparti sur un ou plusieurs autres moyens de paiement.
        </p>
        {remainingFcfa > 0 ? (
          <p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-sm font-semibold text-foreground">
            Reste à recevoir : {formatFcfa(remainingFcfa)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
