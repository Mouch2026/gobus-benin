"use client";

import { useActionState } from "react";
import { resetPassword, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = { error: null };

const fieldClasses =
  "rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-muted";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="newPassword" className={labelClasses}>
          Nouveau mot de passe
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className={fieldClasses}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className={labelClasses}>
          Confirmer le nouveau mot de passe
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className={fieldClasses}
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Enregistrement..." : "Réinitialiser le mot de passe"}
      </button>
    </form>
  );
}
