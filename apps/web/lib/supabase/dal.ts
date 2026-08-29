import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./server";

export type UserClaims = { sub: string; email?: string; [key: string]: unknown };

// The real authorization boundary for the few pages/actions that actually
// require a traveler to be signed in (booking creation, payment, success).
// Unlike apps/backoffice, there's no global proxy.ts gate here — apps/web
// is a public site (home, search, /aide, /partenaires must stay reachable
// by an anonymous visitor), so each protected entry point calls this
// itself rather than relying on a blanket redirect.
export async function requireUser(redirectTo?: string): Promise<UserClaims> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    const loginUrl = redirectTo
      ? `/compte/connexion?next=${encodeURIComponent(redirectTo)}`
      : "/compte/connexion";
    redirect(loginUrl);
  }

  return data.claims as UserClaims;
}

// Same check, but never redirects — used only for the soft, UX-level
// "is someone logged in?" question (e.g. deciding whether the booking
// form's button should submit or send the visitor to /connexion first).
// It is not a security boundary: createBooking() and the payment actions
// re-check via requireUser() regardless of what this returned.
export async function getOptionalUser(): Promise<UserClaims | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) return null;
  return data.claims as UserClaims;
}
