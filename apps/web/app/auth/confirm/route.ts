import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Nécessaire parce que createClient() (lib/supabase/server.ts) ne peut
// écrire des cookies de session que depuis une Server Action ou un Route
// Handler — pas depuis un Server Component de page, où l'écriture est
// silencieusement avalée (voir le commentaire sur ce point dans
// server.ts). L'échange du code PKCE de resetPasswordForEmail() DOIT donc
// passer par cette route dédiée, jamais directement dans
// /compte/reinitialiser-mot-de-passe. Même mécanisme que
// apps/backoffice/app/auth/confirm/route.ts.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Code absent ou invalide/expiré : pas de session établie, retour à la
  // connexion normale plutôt qu'une page cassée.
  return NextResponse.redirect(`${origin}/compte/connexion`);
}
