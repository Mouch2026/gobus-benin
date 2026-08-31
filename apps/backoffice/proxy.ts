import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next.js 16 renamed middleware.ts to proxy.ts (same mechanics, new name/
// export). See node_modules/next/dist/docs/.../file-conventions/proxy.md.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// /reinitialiser-mot-de-passe reste volontairement HORS de cette liste :
// elle doit se comporter comme une page protégée normale (redirige vers
// /connexion si aucune session), car "accessible uniquement via le lien
// reçu par e-mail" est satisfait par la session de recovery établie par
// /auth/confirm avant d'y arriver — pas besoin d'un garde-fou séparé.
const PUBLIC_PATHS = ["/connexion", "/mot-de-passe-oublie", "/auth/confirm"];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // getClaims() verifies the JWT (via cached JWKS, usually no network call)
  // rather than just reading it — unlike a plain cookie read, this is a
  // real check, not merely "optimistic" in the weaker sense Next's guide
  // warns about. requireUser() in lib/supabase/dal.ts still re-checks
  // close to the actual page, per that same guidance.
  const { data, error } = await supabase.auth.getClaims();
  const isAuthenticated = !error && !!data?.claims;

  const pathname = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!isAuthenticated && !isPublicPath) {
    const loginUrl = new URL("/connexion", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && isPublicPath) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
