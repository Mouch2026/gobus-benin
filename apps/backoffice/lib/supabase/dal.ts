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

export type CompanyAccessDenialReason =
  | "no-company"
  | "no-subscription"
  | "subscription-pending"
  | "subscription-inactive";

export type CompanyAccessResult =
  | {
      ok: true;
      user: UserClaims;
      company: Company;
      subscription: { planName: string; currentPeriodEnd: string | null };
    }
  | { ok: false; reason: CompanyAccessDenialReason };

type CompanySubscriptionRow = {
  status: string;
  current_period_end: string | null;
  subscription_plans: { name: string } | null;
};

// requireUser() only proves the session is valid; a connected account can
// still have no `companies` row, or a company with no active subscription.
// Both checks live in this one function — not requireUser() plus a
// separate subscription check a future page could forget to call — so
// every backoffice page that scopes data by company gets both for free
// from this single call.
export async function requireCompany(): Promise<CompanyAccessResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("owner_id", user.sub)
    .maybeSingle();

  if (companyError) {
    console.error("Impossible de charger la compagnie :", companyError.message);
    return { ok: false, reason: "no-company" };
  }

  if (!company) {
    return { ok: false, reason: "no-company" };
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from("company_subscriptions")
    .select("status, current_period_end, subscription_plans(name)")
    .eq("company_id", company.id)
    .maybeSingle<CompanySubscriptionRow>();

  if (subscriptionError) {
    console.error("Impossible de charger l'abonnement :", subscriptionError.message);
    return { ok: false, reason: "no-subscription" };
  }

  if (!subscription) {
    return { ok: false, reason: "no-subscription" };
  }

  if (subscription.status === "pending_payment") {
    return { ok: false, reason: "subscription-pending" };
  }

  if (subscription.status === "inactive") {
    return { ok: false, reason: "subscription-inactive" };
  }

  return {
    ok: true,
    user,
    company,
    subscription: {
      planName: subscription.subscription_plans?.name ?? "—",
      currentPeriodEnd: subscription.current_period_end,
    },
  };
}
