"use client";

import { useActionState } from "react";
import { createTrip, type NewTripState } from "./actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "../../_shared";

const initialState: NewTripState = { error: null };

type RouteOption = {
  id: string;
  origin_city: string;
  destination_city: string;
};

export function NewTripForm({ routes }: { routes: RouteOption[] }) {
  const [state, formAction, pending] = useActionState(createTrip, initialState);
  const today = new Date().toISOString().slice(0, 10); // soft UI hint only — see actions.ts for the real, server-side guarantee

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="routeId" className={LABEL_CLASSES}>
          Route
        </label>
        <select id="routeId" name="routeId" required defaultValue="" className={FIELD_CLASSES}>
          <option value="" disabled>
            Choisir une route
          </option>
          {routes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.origin_city} → {route.destination_city}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="seatClass" className={LABEL_CLASSES}>
          Classe
        </label>
        <select id="seatClass" name="seatClass" required defaultValue="standard" className={FIELD_CLASSES}>
          <option value="standard">Standard</option>
          <option value="vip">VIP</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="departureDate" className={LABEL_CLASSES}>
            Date de départ
          </label>
          <input
            id="departureDate"
            name="departureDate"
            type="date"
            required
            min={today}
            className={FIELD_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="departureTime" className={LABEL_CLASSES}>
            Heure de départ
          </label>
          <input
            id="departureTime"
            name="departureTime"
            type="time"
            required
            className={FIELD_CLASSES}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            min={1}
            required
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
        {pending ? "Création..." : "Créer le trajet"}
      </button>
    </form>
  );
}
