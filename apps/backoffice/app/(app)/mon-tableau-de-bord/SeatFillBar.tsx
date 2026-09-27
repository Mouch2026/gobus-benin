// Présentation pure — aucune dépendance nouvelle, une simple barre
// Tailwind. Seuil "presque complet" arbitraire (10 % de places
// restantes), à corriger si besoin.
const NEARLY_FULL_THRESHOLD_RATIO = 0.1;

export function SeatFillBar({ availableSeats, totalSeats }: { availableSeats: number; totalSeats: number }) {
  const filledRatio = totalSeats > 0 ? (totalSeats - availableSeats) / totalSeats : 0;
  const remainingRatio = totalSeats > 0 ? availableSeats / totalSeats : 0;
  const isFull = availableSeats <= 0;
  const isNearlyFull = !isFull && remainingRatio < NEARLY_FULL_THRESHOLD_RATIO;

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full ${isFull ? "bg-red-500" : isNearlyFull ? "bg-amber-500" : "bg-zinc-950"}`}
          style={{ width: `${Math.min(100, Math.round(filledRatio * 100))}%` }}
        />
      </div>
      <span className="text-xs text-zinc-500">
        {availableSeats}/{totalSeats} places
      </span>
      {isFull ? (
        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
          Complet
        </span>
      ) : isNearlyFull ? (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
          Presque complet
        </span>
      ) : null}
    </div>
  );
}
