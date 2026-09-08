"use client";

import { useActionState, useEffect, useRef, useState } from "react";
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
  const [logoPreview, setLogoPreview] = useState<string | null>(company.logo_url);
  const objectUrlRef = useRef<string | null>(null);

  // Aperçu instantané côté client au choix d'un fichier — "avant" (juste
  // sélectionné, pas encore envoyé), aucun aller-retour serveur. Le
  // "après" (fichier réellement envoyé) n'a besoin d'aucun code
  // spécifique : c'est simplement le nouveau company.logo_url affiché une
  // fois la page revalidée après le succès de l'action.
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (!file) return;
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setLogoPreview(url);
  }

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

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
        <label htmlFor="logo" className={LABEL_CLASSES}>
          Logo (optionnel)
        </label>
        <div className="flex items-center gap-4">
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoPreview}
              alt="Logo de la compagnie"
              className="h-16 w-16 shrink-0 rounded-xl border border-zinc-200 object-cover dark:border-zinc-700"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-400 dark:border-zinc-700">
              Aucun
            </span>
          )}
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileChange}
            className={`${FIELD_CLASSES} file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium dark:file:bg-zinc-800`}
          />
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          PNG, JPG ou WEBP, 2 Mo maximum. Laissez vide pour ne pas changer le logo actuel.
        </span>
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
