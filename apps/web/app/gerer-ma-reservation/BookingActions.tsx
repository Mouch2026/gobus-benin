"use client";

import { useActionState, useState } from "react";
import { formatFcfa } from "shared";
import { cancelBookingFromLookup, type CancelFromLookupState } from "./cancelActions";

const initialState: CancelFromLookupState = {
  error: null,
  notOwned: false,
  voucherAmountFcfa: null,
  voucherExpiresAt: null,
};

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(iso));
}

// "Annuler" et "Modifier" partagent le même panneau de confirmation
// (le champ caché "mode" décide seul de ce qui se passe après succès :
// rester ici, ou rediriger vers /recherche — voir cancelActions.ts) —
// message de succès aligné sur apps/web/app/reservation/CancelBookingButton.tsx.
export function BookingActions({
  bookingId,
  voucherPreviewFcfa,
}: {
  bookingId: string;
  voucherPreviewFcfa: number;
}) {
  const [state, formAction, pending] = useActionState(cancelBookingFromLookup, initialState);
  const [mode, setMode] = useState<"idle" | "stay" | "modify">("idle");

  if (state.voucherAmountFcfa !== null) {
    return (
      <p
        className="mt-3 rounded-xl border border-border bg-background p-3 text-sm text-foreground"
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

  if (mode === "idle") {
    return (
      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={() => setMode("stay")}
          className="text-sm font-semibold text-red-600 hover:underline"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => setMode("modify")}
          className="text-sm font-semibold text-primary hover:underline"
        >
          Modifier
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 flex flex-col gap-3 rounded-xl border border-border bg-background p-3 text-left"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="mode" value={mode} />

      <p className="text-sm text-foreground">
        {mode === "modify"
          ? "Cette réservation sera annulée et vous serez redirigé vers la recherche pour en choisir une nouvelle. "
          : ""}
        {voucherPreviewFcfa > 0
          ? `Vous recevrez un avoir de ${formatFcfa(voucherPreviewFcfa)}, valable 24h — pas de remboursement immédiat.`
          : "Aucun avoir ne pourra être émis."}
      </p>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.notOwned
            ? "Cette réservation est associée à un autre compte que celui-ci. Connectez-vous avec le compte qui l'a effectuée pour la gérer."
            : state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "..." : mode === "modify" ? "Confirmer et choisir un nouveau trajet" : "Confirmer l'annulation"}
        </button>
        <button
          type="button"
          onClick={() => setMode("idle")}
          disabled={pending}
          className="text-sm font-semibold text-muted hover:text-foreground"
        >
          Retour
        </button>
      </div>
    </form>
  );
}
