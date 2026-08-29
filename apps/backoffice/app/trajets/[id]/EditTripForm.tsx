"use client";

import { useActionState } from "react";
import { updateTripDetails, cancelTrip, type EditTripState } from "./actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "../../_shared";

const initialState: EditTripState = { error: null };

type Trip = {
  id: string;
  price_fcfa: number;
  total_seats: number;
  available_seats: number;
  status: string;
};

export function EditTripForm({ trip }: { trip: Trip }) {
  const [detailsState, detailsAction, detailsPending] = useActionState(
    updateTripDetails,
    initialState
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelTrip, initialState);

  const booked = trip.total_seats - trip.available_seats;
  const canCancel = trip.status !== "cancelled" && trip.status !== "completed";

  return (
    <div className="flex flex-col gap-6">
      <form action={detailsAction} className="flex flex-col gap-4">
        <input type="hidden" name="tripId" value={trip.id} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="priceFcfa" className={LABEL_CLASSES}>
            Prix (FCFA)
          </label>
          <input
            id="priceFcfa"
            name="priceFcfa"
            type="number"
            min={0}
            required
            defaultValue={trip.price_fcfa}
            className={FIELD_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="totalSeats" className={LABEL_CLASSES}>
            Nombre total de places
          </label>
          <input
            id="totalSeats"
            name="totalSeats"
            type="number"
            min={booked > 0 ? booked : 1}
            required
            defaultValue={trip.total_seats}
            className={FIELD_CLASSES}
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {booked} place{booked > 1 ? "s" : ""} déjà réservée{booked > 1 ? "s" : ""} — le nombre
            total ne peut pas descendre en dessous.
          </span>
        </div>

        {detailsState.error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {detailsState.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={detailsPending}
          className="self-start rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {detailsPending ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>

      <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <form action={cancelAction} className="flex flex-col items-start gap-3">
          <input type="hidden" name="tripId" value={trip.id} />

          {cancelState.error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {cancelState.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canCancel || cancelPending}
            className="rounded-lg border border-red-200 px-4 py-2.5 font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            {cancelPending
              ? "Annulation..."
              : canCancel
                ? "Annuler ce trajet"
                : "Trajet déjà terminé ou annulé"}
          </button>
        </form>
      </div>
    </div>
  );
}
