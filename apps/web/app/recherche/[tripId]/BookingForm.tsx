"use client";

import { useState, type ChangeEvent } from "react";
import { calculateBookingTotal, formatFcfa } from "shared";

export function BookingForm({
  unitPriceFcfa,
  availableSeats,
}: {
  unitPriceFcfa: number;
  availableSeats: number;
}) {
  const [seatCount, setSeatCount] = useState(1);
  const [passengerName, setPassengerName] = useState("");
  const [phone, setPhone] = useState("");
  const [showPlaceholder, setShowPlaceholder] = useState(false);

  if (availableSeats < 1) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-6 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
        Ce trajet est complet.
      </div>
    );
  }

  // Aperçu client uniquement — reserve_trip_seats (côté DB) revalide ce
  // total à l'insertion et rejette la réservation si le client ment.
  const totalPriceFcfa = calculateBookingTotal({ unitPriceFcfa, seatCount });

  function handleSeatCountChange(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    const clamped = Number.isNaN(value) ? 1 : Math.min(Math.max(value, 1), availableSeats);
    setSeatCount(clamped);
  }

  const canContinue = passengerName.trim().length > 0 && phone.trim().length > 0;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="seatCount"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Nombre de places
          </label>
          <input
            id="seatCount"
            type="number"
            min={1}
            max={availableSeats}
            value={seatCount}
            onChange={handleSeatCountChange}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="passengerName"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Nom du voyageur
          </label>
          <input
            id="passengerName"
            type="text"
            value={passengerName}
            onChange={(event) => setPassengerName(event.target.value)}
            placeholder="Prénom et nom"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Téléphone
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+229 ..."
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Prix total</span>
          <span className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            {formatFcfa(totalPriceFcfa)}
          </span>
        </div>

        <button
          type="button"
          disabled={!canContinue}
          onClick={() => setShowPlaceholder(true)}
          className="mt-2 rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Continuer vers le paiement
        </button>

        {showPlaceholder ? (
          <p className="rounded-lg bg-zinc-100 p-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            Le paiement arrive bientôt — cette fonctionnalité n&apos;est pas encore disponible.
          </p>
        ) : null}
      </div>
    </div>
  );
}
