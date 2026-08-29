"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "@/lib/supabase";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PinIcon,
  SearchIcon,
  SwapIcon,
  UsersIcon,
} from "@/lib/icons";

const MAX_PASSENGERS = 9;

function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function fetchDestinationCities(origin: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("routes")
    .select("destination_city")
    .eq("origin_city", origin)
    .order("destination_city");

  if (error) {
    console.error("Impossible de charger les destinations :", error.message);
    return [];
  }

  return Array.from(new Set(data.map((route) => route.destination_city)));
}

export function SearchWidget({
  originCities,
  defaultOrigin,
  initialDestinationCities,
  today,
}: {
  originCities: string[];
  defaultOrigin: string;
  initialDestinationCities: string[];
  today: string;
}) {
  const [tripType, setTripType] = useState<"one-way" | "round-trip">("one-way");
  const [origin, setOrigin] = useState(defaultOrigin);
  const [destination, setDestination] = useState("");
  const [destinationCities, setDestinationCities] = useState(initialDestinationCities);
  const [date, setDate] = useState(today);
  const [returnDate, setReturnDate] = useState(today);
  const [passengers, setPassengers] = useState(1);

  // A return date earlier than the (possibly just-changed) departure date is
  // never valid — bump it forward to match rather than leaving it stale or
  // forcing the user to re-pick from scratch every time Départ moves.
  useEffect(() => {
    setReturnDate((current) => (current < date ? date : current));
  }, [date]);

  // Skip the very first run: the initial destination list was already
  // fetched server-side for `defaultOrigin` and passed in as a prop — this
  // effect is only for re-fetching when the user actually changes origin
  // (including via the swap button).
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    let cancelled = false;

    fetchDestinationCities(origin).then((cities) => {
      if (cancelled) return;
      setDestinationCities(cities);
      setDestination((current) => (cities.includes(current) ? current : ""));
    });

    return () => {
      cancelled = true;
    };
  }, [origin]);

  const hasDestinations = destinationCities.length > 0;
  const hasOrigins = originCities.length > 0;

  function handleSwap() {
    if (!destination) return; // nothing to swap into
    const previousOrigin = origin;
    setOrigin(destination);
    setDestination(previousOrigin);
  }

  function handlePassengersChange(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    const clamped = Number.isNaN(value) ? 1 : Math.min(Math.max(value, 1), MAX_PASSENGERS);
    setPassengers(clamped);
  }

  const isAtMinDate = date <= today;

  // Grid layout notes (no headless browser available to eyeball this, so
  // the exact tracks are spelled out here):
  //
  // - <sm (mobile): both row groups collapse to grid-cols-1 — every field
  //   stacks full-width in one column, Bouton included. Safest fallback,
  //   never a squeeze.
  // - sm–lg (tablet, two rows): row 1 (De/À/Départ[/Retour]) is an equal
  //   3- or 4-column grid; row 2 (Passagers/Bouton) is an even 2-column
  //   grid. Two clean rows, not one cramped one.
  // - ≥lg (desktop, single row): both row-group wrappers become
  //   `display: contents` (they stop generating a box and hand their
  //   children straight to the <form>, which switches to `grid` at this
  //   breakpoint), so all fields + the button share ONE row. The button's
  //   track is a fixed 11.5rem in both trip types — it shares the leftover
  //   space with the `fr` columns but never gives any of its own up. The
  //   `fr` weights are lower per field in round-trip (6 tracks) than
  //   one-way (5 tracks), so adding Retour narrows every field a bit
  //   instead of leaving them all as wide as before and pushing Bouton
  //   out. At a 768px-wide card (this widget's max width):
  //     one-way:     De 172px · À 172px · Départ 135px · Pax 105px · Bouton 184px
  //     round-trip:  De 138px · À 138px · Départ 112px · Retour 112px · Pax 85px · Bouton 184px
  const rowOneGridCols = tripType === "round-trip" ? "sm:grid-cols-4" : "sm:grid-cols-3";
  const desktopGridCols =
    tripType === "round-trip"
      ? "lg:grid-cols-[1.05fr_1.05fr_0.85fr_0.85fr_0.65fr_11.5rem]"
      : "lg:grid-cols-[1.15fr_1.15fr_0.9fr_0.7fr_11.5rem]";
  const dateFieldDivider = tripType === "round-trip" ? "border-b border-border sm:border-b-0 sm:border-r" : "";

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 p-1">
        <button
          type="button"
          onClick={() => setTripType("one-way")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            tripType === "one-way"
              ? "bg-primary text-primary-foreground"
              : "text-on-ink-muted hover:text-on-ink"
          }`}
        >
          Aller simple
        </button>
        <button
          type="button"
          onClick={() => setTripType("round-trip")}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            tripType === "round-trip"
              ? "bg-primary text-primary-foreground"
              : "text-on-ink-muted hover:text-on-ink"
          }`}
        >
          Aller-retour
        </button>
      </div>

      <form
        action="/recherche"
        method="get"
        className={`grid grid-cols-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_24px_48px_-20px_rgba(0,0,0,0.45)] lg:grid ${desktopGridCols}`}
      >
        {/* Row group 1: De / À / Départ [/ Retour]. Its own grid at sm–lg;
            becomes `contents` at lg so its children join the form's single
            row instead of nesting a grid-inside-a-grid. */}
        <div className={`grid grid-cols-1 ${rowOneGridCols} border-b border-border lg:contents`}>
          <div className="relative flex items-center gap-3 border-b border-border px-5 py-4 text-left sm:border-b-0 sm:border-r">
            <PinIcon className="h-5 w-5 shrink-0 text-muted" />
            <div className="flex flex-1 flex-col">
              <label htmlFor="origin" className="text-xs font-semibold uppercase tracking-wide text-muted">
                Départ
              </label>
              <select
                id="origin"
                name="origin"
                required
                value={origin}
                disabled={!hasOrigins}
                onChange={(event) => setOrigin(event.target.value)}
                className="bg-transparent font-display text-base font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {!hasOrigins ? <option value="">Aucun départ disponible</option> : null}
                {originCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleSwap}
              disabled={!destination}
              aria-label="Échanger le départ et l'arrivée"
              title="Échanger le départ et l'arrivée"
              className="absolute bottom-0 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 sm:top-1/2 sm:right-0 sm:bottom-auto sm:left-auto sm:translate-x-1/2 sm:-translate-y-1/2"
            >
              <SwapIcon className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 border-b border-border px-5 py-4 text-left sm:border-b-0 sm:border-r">
            <PinIcon className="h-5 w-5 shrink-0 text-muted" />
            <div className="flex flex-1 flex-col">
              <label
                htmlFor="destination"
                className="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Arrivée
              </label>
              <select
                id="destination"
                name="destination"
                required
                value={destination}
                disabled={!hasDestinations}
                onChange={(event) => setDestination(event.target.value)}
                className="bg-transparent font-display text-base font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" disabled>
                  {hasDestinations ? "Choisir une ville" : "Aucune destination disponible"}
                </option>
                {destinationCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={`flex items-center gap-2 px-5 py-4 text-left ${dateFieldDivider}`}>
            <CalendarIcon className="h-5 w-5 shrink-0 text-muted" />
            <div className="flex flex-1 flex-col">
              <label htmlFor="date" className="text-xs font-semibold uppercase tracking-wide text-muted">
                Date
              </label>
              <input
                id="date"
                name="date"
                type="date"
                required
                min={today}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="bg-transparent font-display text-base font-semibold text-foreground [color-scheme:light]"
              />
            </div>
            <div className="flex shrink-0 flex-col gap-0.5">
              <button
                type="button"
                onClick={() => setDate((current) => shiftDate(current, -1))}
                disabled={isAtMinDate}
                aria-label="Jour précédent"
                className="flex h-5 w-6 items-center justify-center rounded text-muted transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDate((current) => shiftDate(current, 1))}
                aria-label="Jour suivant"
                className="flex h-5 w-6 items-center justify-center rounded text-muted transition-colors hover:text-foreground"
              >
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {tripType === "round-trip" ? (
            <div className="flex items-center gap-3 px-5 py-4 text-left">
              <CalendarIcon className="h-5 w-5 shrink-0 text-muted" />
              <div className="flex flex-1 flex-col">
                <label
                  htmlFor="returnDate"
                  className="text-xs font-semibold uppercase tracking-wide text-muted"
                >
                  Retour
                </label>
                <input
                  id="returnDate"
                  name="returnDate"
                  type="date"
                  required
                  min={date}
                  value={returnDate}
                  onChange={(event) => setReturnDate(event.target.value)}
                  className="bg-transparent font-display text-base font-semibold text-foreground [color-scheme:light]"
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* Row group 2: Passagers / Bouton. Same `contents`-at-lg trick, so
            at lg the button becomes the form grid's fixed 11.5rem last
            track instead of sharing a 2-column split with Passagers. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:contents">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4 text-left sm:border-b-0 sm:border-r">
            <UsersIcon className="h-5 w-5 shrink-0 text-muted" />
            <div className="flex flex-1 flex-col">
              <label
                htmlFor="passengers"
                className="text-xs font-semibold uppercase tracking-wide text-muted"
              >
                Passagers
              </label>
              <input
                id="passengers"
                name="passengers"
                type="number"
                min={1}
                max={MAX_PASSENGERS}
                value={passengers}
                onChange={handlePassengersChange}
                className="bg-transparent font-display text-base font-semibold text-foreground"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!hasDestinations}
            className="flex items-center justify-center gap-2 whitespace-nowrap bg-primary px-6 py-4 font-display text-base font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <SearchIcon className="h-5 w-5" />
            Rechercher
          </button>
        </div>
      </form>
    </div>
  );
}
