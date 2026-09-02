"use client";

import { useActionState, useState } from "react";
import { formatFcfa } from "shared";
import { cancelBooking, type CancelBookingState } from "./cancelBookingAction";

const initialState: CancelBookingState = { error: null, refundedAmountFcfa: null };

// refundPreviewFcfa : calculé côté serveur au moment du rendu de la page
// (même règle que cancel_booking() — > 30 min avant départ ->
// base_amount_fcfa, sinon 0), jamais côté client. C'est une
// prévisualisation, pas la source de vérité : le RPC recalcule strictement
// la même règle au moment de l'exécution.
export function CancelBookingButton({
  bookingId,
  refundPreviewFcfa,
}: {
  bookingId: string;
  refundPreviewFcfa: number;
}) {
  const [state, formAction, pending] = useActionState(cancelBooking, initialState);
  const [confirming, setConfirming] = useState(false);

  if (state.refundedAmountFcfa !== null) {
    return (
      <p
        className="mt-4 rounded-xl border border-border bg-background p-4 text-sm text-foreground"
        role="status"
      >
        Réservation annulée.{" "}
        {state.refundedAmountFcfa > 0
          ? `${formatFcfa(state.refundedAmountFcfa)} vous seront remboursés.`
          : "Aucun remboursement n'était possible à moins de 30 minutes du départ."}
      </p>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-4 text-sm font-semibold text-red-600 hover:underline"
      >
        Annuler ma réservation
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-background p-4 text-left"
    >
      <input type="hidden" name="bookingId" value={bookingId} />

      <p className="text-sm text-foreground">
        {refundPreviewFcfa > 0
          ? `Vous serez remboursé de ${formatFcfa(refundPreviewFcfa)}.`
          : "Aucun remboursement ne sera possible : le départ est dans moins de 30 minutes."}
      </p>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Annulation..." : "Confirmer l'annulation"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-sm font-semibold text-muted hover:text-foreground"
        >
          Retour
        </button>
      </div>
    </form>
  );
}
