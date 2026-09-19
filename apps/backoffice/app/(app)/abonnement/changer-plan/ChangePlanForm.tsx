"use client";

import { useActionState } from "react";
import { changePlan, type ChangePlanState } from "../actions";

const initialState: ChangePlanState = { error: null };

export function ChangePlanForm({ planId }: { planId: string }) {
  const [state, formAction, pending] = useActionState(changePlan, initialState);

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      <input type="hidden" name="planId" value={planId} />

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {pending ? "Changement..." : "Confirmer le changement de plan"}
      </button>
    </form>
  );
}
