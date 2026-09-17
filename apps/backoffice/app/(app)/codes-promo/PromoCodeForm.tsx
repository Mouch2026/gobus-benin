"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";
import { createPromoCode, type PromoCodeFormState } from "./actions";

const initialState: PromoCodeFormState = { error: null };

export function PromoCodeForm() {
  const [state, formAction, pending] = useActionState(createPromoCode, initialState);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">("fixed");
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
      setDiscountType("fixed");
    }
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="code" className={LABEL_CLASSES}>
          Code
        </label>
        <input
          id="code"
          name="code"
          type="text"
          required
          placeholder="BIENVENUE10"
          className={`${FIELD_CLASSES} uppercase`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL_CLASSES}>Type de réduction</span>
        <div className="flex gap-4 text-sm text-zinc-700 dark:text-zinc-300">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="discountType"
              value="fixed"
              checked={discountType === "fixed"}
              onChange={() => setDiscountType("fixed")}
            />
            Montant fixe (FCFA)
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="discountType"
              value="percent"
              checked={discountType === "percent"}
              onChange={() => setDiscountType("percent")}
            />
            Pourcentage
          </label>
        </div>
      </div>

      {discountType === "fixed" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="discountFixedFcfa" className={LABEL_CLASSES}>
            Montant de la réduction (FCFA)
          </label>
          <input
            id="discountFixedFcfa"
            name="discountFixedFcfa"
            type="number"
            min={1}
            required
            className={FIELD_CLASSES}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="discountPercent" className={LABEL_CLASSES}>
            Pourcentage de réduction
          </label>
          <input
            id="discountPercent"
            name="discountPercent"
            type="number"
            min={1}
            max={100}
            required
            className={FIELD_CLASSES}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="startsAt" className={LABEL_CLASSES}>
            Début (facultatif)
          </label>
          <input id="startsAt" name="startsAt" type="datetime-local" className={FIELD_CLASSES} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="endsAt" className={LABEL_CLASSES}>
            Fin (facultatif)
          </label>
          <input id="endsAt" name="endsAt" type="datetime-local" className={FIELD_CLASSES} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="maxUses" className={LABEL_CLASSES}>
            Utilisations max (facultatif)
          </label>
          <input id="maxUses" name="maxUses" type="number" min={1} className={FIELD_CLASSES} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="minPurchaseFcfa" className={LABEL_CLASSES}>
            Achat minimum en FCFA (facultatif)
          </label>
          <input
            id="minPurchaseFcfa"
            name="minPurchaseFcfa"
            type="number"
            min={0}
            className={FIELD_CLASSES}
          />
        </div>
      </div>

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
        {pending ? "Création..." : "Créer le code"}
      </button>
    </form>
  );
}
