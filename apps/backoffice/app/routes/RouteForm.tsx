"use client";

import { useActionState, useEffect, useRef } from "react";
import { createRoute, type RouteFormState } from "./actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";

const initialState: RouteFormState = { error: null };

export function RouteForm() {
  const [state, formAction, pending] = useActionState(createRoute, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    // Transitioned from pending to settled with no error: the route was
    // created — clear the form. (Initial mount has wasPending=false, so
    // this never fires just from rendering.)
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="originCity" className={LABEL_CLASSES}>
            Ville de départ
          </label>
          <input
            id="originCity"
            name="originCity"
            type="text"
            required
            placeholder="Cotonou"
            className={FIELD_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="destinationCity" className={LABEL_CLASSES}>
            Ville d&apos;arrivée
          </label>
          <input
            id="destinationCity"
            name="destinationCity"
            type="text"
            required
            placeholder="Parakou"
            className={FIELD_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="distanceKm" className={LABEL_CLASSES}>
            Distance (km)
          </label>
          <input
            id="distanceKm"
            name="distanceKm"
            type="number"
            min={1}
            required
            className={FIELD_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="durationMinutes" className={LABEL_CLASSES}>
            Durée estimée (minutes, optionnel)
          </label>
          <input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={1}
            className={FIELD_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lineNumber" className={LABEL_CLASSES}>
            Numéro de ligne (optionnel)
          </label>
          <input
            id="lineNumber"
            name="lineNumber"
            type="text"
            placeholder="12"
            className={FIELD_CLASSES}
          />
        </div>
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
        {pending ? "Création..." : "Créer la route"}
      </button>
    </form>
  );
}
