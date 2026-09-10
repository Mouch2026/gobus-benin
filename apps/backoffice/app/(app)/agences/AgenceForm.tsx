"use client";

import { useActionState, useEffect, useRef } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";
import { createAgency, type AgencyFormState } from "./actions";

export type StationOption = { id: string; name: string; city: string };

const initialState: AgencyFormState = { error: null };

function stationLabel(s: StationOption): string {
  return s.name === s.city ? s.name : `${s.name} — ${s.city}`;
}

export function AgenceForm({ stations }: { stations: StationOption[] }) {
  const [state, formAction, pending] = useActionState(createAgency, initialState);
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
          Nom de l&apos;agence
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Guichet principal"
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="stationId" className={LABEL_CLASSES}>
          Gare
        </label>
        <select id="stationId" name="stationId" required defaultValue="" className={FIELD_CLASSES}>
          <option value="" disabled>
            Choisir une gare…
          </option>
          {stations.map((s) => (
            <option key={s.id} value={s.id}>
              {stationLabel(s)}
            </option>
          ))}
        </select>
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
        {pending ? "Création..." : "Créer l'agence"}
      </button>
    </form>
  );
}
