"use client";

import { useActionState, useEffect, useRef } from "react";
import { createBusLayout, type BusLayoutFormState } from "./actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";

const initialState: BusLayoutFormState = { error: null };

export function BusLayoutForm() {
  const [state, formAction, pending] = useActionState(createBusLayout, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={LABEL_CLASSES}>
          Nom du plan
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Bus 40 places"
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="seatLabels" className={LABEL_CLASSES}>
          Libellés des sièges, séparés par des virgules
        </label>
        <textarea
          id="seatLabels"
          name="seatLabels"
          required
          rows={3}
          placeholder="1A, 1B, 1C, 1D, 2A, 2B, 2C, 2D, ..."
          className={FIELD_CLASSES}
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          L&apos;ordre saisi est l&apos;ordre d&apos;attribution des sièges aux voyageurs.
        </span>
      </div>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {pending ? "Création..." : "Créer le plan"}
      </button>
    </form>
  );
}
