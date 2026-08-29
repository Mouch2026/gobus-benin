"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { calculateBookingTotal, calculatePointsEarned, formatFcfa } from "shared";
import { createBooking, type BookingState } from "./actions";

const fieldClasses =
  "rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-muted";

const initialState: BookingState = { error: null };

export function BookingForm({
  tripId,
  unitPriceFcfa,
  availableSeats,
  isLoggedIn,
  initialSeatCount,
  initialPassengerName,
  initialPhone,
}: {
  tripId: string;
  unitPriceFcfa: number;
  availableSeats: number;
  isLoggedIn: boolean;
  initialSeatCount: number;
  initialPassengerName: string;
  initialPhone: string;
}) {
  const router = useRouter();
  const [seatCount, setSeatCount] = useState(Math.min(initialSeatCount, Math.max(availableSeats, 1)));
  const [passengerName, setPassengerName] = useState(initialPassengerName);
  const [phone, setPhone] = useState(initialPhone);

  const [state, formAction, pending] = useActionState(createBooking, initialState);

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
  const pointsEarned = calculatePointsEarned(totalPriceFcfa);

  function handleSeatCountChange(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    const clamped = Number.isNaN(value) ? 1 : Math.min(Math.max(value, 1), availableSeats);
    setSeatCount(clamped);
  }

  const canContinue = passengerName.trim().length > 0 && phone.trim().length > 0;

  function goToLogin() {
    const params = new URLSearchParams({
      seats: String(seatCount),
      name: passengerName,
      phone,
    });
    router.push(
      `/compte/connexion?next=${encodeURIComponent(`/recherche/${tripId}?${params.toString()}`)}`
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <form action={isLoggedIn ? formAction : undefined} className="flex flex-col gap-4">
        <input type="hidden" name="tripId" value={tripId} />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="seatCount" className={labelClasses}>
            Nombre de places
          </label>
          <input
            id="seatCount"
            name="seatCount"
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
            name="passengerName"
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
            name="phone"
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

        <p className="text-xs text-muted">
          Vous gagnerez <span className="font-semibold text-foreground">{pointsEarned} GoBus Points</span>{" "}
          une fois ce billet payé.
        </p>

        {state.error ? (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        ) : null}

        {isLoggedIn ? (
          <button
            type="submit"
            disabled={!canContinue || pending}
            className="mt-1 rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Réservation en cours..." : "Continuer vers le paiement"}
          </button>
        ) : (
          <button
            type="button"
            disabled={!canContinue}
            onClick={goToLogin}
            className="mt-1 rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Se connecter pour continuer
          </button>
        )}
      </form>
    </div>
  );
}
