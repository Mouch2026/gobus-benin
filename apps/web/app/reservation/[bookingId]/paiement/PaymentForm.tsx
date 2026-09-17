"use client";

import { useActionState } from "react";
import { formatFcfa } from "shared";
import { simulatePayment, type PaymentState } from "./actions";
import { SubmitButton } from "./SubmitButton";

const initialState: PaymentState = { error: null };

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

// Formulaire extrait en composant client (même patron que
// recherche/[tripId]/BookingForm.tsx : useActionState + state.error) —
// nécessaire depuis le chantier des codes promo, le seul champ de tout ce
// parcours de paiement où le serveur peut renvoyer une erreur à afficher
// (avoir/points restent identité-scopés, jamais en échec côté client).
export function PaymentForm({
  bookingId,
  vouchers,
  pointsBalance,
}: {
  bookingId: string;
  vouchers: ActiveVoucher[];
  pointsBalance: number;
}) {
  const simulatePaymentForBooking = simulatePayment.bind(null, bookingId);
  const [state, formAction] = useActionState(simulatePaymentForBooking, initialState);
  const selectedVoucher = vouchers[0] ?? null;

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="promoCode" className="text-xs font-semibold uppercase tracking-wide text-muted">
          Code promo (facultatif)
        </label>
        <input
          id="promoCode"
          name="promoCode"
          type="text"
          autoCapitalize="characters"
          placeholder="Ex. BIENVENUE10"
          className="rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25"
        />
      </div>

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

      {pointsBalance > 0 ? (
        <label className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm text-foreground">
          <input type="checkbox" name="usePoints" value="1" defaultChecked className="mt-0.5" />
          <span>
            Utiliser mes points disponibles{" "}
            <span className="font-semibold">(solde : {pointsBalance} points)</span>
          </span>
        </label>
      ) : null}

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
