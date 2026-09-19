"use client";

import { useActionState, useEffect, useRef } from "react";
import { changePin } from "../lock-actions";
import type { SetPinState } from "../lock-actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";

const initialState: SetPinState = { error: null, success: false };

export function PinForm() {
  const [state, formAction, pending] = useActionState(changePin, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && state.success) {
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="currentPassword" className={LABEL_CLASSES}>
          Mot de passe actuel
        </label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="pin" className={LABEL_CLASSES}>
          Nouveau code PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4,6}"
          minLength={4}
          maxLength={6}
          required
          autoComplete="off"
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPin" className={LABEL_CLASSES}>
          Confirmer le nouveau code PIN
        </label>
        <input
          id="confirmPin"
          name="confirmPin"
          type="password"
          inputMode="numeric"
          pattern="\d{4,6}"
          minLength={4}
          maxLength={6}
          required
          autoComplete="off"
          className={FIELD_CLASSES}
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400" role="status">
          Code PIN changé.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {pending ? "Modification..." : "Changer le code PIN"}
      </button>
    </form>
  );
}
