"use client";

import { useState, useTransition, useActionState } from "react";
import { formatFcfa } from "shared";
import { FIELD_CLASSES, LABEL_CLASSES, formatDepartureDateTime } from "../../_shared";
import { createBookingForCustomer, lookupCustomer, type CustomerLookupResult, type NewBookingState } from "./actions";

export type BookableTrip = {
  id: string;
  departure_at: string;
  price_fcfa: number;
  available_seats: number;
  total_seats: number;
  routes: {
    origin_city: string;
    destination_city: string;
    origin_station_id: string | null;
    destination_station_id: string | null;
  };
  seatLabels: string[];
  occupiedSeats: string[];
};

type PaymentMode = "mtn_money" | "moov_money" | "card" | "cash";
type PaymentPart = { mode: PaymentMode; amountFcfa: string };

const MODE_LABELS: Record<PaymentMode, string> = {
  mtn_money: "Mobile Money (MTN) — par lien",
  moov_money: "Mobile Money (Moov) — par lien",
  card: "Carte bancaire — par lien",
  cash: "Espèces — reçu immédiatement",
};

const initialState: NewBookingState = { error: null };

// Jusqu'à 6 passagers, champs laissés vides si non utilisés — le nombre
// de places réservées est dérivé du nombre de noms réellement remplis,
// jamais saisi séparément (même garde-fou que create_booking lui-même :
// le nombre de noms doit correspondre au nombre de places).
const MAX_PASSENGERS = 6;
const MAX_PARTS = 4;

function formatVoucherExpiry(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));
}

// Patron de formulaire identique à NewTripForm.tsx (trajets/nouveau) :
// useActionState, FIELD_CLASSES/LABEL_CLASSES, une seule erreur affichée,
// redirect() côté serveur en cas de succès.
export function NewBookingForm({ trips }: { trips: BookableTrip[] }) {
  const [state, action, pending] = useActionState(createBookingForCustomer, initialState);
  const [tripId, setTripId] = useState(trips[0]?.id ?? "");
  const [seatAssignments, setSeatAssignments] = useState<Record<number, string>>({});
  const [passengerNames, setPassengerNames] = useState<string[]>(Array(MAX_PASSENGERS).fill(""));

  const [email, setEmail] = useState("");
  const [lookupResult, setLookupResult] = useState<CustomerLookupResult | null>(null);
  const [isLookingUp, startLookup] = useTransition();
  const [voucherId, setVoucherId] = useState("");
  const [usePoints, setUsePoints] = useState(false);

  const [parts, setParts] = useState<PaymentPart[]>([{ mode: "mtn_money", amountFcfa: "" }]);

  const selectedTrip = trips.find((trip) => trip.id === tripId);
  const seatLabels = selectedTrip?.seatLabels ?? [];
  const occupiedSet = new Set(selectedTrip?.occupiedSeats ?? []);

  const activePassengerCount = passengerNames.filter((n) => n.trim()).length;
  const totalPriceFcfa = (selectedTrip?.price_fcfa ?? 0) * activePassengerCount;
  const partsSum = parts.reduce((sum, p) => sum + (Number(p.amountFcfa) || 0), 0);
  const sumMatches = parts.length > 0 && partsSum === totalPriceFcfa && totalPriceFcfa > 0;

  function syncSinglePartAmount(newTotal: number) {
    setParts((prev) => (prev.length === 1 ? [{ ...prev[0], amountFcfa: newTotal > 0 ? String(newTotal) : "" }] : prev));
  }

  function handleLookup() {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    startLookup(async () => {
      const result = await lookupCustomer(trimmed);
      setLookupResult(result);
      if (!result.existing) {
        setVoucherId("");
        setUsePoints(false);
      }
    });
  }

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
            const trip = trips.find((t) => t.id === e.target.value);
            syncSinglePartAmount((trip?.price_fcfa ?? 0) * activePassengerCount);
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
        <div className="flex gap-2">
          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="client@exemple.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setLookupResult(null);
            }}
            className={FIELD_CLASSES}
          />
          <button
            type="button"
            onClick={handleLookup}
            disabled={isLookingUp || !email.trim().includes("@")}
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {isLookingUp ? "Recherche..." : "Rechercher"}
          </button>
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Sert à créer ou retrouver son compte — aucun mot de passe à connaître de son côté.
        </span>
        {lookupResult ? (
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {lookupResult.existing
              ? "Client déjà connu — avoirs/points ci-dessous si disponibles."
              : "Aucun compte existant — un nouveau compte sera créé."}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className={LABEL_CLASSES}>
          Téléphone de contact
        </label>
        <input id="phone" name="phone" type="tel" required className={FIELD_CLASSES} />
      </div>

      {lookupResult?.existing && (lookupResult.vouchers.length > 0 || lookupResult.pointsBalance > 0) ? (
        <div className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Avoirs et points de ce client
          </h3>
          {lookupResult.vouchers.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="radio"
                  name="voucherId"
                  value=""
                  checked={voucherId === ""}
                  onChange={() => setVoucherId("")}
                />
                Aucun avoir
              </label>
              {lookupResult.vouchers.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="radio"
                    name="voucherId"
                    value={v.id}
                    checked={voucherId === v.id}
                    onChange={() => setVoucherId(v.id)}
                  />
                  {formatFcfa(v.amountFcfa)} — expire le {formatVoucherExpiry(v.expiresAt)}
                </label>
              ))}
            </div>
          ) : null}
          {lookupResult.pointsBalance > 0 ? (
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                name="usePoints"
                value="1"
                checked={usePoints}
                onChange={(e) => setUsePoints(e.target.checked)}
              />
              Utiliser les points GoBus (solde : {lookupResult.pointsBalance} FCFA)
            </label>
          ) : null}
        </div>
      ) : null}

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
                  value={passengerNames[i]}
                  onChange={(e) => {
                    const next = [...passengerNames];
                    next[i] = e.target.value;
                    setPassengerNames(next);
                    const newCount = next.filter((n) => n.trim()).length;
                    syncSinglePartAmount((selectedTrip?.price_fcfa ?? 0) * newCount);
                  }}
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
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Prix total du billet : {formatFcfa(totalPriceFcfa)}. Répartissez ce montant entre un ou
          plusieurs moyens de paiement — la somme doit correspondre exactement.
        </p>

        {parts.map((part, i) => (
          <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_auto]">
            <div className="flex flex-col gap-1.5">
              {i === 0 ? <label className={LABEL_CLASSES}>Moyen de paiement</label> : null}
              <select
                name={`partMode-${i}`}
                value={part.mode}
                onChange={(e) => {
                  const next = [...parts];
                  next[i] = { ...next[i], mode: e.target.value as PaymentMode };
                  setParts(next);
                }}
                className={FIELD_CLASSES}
              >
                {(Object.keys(MODE_LABELS) as PaymentMode[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {MODE_LABELS[mode]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              {i === 0 ? <label className={LABEL_CLASSES}>Montant (FCFA)</label> : null}
              <input
                name={`partAmount-${i}`}
                type="number"
                min={1}
                value={part.amountFcfa}
                onChange={(e) => {
                  const next = [...parts];
                  next[i] = { ...next[i], amountFcfa: e.target.value };
                  setParts(next);
                }}
                className={FIELD_CLASSES}
              />
            </div>
            {parts.length > 1 ? (
              <button
                type="button"
                onClick={() => setParts(parts.filter((_, idx) => idx !== i))}
                className="self-end rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Retirer
              </button>
            ) : null}
          </div>
        ))}

        {parts.length < MAX_PARTS ? (
          <button
            type="button"
            onClick={() => setParts([...parts, { mode: "cash", amountFcfa: "" }])}
            className="self-start text-sm font-medium text-zinc-700 hover:underline dark:text-zinc-300"
          >
            + Ajouter un mode de paiement
          </button>
        ) : null}

        <p className={`text-sm ${sumMatches ? "text-zinc-500 dark:text-zinc-400" : "font-medium text-red-600 dark:text-red-400"}`}>
          Somme des moyens de paiement : {formatFcfa(partsSum)} / {formatFcfa(totalPriceFcfa)}
        </p>
      </div>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !sumMatches}
        className="self-start rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {pending ? "Création..." : "Créer la réservation"}
      </button>
    </form>
  );
}
