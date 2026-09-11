import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// The real authorization boundary. proxy.ts also redirects unauthenticated
// requests, but per Next's own guidance that's an optimistic, edge-level
// check — this is the check that must run close to the actual page/data,
// since proxy alone "should not be your only line of defense".
//
// Mémoïsé par requête via React cache() : le layout partagé
// (app/(app)/layout.tsx) ET chaque page individuelle appellent tous les
// deux requireUser()/requireCompany() (voir plus bas) — chaque page garde
// son propre appel pour respecter la règle CLAUDE.md ("toute page ...
// doit appeler requireCompany()"), cache() évite juste que ça double les
// allers-retours Supabase réels. Changement additif pur : mêmes entrées →
// mêmes sorties dans une requête donnée, aucun changement de comportement.
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/connexion");
  }

  return data.claims;
});

export type Company = {
  id: string;
  name: string;
  slug: string;
};

export type UserClaims = Awaited<ReturnType<typeof requireUser>>;

export type CompanyRole = "owner" | "agency_manager" | "agent";

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
      // Chantier "comptes multi-agents" : role/agency/memberName sont
      // purement additifs — voir le plan pour la vérification exhaustive
      // qu'aucun appelant existant n'est affecté par cet ajout.
      role: CompanyRole;
      agency: { id: string; name: string } | null; // null pour un propriétaire
      memberName: string; // full_name saisi à la création, ou email à défaut
      subscription: { planName: string; currentPeriodEnd: string | null };
    }
  | { ok: false; reason: CompanyAccessDenialReason };

type GetCompanyAccessRow = {
  company_id: string;
  company_name: string;
  company_slug: string;
  member_role: string;
  agency_id: string | null;
  agency_name: string | null;
  member_name: string;
  subscription_status: string | null;
  current_period_end: string | null;
  plan_name: string | null;
};

// requireUser() only proves the session is valid; a connected account can
// still have no company/membership row, or a company with no active
// subscription. Both checks live in this one function — not requireUser()
// plus a separate subscription check a future page could forget to call —
// so every backoffice page that scopes data by company gets both for free
// from this single call.
//
// Résolution de la compagnie : auparavant 2 requêtes sur le client de
// session (RLS `authenticated`), filtrées par `companies.owner_id` — un
// employé (non-propriétaire) échouait aux deux, avant même d'atteindre la
// vérification d'abonnement. Un seul appel service_role à
// get_company_access() (SQL) résout désormais la compagnie via
// company_members (qui couvre le propriétaire — ligne dérivée par trigger,
// voir la migration — ET tout employé actif), en toute sécurité : p_user_id
// vient du JWT déjà vérifié par requireUser() (getClaims() vérifie la
// signature), jamais d'une entrée cliente. La logique de statut
// d'abonnement ci-dessous reste strictement identique à avant — seul le
// client qui va chercher les données a changé.
export const requireCompany = cache(async (): Promise<CompanyAccessResult> => {
  const user = await requireUser();

  const { data, error } = await supabaseAdmin
    .rpc("get_company_access", { p_user_id: user.sub })
    .maybeSingle<GetCompanyAccessRow>();

  if (error) {
    console.error("Impossible de résoudre l'accès compagnie :", error.message);
    return { ok: false, reason: "no-company" };
  }

  if (!data) {
    // Ni propriétaire, ni membre actif d'aucune compagnie.
    return { ok: false, reason: "no-company" };
  }

  if (!data.subscription_status) {
    return { ok: false, reason: "no-subscription" };
  }

  if (data.subscription_status === "pending_payment") {
    return { ok: false, reason: "subscription-pending" };
  }

  if (data.subscription_status === "inactive") {
    return { ok: false, reason: "subscription-inactive" };
  }

  return {
    ok: true,
    user,
    company: { id: data.company_id, name: data.company_name, slug: data.company_slug },
    role: data.member_role as CompanyRole,
    agency: data.agency_id ? { id: data.agency_id, name: data.agency_name! } : null,
    memberName: data.member_name,
    subscription: {
      planName: data.plan_name ?? "—",
      currentPeriodEnd: data.current_period_end,
    },
  };
});
