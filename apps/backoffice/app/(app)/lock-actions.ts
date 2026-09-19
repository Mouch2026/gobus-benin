"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCompanyMembership } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { findExistingUserByEmail } from "@/lib/customers";
import { hashPin, verifyPin, isValidPinFormat } from "@/lib/pin";
import { logAuditEvent } from "shared/src/lib/auditLog";

// Compte-puis-décide fait EN UNE SEULE fonction SQL (check_and_record_pin_attempt,
// migration 20260919120000), avec un verrou explicite sur la ligne
// company_members correspondante — un premier essai en deux allers-
// retours TypeScript séparés (SELECT count() puis INSERT) s'est avéré
// contournable sous requêtes concurrentes en conditions réelles (8/8
// tentatives simultanées toutes autorisées au lieu de 3 max, script de
// vérification à l'appui) : rien n'empêchait plusieurs requêtes de lire
// le même compte "sous la limite" avant qu'aucune n'ait encore inséré.
// Scope = la ligne company_members de la personne actuellement
// authentifiée par le cookie (A), que la tentative vise à se
// redéverrouiller elle-même ou à basculer vers un autre agent — c'est CE
// poste qui est brute-forcé, peu importe l'identité visée.
async function checkAndRecordPinAttempt(lockedMemberId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc("check_and_record_pin_attempt", {
    p_locked_member_id: lockedMemberId,
  });
  if (error) {
    console.error("Impossible de vérifier le rate-limit PIN :", error.message);
    return false;
  }
  return data === true;
}

// "PIN oublié ? Se déconnecter" sur l'écran de verrouillage — distincte
// du changement d'agent : ici on ne connaît PAS de PIN valide du tout,
// la seule sortie est une vraie déconnexion complète puis une
// reconnexion par mot de passe (parcours "mot de passe oublié" existant
// si nécessaire). scope PAR DÉFAUT (global), volontairement différent du
// scope 'local' de switchAgent : il s'agit ici d'une vraie déconnexion
// complète demandée explicitement, pas d'un changement d'agent sur un
// poste partagé. redirectTo pointe vers /connexion avec un `next` qui
// ramène sur le dashboard avec un indicateur — réutilise telle quelle la
// validation safeRedirectTarget déjà en place côté /connexion/actions.ts,
// aucune plomberie nouvelle. Le login() qui suivra réinitialise lui-même
// locked_at (voir dal.ts et connexion/actions.ts — vérifié en conditions
// réelles : locked_at vit sur company_members, indépendant des
// cookies/du JWT, une reconnexion par mot de passe seule ne le levait
// pas avant ce correctif).
export async function signOutForgotPin(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion?next=%2F%3Fpin_forgotten%3D1");
}

// Appelée par le traqueur d'activité côté client dès que son minuteur
// local expire — pose locked_at explicitement, pour que le prochain appel
// serveur (même depuis un autre onglet/appareil) voie l'état verrouillé
// immédiatement, sans attendre le calcul paresseux sur last_activity_at.
export async function lockScreen(): Promise<void> {
  const membership = await requireCompanyMembership();
  if (!membership) return;

  await supabaseAdmin
    .from("company_members")
    .update({ locked_at: new Date().toISOString() })
    .eq("id", membership.memberId);
}

// Battement de cœur — appelé uniquement quand le traqueur a vu au moins
// une interaction depuis le dernier appel (voir _activity-tracker.tsx).
// Ne touche jamais locked_at : seul un déverrouillage réussi doit lever
// un verrouillage explicite, jamais une simple activité résiduelle.
export async function recordActivity(): Promise<void> {
  const membership = await requireCompanyMembership();
  if (!membership) return;

  await supabaseAdmin
    .from("company_members")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", membership.memberId)
    .is("locked_at", null);
}

export type UnlockState = { error: string | null };

// A se redéverrouille avec son propre PIN — requireCompanyMembership()
// résout déjà A sans ambiguïté via le cookie de session, jamais besoin de
// redemander qui il est.
export async function unlockAsSelf(_prevState: UnlockState, formData: FormData): Promise<UnlockState> {
  const membership = await requireCompanyMembership();
  if (!membership) {
    return { error: "Session invalide. Reconnectez-vous." };
  }

  const pin = String(formData.get("pin") ?? "");
  if (!isValidPinFormat(pin)) {
    return { error: "Code PIN invalide." };
  }

  const allowed = await checkAndRecordPinAttempt(membership.memberId);
  if (!allowed) {
    return { error: "Trop d'essais incorrects. Réessayez dans quelques minutes." };
  }

  if (!membership.pinHash || !(await verifyPin(pin, membership.pinHash))) {
    return { error: "Code PIN incorrect." };
  }

  await supabaseAdmin
    .from("company_members")
    .update({ locked_at: null, last_activity_at: new Date().toISOString() })
    .eq("id", membership.memberId);

  // Force requireCompany() à être réévalué au prochain rendu — le formulaire
  // reste sur la même page, aucune navigation, "retour exact à l'écran
  // précédent" est automatique puisque l'URL n'a jamais changé.
  revalidatePath("/", "layout");
  return { error: null };
}

export type SwitchAgentState = { error: string | null };

// B prend le relais — décision actée : PIN + email suffisent (pas de mot
// de passe redemandé), voir le plan pour le raisonnement complet.
export async function switchAgent(_prevState: SwitchAgentState, formData: FormData): Promise<SwitchAgentState> {
  const membershipA = await requireCompanyMembership();
  if (!membershipA) {
    return { error: "Session invalide. Reconnectez-vous." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const pin = String(formData.get("pin") ?? "");
  // Message générique dans tous les cas — jamais "cet agent n'existe pas"
  // vs "mauvais PIN", même raisonnement anti-énumération que
  // verifySupervisorOnSite.
  const genericError = "Email ou code PIN incorrect.";

  if (!email || !isValidPinFormat(pin)) {
    return { error: genericError };
  }

  const allowed = await checkAndRecordPinAttempt(membershipA.memberId);
  if (!allowed) {
    return { error: "Trop d'essais incorrects. Réessayez dans quelques minutes." };
  }

  // Jamais le filtre ?email= de l'API admin (CLAUDE.md) — findExistingUserByEmail
  // liste et matche l'email exact lui-même.
  let bUserId: string | null;
  try {
    bUserId = await findExistingUserByEmail(email);
  } catch (err) {
    console.error("Impossible de résoudre l'email de l'agent :", err);
    return { error: genericError };
  }
  if (!bUserId) {
    return { error: genericError };
  }

  // Éligibilité vérifiée avant toute comparaison de PIN et avant tout
  // appel réseau à GoTrue — même ordre que verifySupervisorOnSite : même
  // compagnie qu'A, compte actif, PIN déjà défini.
  const { data: memberB } = await supabaseAdmin
    .from("company_members")
    .select("id, full_name, pin_hash, is_active, company_id, agency_id")
    .eq("user_id", bUserId)
    .maybeSingle<{
      id: string;
      full_name: string | null;
      pin_hash: string | null;
      is_active: boolean;
      company_id: string;
      agency_id: string | null;
    }>();

  const eligible =
    !!memberB && memberB.is_active && memberB.company_id === membershipA.companyId && !!memberB.pin_hash;

  if (!eligible || !(await verifyPin(pin, memberB!.pin_hash!))) {
    return { error: genericError };
  }

  // À partir d'ici, B est authentifié par PIN — bascule réelle de session
  // Supabase Auth (pas un simple déblocage visuel).
  const supabase = await createClient();

  // scope 'local' : termine la session d'A sur CE POSTE uniquement, pas
  // une révocation globale de son compte (il peut rester connecté
  // ailleurs, ex. son téléphone) — "changement rapide d'agent" décrit un
  // poste partagé, pas une désactivation de compte.
  await supabase.auth.signOut({ scope: "local" });

  const { data: userB, error: userBError } = await supabaseAdmin.auth.admin.getUserById(bUserId);
  if (userBError || !userB.user?.email) {
    console.error("Impossible de résoudre l'email réel de l'agent :", userBError?.message);
    return { error: "Impossible de basculer vers cet agent. Réessayez." };
  }

  // Pas de mot de passe redemandé (décision actée) : un lien magique
  // généré côté admin puis vérifié immédiatement établit une VRAIE
  // session Supabase Auth pour B — jamais de JWT fabriqué à la main,
  // aucune nouvelle couche API, seulement les méthodes natives du SDK
  // Auth déjà installé.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: userB.user.email,
  });
  if (linkError || !linkData) {
    console.error("Impossible de générer le lien de bascule :", linkError?.message);
    return { error: "Impossible de basculer vers cet agent. Réessayez." };
  }

  // Le SDK rejette l'appel (erreur au runtime, vérifié en conditions
  // réelles) si `email` est fourni EN PLUS de `token_hash` — ce sont deux
  // variantes distinctes de verifyOtp (VerifyEmailOtpParams vs
  // VerifyTokenHashParams dans @supabase/auth-js), jamais mélangées.
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyError) {
    console.error("Impossible d'établir la session de l'agent :", verifyError.message);
    return { error: "Impossible de basculer vers cet agent. Réessayez." };
  }

  await supabaseAdmin
    .from("company_members")
    .update({ locked_at: null, last_activity_at: new Date().toISOString() })
    .eq("id", memberB!.id);

  const aName = membershipA.fullName ?? "Agent";
  const bName = memberB!.full_name ?? "Agent";

  await logAuditEvent({
    action: "session_swap",
    bookingId: null,
    companyId: membershipA.companyId,
    acteurId: bUserId,
    agencyId: memberB!.agency_id,
    payload: {
      locked_by_agent_id: membershipA.memberId,
      locked_by_name: aName,
      unlocked_by_agent_id: memberB!.id,
      unlocked_by_name: bName,
    },
  });

  redirect(`/?swapped=1&from=${encodeURIComponent(aName)}&to=${encodeURIComponent(bName)}`);
}

export type SetPinState = { error: string | null; success: boolean };

// Onboarding (pin_hash encore nul) — pas de re-saisie du mot de passe :
// la session qui vient de passer par signInWithPassword sur /connexion
// prouve déjà l'identité fraîchement, cohérent avec le reste de l'app
// (aucune étape post-connexion obligatoire ne redemande le mot de passe).
export async function setInitialPin(_prevState: SetPinState, formData: FormData): Promise<SetPinState> {
  const membership = await requireCompanyMembership();
  if (!membership) {
    return { error: "Session invalide. Reconnectez-vous.", success: false };
  }
  if (membership.pinHash) {
    return { error: "Un code PIN est déjà défini — utilisez plutôt le profil pour le changer.", success: false };
  }

  const pin = String(formData.get("pin") ?? "");
  const confirmPin = String(formData.get("confirmPin") ?? "");

  if (!isValidPinFormat(pin)) {
    return { error: "Le code PIN doit contenir 4 à 6 chiffres.", success: false };
  }
  if (pin !== confirmPin) {
    return { error: "Les deux codes PIN ne correspondent pas.", success: false };
  }

  const pinHash = await hashPin(pin);
  const { error } = await supabaseAdmin
    .from("company_members")
    .update({ pin_hash: pinHash, last_activity_at: new Date().toISOString() })
    .eq("id", membership.memberId);

  if (error) {
    console.error("Impossible d'enregistrer le code PIN :", error.message);
    return { error: "Impossible d'enregistrer le code PIN. Réessayez.", success: false };
  }

  revalidatePath("/", "layout");
  return { error: null, success: true };
}

// Changer un PIN déjà défini (oubli, rotation) — depuis /profil. Ré-
// authentification par mot de passe requise avant d'accepter quoi que ce
// soit, même précaution "appareil laissé déverrouillé" déjà nommée dans
// profil/actions.ts::changePassword.
export async function changePin(_prevState: SetPinState, formData: FormData): Promise<SetPinState> {
  const membership = await requireCompanyMembership();
  if (!membership) {
    return { error: "Session invalide. Reconnectez-vous.", success: false };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const confirmPin = String(formData.get("confirmPin") ?? "");

  if (!currentPassword) {
    return { error: "Merci de renseigner votre mot de passe actuel.", success: false };
  }
  if (!isValidPinFormat(pin)) {
    return { error: "Le code PIN doit contenir 4 à 6 chiffres.", success: false };
  }
  if (pin !== confirmPin) {
    return { error: "Les deux codes PIN ne correspondent pas.", success: false };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) {
    return { error: "Impossible de vérifier votre identité. Reconnectez-vous et réessayez.", success: false };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });
  if (reauthError) {
    return { error: "Mot de passe actuel incorrect.", success: false };
  }

  const pinHash = await hashPin(pin);
  const { error } = await supabaseAdmin
    .from("company_members")
    .update({ pin_hash: pinHash })
    .eq("id", membership.memberId);

  if (error) {
    console.error("Impossible de changer le code PIN :", error.message);
    return { error: "Impossible de changer le code PIN. Réessayez.", success: false };
  }

  return { error: null, success: true };
}
