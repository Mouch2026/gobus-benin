"use client";

import { useActionState } from "react";
import { signupCompany, type SignupState } from "./actions";

const initialState: SignupState = { error: null };

const fieldClasses =
  "rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-muted";

export function SignupForm({ planId }: { planId: string }) {
  const [state, formAction, pending] = useActionState(signupCompany, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="planId" value={planId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="companyName" className={labelClasses}>
          Nom de la compagnie
        </label>
        <input
          id="companyName"
          name="companyName"
          type="text"
          required
          placeholder="Ex. ATT Transport"
          className={fieldClasses}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelClasses}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={fieldClasses}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className={labelClasses}>
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
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
        {pending ? "Création en cours..." : "Créer mon compte"}
      </button>
    </form>
  );
}
