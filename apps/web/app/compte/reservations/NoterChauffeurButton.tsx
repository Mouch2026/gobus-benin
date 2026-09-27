"use client";

import { useActionState, useState } from "react";
import { submitDriverRating, type SubmitDriverRatingState } from "./submitDriverRatingAction";

const initialState: SubmitDriverRatingState = { error: null, success: false };

// Même patron que CancelBookingButton.tsx : bouton simple → formulaire
// déplié → confirmation, avec bookingId en champ caché et
// useActionState. L'éligibilité affichée (voir isEligibleForRating,
// page.tsx) n'est qu'un confort d'UI ; submit_driver_rating() revérifie
// tout elle-même.
export function NoterChauffeurButton({ bookingId }: { bookingId: string }) {
  const [state, formAction, pending] = useActionState(submitDriverRating, initialState);
  const [opening, setOpening] = useState(false);
  const [stars, setStars] = useState(0);

  if (state.success) {
    return (
      <p
        className="self-start rounded-xl border border-border bg-surface px-4 py-2 text-sm text-foreground"
        role="status"
      >
        Merci pour votre avis !
      </p>
    );
  }

  if (!opening) {
    return (
      <button
        type="button"
        onClick={() => setOpening(true)}
        className="self-start text-sm font-semibold text-primary hover:underline"
      >
        Noter mon chauffeur
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-left"
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="stars" value={stars} />

      <div className="flex items-center gap-1" role="radiogroup" aria-label="Note de 1 à 5 étoiles">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStars(value)}
            aria-label={`${value} étoile${value > 1 ? "s" : ""}`}
            aria-pressed={stars === value}
            className="text-2xl leading-none"
          >
            <span className={stars >= value ? "text-primary" : "text-muted"}>★</span>
          </button>
        ))}
      </div>

      <textarea
        name="comment"
        placeholder="Un commentaire (optionnel)"
        rows={3}
        className="rounded-lg border border-border bg-background p-3 text-sm text-foreground"
      />

      {state.error ? (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || stars === 0}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Envoi..." : "Envoyer"}
        </button>
        <button
          type="button"
          onClick={() => setOpening(false)}
          disabled={pending}
          className="text-sm font-semibold text-muted hover:text-foreground"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
