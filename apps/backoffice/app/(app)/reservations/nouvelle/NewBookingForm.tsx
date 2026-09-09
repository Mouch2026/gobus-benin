"use client";

import { useActionState } from "react";
import { formatFcfa } from "shared";
import { FIELD_CLASSES, LABEL_CLASSES, formatDepartureDateTime } from "../../_shared";
import { createBookingForCustomer, type NewBookingState } from "./actions";

export type BookableTrip = {
  id: string;
  departure_at: string;
  price_fcfa: number;
  available_seats: number;
  total_seats: number;
  routes: { origin_city: string; destination_city: string };
};

const initialState: NewBookingState = { error: null };

// Jusqu'à 6 passagers, champs laissés vides si non utilisés — le nombre
// de places réservées est dérivé du nombre de noms réellement remplis,
// jamais saisi séparément (même garde-fou que create_booking lui-même :
// le nombre de noms doit correspondre au nombre de places).
const MAX_PASSENGERS = 6;

// Patron de formulaire identique à NewTripForm.tsx (trajets/nouveau) :
// useActionState, FIELD_CLASSES/LABEL_CLASSES, une seule erreur affichée,
// redirect() côté serveur en cas de succès.
export function NewBookingForm({ trips }: { trips: BookableTrip[] }) {
  const [state, action, pending] = useActionState(createBookingForCustomer, initialState);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tripId" className={LABEL_CLASSES}>
          Trajet
        </label>
        <select id="tripId" name="tripId" required className={FIELD_CLASSES}>
          {trips.map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.routes.origin_city} → {trip.routes.destination_city} —{" "}
              {formatDepartureDateTime(trip.departure_at)} ({trip.available_seats} places libres,{" "}
              {formatFcfa(trip.price_fcfa)})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className={LABEL_CLASSES}>
          E-mail du client
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="client@exemple.com"
          className={FIELD_CLASSES}
        />
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Un lien de paiement sécurisé lui sera envoyé à cette adresse — aucun compte ni mot de
          passe à connaître de son côté.
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className={LABEL_CLASSES}>
          Téléphone de contact
        </label>
        <input id="phone" name="phone" type="tel" required className={FIELD_CLASSES} />
      </div>

      <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Passager(s) — laissez vide si inutilisé
        </h3>
        {Array.from({ length: MAX_PASSENGERS }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <label htmlFor={`passengerName-${i}`} className={LABEL_CLASSES}>
              Nom du passager {i + 1}
            </label>
            <input
              id={`passengerName-${i}`}
              name="passengerName"
              type="text"
              className={FIELD_CLASSES}
            />
          </div>
        ))}
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
        {pending ? "Création..." : "Créer la réservation et envoyer le lien"}
      </button>
    </form>
  );
}
