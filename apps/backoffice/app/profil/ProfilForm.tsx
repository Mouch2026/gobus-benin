"use client";

import { useActionState } from "react";
import { updateCompanyProfile, type ProfilFormState } from "./actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";

const initialState: ProfilFormState = { error: null, success: false };

type CompanyProfile = {
  name: string;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
};

export function ProfilForm({ company }: { company: CompanyProfile }) {
  const [state, formAction, pending] = useActionState(updateCompanyProfile, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={LABEL_CLASSES}>
          Nom de la compagnie
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          defaultValue={company.name}
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className={LABEL_CLASSES}>
          Téléphone (optionnel)
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={company.phone ?? ""}
          placeholder="+229 ..."
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={LABEL_CLASSES}>
          Email (optionnel)
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={company.email ?? ""}
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="logoUrl" className={LABEL_CLASSES}>
          URL du logo (optionnel)
        </label>
        <input
          id="logoUrl"
          name="logoUrl"
          type="text"
          defaultValue={company.logo_url ?? ""}
          placeholder="https://..."
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
          Profil mis à jour.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
