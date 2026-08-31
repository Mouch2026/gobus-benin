"use client";

import { useActionState } from "react";
import { resetPassword, type ResetPasswordState } from "./actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";

const initialState: ResetPasswordState = { error: null };

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="newPassword" className={LABEL_CLASSES}>
          Nouveau mot de passe
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className={LABEL_CLASSES}>
          Confirmer le nouveau mot de passe
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className={FIELD_CLASSES}
        />
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
        {pending ? "Enregistrement..." : "Réinitialiser le mot de passe"}
      </button>
    </form>
  );
}
