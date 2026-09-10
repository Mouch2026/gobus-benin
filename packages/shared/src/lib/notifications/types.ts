// Partagé par tous les canaux (e-mail aujourd'hui, WhatsApp demain) —
// chaque canal reçoit exactement la même forme de données, construite une
// seule fois par buildBookingConfirmationPayload.ts.

export type BookingConfirmationLegPrice = {
  baseAmountFcfa: number;
  platformFeeFcfa: number;
  transactionFeeFcfa: number;
  totalFcfa: number;
  // Avoir éventuellement appliqué à ce paiement (payments.voucher_amount_fcfa)
  // et montant réellement à la charge du voyageur qui en résulte
  // (payments.amount_charged_fcfa) — 0 et totalFcfa respectivement quand
  // aucun avoir n'a été utilisé.
  voucherAppliedFcfa: number;
  amountChargedFcfa: number;
};

export type BookingConfirmationPassenger = {
  fullName: string;
  seatNumber: string | null;
};

export type BookingConfirmationLeg = {
  // null pour un aller simple (une seule leg, pas de distinction à faire).
  legLabel: "Aller" | "Retour" | null;
  bookingReference: string;
  companyId: string;
  companyName: string;
  companyLogoUrl: string | null;
  companyEmail: string | null;
  originCity: string;
  destinationCity: string;
  departureAt: string; // ISO
  arrivalAt: string | null; // ISO
  busNumber: string;
  seatClassLabel: string;
  passengers: BookingConfirmationPassenger[];
  price: BookingConfirmationLegPrice;
};

export type BookingConfirmationPayload = {
  userId: string;
  // Une par leg (1 ou 2) — les legs eux-mêmes n'exposent que
  // bookingReference (texte d'affichage), pas l'UUID ; nécessaire pour
  // journaliser l'envoi dans notification_log sur chaque réservation
  // concernée.
  bookingIds: string[];
  recipientEmail: string;
  phone: string | null;
  legs: BookingConfirmationLeg[]; // longueur 1 (aller simple) ou 2 (aller-retour, aller puis retour)
  totalPaidFcfa: number; // somme des price.totalFcfa de chaque leg
  manageUrl: string;
};

// Annulation d'un trajet entier par la compagnie (cancelTrip) — un type
// distinct, pas un détournement de BookingConfirmationPayload. Toujours
// une seule réservation à la fois : un trajet cancel ne concerne qu'un
// leg, jamais une paire aller-retour groupée. Si cette réservation fait
// partie d'un aller-retour, le leg jumeau n'est ni mentionné ni affecté —
// portée volontairement limitée à ce qui a réellement été annulé.
//
// Depuis le passage au système d'avoir : ceci n'annonce plus un
// remboursement immédiat mais un avoir de 24h (issue_voucher_and_cancel_booking) —
// voucherAmountFcfa/voucherExpiresAt remplacent l'ancien refundedAmountFcfa.
export type TripCancellationPayload = {
  userId: string;
  recipientEmail: string;
  bookingReference: string;
  companyName: string;
  originCity: string;
  destinationCity: string;
  departureAt: string; // ISO
  voucherAmountFcfa: number;
  voucherExpiresAt: string; // ISO
  manageUrl: string;
};

// Avoir passé en file d'attente de remboursement manuel — soit parce
// qu'il a expiré sans être utilisé (montant = l'avoir complet), soit
// parce qu'il a été appliqué à une réservation moins chère et qu'un
// reliquat subsiste (montant = ce reliquat). Un seul gabarit pour les
// deux cas : le voyageur n'a pas besoin de savoir laquelle des deux
// situations s'est produite, seulement combien lui revient et sous
// quel délai indicatif.
export type VoucherRefundPendingPayload = {
  userId: string;
  recipientEmail: string;
  amountFcfa: number;
  originBookingReference: string;
  manageUrl: string;
};

// Réservation créée par la compagnie pour un client qui ne peut pas la
// faire lui-même (chantier "+ Nouvelle réservation" côté compagnie) — ce
// client n'a jamais de session, le seul moyen de payer est ce lien à
// durée limitée. paymentUrl pointe vers /paiement-securise/[token],
// jamais vers la page de paiement authentifiée habituelle.
//
// Depuis le chantier "paiements scindés" : le jeton est porté par UNE
// PART de paiement (payments.payment_token), pas par la réservation
// entière — une réservation peut avoir plusieurs parts "par lien"
// (Mobile Money ET Carte), chacune avec son propre e-mail. paymentMethodLabel
// permet au client de distinguer les e-mails reçus lorsqu'il y en a
// plusieurs pour la même réservation.
export type BookingPaymentLinkPayload = {
  userId: string;
  bookingId: string; // pour journaliser dans notification_log (clé sur booking_id, pas payment_id)
  recipientEmail: string;
  bookingReference: string;
  companyName: string;
  originCity: string;
  destinationCity: string;
  departureAt: string; // ISO
  paymentMethodLabel: string; // "Mobile Money (MTN)" | "Mobile Money (Moov)" | "Carte bancaire"
  amountDueFcfa: number; // payments.amount_charged_fcfa de CETTE part (base + frais/avoir/points si attachés à cette part)
  paymentUrl: string;
  expiresAt: string; // ISO — payments.payment_token_expires_at, affiché pour que le client sache jusqu'à quand agir
};
