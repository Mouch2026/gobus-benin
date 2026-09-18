"use client";

import { useActionState } from "react";
import { formatFcfa } from "shared";
import { FIELD_CLASSES, LABEL_CLASSES } from "../../_shared";
import { closeSession, type CloseSessionState } from "./actions";

const initialState: CloseSessionState = { error: null, ecartFcfa: null, soldeTheoriqueFcfa: null };

// Un seul champ, aucun solde théorique affiché nulle part sur cet écran
// — c'est ce qui rend la réconciliation aveugle réelle. L'écart n'est
// révélé qu'après soumission, dans state.ecartFcfa/soldeTheoriqueFcfa,
// jamais avant (voir cloture/actions.ts).
export function CloseSessionForm() {
  const [state, action, pending] = useActionState(closeSession, initialState);

  if (state.ecartFcfa !== null) {
    const isBalanced = state.ecartFcfa === 0;
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Session clôturée</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Solde théorique attendu par le système : {formatFcfa(state.soldeTheoriqueFcfa ?? 0)}
        </p>
        <p
          className={`text-xl font-bold ${
            isBalanced
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {isBalanced
            ? "Aucun écart."
            : `Écart : ${state.ecartFcfa! > 0 ? "+" : ""}${formatFcfa(state.ecartFcfa!)}`}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <label htmlFor="montantCompteFcfa" className={LABEL_CLASSES}>
        Montant réellement compté dans le tiroir (FCFA)
      </label>
      <input
        id="montantCompteFcfa"
        name="montantCompteFcfa"
        type="number"
        min={0}
        required
        className={FIELD_CLASSES}
      />
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
        {pending ? "Clôture..." : "Clôturer la session"}
      </button>
    </form>
  );
}
