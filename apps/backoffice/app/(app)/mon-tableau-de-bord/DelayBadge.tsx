// N'affiche jamais de badge "à l'heure" inventé : un trajet sans
// signalement, ou dont le dernier signalement est à 0 minute (retard
// résorbé), ne montre simplement rien.
export function DelayBadge({ delayMinutes }: { delayMinutes: number | null }) {
  if (!delayMinutes) return null;

  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      Retard signalé : {delayMinutes} min
    </span>
  );
}
