// Mécanisme centralisé de permissions par rôle (chantier "permissions par
// rôle dans le back-office"). Aucun import "server-only" ici : ce fichier
// doit pouvoir être importé par des Client Components pour piloter le
// masquage/désactivation de l'UI (jamais la seule protection — voir
// requirePermission ci-dessous, appelée côté serveur dans chaque Server
// Action concernée).
import type { CompanyAccessResult } from "./supabase/dal";

export type CompanyRole = "owner" | "agency_manager" | "agent";

export type CompanyAction =
  | "trips.manage" // créer/éditer/annuler un trajet, éditer sa route
  | "busLayouts.manage" // créer un plan de bus
  | "agencies.manage" // créer/éditer/activer une agence
  | "employees.manage" // créer/gérer un compte employé
  | "promoCodes.manage" // créer/désactiver un code promo — réduit le revenu de la compagnie
  | "supervisorApprovals.manage" // valider/refuser une remise ou une annulation, sur place ou à distance
  | "cashCeiling.manage" // régler le plafond d'espèces par session de caisse
  | "auditLog.view" // consulter le journal d'audit et la vue consolidée
  | "lockPolicy.manage" // régler le seuil d'inactivité avant verrouillage d'écran
  | "subscription.manage" // aucune action de mutation n'existe encore — prêt pour plus tard
  | "boarding.validate" // valider un billet à l'embarquement — tâche opérationnelle quotidienne, seule action ouverte à "agent"
  | "drivers.manage" // créer/éditer/désactiver un chauffeur — propriétaire uniquement, comme agencies/busLayouts (l'affectation à un trajet reste sous trips.manage)
  | "driverUnavailability.manage" // déclarer/modifier/supprimer une indisponibilité — même niveau que trips.manage (owner + agency_manager), pas le niveau CRUD roster (drivers.manage, owner seul)
  | "driverDocuments.manage" // voir/téléverser/télécharger/supprimer les documents d'un chauffeur — owner + agency_manager, lecture COMPRISE (données personnelles : un agent ne voit même pas la liste)
  | "documentAlerts.manage" // régler le seuil d'alerte d'expiration des documents — propriétaire uniquement, comme cashCeiling/lockPolicy
  | "driverRatings.view" // consulter les évaluations d'un chauffeur — owner + agency_manager, comme driverDocuments.manage mais action distincte (voir un avis n'est pas gérer un document légal)
  | "ownerDashboard.view"; // consulter le tableau de bord stratégique compagnie entière (/pilotage) — propriétaire uniquement

const PERMISSIONS: Record<CompanyAction, readonly CompanyRole[]> = {
  "trips.manage": ["owner", "agency_manager"],
  "busLayouts.manage": ["owner"],
  "agencies.manage": ["owner"],
  "employees.manage": ["owner"],
  "promoCodes.manage": ["owner"],
  "supervisorApprovals.manage": ["owner", "agency_manager"],
  "cashCeiling.manage": ["owner"],
  "auditLog.view": ["owner", "agency_manager"],
  "lockPolicy.manage": ["owner"],
  "subscription.manage": ["owner"],
  "boarding.validate": ["owner", "agency_manager", "agent"],
  "drivers.manage": ["owner"],
  "driverUnavailability.manage": ["owner", "agency_manager"],
  "driverDocuments.manage": ["owner", "agency_manager"],
  "documentAlerts.manage": ["owner"],
  "driverRatings.view": ["owner", "agency_manager"],
  "ownerDashboard.view": ["owner"],
};

export function can(role: CompanyRole, action: CompanyAction): boolean {
  return PERMISSIONS[action].includes(role);
}

// Garde côté serveur, à appeler en toute première ligne (après
// requireCompany()) de chaque Server Action concernée — le masquage UI
// piloté par can() ci-dessus n'est qu'un confort, jamais une protection.
export function requirePermission(
  access: CompanyAccessResult,
  action: CompanyAction
): { error: string } | null {
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }
  if (!can(access.role, action)) {
    return { error: "Vous n'avez pas la permission d'effectuer cette action." };
  }
  return null;
}

// Chantier "affectation d'un tableau de bord à un employé" — home_screen
// et pilotage_access_granted (company_members) ne sont pas des permissions
// statiques par rôle comme PERMISSIONS ci-dessus (elles varient par
// MEMBRE, pas seulement par rôle), d'où ces fonctions séparées plutôt
// qu'une entrée de plus dans CompanyAction/PERMISSIONS.
export type HomeScreen = "global" | "owner_dashboard" | "employee_dashboard";

// LE point de contrôle central pour les deux vues compagnie entière — "/"
// (vue globale) ET /pilotage — jamais dupliqué en `role === "owner"` à la
// main (pages, sélecteur d'agence, menu). Décision explicite : ce ne sont
// PAS deux autorisations distinctes, un chef d'agence non autorisé ne
// doit ouvrir ni l'une ni l'autre — une seule et même vérification, un
// seul et même booléen, pour les deux gardes. Un agent ne peut jamais
// passer ce test : pilotageAccessGranted est de toute façon garanti false
// pour lui en base (company_members_pilotage_agent_check).
export function canViewCompanyWideDashboards(access: {
  role: CompanyRole;
  pilotageAccessGranted: boolean;
}): boolean {
  return access.role === "owner" || (access.role === "agency_manager" && access.pilotageAccessGranted);
}

// Résout l'écran d'accueil RÉEL d'un membre, en retombant proprement sur
// le tableau employé si sa préférence pointe vers un écran qu'il n'a
// plus le droit de voir (autorisation pilotage retirée après coup, par
// exemple) — jamais de page bloquante, jamais de boucle, puisque
// /mon-tableau-de-bord n'a lui-même aucune garde qui renverrait ailleurs.
export function resolveHomeRoute(access: {
  role: CompanyRole;
  homeScreen: HomeScreen;
  pilotageAccessGranted: boolean;
}): "/" | "/pilotage" | "/mon-tableau-de-bord" {
  if (access.homeScreen === "owner_dashboard" && canViewCompanyWideDashboards(access)) return "/pilotage";
  if (access.homeScreen === "global" && canViewCompanyWideDashboards(access)) return "/";
  return "/mon-tableau-de-bord";
}
