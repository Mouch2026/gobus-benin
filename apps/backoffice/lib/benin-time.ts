import "server-only";

// Africa/Porto-Novo est UTC+1 fixe (jamais de changement d'heure) — un
// décalage explicite, jamais Date.prototype.setUTCHours() (minuit UTC,
// pas minuit au Bénin) ni l'heure locale de la machine qui exécute le
// code (qui n'a aucune raison d'être au Bénin). Même philosophie que
// scripts/seed.ts (tomorrowAt8amBenin) : ancrer via un offset ISO
// explicite (+01:00), jamais via les méthodes locales de Date.
//
// Centralisé ici plutôt que dupliqué (sélecteur de période du Dashboard
// ET Route Handler d'export l'utilisent tous les deux pour "aujourd'hui")
// — exactement pour éviter qu'un des deux soit corrigé sans l'autre.
// Décale "maintenant" de +1h avant de lire sa date calendaire : au Bénin
// (UTC+1), la date du jour peut déjà avoir changé alors qu'elle ne l'a
// pas encore en UTC (ex. 23:30 UTC = 00:30 le lendemain au Bénin) — lire
// la date UTC de l'instant décalé donne la bonne date calendaire
// béninoise ("AAAA-MM-JJ").
export function getBeninDateString(): string {
  const now = new Date();
  const beninNow = new Date(now.getTime() + 60 * 60 * 1000);
  return beninNow.toISOString().slice(0, 10);
}

export function getBeninMidnightToday(): Date {
  // Note : `.toISOString().slice(0, 10)` sur le Date renvoyé ici donnerait
  // la date UTC de cet instant (la veille, puisque minuit béninois = 23h
  // UTC la veille) — jamais utiliser ça pour retrouver la date
  // calendaire béninoise, toujours getBeninDateString() à la place.
  return new Date(`${getBeninDateString()}T00:00:00+01:00`);
}

// Même décalage explicite (+1h) que getBeninDateString() ci-dessus,
// lu jusqu'aux minutes plutôt que tronqué à la date — pour l'horloge de
// la topbar back-office (_live-clock.tsx interroge /heure-benin, qui
// appelle cette fonction, plutôt que de dupliquer ce calcul côté client).
export function getBeninTimeString(): string {
  const now = new Date();
  const beninNow = new Date(now.getTime() + 60 * 60 * 1000);
  return beninNow.toISOString().slice(11, 16);
}
