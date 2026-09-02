import "server-only";
import { buildBookingConfirmationPayload } from "./buildBookingConfirmationPayload";
import { sendBookingConfirmationEmail } from "./channels/email";
import { sendCompanySaleEmail } from "./channels/companySaleEmail";
import type { BookingConfirmationLeg, BookingConfirmationPayload } from "./types";

// Point d'entrée générique : "envoyer une confirmation de réservation",
// pas "envoyer un e-mail". Un futur canal WhatsApp s'ajoute ici (une
// ligne de plus), sans toucher aux deux Server Actions de paiement qui
// appellent cette fonction — elles ne connaissent que "confirmation
// envoyée ou pas", jamais le détail des canaux.
export async function sendBookingConfirmation(
  target: { bookingId: string } | { bookingGroupId: string }
): Promise<void> {
  let payload: BookingConfirmationPayload;
  try {
    payload = await buildBookingConfirmationPayload(target);
  } catch (error) {
    console.error("Impossible de construire la confirmation de réservation :", error);
    return;
  }

  // Voyageur et compagnie(s) doivent être indépendants l'un de l'autre :
  // un seul try/catch autour de deux `await` séquentiels ne suffirait pas
  // (un throw dans le premier empêcherait le second de s'exécuter du
  // tout). Promise.allSettled + un try/catch propre à chaque envoi est ce
  // qui garantit réellement qu'aucun des deux ne peut bloquer l'autre.
  await Promise.allSettled([
    sendTravelerConfirmation(payload),
    sendCompanySaleNotifications(payload),
  ]);
}

async function sendTravelerConfirmation(payload: BookingConfirmationPayload): Promise<void> {
  try {
    await sendBookingConfirmationEmail(payload);
  } catch (error) {
    // Ne relance jamais — appelée après un paiement déjà approuvé, ne doit
    // jamais faire échouer la réservation elle-même.
    console.error("Impossible d'envoyer la confirmation voyageur :", error);
  }
}

// Une compagnie par entrée, jamais un seul e-mail groupé pour deux
// compagnies différentes sur un aller-retour — chaque compagnie ne voit
// que le(s) leg(s) qu'elle opère elle-même.
async function sendCompanySaleNotifications(payload: BookingConfirmationPayload): Promise<void> {
  const legsByCompany = new Map<
    string,
    { email: string; name: string; legs: BookingConfirmationLeg[] }
  >();

  for (const leg of payload.legs) {
    if (!leg.companyEmail) {
      // Pas une erreur : une compagnie peut légitimement ne pas avoir
      // renseigné d'email. Ignoré silencieusement pour cette compagnie
      // uniquement, ne bloque ni le reste ni la confirmation voyageur.
      console.info(
        `Compagnie "${leg.companyName}" sans email renseigné — notification de vente ignorée pour ${leg.bookingReference}.`
      );
      continue;
    }

    const group = legsByCompany.get(leg.companyId) ?? {
      email: leg.companyEmail,
      name: leg.companyName,
      legs: [],
    };
    group.legs.push(leg);
    legsByCompany.set(leg.companyId, group);
  }

  // Chaque compagnie indépendante des autres : l'échec de l'une ne doit
  // pas empêcher l'envoi aux autres.
  await Promise.allSettled(
    [...legsByCompany.values()].map(async (group) => {
      try {
        await sendCompanySaleEmail({
          companyEmail: group.email,
          companyName: group.name,
          travelerPhone: payload.phone,
          legs: group.legs,
        });
      } catch (error) {
        console.error(`Impossible d'envoyer la notification de vente à "${group.name}" :`, error);
      }
    })
  );
}
