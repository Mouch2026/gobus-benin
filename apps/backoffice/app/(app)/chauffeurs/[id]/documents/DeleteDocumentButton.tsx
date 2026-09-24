"use client";

import { useActionState } from "react";
import { deleteDriverDocument, type DocumentFormState } from "../../documentActions";

const initialState: DocumentFormState = { error: null, success: false };

export function DeleteDocumentButton({ driverId, documentId }: { driverId: string; documentId: string }) {
  const [state, formAction, pending] = useActionState(deleteDriverDocument, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="driverId" value={driverId} />
      <input type="hidden" name="documentId" value={documentId} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!window.confirm("Supprimer définitivement ce document ? Le fichier sera effacé.")) {
            e.preventDefault();
          }
        }}
        className="text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400"
      >
        {pending ? "…" : "Supprimer"}
      </button>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
