import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Session-aware client (cookie-based), for anything that needs to know
// which traveler is signed in. Distinct from ../supabase.ts (plain anon
// client, no session) — that one stays in place for the purely public
// catalog reads (trips/routes/companies) that don't care who's asking.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called during a plain Server Component render, where
          // next/headers cookies() is read-only. Safe to ignore — the
          // session is refreshed on the next request that can set cookies
          // (a Server Action or Route Handler).
        }
      },
    },
  });
}
