"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { setInitialPin, type SetPinState } from "./lock-actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "./_shared";

const initialState: SetPinState = { error: null, success: false };

// Onboarding obligatoire (company_members.pin_hash encore nul) — bloque
// tout le reste du back-office tant qu'aucun PIN n'est défini (voir
// dal.ts::requireCompany, raison "no-pin"). revalidatePath (côté serveur,
// dans setInitialPin) marque seulement le cache Next.js périmé pour la
// PROCHAINE navigation — cet arbre client déjà monté ne se re-rend pas
// tout seul pour autant : sans router.refresh() explicite ici, un succès
// ne changeait visuellement RIEN (vérifié : bug réel trouvé en conditions
// réelles, corrigé ici).
export function SetupPinForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(setInitialPin, initialState);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && state.success) {
      router.refresh();
    }
    wasPending.current = pending;
  }, [pending, state, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Définissez votre code PIN
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            4 à 6 chiffres — utilisé pour déverrouiller rapidement votre poste après une
            inactivité, ou pour laisser un collègue reprendre la main sur ce poste.
          </p>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pin" className={LABEL_CLASSES}>
              Code PIN
            </label>
            <input
              id="pin"
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              minLength={4}
              maxLength={6}
              required
              autoComplete="off"
              className={FIELD_CLASSES}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPin" className={LABEL_CLASSES}>
              Confirmer le code PIN
            </label>
            <input
              id="confirmPin"
              name="confirmPin"
              type="password"
              inputMode="numeric"
              pattern="\d{4,6}"
              minLength={4}
              maxLength={6}
              required
              autoComplete="off"
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
            className="rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {pending ? "Enregistrement..." : "Valider"}
          </button>
        </form>
      </div>
    </div>
  );
}
