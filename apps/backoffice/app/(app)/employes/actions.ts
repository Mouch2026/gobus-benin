"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission, type HomeScreen } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logAuditEvent } from "shared/src/lib/auditLog";

export type EmployeeFormState = { error: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6; // Supabase Auth's own default minimum — même constante que partenaires/inscription et compte/inscription.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOME_SCREENS: readonly HomeScreen[] = ["global", "owner_dashboard", "employee_dashboard"];

// Backstop applicatif partagé par createEmployee et updateEmployeeDashboard
// — message clair plutôt qu'une erreur Postgres brute si jamais franchi ;
// les CHECK de la migration company_members restent la protection réelle
// contre une requête forgée (voir supabase/migrations/
// 20260928090000_add_employee_dashboard_assignment.sql). Ne fait AUCUNE
// confiance à ce qu'envoie le client, même pour un rôle "agent" dont le
// sélecteur est censé être masqué côté formulaire.
//
// L'autorisation pilotage couvre les DEUX vues compagnie entière ("/" ET
// /pilotage) — décision explicite, ce ne sont pas deux autorisations
// distinctes. Un chef d'agence SANS l'autorisation ne peut donc avoir
// d'autre home_screen que 'employee_dashboard' : retirer l'autorisation
// (pilotageAccessGranted = false) force TOUJOURS ce retour ici, quelle
// que soit la valeur soumise pour homeScreen — c'est ce qui garantit que
// la Server Action écrit les deux colonnes de façon cohérente EN UNE
// SEULE instruction UPDATE, jamais en deux temps (le CHECK SQL
// company_members_home_screen_role_check rejetterait toute autre valeur
// pour un chef d'agence non autorisé).
function resolveDashboardAssignment(
  role: "agency_manager" | "agent",
  homeScreenRaw: string,
  pilotageAccessGranted: boolean
): { homeScreen: HomeScreen; pilotageAccessGranted: boolean } | { error: string } {
  if (role === "agent") {
    // Un agent n'a aucun choix — toujours son tableau employé, jamais la
    // grant pilotage (company_members_pilotage_agent_check l'interdit de
    // toute façon en base).
    return { homeScreen: "employee_dashboard", pilotageAccessGranted: false };
  }

  if (!pilotageAccessGranted) {
    return { homeScreen: "employee_dashboard", pilotageAccessGranted: false };
  }

  if (!HOME_SCREENS.includes(homeScreenRaw as HomeScreen)) {
    return { error: "Écran d'accueil invalide." };
  }
  return { homeScreen: homeScreenRaw as HomeScreen, pilotageAccessGranted: true };
}

function mapAuthError(error: { code?: string; message: string }): string {
  if (error.code === "email_exists") {
    // Jamais de fallback vers un compte existant (contrairement à
    // findOrCreateDiscreetCustomer) : on ne détourne pas un compte
    // voyageur — ou celui d'un autre employé — pour en faire un compte
    // agent. Le propriétaire doit utiliser une autre adresse.
    return "Un compte existe déjà avec cet email. Utilisez une autre adresse.";
  }
  return "Impossible de créer le compte. Vérifiez les informations et réessayez.";
}

export async function createEmployee(
  _prevState: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "employees.manage");
  if (guardError) return guardError;
  if (!access.ok) return { error: "Votre session ou votre abonnement ne permet plus cette action." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");
  const agencyId = String(formData.get("agencyId") ?? "").trim();
  const homeScreenRaw = String(formData.get("homeScreen") ?? "");
  const pilotageAccessGranted = formData.get("pilotageAccessGranted") === "1";

  if (!EMAIL_RE.test(email)) {
    return { error: "Merci de renseigner un email valide." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }
  if (role !== "agency_manager" && role !== "agent") {
    return { error: "Merci de choisir un rôle." };
  }
  if (!UUID_RE.test(agencyId)) {
    return { error: "Merci de choisir une agence." };
  }

  const dashboard = resolveDashboardAssignment(role, homeScreenRaw, pilotageAccessGranted);
  if ("error" in dashboard) return dashboard;

  // L'agence doit exister, être active, ET appartenir à CETTE compagnie —
  // jamais fait confiance à un id transmis par le formulaire (même règle
  // que createAgency vérifiant la gare).
  const { data: agency } = await supabaseAdmin
    .from("agencies")
    .select("id")
    .eq("id", agencyId)
    .eq("company_id", access.company.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!agency) {
    return { error: "Cette agence n'existe pas, n'est plus active, ou n'appartient pas à votre compagnie." };
  }

  // Étape 1 : compte auth. admin.createUser est un appel HTTP au service
  // Auth, hors de toute transaction Postgres qu'on contrôle — d'où la
  // compensation manuelle ci-dessous en cas d'échec de l'étape 2 (même
  // patron que createCompanyAccount, apps/web/app/partenaires/inscription/actions.ts).
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (userError || !userData.user) {
    return { error: mapAuthError(userError ?? { message: "unknown" }) };
  }

  const userId = userData.user.id;

  // Étape 2 : rattachement. En cas d'échec, on retire le compte auth
  // qu'on vient de créer — jamais de compte orphelin, jamais rattaché à
  // rien.
  const { error: memberError } = await supabaseAdmin.from("company_members").insert({
    user_id: userId,
    company_id: access.company.id,
    role,
    agency_id: agencyId,
    full_name: fullName || null,
    is_active: true,
    home_screen: dashboard.homeScreen,
    pilotage_access_granted: dashboard.pilotageAccessGranted,
  });

  if (memberError) {
    await supabaseAdmin.auth.admin.deleteUser(userId);

    // 23505 = unique_violation sur company_members.unique(user_id) : cet
    // email existait déjà dans auth.users (donc pas de "email_exists" à
    // l'étape 1) mais l'utilisateur est déjà rattaché à une compagnie —
    // scénario résiduel, pas supposé impossible.
    if (memberError.code === "23505") {
      return { error: "Ce compte est déjà rattaché à une compagnie." };
    }
    console.error("Impossible de créer le rattachement employé :", memberError.message);
    return { error: "Impossible de créer ce compte employé. Réessayez." };
  }

  revalidatePath("/employes");
  return { error: null };
}

// Chantier 6 — seuil d'inactivité avant verrouillage d'écran, même
// précédent que cash_ceiling_fcfa (chantier 4) : un seul réglage
// structurel stocké directement sur companies, contrainte CHECK déjà
// posée en base (2 à 5 minutes) comme filet, revérifiée ici pour un
// message d'erreur clair plutôt qu'un échec SQL brut.
export async function updateLockTimeout(
  _prevState: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "lockPolicy.manage");
  if (guardError) return guardError;
  if (!access.ok) return { error: "Votre session ou votre abonnement ne permet plus cette action." };

  const minutes = Number(formData.get("lockTimeoutMinutes"));
  if (!Number.isInteger(minutes) || minutes < 2 || minutes > 5) {
    return { error: "Le seuil doit être un nombre entier entre 2 et 5 minutes." };
  }

  const { error } = await supabaseAdmin
    .from("companies")
    .update({ lock_timeout_minutes: minutes })
    .eq("id", access.company.id);

  if (error) {
    console.error("Impossible de mettre à jour le seuil de verrouillage :", error.message);
    return { error: "Impossible de mettre à jour ce réglage. Réessayez." };
  }

  revalidatePath("/employes");
  return { error: null };
}

export async function setEmployeeActive(
  _prevState: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "employees.manage");
  if (guardError) return guardError;
  if (!access.ok) return { error: "Votre session ou votre abonnement ne permet plus cette action." };

  const memberId = String(formData.get("memberId") ?? "").trim();
  const isActive = formData.get("isActive") === "1";

  // Jamais sur la ligne 'owner' (RLS le refuserait de toute façon —
  // company_members_update_owner exige role <> 'owner' — mais un message
  // clair vaut mieux qu'un échec silencieux).
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role")
    .eq("id", memberId)
    .eq("company_id", access.company.id)
    .maybeSingle();

  if (!member) {
    return { error: "Ce compte n'existe pas ou ne fait pas partie de votre compagnie." };
  }
  if (member.role === "owner") {
    return { error: "Le compte propriétaire ne peut pas être désactivé ici." };
  }

  const { error } = await supabaseAdmin
    .from("company_members")
    .update({ is_active: isActive })
    .eq("id", memberId);

  if (error) {
    console.error("Impossible de changer l'état du compte employé :", error.message);
    return { error: "Impossible de changer l'état de ce compte. Réessayez." };
  }

  revalidatePath("/employes");
  return { error: null };
}

// Panneau "Tableau de bord" du panneau dépliable de chaque ligne
// (EmployeeRow) — propriétaire uniquement, jamais sur la ligne 'owner'.
// Protection en profondeur : cette validation applicative (message clair)
// + RLS company_members_update_owner (owner uniquement, jamais role =
// 'owner') + les CHECK de la migration 20260928090000 comme dernier
// rempart si jamais une requête contournait cette action.
export async function updateEmployeeDashboard(
  _prevState: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "employees.manage");
  if (guardError) return guardError;
  if (!access.ok) return { error: "Votre session ou votre abonnement ne permet plus cette action." };

  const memberId = String(formData.get("memberId") ?? "").trim();
  const homeScreenRaw = String(formData.get("homeScreen") ?? "");
  const pilotageAccessGranted = formData.get("pilotageAccessGranted") === "1";

  // Jamais un id transmis à l'aveugle : re-vérifié scopé à la compagnie,
  // même patron que setEmployeeActive/createEmployee.
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("id, role, home_screen, pilotage_access_granted")
    .eq("id", memberId)
    .eq("company_id", access.company.id)
    .maybeSingle<{
      id: string;
      role: "owner" | "agency_manager" | "agent";
      home_screen: HomeScreen;
      pilotage_access_granted: boolean;
    }>();

  if (!member) {
    return { error: "Ce compte n'existe pas ou ne fait pas partie de votre compagnie." };
  }
  if (member.role === "owner") {
    return { error: "Le compte propriétaire n'est pas géré ici." };
  }

  const dashboard = resolveDashboardAssignment(member.role, homeScreenRaw, pilotageAccessGranted);
  if ("error" in dashboard) return dashboard;

  const { error } = await supabaseAdmin
    .from("company_members")
    .update({ home_screen: dashboard.homeScreen, pilotage_access_granted: dashboard.pilotageAccessGranted })
    .eq("id", memberId)
    .eq("company_id", access.company.id);

  if (error) {
    console.error("Impossible de mettre à jour le tableau de bord de cet employé :", error.message);
    return { error: "Impossible de mettre à jour ce réglage. Réessayez." };
  }

  await logAuditEvent({
    action: "employee_dashboard_updated",
    bookingId: null,
    companyId: access.company.id,
    acteurId: access.user.sub,
    agencyId: null,
    payload: {
      targetMemberId: memberId,
      before: { homeScreen: member.home_screen, pilotageAccessGranted: member.pilotage_access_granted },
      after: dashboard,
    },
  });

  revalidatePath("/employes");
  return { error: null };
}
