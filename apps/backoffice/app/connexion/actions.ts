"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireCompany } from "@/lib/supabase/dal";
import { resolveHomeRoute } from "@/lib/permissions";
import { safeRedirectTarget } from "shared";

export type LoginState = { error: string | null };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeRedirectTarget(String(formData.get("redirectTo") ?? "/"));

  if (!email || !password) {
    return { error: "Merci de renseigner l'email et le mot de passe." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email ou mot de passe incorrect." };
  }

  // Chantier 6 — vérifié en conditions réelles : locked_at vit sur
  // company_members, complètement indépendant des cookies/du JWT. Sans
  // ce reset, un agent qui s'est déconnecté depuis l'écran verrouillé
  // (PIN oublié) — ou dont la session a simplement expiré après 8h
  // pendant que son poste était verrouillé — retomberait IMMÉDIATEMENT
  // sur l'écran verrouillé après s'être reconnecté normalement par mot
  // de passe, sans aucun moyen d'en sortir. Une reconnexion par mot de
  // passe réel est toujours une preuve de présence fraîche : elle doit
  // systématiquement lever tout verrouillage antérieur. Best-effort :
  // aucun company_members ne correspond pour un compte sans compagnie
  // (ex. voyageur), l'update ne touche alors simplement aucune ligne.
  // session_started_at ancre cette connexion réelle — comparée dans
  // requireCompany() (dal.ts) pour forcer une vraie déconnexion au-delà
  // de 8h, indépendamment du cycle de rafraîchissement silencieux du JWT.
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("company_members")
    .update({ locked_at: null, last_activity_at: now, session_started_at: now })
    .eq("user_id", data.user.id);

  // Chantier "affectation d'un tableau de bord à un employé" — n'écrase
  // JAMAIS un ?next= explicite (deep-link préservé, ex. lien direct vers
  // une réservation reçu par un agent alors qu'il n'était pas connecté) :
  // seule la destination par défaut ("/", faute de tout ?next=) est
  // remplacée par l'écran d'accueil réellement assigné à ce membre.
  if (redirectTo === "/") {
    const access = await requireCompany();
    if (access.ok) {
      redirect(resolveHomeRoute(access));
    }
  }

  redirect(redirectTo);
}
