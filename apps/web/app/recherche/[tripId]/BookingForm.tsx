"use client";

import { useState, type ChangeEvent } from "react";
import { calculateBookingTotal, formatFcfa } from "shared";

const fieldClasses =
  "rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-muted";

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
      <div className="rounded-2xl border border-border bg-surface p-6 text-muted">
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
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="seatCount" className={labelClasses}>
            Nombre de places
          </label>
          <input
            id="seatCount"
            type="number"
            min={1}
            max={availableSeats}
            value={seatCount}
            onChange={handleSeatCountChange}
            className={fieldClasses}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="passengerName" className={labelClasses}>
            Nom du voyageur
          </label>
          <input
            id="passengerName"
            type="text"
            value={passengerName}
            onChange={(event) => setPassengerName(event.target.value)}
            placeholder="Prénom et nom"
            className={fieldClasses}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className={labelClasses}>
            Téléphone
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+229 ..."
            className={fieldClasses}
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3">
          <span className="text-sm font-semibold text-muted">Prix total</span>
          <span className="font-display text-2xl font-extrabold text-foreground">
            {formatFcfa(totalPriceFcfa)}
          </span>
        </div>

        <button
          type="button"
          disabled={!canContinue}
          onClick={() => setShowPlaceholder(true)}
          className="mt-1 rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continuer vers le paiement
        </button>

        {showPlaceholder ? (
          <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted">
            Le paiement arrive bientôt — cette fonctionnalité n&apos;est pas encore disponible.
          </p>
        ) : null}
      </div>
    </div>
  );
}
