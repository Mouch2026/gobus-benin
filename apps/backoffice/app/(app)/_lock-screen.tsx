"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { unlockAsSelf, switchAgent, signOutForgotPin, type UnlockState, type SwitchAgentState } from "./lock-actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "./_shared";

const unlockInitialState: UnlockState = { error: null };
const switchInitialState: SwitchAgentState = { error: null };

// Rendu par layout.tsx à la place du chrome normal quand requireCompany()
// renvoie reason:"locked" — jamais une navigation, donc "retour exact à
// l'écran précédent" est automatique : router.refresh() après succès
// réévalue simplement le MÊME arbre serveur, à la MÊME URL.
export function LockScreen({
  memberName,
  companyName,
}: {
  memberName: string;
  companyName: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"self" | "switch">("self");

  const [unlockState, unlockAction, unlockPending] = useActionState(unlockAsSelf, unlockInitialState);
  const [switchState, switchAction, switchPending] = useActionState(switchAgent, switchInitialState);

  const wasUnlockPending = useRef(false);
  useEffect(() => {
    if (wasUnlockPending.current && !unlockPending && unlockState.error === null) {
      router.refresh();
    }
    wasUnlockPending.current = unlockPending;
  }, [unlockPending, unlockState, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-3xl">🔒</span>
          <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            {companyName} — Verrouillé
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {mode === "self" ? (
              <>
                Verrouillé par <strong>{memberName}</strong>
              </>
            ) : (
              "Un autre agent prend le relais sur ce poste"
            )}
          </p>
        </div>

        {mode === "self" ? (
          <>
            <form action={unlockAction} className="flex flex-col gap-4">
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
                  autoFocus
                  autoComplete="off"
                  className={FIELD_CLASSES}
                />
              </div>

              {unlockState.error ? (
                <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {unlockState.error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={unlockPending}
                className="rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
              >
                {unlockPending ? "Vérification..." : "Déverrouiller"}
              </button>

              <button
                type="button"
                onClick={() => setMode("switch")}
                className="text-sm text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
              >
                Ce n&apos;est pas vous ? Changer d&apos;agent
              </button>
            </form>

            {/* Distinct du changement d'agent : ici on ne connaît AUCUN
                PIN valide (ni le sien, ni celui d'un collègue) — la seule
                sortie est une vraie déconnexion complète, jamais un
                simple déblocage visuel. Formulaire séparé (HTML
                n'autorise pas les <form> imbriqués) — signOutForgotPin
                n'est pas un useActionState, juste une action serveur
                directe, même patron que logout() (app/actions.ts) déjà
                utilisée dans le menu utilisateur normal. */}
            <form action={signOutForgotPin}>
              <button
                type="submit"
                className="text-sm text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
              >
                PIN oublié ? Se déconnecter
              </button>
            </form>
          </>
        ) : (
          <form action={switchAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className={LABEL_CLASSES}>
                Votre email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="username"
                className={FIELD_CLASSES}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="switchPin" className={LABEL_CLASSES}>
                Votre code PIN
              </label>
              <input
                id="switchPin"
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

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              La session de {memberName} sera fermée sur ce poste. Sa caisse, si elle est ouverte,
              n&apos;est pas affectée.
            </p>

            {switchState.error ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {switchState.error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={switchPending}
              className="rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {switchPending ? "Bascule..." : "Prendre le relais"}
            </button>

            <button
              type="button"
              onClick={() => setMode("self")}
              className="text-sm text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
            >
              Retour
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
