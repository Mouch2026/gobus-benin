"use client";

import { useActionState } from "react";
import { setPromoCodeActive, type ToggleActiveState } from "./actions";

const initialState: ToggleActiveState = { error: null, success: false };

export function PromoCodeToggleButton({
  promoCodeId,
  isActive,
}: {
  promoCodeId: string;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState(setPromoCodeActive, initialState);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-1.5">
      <input type="hidden" name="promoCodeId" value={promoCodeId} />
      <input type="hidden" name="isActive" value={isActive ? "0" : "1"} />
      {state.error ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {pending ? "…" : isActive ? "Désactiver" : "Réactiver"}
      </button>
    </form>
  );
}
