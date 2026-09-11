"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type EmployeeFormState = { error: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6; // Supabase Auth's own default minimum — même constante que partenaires/inscription et compte/inscription.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// Cette page/action n'a de sens QUE pour le propriétaire — la demande le
// dit explicitement ("Réservée au propriétaire pour l'instant"). Ce n'est
// pas une restriction par rôle façon chantier 3 (qui-peut-faire-quoi de
// façon générale) : c'est la seule garde posée dès ce chantier.
function requireOwner(access: Awaited<ReturnType<typeof requireCompany>>) {
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }
  if (access.role !== "owner") {
    return { error: "Cette action est réservée au propriétaire du compte." };
  }
  return null;
}

export async function createEmployee(
  _prevState: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const access = await requireCompany();
  const guardError = requireOwner(access);
  if (guardError) return guardError;
  if (!access.ok) return { error: "Votre session ou votre abonnement ne permet plus cette action." };

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");
  const agencyId = String(formData.get("agencyId") ?? "").trim();

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

export async function setEmployeeActive(
  _prevState: EmployeeFormState,
  formData: FormData
): Promise<EmployeeFormState> {
  const access = await requireCompany();
  const guardError = requireOwner(access);
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
