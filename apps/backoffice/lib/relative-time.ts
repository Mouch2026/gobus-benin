// Aucune librairie de dates n'existe dans ce dépôt (ni date-fns, ni dayjs,
// ni luxon) — Intl.RelativeTimeFormat suffit pour ce seul besoin, pas la
// peine d'en ajouter une. Calculé côté serveur uniquement (le panneau de
// la cloche est un Server Component) : jamais évalué côté client, donc
// aucun écart d'hydratation entre le rendu serveur et le premier rendu
// client possible.
const RTF = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

export function formatRelativeTime(isoDate: string): string {
  const diffSeconds = (new Date(isoDate).getTime() - Date.now()) / 1000;

  for (const [unit, secondsInUnit] of UNITS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return RTF.format(Math.round(diffSeconds / secondsInUnit), unit);
    }
  }
  return RTF.format(Math.round(diffSeconds), "second");
}
