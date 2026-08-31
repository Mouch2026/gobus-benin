"use server";

import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = { error: string | null; submitted: boolean };

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { error: "Merci de renseigner votre email.", submitted: false };
  }

  const supabase = await createClient();

  // Résultat volontairement ignoré : la réponse à l'utilisateur ne doit
  // jamais varier selon que l'email existe ou non — même principe
  // d'anti-énumération que /gerer-ma-reservation. Un email inconnu ou
  // invalide reçoit exactement le même message qu'un email valide.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_BACKOFFICE_URL}/auth/confirm?next=/reinitialiser-mot-de-passe`,
  });

  return { error: null, submitted: true };
}
