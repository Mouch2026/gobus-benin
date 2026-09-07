"use client";

import { useActionState } from "react";
import { updateProfile, type ProfilFormState } from "./actions";

const initialState: ProfilFormState = { error: null, success: false };

const fieldClasses =
  "rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-muted";

export function ProfilForm({ fullName, email }: { fullName: string; email: string }) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="fullName" className={labelClasses}>
          Nom
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          defaultValue={fullName}
          className={fieldClasses}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={labelClasses}>
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          disabled
          className={`${fieldClasses} cursor-not-allowed opacity-60`}
        />
        <span className="text-xs text-muted">
          L&apos;email est lié à votre compte et ne peut pas être modifié ici.
        </span>
      </div>

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      {state.success ? (
        <p className="text-sm text-emerald-600" role="status">
          Profil mis à jour.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-xl bg-primary px-4 py-2.5 font-display font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
