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
  approved: "Approuvé",
  failed: "Échoué",
  refunded: "Remboursé",
  voucher_issued: "Avoir émis",
};

export const PAYMENT_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
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
