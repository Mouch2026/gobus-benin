"use client";

import { useState, useActionState } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";
import { cancelBooking, type CancelBookingState } from "./actions";

const initialState: CancelBookingState = { error: null };

// Un composant client par ligne, comme VoucherRow (remboursements/RemboursementsTable.tsx) :
// l'état pending/erreur reste scopé à CE bouton, jamais partagé entre lignes.
//
// Chantier 3c : requiresApproval (départ < 2h, agent) déplie un choix
// sur place/à distance au lieu du window.confirm() simple — le serveur
// revalide le délai indépendamment de cette prop, qui ne pilote que
// l'affichage.
export function CancelBookingButton({
  bookingId,
  requiresApproval,
}: {
  bookingId: string;
  requiresApproval: boolean;
}) {
  const [state, action, pending] = useActionState(cancelBooking, initialState);
  const [expanded, setExpanded] = useState(false);
  const [approvalMode, setApprovalMode] = useState<"on_site" | "remote">("on_site");

  if (!requiresApproval) {
    return (
      <form action={action} className="flex flex-col items-start gap-1">
        <input type="hidden" name="bookingId" value={bookingId} />
        <button
          type="submit"
          disabled={pending}
          onClick={(e) => {
            if (!window.confirm("Annuler cette réservation ? Un avoir de 24h sera émis au voyageur.")) {
              e.preventDefault();
            }
          }}
          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
        >
          {pending ? "…" : "Annuler"}
        </button>
        {state.error ? (
          <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span>
        ) : null}
      </form>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
      >
        Annuler…
      </button>
    );
  }

  return (
    <form action={action} className="flex w-64 flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
      <input type="hidden" name="bookingId" value={bookingId} />
      <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
        Départ dans moins de 2h : validation d&apos;un superviseur requise.
      </p>
      <div className="flex flex-col gap-1 text-xs text-amber-900 dark:text-amber-200">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="approvalMode"
            value="on_site"
            checked={approvalMode === "on_site"}
            onChange={() => setApprovalMode("on_site")}
          />
          Sur place (mot de passe superviseur)
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="approvalMode"
            value="remote"
            checked={approvalMode === "remote"}
            onChange={() => setApprovalMode("remote")}
          />
          À distance (envoyer une demande)
        </label>
      </div>
      {approvalMode === "on_site" ? (
        <div className="flex flex-col gap-2">
          <input
            name="supervisorEmail"
            type="email"
            required
            placeholder="E-mail du superviseur"
            className={`${FIELD_CLASSES} text-xs`}
          />
          <input
            name="supervisorPassword"
            type="password"
            required
            placeholder="Mot de passe"
            className={`${FIELD_CLASSES} text-xs`}
          />
        </div>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "…" : approvalMode === "on_site" ? "Valider et annuler" : "Envoyer la demande"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900"
        >
          Annuler
        </button>
      </div>
      {state.error ? <span className="text-xs text-red-600 dark:text-red-400">{state.error}</span> : null}
    </form>
  );
}
