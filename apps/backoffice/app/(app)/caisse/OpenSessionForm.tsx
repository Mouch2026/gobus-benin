"use client";

import { useActionState } from "react";
import { openSession, type CaisseActionState } from "./actions";

const initialState: CaisseActionState = { error: null };

export function OpenSessionForm() {
  const [state, action, pending] = useActionState(openSession, initialState);

  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {pending ? "Ouverture..." : "Ouvrir une session de caisse"}
      </button>
      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
