"use client";

import { useActionState, useEffect, useRef } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";
import { createEmployee, type EmployeeFormState } from "./actions";

export type AgencyOption = { id: string; name: string; stationLabel: string | null };

const initialState: EmployeeFormState = { error: null };

export function EmployeeForm({ agencies }: { agencies: AgencyOption[] }) {
  const [state, formAction, pending] = useActionState(createEmployee, initialState);
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
        <label htmlFor="fullName" className={LABEL_CLASSES}>
          Nom (optionnel)
        </label>
        <input id="fullName" name="fullName" type="text" placeholder="Prénom Nom" className={FIELD_CLASSES} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={LABEL_CLASSES}>
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="employe@exemple.com"
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={LABEL_CLASSES}>
          Mot de passe initial
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className={FIELD_CLASSES}
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Communiquez ces identifiants à l&apos;employé — aucun e-mail ne lui est envoyé.
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className={LABEL_CLASSES}>
            Rôle
          </label>
          <select id="role" name="role" required defaultValue="agent" className={FIELD_CLASSES}>
            <option value="agent">Agent</option>
            <option value="agency_manager">Chef d&apos;agence</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="agencyId" className={LABEL_CLASSES}>
            Agence
          </label>
          <select id="agencyId" name="agencyId" required defaultValue="" className={FIELD_CLASSES}>
            <option value="" disabled>
              Choisir une agence…
            </option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.stationLabel ? ` — ${a.stationLabel}` : ""}
              </option>
            ))}
          </select>
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
        {pending ? "Création..." : "Créer le compte"}
      </button>
    </form>
  );
}
