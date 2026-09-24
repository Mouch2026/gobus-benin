"use client";

import { useActionState } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../../_shared";
import { setDriverActive, updateDriver, type EditDriverState } from "../actions";

const initialState: EditDriverState = { error: null, success: false };

type Driver = { id: string; full_name: string; phone: string | null; license_number: string | null; is_active: boolean };

export function EditDriverForm({ driver, canManage }: { driver: Driver; canManage: boolean }) {
  const [detailsState, detailsAction, detailsPending] = useActionState(updateDriver, initialState);
  const [activeState, activeAction, activePending] = useActionState(setDriverActive, initialState);

  return (
    <div className="flex flex-col gap-8">
      {!canManage ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Réservé au propriétaire du compte.</p>
      ) : null}

      <form action={detailsAction} className="flex flex-col gap-4">
        <input type="hidden" name="driverId" value={driver.id} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className={LABEL_CLASSES}>
            Nom complet
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            disabled={!canManage}
            defaultValue={driver.full_name}
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
            disabled={!canManage}
            defaultValue={driver.phone ?? ""}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="licenseNumber" className={LABEL_CLASSES}>
            Numéro de permis (optionnel)
          </label>
          <input
            id="licenseNumber"
            name="licenseNumber"
            type="text"
            disabled={!canManage}
            defaultValue={driver.license_number ?? ""}
            className={FIELD_CLASSES}
          />
        </div>

        {detailsState.error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {detailsState.error}
          </p>
        ) : null}
        {detailsState.success ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">Enregistré.</p>
        ) : null}

        <button
          type="submit"
          disabled={!canManage || detailsPending}
          className="self-start rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {detailsPending ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>

      <form
        action={activeAction}
        className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
      >
        <input type="hidden" name="driverId" value={driver.id} />
        <input type="hidden" name="isActive" value={driver.is_active ? "0" : "1"} />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {driver.is_active
            ? "Ce chauffeur est actif. Le désactiver le retire des choix d'affectation sans rien supprimer."
            : "Ce chauffeur est inactif (archivé)."}
        </p>
        {activeState.error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {activeState.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!canManage || activePending}
          className="self-start rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {activePending ? "…" : driver.is_active ? "Désactiver le chauffeur" : "Réactiver le chauffeur"}
        </button>
      </form>
    </div>
  );
}
