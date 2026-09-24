"use client";

import { useActionState } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";
import { createDriver, type DriverFormState } from "./actions";

const initialState: DriverFormState = { error: null };

export function DriverForm() {
  const [state, formAction, pending] = useActionState(createDriver, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="fullName" className={LABEL_CLASSES}>
          Nom complet
        </label>
        <input id="fullName" name="fullName" type="text" required placeholder="Adjovi Koffi" className={FIELD_CLASSES} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className={LABEL_CLASSES}>
          Téléphone (optionnel)
        </label>
        <input id="phone" name="phone" type="tel" placeholder="+229 01 23 45 67 89" className={FIELD_CLASSES} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="licenseNumber" className={LABEL_CLASSES}>
          Numéro de permis (optionnel)
        </label>
        <input id="licenseNumber" name="licenseNumber" type="text" className={FIELD_CLASSES} />
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
        {pending ? "Création..." : "Créer le chauffeur"}
      </button>
    </form>
  );
}
