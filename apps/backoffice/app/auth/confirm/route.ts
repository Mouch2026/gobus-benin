import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectTarget } from "shared";

// Nécessaire parce que createClient() (lib/supabase/server.ts) ne peut
// écrire des cookies de session que depuis une Server Action ou un Route
// Handler — pas depuis un Server Component de page, où l'écriture est
// silencieusement avalée (voir le commentaire sur ce point dans
// server.ts). L'échange du code PKCE de resetPasswordForEmail() DOIT donc
// passer par cette route dédiée, jamais directement dans
// /reinitialiser-mot-de-passe.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // safeRedirectTarget() d'abord (next est un paramètre de requête brut,
  // donc falsifiable), PUIS new URL(next, origin) plutôt qu'une
  // concaténation de chaînes — ${origin}${next} laissait passer un hôte
  // différent via un "@" (userinfo) ou un simple suffixe ".evil.com"
  // fusionné dans le nom d'hôte, même avec next déjà validé par ailleurs.
  // new URL(..., origin) résout next comme une référence contre origin,
  // sans jamais pouvoir corrompre l'autorité (schéma+hôte+port) d'origin.
  const next = safeRedirectTarget(searchParams.get("next") ?? "/");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Code absent ou invalide/expiré : pas de session établie, retour à la
  // connexion normale plutôt qu'une page cassée.
  return NextResponse.redirect(new URL("/connexion", origin));
}
