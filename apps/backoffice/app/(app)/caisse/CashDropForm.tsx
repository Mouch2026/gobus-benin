"use client";

import { useState, useActionState } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";
import { recordCashDrop, type CaisseActionState } from "./actions";

const initialState: CaisseActionState = { error: null };

export function CashDropForm() {
  const [state, action, pending] = useActionState(recordCashDrop, initialState);
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Vide-caisse
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <label htmlFor="montantFcfa" className={LABEL_CLASSES}>
        Montant déposé au coffre (FCFA)
      </label>
      <input id="montantFcfa" name="montantFcfa" type="number" min={1} required className={FIELD_CLASSES} />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {pending ? "Enregistrement..." : "Confirmer le vide-caisse"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Annuler
        </button>
      </div>
      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
