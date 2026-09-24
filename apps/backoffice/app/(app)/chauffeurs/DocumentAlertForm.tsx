"use client";

import { useActionState } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";
import { updateDocumentAlertDays, type DocumentAlertState } from "./actions";

const initialState: DocumentAlertState = { error: null, success: false };

export function DocumentAlertForm({ currentDays }: { currentDays: number }) {
  const [state, formAction, pending] = useActionState(updateDocumentAlertDays, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="documentAlertDays" className={LABEL_CLASSES}>
          Alerter (jours avant expiration)
        </label>
        <input
          id="documentAlertDays"
          name="documentAlertDays"
          type="number"
          min={1}
          max={365}
          required
          defaultValue={currentDays}
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
        <p className="w-full text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="w-full text-sm text-emerald-600 dark:text-emerald-400">Enregistré.</p>
      ) : null}
    </form>
  );
}
