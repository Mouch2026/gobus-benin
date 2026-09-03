"use client";

import { useActionState, useState } from "react";
import { formatFcfa } from "shared";
import { cancelBooking, type CancelBookingState } from "./cancelBookingAction";

const initialState: CancelBookingState = { error: null, voucherAmountFcfa: null, voucherExpiresAt: null };

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

// voucherPreviewFcfa : calculé côté serveur au moment du rendu de la page
// (même règle que cancel_booking() — toujours base_amount_fcfa tant que le
// trajet n'est pas déjà parti, plus de condition de délai), jamais côté
// client. C'est une prévisualisation, pas la source de vérité : le RPC
// recalcule strictement la même règle au moment de l'exécution.
export function CancelBookingButton({
  bookingId,
  voucherPreviewFcfa,
}: {
  bookingId: string;
  voucherPreviewFcfa: number;
}) {
  const [state, formAction, pending] = useActionState(cancelBooking, initialState);
  const [confirming, setConfirming] = useState(false);

  if (state.voucherAmountFcfa !== null) {
    return (
      <p
        className="mt-4 rounded-xl border border-border bg-background p-4 text-sm text-foreground"
        role="status"
      >
        Réservation annulée.{" "}
        {state.voucherAmountFcfa > 0
          ? `Vous recevez un avoir de ${formatFcfa(state.voucherAmountFcfa)}${
              state.voucherExpiresAt ? `, valable jusqu'au ${formatExpiry(state.voucherExpiresAt)}` : ""
            } — utilisez-le sur une nouvelle réservation dans les 24h.`
          : "Aucun avoir n'a pu être émis."}
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
        {voucherPreviewFcfa > 0
          ? `Vous recevrez un avoir de ${formatFcfa(voucherPreviewFcfa)}, valable 24h — pas de remboursement immédiat.`
          : "Aucun avoir ne pourra être émis."}
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
