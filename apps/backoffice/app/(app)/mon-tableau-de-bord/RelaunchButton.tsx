"use client";

import { useActionState } from "react";
import { relaunchPaymentLink, type RelaunchPaymentLinkState } from "./actions";

const initialState: RelaunchPaymentLinkState = { error: null, success: false };

export function RelaunchButton({ paymentId, disabled }: { paymentId: string; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(relaunchPaymentLink, initialState);

  if (state.success) {
    return <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Relancé.</span>;
  }

  return (
    <form action={formAction} className="flex flex-col items-start gap-1">
      <input type="hidden" name="paymentId" value={paymentId} />
      <button
        type="submit"
        disabled={disabled || pending}
        title={disabled ? "Lien expiré — ne peut plus être relancé" : undefined}
        className="text-xs font-medium text-zinc-700 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 disabled:no-underline dark:text-zinc-300 dark:disabled:text-zinc-600"
      >
        {pending ? "Envoi..." : "Relancer"}
      </button>
      {state.error ? (
        <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>
      ) : null}
    </form>
  );
}
