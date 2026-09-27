"use client";

import { useActionState, useState } from "react";
import { reportTripDelay, type ReportDelayState } from "./actions";

const initialState: ReportDelayState = { error: null, success: false };

// Même patron bouton -> formulaire déplié que NoterChauffeurButton.tsx
// (apps/web) : ouvre inline, sans navigation.
export function ReportDelayForm({ tripId }: { tripId: string }) {
  const [state, formAction, pending] = useActionState(reportTripDelay, initialState);
  const [opening, setOpening] = useState(false);

  if (state.success) {
    return <span className="text-xs font-medium text-emerald-600">Signalé.</span>;
  }

  if (!opening) {
    return (
      <button
        type="button"
        onClick={() => setOpening(true)}
        className="text-xs font-medium text-zinc-700 hover:underline"
      >
        Signaler un retard
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3">
      <input type="hidden" name="tripId" value={tripId} />
      <div className="flex items-center gap-2">
        <input
          name="delayMinutes"
          type="number"
          min={0}
          required
          placeholder="Minutes"
          className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
        />
        <input
          name="reason"
          type="text"
          placeholder="Motif (optionnel)"
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
        />
      </div>
      {state.error ? (
        <p className="text-xs text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Envoi..." : "Confirmer"}
        </button>
        <button
          type="button"
          onClick={() => setOpening(false)}
          disabled={pending}
          className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
