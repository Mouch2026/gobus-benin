"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { validateNewPassword, mapWeakPasswordError } from "shared";

export type ProfilFormState = { error: string | null; success: boolean };

export async function updateProfile(
  _prevState: ProfilFormState,
  formData: FormData
): Promise<ProfilFormState> {
  await requireUser("/compte/profil");

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) {
    return { error: "Merci de renseigner votre nom.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } });

  if (error) {
    console.error("Impossible de mettre à jour le profil :", error.message);
    return { error: "Impossible de mettre à jour le profil. Réessayez.", success: false };
  }

  revalidatePath("/compte/profil");
  revalidatePath("/"); // le nom est affiché dans la Navbar
  return { error: null, success: true };
}

export type PasswordFormState = { error: string | null; success: boolean };

// Mirror exact de apps/backoffice/app/profil/actions.ts#changePassword —
// secure_password_change est désactivé projet-entier (supabase/config.toml),
// donc Supabase n'exige pas lui-même de ré-authentification récente avant
// un changement de mot de passe. On revérifie nous-mêmes le mot de passe
// actuel via une tentative réelle de connexion, avant d'accepter quoi que
// ce soit.
export async function changePassword(
  _prevState: PasswordFormState,
  formData: FormData
): Promise<PasswordFormState> {
  await requireUser("/compte/profil");

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
