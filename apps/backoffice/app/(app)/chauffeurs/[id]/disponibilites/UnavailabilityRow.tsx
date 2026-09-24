"use client";

import { useActionState, useState } from "react";
import { FIELD_CLASSES, LABEL_CLASSES, UNAVAILABILITY_REASON_LABELS } from "../../../_shared";
import {
  updateDriverUnavailability,
  deleteDriverUnavailability,
  type EditUnavailabilityState,
} from "../../unavailabilityActions";

const initialState: EditUnavailabilityState = { error: null, success: false };

type Period = { id: string; reason: string; startDate: string; endDate: string };

export function UnavailabilityRow({
  driverId,
  period,
  canManage,
}: {
  driverId: string;
  period: Period;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction, editPending] = useActionState(updateDriverUnavailability, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteDriverUnavailability, initialState);

  if (editing) {
    return (
      <li className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <form action={editAction} className="flex flex-col gap-3">
          <input type="hidden" name="unavailabilityId" value={period.id} />
          <input type="hidden" name="driverId" value={driverId} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className={LABEL_CLASSES}>Du</label>
              <input name="startDate" type="date" required defaultValue={period.startDate} className={FIELD_CLASSES} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={LABEL_CLASSES}>Au</label>
              <input name="endDate" type="date" required defaultValue={period.endDate} className={FIELD_CLASSES} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={LABEL_CLASSES}>Motif</label>
              <select name="reason" required defaultValue={period.reason} className={FIELD_CLASSES}>
                {Object.entries(UNAVAILABILITY_REASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {editState.error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {editState.error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={editPending}
              className="rounded-lg bg-zinc-950 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {editPending ? "Enregistrement..." : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Annuler
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-sm text-zinc-950 dark:text-zinc-50">
        {UNAVAILABILITY_REASON_LABELS[period.reason] ?? period.reason} — du {period.startDate} au {period.endDate}
      </span>
      {canManage ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-zinc-700 hover:underline dark:text-zinc-300"
          >
            Modifier
          </button>
          <form action={deleteAction}>
            <input type="hidden" name="unavailabilityId" value={period.id} />
            <input type="hidden" name="driverId" value={driverId} />
            <button
              type="submit"
              disabled={deletePending}
              onClick={(e) => {
                if (!window.confirm("Supprimer cette période d'indisponibilité ?")) {
                  e.preventDefault();
                }
              }}
              className="text-xs font-medium text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400"
            >
              {deletePending ? "…" : "Supprimer"}
            </button>
          </form>
        </div>
      ) : null}
      {deleteState.error ? (
        <span className="w-full text-xs text-red-600 dark:text-red-400">{deleteState.error}</span>
      ) : null}
    </li>
  );
}
