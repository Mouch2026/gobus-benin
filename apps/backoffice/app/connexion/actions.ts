"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

function safeRedirectTarget(value: string): string {
  // `redirectTo` comes from a query param an attacker could craft (e.g.
  // ?next=//evil.com, which passes a naive startsWith("/") check but is a
  // protocol-relative URL browsers will follow to a different host).
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectTarget(String(formData.get("redirectTo") ?? "/"));

  if (!email || !password) {
    return { error: "Merci de renseigner l'email et le mot de passe." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email ou mot de passe incorrect." };
  }

  redirect(redirectTo);
}
