"use client";

import { useActionState, useEffect, useRef } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../../../_shared";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/driverDocuments";
import { uploadDriverDocument, type DocumentFormState } from "../../documentActions";

const initialState: DocumentFormState = { error: null, success: false };

export function UploadDocumentForm({ driverId }: { driverId: string }) {
  const [state, formAction, pending] = useActionState(uploadDriverDocument, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Réinitialisation impérative du formulaire (action DOM, pas un setState) ;
  // le message de succès est dérivé directement de state.success au rendu.
  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="driverId" value={driverId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="docType" className={LABEL_CLASSES}>
            Type de document
          </label>
          <select id="docType" name="type" required defaultValue="permis" className={FIELD_CLASSES}>
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="docExpiration" className={LABEL_CLASSES}>
            Date d&apos;expiration (optionnelle)
          </label>
          <input id="docExpiration" name="expirationDate" type="date" className={FIELD_CLASSES} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="docFile" className={LABEL_CLASSES}>
          Fichier (PDF, PNG, JPG ou WEBP — 5 Mo maximum)
        </label>
        <input
          id="docFile"
          name="file"
          type="file"
          required
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className={FIELD_CLASSES}
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">Document ajouté.</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {pending ? "Envoi en cours..." : "Ajouter le document"}
      </button>
    </form>
  );
}
