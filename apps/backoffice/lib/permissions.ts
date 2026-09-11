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
  | "subscription.manage"; // aucune action de mutation n'existe encore — prêt pour plus tard

const PERMISSIONS: Record<CompanyAction, readonly CompanyRole[]> = {
  "trips.manage": ["owner", "agency_manager"],
  "busLayouts.manage": ["owner"],
  "agencies.manage": ["owner"],
  "employees.manage": ["owner"],
  "subscription.manage": ["owner"],
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
