"use client";

import { useActionState } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../../_shared";
import { setAgencyActive, updateAgency, type EditAgencyState } from "../actions";
import type { StationOption } from "../AgenceForm";

const initialState: EditAgencyState = { error: null, success: false };

type Agency = { id: string; name: string; station_id: string; is_active: boolean };

function stationLabel(s: StationOption): string {
  return s.name === s.city ? s.name : `${s.name} — ${s.city}`;
}

export function EditAgenceForm({
  agency,
  stations,
}: {
  agency: Agency;
  stations: StationOption[];
}) {
  const [detailsState, detailsAction, detailsPending] = useActionState(updateAgency, initialState);
  const [activeState, activeAction, activePending] = useActionState(setAgencyActive, initialState);

  return (
    <div className="flex flex-col gap-8">
      <form action={detailsAction} className="flex flex-col gap-4">
        <input type="hidden" name="agencyId" value={agency.id} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className={LABEL_CLASSES}>
            Nom de l&apos;agence
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            defaultValue={agency.name}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="stationId" className={LABEL_CLASSES}>
            Gare
          </label>
          <select
            id="stationId"
            name="stationId"
            required
            defaultValue={agency.station_id}
            className={FIELD_CLASSES}
          >
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {stationLabel(s)}
              </option>
            ))}
          </select>
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
          disabled={detailsPending}
          className="self-start rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {detailsPending ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>

      <form
        action={activeAction}
        className="flex flex-col gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
      >
        <input type="hidden" name="agencyId" value={agency.id} />
        <input type="hidden" name="isActive" value={agency.is_active ? "0" : "1"} />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {agency.is_active
            ? "Cette agence est active. La désactiver la retire des choix sans rien supprimer."
            : "Cette agence est inactive."}
        </p>
        {activeState.error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {activeState.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={activePending}
          className="self-start rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {activePending
            ? "…"
            : agency.is_active
              ? "Désactiver l'agence"
              : "Réactiver l'agence"}
        </button>
      </form>
    </div>
  );
}
