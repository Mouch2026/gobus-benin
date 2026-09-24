"use client";

import { useActionState, useEffect, useRef } from "react";
import { FIELD_CLASSES, LABEL_CLASSES, UNAVAILABILITY_REASON_LABELS } from "../../../_shared";
import { declareDriverUnavailability, type UnavailabilityFormState } from "../../unavailabilityActions";

const initialState: UnavailabilityFormState = { error: null };

export function DeclareUnavailabilityForm({ driverId }: { driverId: string }) {
  const [state, formAction, pending] = useActionState(declareDriverUnavailability, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Réinitialisation du formulaire : une action DOM impérative, pas une
  // mise à jour d'état React — le message de succès lui-même est dérivé
  // directement de `state.success` au rendu ci-dessous, jamais recopié
  // dans un state local (évite un setState en cascade dans cet effect).
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="driverId" value={driverId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="startDate" className={LABEL_CLASSES}>
            Du
          </label>
          <input id="startDate" name="startDate" type="date" required className={FIELD_CLASSES} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="endDate" className={LABEL_CLASSES}>
            Au
          </label>
          <input id="endDate" name="endDate" type="date" required className={FIELD_CLASSES} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reason" className={LABEL_CLASSES}>
          Motif
        </label>
        <select id="reason" name="reason" required defaultValue="conge" className={FIELD_CLASSES}>
          {Object.entries(UNAVAILABILITY_REASON_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.warning ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {state.warning}
        </p>
      ) : null}
      {state.success && !state.warning ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Indisponibilité enregistrée.</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {pending ? "Enregistrement..." : "Déclarer l'indisponibilité"}
      </button>
    </form>
  );
}
