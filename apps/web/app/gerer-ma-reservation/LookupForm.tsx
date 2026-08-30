"use client";

import { useActionState } from "react";
import { formatFcfa } from "shared";
import { lookupBooking, type BookingSummary, type LookupState } from "./actions";

const initialState: LookupState = { error: null, booking: null, siblingBooking: null };

const fieldClasses =
  "rounded-xl border border-border bg-background px-3 py-2.5 text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/25";
const labelClasses = "text-xs font-semibold uppercase tracking-wide text-muted";

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente de paiement",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  completed: "Terminée",
};

const LEG_LABELS: Record<string, string> = {
  outbound: "Aller",
  return: "Retour",
};

function formatDepartureDateTime(departureAt: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(departureAt));
}

function BookingCard({ booking }: { booking: BookingSummary }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-4">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground">{booking.booking_reference}</span>
        {booking.leg ? (
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
            {LEG_LABELS[booking.leg] ?? booking.leg}
          </span>
        ) : null}
      </div>
      {booking.trips ? (
        <span className="text-sm text-muted">
          {booking.trips.routes.origin_city} → {booking.trips.routes.destination_city} ·{" "}
          {formatDepartureDateTime(booking.trips.departure_at)}
        </span>
      ) : null}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{STATUS_LABELS[booking.status] ?? booking.status}</span>
        <span className="font-display font-bold text-foreground">
          {formatFcfa(booking.total_price_fcfa)}
        </span>
      </div>
    </div>
  );
}

export function LookupForm() {
  const [state, formAction, pending] = useActionState(lookupBooking, initialState);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reference" className={labelClasses}>
            Référence de réservation
          </label>
          <input
            id="reference"
            name="reference"
            type="text"
            required
            placeholder="GB-XXXXXX"
            className={fieldClasses}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className={labelClasses}>
            Numéro de téléphone du passager
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            placeholder="+229 ..."
            className={fieldClasses}
          />
        </div>

        {state.error ? (
          <p className="text-sm text-red-600" role="alert">
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-xl bg-primary px-4 py-3 font-display font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Recherche..." : "Retrouver ma réservation"}
        </button>
      </form>

      {state.booking ? (
        <div className="flex flex-col gap-3">
          <BookingCard booking={state.booking} />
          {state.siblingBooking ? <BookingCard booking={state.siblingBooking} /> : null}
        </div>
      ) : null}
    </div>
  );
}
