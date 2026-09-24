export const SEAT_CLASS_LABELS: Record<string, string> = {
  standard: "Standard",
  vip: "VIP",
};

export const STATUS_LABELS: Record<string, string> = {
  scheduled: "Programmé",
  in_progress: "En cours",
  completed: "Terminé",
  cancelled: "Annulé",
};

export const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_progress: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
};

// Distinct from STATUS_LABELS/STATUS_STYLES above, which describe a
// trip's status — bookings have their own, different set of status values.
export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  confirmed: "Confirmée",
  cancelled: "Annulée",
  completed: "Terminée",
};

export const BOOKING_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  confirmed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  completed: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

// Distinct from STATUS_LABELS/BOOKING_STATUS_LABELS above — a payment has
// its own, different set of status values (voucher_issued has no
// equivalent on trips/bookings).
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  // Part d'un paiement scindé : reçue, mais la somme des parts n'atteint
  // pas encore total_price_fcfa (voir record_payment_part_received) —
  // distinct de "approved", jamais confondu avec un paiement complet.
  received: "Reçu (paiement scindé, en attente du reste)",
  approved: "Approuvé",
  failed: "Échoué",
  refunded: "Remboursé",
  voucher_issued: "Avoir émis",
};

export const PAYMENT_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  received: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  approved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  refunded: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  voucher_issued: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
};

// Distinct des 3 maps de statut ci-dessus : c'est un statut AFFICHÉ,
// dérivé (jamais stocké tel quel) — combine bookings.status et le statut
// de l'avoir éventuellement émis pour CETTE réservation.
export type BookingDisplayStatus = "confirmed" | "pending" | "cancelled" | "refunded";

export const BOOKING_DISPLAY_STATUS_LABELS: Record<BookingDisplayStatus, string> = {
  confirmed: "Confirmée",
  pending: "En attente",
  cancelled: "Annulée",
  refunded: "Remboursée",
};

export const BOOKING_DISPLAY_STATUS_STYLES: Record<BookingDisplayStatus, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  refunded: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

// Règle exacte de dérivation (voir le plan du chantier) : bookings.status
// + statut de l'avoir émis pour CETTE réservation (vouchers.origin_booking_id
// est UNIQUE — au plus un avoir par réservation).
// - confirmed OU completed → "confirmed" (vert) : réservation honorée.
// - pending                → "pending" (orange) : paiement en attente.
// - cancelled ET (voucherStatus = 'refund_pending' OU 'refund_processed')
//                          → "refunded" (bleu) : l'avoir n'a jamais été
//   consommé comme crédit, il a fini en remboursement réel/à traiter.
// - cancelled, tout le reste (aucun avoir, ou avoir 'active'/'used')
//                          → "cancelled" (rouge) : annulée, aucun argent
//   réel n'a (encore) quitté le système côté compagnie.
export function deriveBookingDisplayStatus(
  bookingStatus: string,
  voucherStatus: string | null
): BookingDisplayStatus {
  if (bookingStatus === "confirmed" || bookingStatus === "completed") return "confirmed";
  if (bookingStatus === "pending") return "pending";
  if (bookingStatus === "cancelled") {
    return voucherStatus === "refund_pending" || voucherStatus === "refund_processed"
      ? "refunded"
      : "cancelled";
  }
  return "cancelled"; // filet de sécurité — bookings.status est un enum fermé, ne devrait jamais arriver
}

// Niveaux visuels d'une notification (cloche back-office) — pas un statut
// métier comme les maps ci-dessus, un niveau de gravité générique partagé
// par tous les types (présents et futurs).
export const NOTIFICATION_LEVEL_LABELS: Record<string, string> = {
  critical: "Critique",
  warning: "Attention",
  info: "Info",
};

export const NOTIFICATION_LEVEL_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  info: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
};

// Chantier A (chauffeurs) : premier statut DÉRIVÉ d'un intervalle de temps
// plutôt que de colonnes stockées (aucun autre exemple de ce genre dans le
// repo à ce jour) — jamais persisté, recalculé à chaque rendu. "en_mission"
// vient de get_company_drivers_overview (current_trip_id non nul signifie
// qu'un trajet de ce chauffeur a son intervalle [departure_at,
// coalesce(arrival_at, departure_at)] qui couvre now() au moment de la
// requête SQL) — même forme que deriveBookingDisplayStatus (type + fonction
// pure + labels/styles), pas de statut "congé" (chantier B, calendrier de
// disponibilités).
export type DriverDisplayStatus = "en_mission" | "disponible" | "archive";

export function deriveDriverStatus(isActive: boolean, hasCurrentTrip: boolean): DriverDisplayStatus {
  if (!isActive) return "archive";
  return hasCurrentTrip ? "en_mission" : "disponible";
}

export const DRIVER_DISPLAY_STATUS_LABELS: Record<DriverDisplayStatus, string> = {
  en_mission: "En mission",
  disponible: "Disponible",
  archive: "Archivé",
};

export const DRIVER_DISPLAY_STATUS_STYLES: Record<DriverDisplayStatus, string> = {
  en_mission: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  disponible: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  archive: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

// Chantier B (disponibilités) : statut d'UN JOUR sur le calendrier —
// distinct de DriverDisplayStatus ci-dessus (qui décrit l'instant présent
// pour la liste/fiche, jamais "indisponible"). Un jour peut cumuler
// trajet ET indisponibilité déclarée : "conflit" n'est PAS une couleur
// fondue — le calendrier affiche alors deux bandes (occupé + indisponible)
// côte à côte plutôt qu'une troisième couleur ambiguë, ce type ne sert
// qu'à piloter ce choix de rendu.
export type DriverDayStatus = "disponible" | "occupe" | "indisponible" | "conflit";

export function deriveDriverDayStatus(hasTrip: boolean, hasUnavailability: boolean): DriverDayStatus {
  if (hasTrip && hasUnavailability) return "conflit";
  if (hasTrip) return "occupe";
  if (hasUnavailability) return "indisponible";
  return "disponible";
}

export const DRIVER_DAY_STATUS_LABELS: Record<DriverDayStatus, string> = {
  disponible: "Disponible",
  occupe: "Occupé (trajet)",
  indisponible: "Indisponibilité déclarée",
  conflit: "Trajet + indisponibilité",
};

// "conflit" n'a pas de classe de fond unique : rendu en deux bandes
// (voir DayCell dans disponibilites/), ces couleurs pilotent les bandes
// individuelles et la légende, jamais un fond mélangé.
export const DRIVER_DAY_STATUS_STYLES: Record<Exclude<DriverDayStatus, "conflit">, string> = {
  disponible: "bg-emerald-100 dark:bg-emerald-900",
  occupe: "bg-red-200 dark:bg-red-900",
  indisponible: "bg-amber-200 dark:bg-amber-900",
};

export const UNAVAILABILITY_REASON_LABELS: Record<string, string> = {
  conge: "Congé",
  maladie: "Maladie",
  indisponible: "Indisponible",
};

export function formatDepartureDateTime(departureAt: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(departureAt));
}

const fieldClasses =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-950 outline-none transition-colors focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-50";
export const FIELD_CLASSES = fieldClasses;

const labelClasses = "text-sm font-medium text-zinc-700 dark:text-zinc-300";
export const LABEL_CLASSES = labelClasses;
