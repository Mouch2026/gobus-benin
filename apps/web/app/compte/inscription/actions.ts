"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase/server";

export type SignupState = { error: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6; // Supabase Auth's own default minimum

function safeRedirectTarget(value: string): string {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

function mapAuthError(error: { code?: string; message: string }): string {
  if (error.code === "email_exists") {
    return "Un compte existe déjà avec cet email. Connectez-vous plutôt.";
  }
  return "Impossible de créer le compte. Vérifiez vos informations et réessayez.";
}

export async function signup(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectTarget(String(formData.get("redirectTo") ?? "/"));

  if (!EMAIL_RE.test(email)) {
    return { error: "Merci de renseigner un email valide." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }

  // No real email pipeline exists anywhere in this project yet (payments
  // are simulated too) — admin.createUser + email_confirm:true skips
  // confirmation mail entirely, same approach already used for company
  // signup and scripts/seed.ts, rather than depending on a delivery path
  // that doesn't exist.
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });

  if (userError || !userData.user) {
    return { error: mapAuthError(userError ?? { message: "unknown" }) };
  }

  // Sign in immediately via the session-aware client so the traveler lands
  // back on `redirectTo` already logged in — no separate "please log in
  // now" step for an account they just created.
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

  if (signInError) {
    // The account exists and is usable — just send them to log in by hand
    // rather than reporting a failure that didn't really happen.
    redirect(`/connexion?next=${encodeURIComponent(redirectTo)}`);
  }

  redirect(redirectTo);
}
