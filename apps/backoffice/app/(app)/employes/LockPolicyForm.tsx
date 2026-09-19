"use client";

import { useActionState } from "react";
import { updateLockTimeout, type EmployeeFormState } from "./actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";

const initialState: EmployeeFormState = { error: null };

export function LockPolicyForm({ currentMinutes }: { currentMinutes: number }) {
  const [state, formAction, pending] = useActionState(updateLockTimeout, initialState);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="lockTimeoutMinutes" className={LABEL_CLASSES}>
          Verrouiller après (minutes d&apos;inactivité)
        </label>
        <select
          id="lockTimeoutMinutes"
          name="lockTimeoutMinutes"
          defaultValue={currentMinutes}
          className={FIELD_CLASSES}
        >
          {[2, 3, 4, 5].map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} min
            </option>
          ))}
        </select>
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
    </form>
  );
}
