"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateNewPassword, mapWeakPasswordError } from "shared";

export type ResetPasswordState = { error: string | null };

export async function resetPassword(
  _prevState: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const validationError = validateNewPassword(newPassword, confirmPassword);
  if (validationError) {
    return { error: validationError };
  }

  const supabase = await createClient();

  // Pas de ré-authentification par mot de passe actuel ici, contrairement
  // à changePassword() (back-office /profil) : la session de recovery
  // établie par /auth/confirm à partir du lien reçu par e-mail EST la
  // preuve d'identité — c'est tout l'intérêt de ce flux (on ne demande
  // pas l'ancien mot de passe qu'on a justement oublié).
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

  if (updateError) {
    if (updateError.code === "weak_password") {
      return { error: mapWeakPasswordError() };
    }
    console.error("Impossible de réinitialiser le mot de passe :", updateError.message);
    return { error: "Impossible de réinitialiser le mot de passe. Réessayez." };
  }

  redirect("/");
}
