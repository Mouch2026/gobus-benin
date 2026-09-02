// Partagé par tous les canaux (e-mail aujourd'hui, WhatsApp demain) —
// chaque canal reçoit exactement la même forme de données, construite une
// seule fois par buildBookingConfirmationPayload.ts.

export type BookingConfirmationLegPrice = {
  baseAmountFcfa: number;
  platformFeeFcfa: number;
  transactionFeeFcfa: number;
  totalFcfa: number;
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
export type TripCancellationPayload = {
  recipientEmail: string;
  bookingReference: string;
  companyName: string;
  originCity: string;
  destinationCity: string;
  departureAt: string; // ISO
  refundedAmountFcfa: number;
  manageUrl: string;
};
