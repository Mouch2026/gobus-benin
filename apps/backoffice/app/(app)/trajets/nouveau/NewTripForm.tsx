"use client";

import { useActionState, useState } from "react";
import { createTrip, type NewTripState } from "./actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "../../_shared";

const initialState: NewTripState = { error: null };

type BusLayoutOption = {
  id: string;
  name: string;
  seat_labels: string[];
};

export function NewTripForm({
  cities,
  busLayouts,
}: {
  cities: string[];
  busLayouts: BusLayoutOption[];
}) {
  const [state, formAction, pending] = useActionState(createTrip, initialState);
  const [busLayoutId, setBusLayoutId] = useState("");
  const today = new Date().toISOString().slice(0, 10); // soft UI hint only — see actions.ts for the real, server-side guarantee

  const selectedLayout = busLayouts.find((layout) => layout.id === busLayoutId);
  const totalSeats = selectedLayout?.seat_labels.length;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <datalist id="cities-list">
        {cities.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>

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
            list="cities-list"
            placeholder="Cotonou"
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
            list="cities-list"
            placeholder="Parakou"
            className={FIELD_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="distanceKm" className={LABEL_CLASSES}>
            Distance (km, optionnel)
          </label>
          <input id="distanceKm" name="distanceKm" type="number" min={1} className={FIELD_CLASSES} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lineNumber" className={LABEL_CLASSES}>
            Numéro de ligne (optionnel)
          </label>
          <input id="lineNumber" name="lineNumber" type="text" placeholder="12" className={FIELD_CLASSES} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="busLayoutId" className={LABEL_CLASSES}>
          Plan de bus
        </label>
        <select
          id="busLayoutId"
          name="busLayoutId"
          required
          value={busLayoutId}
          onChange={(event) => setBusLayoutId(event.target.value)}
          className={FIELD_CLASSES}
        >
          <option value="" disabled>
            Choisir un plan de bus
          </option>
          {busLayouts.map((layout) => (
            <option key={layout.id} value={layout.id}>
              {layout.name} ({layout.seat_labels.length} places)
            </option>
          ))}
        </select>
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
          placeholder="12 ou AB-1234-BJ"
          className={FIELD_CLASSES}
        />
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
          <label htmlFor="durationHours" className={LABEL_CLASSES}>
            Durée estimée — heures (optionnel)
          </label>
          <input
            id="durationHours"
            name="durationHours"
            type="number"
            min={0}
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
          {/* Le plan de bus est désormais obligatoire (trips.bus_layout_id
              est NOT NULL) : ce champ est toujours dérivé, jamais saisi
              manuellement. La valeur soumise ici est un simple placeholder
              tant qu'aucun plan n'est encore choisi — le trigger
              set_trip_seats_from_layout la resynchronise toujours depuis le
              plan choisi côté serveur, jamais fait confiance au client. */}
          <input type="hidden" name="totalSeats" value={totalSeats ?? 0} />
          <p className={FIELD_CLASSES}>
            {totalSeats ? `${totalSeats} (dérivé du plan choisi)` : "Choisissez un plan de bus ci-dessus"}
          </p>
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
