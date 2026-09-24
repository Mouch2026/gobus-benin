// Chantier B (disponibilités) : calcul de grille-mois en Date natif —
// aucune librairie de dates n'existe dans ce repo (vérifié), et le calcul
// (premier jour, nombre de jours, décalage jour-de-semaine) est assez
// simple pour ne pas en justifier une nouvelle. Toutes les dates
// manipulées ici sont de simples chaînes calendaires "AAAA-MM-JJ" (déjà
// converties depuis un timestamptz via getBeninDateStringFor si besoin
// par l'appelant) — ce module ne connaît aucun fuseau horaire, il ne fait
// que de l'arithmétique de calendrier sur des dates déjà résolues.

export type MonthDay = { date: string; dayOfMonth: number; isCurrentMonth: boolean };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateString(year: number, month0: number, day: number): string {
  const d = new Date(Date.UTC(year, month0, day));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// Découpe un mois en semaines de 7 jours (lundi en premier — convention
// calendrier française), avec des jours de padding du mois précédent/
// suivant pour compléter la première et la dernière semaine.
export function buildMonthGrid(monthKey: string): MonthDay[][] {
  const [year, month] = monthKey.split("-").map(Number);
  const month0 = month - 1;
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month0, 1)).getUTCDay() + 6) % 7; // 0=lundi

  const days: MonthDay[] = [];
  for (let i = firstWeekday; i > 0; i--) {
    const d = new Date(Date.UTC(year, month0, 1 - i));
    days.push({ date: toDateString(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), dayOfMonth: d.getUTCDate(), isCurrentMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push({ date: toDateString(year, month0, day), dayOfMonth: day, isCurrentMonth: true });
  }
  let trailing = 1;
  while (days.length % 7 !== 0) {
    const d = new Date(Date.UTC(year, month0 + 1, trailing));
    days.push({ date: toDateString(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), dayOfMonth: d.getUTCDate(), isCurrentMonth: false });
    trailing += 1;
  }

  const weeks: MonthDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

export function allDatesInMonth(monthKey: string): string[] {
  return buildMonthGrid(monthKey)
    .flat()
    .filter((d) => d.isCurrentMonth)
    .map((d) => d.date);
}

export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-BJ", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1))
  );
}

export const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
