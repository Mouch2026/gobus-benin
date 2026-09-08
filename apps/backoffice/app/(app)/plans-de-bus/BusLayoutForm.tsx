"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createBusLayout, type BusLayoutFormState } from "./actions";
import { FIELD_CLASSES, LABEL_CLASSES } from "../_shared";

const initialState: BusLayoutFormState = { error: null };

type SeatEntry = { id: number; value: string };

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Rangée + lettre (1A,1B,1C,1D,2A,...) — schéma fixe, cohérent avec celui
// déjà utilisé partout ailleurs dans ce projet. Bus réels ≤ 26 sièges par
// rangée (LETTERS.length) : au-delà, le champ "sièges par rangée" ne doit
// simplement pas être poussé plus loin, pas de gestion AA/AB.
function generateSeatLabels(rows: number, seatsPerRow: number): string[] {
  const labels: string[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let seat = 0; seat < seatsPerRow; seat++) {
      labels.push(`${row}${LETTERS[seat] ?? "?"}`);
    }
  }
  return labels;
}

export function BusLayoutForm() {
  const [state, formAction, pending] = useActionState(createBusLayout, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);
  const nextId = useRef(0);

  const [rows, setRows] = useState("10");
  const [seatsPerRow, setSeatsPerRow] = useState("4");
  const [seats, setSeats] = useState<SeatEntry[]>([]);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset();
      setSeats([]);
    }
    wasPending.current = pending;
  }, [pending, state]);

  function handleGenerate() {
    const rowsCount = Number(rows);
    const seatsPerRowCount = Number(seatsPerRow);
    if (!Number.isInteger(rowsCount) || rowsCount <= 0) return;
    if (!Number.isInteger(seatsPerRowCount) || seatsPerRowCount <= 0 || seatsPerRowCount > LETTERS.length) return;

    setSeats(
      generateSeatLabels(rowsCount, seatsPerRowCount).map((value) => ({ id: nextId.current++, value }))
    );
  }

  function renameSeat(id: number, value: string) {
    setSeats((current) => current.map((seat) => (seat.id === id ? { ...seat, value } : seat)));
  }

  function removeSeat(id: number) {
    setSeats((current) => current.filter((seat) => seat.id !== id));
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className={LABEL_CLASSES}>
          Nom du plan
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="Bus 40 places"
          className={FIELD_CLASSES}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rows" className={LABEL_CLASSES}>
            Nombre de rangées
          </label>
          <input
            id="rows"
            type="number"
            min={1}
            value={rows}
            onChange={(event) => setRows(event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="seatsPerRow" className={LABEL_CLASSES}>
            Sièges par rangée
          </label>
          <input
            id="seatsPerRow"
            type="number"
            min={1}
            max={LETTERS.length}
            value={seatsPerRow}
            onChange={(event) => setSeatsPerRow(event.target.value)}
            className={FIELD_CLASSES}
          />
        </div>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Utilisez si possible les mêmes numéros déjà peints ou collés sur les sièges de votre bus —
        pas une nouvelle numérotation que vos passagers ne reconnaîtront pas à bord.
      </p>

      <button
        type="button"
        onClick={handleGenerate}
        className="self-start rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        Générer
      </button>

      {seats.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className={LABEL_CLASSES}>
            Sièges générés ({seats.length}) — renommez ou retirez un siège avant de créer le plan
          </span>
          <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-zinc-200 p-3 sm:grid-cols-3 dark:border-zinc-800">
            {seats.map((seat) => (
              <div key={seat.id} className="flex items-center gap-1">
                <input
                  type="hidden"
                  name="seatLabels"
                  value={seat.value}
                />
                <input
                  type="text"
                  value={seat.value}
                  onChange={(event) => renameSeat(seat.id, event.target.value)}
                  className={`${FIELD_CLASSES} !py-1 text-sm`}
                  aria-label={`Libellé du siège ${seat.value}`}
                />
                <button
                  type="button"
                  onClick={() => removeSeat(seat.id)}
                  aria-label={`Retirer le siège ${seat.value}`}
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || seats.length === 0}
        className="self-start rounded-lg bg-zinc-950 px-4 py-2.5 font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
      >
        {pending ? "Création..." : "Créer le plan"}
      </button>
    </form>
  );
}
