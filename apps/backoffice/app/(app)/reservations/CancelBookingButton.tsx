"use client";

import { useActionState } from "react";
import { cancelBooking, type CancelBookingState } from "./actions";

const initialState: CancelBookingState = { error: null };

// Un composant client par ligne, comme VoucherRow (remboursements/RemboursementsTable.tsx) :
// l'état pending/erreur reste scopé à CE bouton, jamais partagé entre lignes.
export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState(cancelBooking, initialState);

  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="bookingId" value={bookingId} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!window.confirm("Annuler cette réservation ? Un avoir de 24h sera émis au voyageur.")) {
            e.preventDefault();
          }
        }}
        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
      >
        {pending ? "…" : "Annuler"}
      </button>
      {state.error ? (
        <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>
      ) : null}
    </form>
  );
}
