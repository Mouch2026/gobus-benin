"use client";

import { useActionState } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";
import { updateCashCeiling, type CaisseActionState } from "./actions";

const initialState: CaisseActionState = { error: null };

export function CashCeilingForm({ currentCeilingFcfa }: { currentCeilingFcfa: number | null }) {
  const [state, action, pending] = useActionState(updateCashCeiling, initialState);

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cashCeilingFcfa" className={LABEL_CLASSES}>
          Plafond d&apos;espèces par session (FCFA)
        </label>
        <input
          id="cashCeilingFcfa"
          name="cashCeilingFcfa"
          type="number"
          min={1}
          placeholder="Aucun plafond"
          defaultValue={currentCeilingFcfa ?? ""}
          className={FIELD_CLASSES}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
