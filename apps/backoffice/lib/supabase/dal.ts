import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./server";

// The real authorization boundary. proxy.ts also redirects unauthenticated
// requests, but per Next's own guidance that's an optimistic, edge-level
// check — this is the check that must run close to the actual page/data,
// since proxy alone "should not be your only line of defense".
export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/connexion");
  }

  return data.claims;
}

export type Company = {
  id: string;
  name: string;
  slug: string;
};

export type UserClaims = Awaited<ReturnType<typeof requireUser>>;

// requireUser() only proves the session is valid — a connected account can
// still have no `companies` row (owner_id = its id). Every backoffice page
// that scopes data by company must call this instead of requireUser()
// directly, or an account with no company sees a silently empty result
// (RLS/company_id filters just match nothing) instead of an explanation.
// Returns both, so callers needing the user (e.g. to display their email)
// don't need a separate requireUser() call re-verifying the same session.
export async function requireCompany(): Promise<{
  user: UserClaims;
  company: Company | null;
}> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("owner_id", user.sub)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger la compagnie :", error.message);
    return { user, company: null };
  }

  return { user, company: data };
}
