"use client";

import { useActionState } from "react";
import { FIELD_CLASSES, LABEL_CLASSES } from "../../../_shared";
import { updateBookingDetails, type EditBookingState } from "./actions";

const initialState: EditBookingState = { error: null };

type Booking = {
  id: string;
  phone: string | null;
  passengers: { id: string; full_name: string; seat_number: string | null }[];
};

// Limité exactement à : nom d'un passager, téléphone de contact,
// réassignation de siège — jamais le nombre de places ni le trajet (pas
// de champ pour ça, structurellement impossible via ce formulaire).
export function EditBookingForm({
  booking,
  allSeats,
  takenByOthers,
}: {
  booking: Booking;
  allSeats: string[];
  takenByOthers: string[];
}) {
  const [state, action, pending] = useActionState(updateBookingDetails, initialState);
  const takenSet = new Set(takenByOthers);

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="bookingId" value={booking.id} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className={LABEL_CLASSES}>
          Téléphone de contact
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={booking.phone ?? ""}
          className={FIELD_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Passagers</h3>
        {booking.passengers.map((passenger) => {
          // Un passager peut toujours garder son siège actuel — les
          // options sont : sièges libres (ni pris par un autre, ni par ce
          // passager déjà) + son propre siège actuel en tête de liste.
          const availableSeats = allSeats.filter(
            (seat) => !takenSet.has(seat) || seat === passenger.seat_number
          );

          return (
            <div key={passenger.id} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
              <input type="hidden" name="passengerId" value={passenger.id} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`fullName-${passenger.id}`} className={LABEL_CLASSES}>
                  Nom
                </label>
                <input
                  id={`fullName-${passenger.id}`}
                  name={`fullName-${passenger.id}`}
                  type="text"
                  required
                  defaultValue={passenger.full_name}
                  className={FIELD_CLASSES}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`seatNumber-${passenger.id}`} className={LABEL_CLASSES}>
                  Siège
                </label>
                <select
                  id={`seatNumber-${passenger.id}`}
                  name={`seatNumber-${passenger.id}`}
                  defaultValue={passenger.seat_number ?? ""}
                  className={FIELD_CLASSES}
                >
                  <option value="">Non assigné</option>
                  {availableSeats.map((seat) => (
                    <option key={seat} value={seat}>
                      {seat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
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
        {pending ? "Enregistrement..." : "Enregistrer"}
      </button>
    </form>
  );
}
