"use client";

import { useActionState } from "react";
import { updateTripDetails, updateTripRoute, cancelTrip, type EditTripState } from "./actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "../../_shared";
import { splitDuration } from "@/lib/duration";

const initialState: EditTripState = { error: null };

type Trip = {
  id: string;
  departure_at: string;
  arrival_at: string | null;
  price_fcfa: number;
  total_seats: number;
  available_seats: number;
  status: string;
  bus_layout_id: string;
  bus_number: string;
  routes: {
    origin_city: string;
    destination_city: string;
    distance_km: number | null;
    line_number: string | null;
  };
};

export function EditTripForm({ trip }: { trip: Trip }) {
  const [detailsState, detailsAction, detailsPending] = useActionState(
    updateTripDetails,
    initialState
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(cancelTrip, initialState);
  const [routeState, routeAction, routePending] = useActionState(updateTripRoute, initialState);

  const booked = trip.total_seats - trip.available_seats;
  const canCancel = trip.status !== "cancelled" && trip.status !== "completed";
  const currentDuration = splitDuration(trip.departure_at, trip.arrival_at);

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
          <label htmlFor="busNumber" className={LABEL_CLASSES}>
            Numéro de bus
          </label>
          <input
            id="busNumber"
            name="busNumber"
            type="text"
            required
            defaultValue={trip.bus_number}
            className={FIELD_CLASSES}
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Modifiable tant que le trajet n&apos;est pas parti (panne, réaffectation de flotte).
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="durationHours" className={LABEL_CLASSES}>
              Durée estimée — heures (optionnel)
            </label>
            <input
              id="durationHours"
              name="durationHours"
              type="number"
              min={0}
              defaultValue={currentDuration.hours}
              className={FIELD_CLASSES}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="durationMinutes" className={LABEL_CLASSES}>
              Durée estimée — minutes (optionnel)
            </label>
            <input
              id="durationMinutes"
              name="durationMinutes"
              type="number"
              min={0}
              max={59}
              defaultValue={currentDuration.minutes}
              className={FIELD_CLASSES}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="totalSeats" className={LABEL_CLASSES}>
            Nombre total de places
          </label>
          {/* bus_layout_id est désormais obligatoire sur tout trajet (NOT
              NULL) : toujours dérivé du plan de bus, jamais saisi
              manuellement — l'ancienne branche "sans plan" est devenue
              inatteignable et a été retirée. */}
          <input type="hidden" name="totalSeats" value={trip.total_seats} />
          <p className={FIELD_CLASSES}>{trip.total_seats} (dérivé du plan de bus)</p>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {booked} place{booked > 1 ? "s" : ""} déjà réservée{booked > 1 ? "s" : ""} — dérivé du
            plan de bus choisi, non modifiable ici.
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
        <h3 className="mb-3 text-sm font-semibold text-zinc-950 dark:text-zinc-50">Route</h3>
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Ces informations sont partagées avec tous les trajets utilisant cette route — la
          modification s&apos;appliquera à chacun d&apos;eux.
        </p>
        <form action={routeAction} className="flex flex-col gap-4">
          <input type="hidden" name="tripId" value={trip.id} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="originCity" className={LABEL_CLASSES}>
                Départ
              </label>
              <input
                id="originCity"
                name="originCity"
                type="text"
                required
                defaultValue={trip.routes.origin_city}
                className={FIELD_CLASSES}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="destinationCity" className={LABEL_CLASSES}>
                Arrivée
              </label>
              <input
                id="destinationCity"
                name="destinationCity"
                type="text"
                required
                defaultValue={trip.routes.destination_city}
                className={FIELD_CLASSES}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="distanceKm" className={LABEL_CLASSES}>
                Distance (km, optionnel)
              </label>
              <input
                id="distanceKm"
                name="distanceKm"
                type="number"
                min={1}
                defaultValue={trip.routes.distance_km ?? ""}
                className={FIELD_CLASSES}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="lineNumber" className={LABEL_CLASSES}>
                Numéro de ligne (optionnel)
              </label>
              <input
                id="lineNumber"
                name="lineNumber"
                type="text"
                defaultValue={trip.routes.line_number ?? ""}
                className={FIELD_CLASSES}
              />
            </div>
          </div>

          {routeState.error ? (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {routeState.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={routePending}
            className="self-start rounded-lg border border-zinc-300 px-4 py-2.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {routePending ? "Enregistrement..." : "Enregistrer la route"}
          </button>
        </form>
      </div>

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
