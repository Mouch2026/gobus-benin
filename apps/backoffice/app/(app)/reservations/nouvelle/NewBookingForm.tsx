"use client";

import { useState, useActionState } from "react";
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
  seatLabels: string[];
  occupiedSeats: string[];
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
  const [tripId, setTripId] = useState(trips[0]?.id ?? "");
  const [seatAssignments, setSeatAssignments] = useState<Record<number, string>>({});
  const [paymentMode, setPaymentMode] = useState<"link" | "received">("link");

  const selectedTrip = trips.find((trip) => trip.id === tripId);
  const seatLabels = selectedTrip?.seatLabels ?? [];
  const occupiedSet = new Set(selectedTrip?.occupiedSeats ?? []);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="tripId" className={LABEL_CLASSES}>
          Trajet
        </label>
        <select
          id="tripId"
          name="tripId"
          required
          value={tripId}
          onChange={(e) => {
            setTripId(e.target.value);
            // Un plan de bus différent rend les sièges déjà choisis dénués
            // de sens — on repart d'une attribution automatique.
            setSeatAssignments({});
          }}
          className={FIELD_CLASSES}
        >
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
          {paymentMode === "link"
            ? "Un lien de paiement sécurisé lui sera envoyé à cette adresse — aucun compte ni mot de passe à connaître de son côté."
            : "Sert à créer son compte et à lui envoyer la confirmation — aucun mot de passe à connaître de son côté."}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className={LABEL_CLASSES}>
          Téléphone de contact
        </label>
        <input id="phone" name="phone" type="tel" required className={FIELD_CLASSES} />
      </div>

      <div className="flex flex-col gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
          Passager(s) — laissez vide si inutilisé
        </h3>
        {Array.from({ length: MAX_PASSENGERS }, (_, i) => {
          const chosenByOtherRows = new Set(
            Object.entries(seatAssignments)
              .filter(([idx]) => Number(idx) !== i)
              .map(([, seat]) => seat)
          );

          return (
            <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
              <div className="flex flex-col gap-1.5">
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
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`seatNumber-${i}`} className={LABEL_CLASSES}>
                  Siège
                </label>
                <select
                  id={`seatNumber-${i}`}
                  name={`seatNumber-${i}`}
                  value={seatAssignments[i] ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSeatAssignments((prev) => {
                      const next = { ...prev };
                      if (value) {
                        next[i] = value;
                      } else {
                        delete next[i];
                      }
                      return next;
                    });
                  }}
                  className={FIELD_CLASSES}
                >
                  <option value="">Attribution automatique</option>
                  {seatLabels.map((seat) => {
                    const takenElsewhere = occupiedSet.has(seat) || chosenByOtherRows.has(seat);
                    return (
                      <option key={seat} value={seat} disabled={takenElsewhere}>
                        {seat}
                        {occupiedSet.has(seat)
                          ? " (occupé)"
                          : chosenByOtherRows.has(seat)
                            ? " (déjà choisi)"
                            : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Paiement</h3>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name="paymentMode"
            value="link"
            checked={paymentMode === "link"}
            onChange={() => setPaymentMode("link")}
          />
          Envoyer un lien de paiement
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="radio"
            name="paymentMode"
            value="received"
            checked={paymentMode === "received"}
            onChange={() => setPaymentMode("received")}
          />
          Paiement déjà reçu (espèces ou carte)
        </label>
        {paymentMode === "received" ? (
          <div className="flex flex-col gap-1.5 pl-6">
            <label htmlFor="receivedMethod" className={LABEL_CLASSES}>
              Moyen de paiement
            </label>
            <select
              id="receivedMethod"
              name="receivedMethod"
              defaultValue="cash"
              className={FIELD_CLASSES}
            >
              <option value="cash">Espèces</option>
              <option value="card">Carte bancaire</option>
            </select>
          </div>
        ) : null}
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
        {pending
          ? "Création..."
          : paymentMode === "link"
            ? "Créer la réservation et envoyer le lien"
            : "Créer la réservation et confirmer"}
      </button>
    </form>
  );
}
