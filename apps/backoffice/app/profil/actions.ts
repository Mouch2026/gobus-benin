"use server";

import { revalidatePath } from "next/cache";
import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { validateNewPassword, mapWeakPasswordError } from "@/lib/password";

export type ProfilFormState = { error: string | null; success: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateCompanyProfile(
  _prevState: ProfilFormState,
  formData: FormData
): Promise<ProfilFormState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();

  if (!name) {
    return { error: "Merci de renseigner le nom de la compagnie.", success: false };
  }
  if (email && !EMAIL_RE.test(email)) {
    return { error: "Merci de renseigner un email valide (ou de laisser le champ vide).", success: false };
  }

  const supabase = await createClient();
  // companies_update_owner (owner_id = auth.uid()) already scopes this —
  // ordinary authenticated client, no service_role needed. slug is
  // intentionally not editable here: it's the company's stable URL
  // identity, out of scope for a profile edit.
  const { error } = await supabase
    .from("companies")
    .update({
      name,
      phone: phone || null,
      email: email || null,
      logo_url: logoUrl || null,
    })
    .eq("id", access.company.id);

  if (error) {
    console.error("Impossible de mettre à jour le profil :", error.message);
    return { error: "Impossible de mettre à jour le profil. Réessayez.", success: false };
  }

  revalidatePath("/profil");
  revalidatePath("/"); // company name shown in the shared navigation
  return { error: null, success: true };
}

export type PasswordFormState = { error: string | null; success: boolean };

export async function changePassword(
  _prevState: PasswordFormState,
  formData: FormData
): Promise<PasswordFormState> {
  const access = await requireCompany();
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action.", success: false };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Merci de remplir les trois champs.", success: false };
  }

  const validationError = validateNewPassword(newPassword, confirmPassword);
  if (validationError) {
    return { error: validationError, success: false };
  }

  const supabase = await createClient();

  // secure_password_change est désactivé sur ce projet (config.toml) :
  // Supabase n'exige pas lui-même une ré-authentification récente avant un
  // changement de mot de passe. Sans ce contrôle explicite, la seule
  // session déjà ouverte suffirait à changer le mot de passe — ce qui
  // n'est pas acceptable pour une action aussi sensible (ex. appareil
  // laissé déverrouillé). On revérifie donc nous-mêmes le mot de passe
  // actuel via une tentative réelle de connexion, avant d'accepter quoi
  // que ce soit.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user?.email) {
    return {
      error: "Impossible de vérifier votre identité. Reconnectez-vous et réessayez.",
      success: false,
    };
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: userData.user.email,
    password: currentPassword,
  });

  if (reauthError) {
    return { error: "Mot de passe actuel incorrect.", success: false };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

  if (updateError) {
    if (updateError.code === "weak_password") {
      return { error: mapWeakPasswordError(), success: false };
    }
    console.error("Impossible de changer le mot de passe :", updateError.message);
    return { error: "Impossible de changer le mot de passe. Réessayez.", success: false };
  }

  return { error: null, success: true };
}
