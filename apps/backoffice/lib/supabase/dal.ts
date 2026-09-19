import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { CompanyRole } from "@/lib/permissions";

export type { CompanyRole } from "@/lib/permissions";

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
  logoUrl: string | null;
};

export type UserClaims = Awaited<ReturnType<typeof requireUser>>;

export type CompanyAccessDenialReason =
  | "no-company"
  | "no-subscription"
  | "subscription-pending"
  | "subscription-inactive"
  // Chantier 6 (verrouillage d'écran) : "no-pin" tant que l'agent n'a
  // jamais défini de code PIN (impossible de verrouiller un poste qu'on
  // ne pourra jamais rouvrir) ; "locked" une fois le PIN défini, dès que
  // l'écran est explicitement verrouillé OU inactif depuis plus de
  // lock_timeout_minutes — voir plus bas, toujours calculé, jamais mis
  // en cache.
  | "no-pin"
  | "locked";

export type CompanyAccessResult =
  | {
      ok: true;
      user: UserClaims;
      company: Company;
      // Chantier "comptes multi-agents" : role/agency/memberName sont
      // purement additifs — voir le plan pour la vérification exhaustive
      // qu'aucun appelant existant n'est affecté par cet ajout.
      role: CompanyRole;
      // null pour un propriétaire. stationId : la gare du guichet
      // (agencies.station_id, not null) — défaut du sélecteur de gare.
      agency: { id: string; name: string; stationId: string } | null;
      memberName: string; // full_name saisi à la création, ou email à défaut
      subscription: { planName: string; currentPeriodEnd: string | null };
      // Chantier 6 — seuil lu une fois ici, transmis au traqueur
      // d'activité côté client (_activity-tracker.tsx).
      lockTimeoutMinutes: number;
    }
  | { ok: false; reason: "no-company" | "no-subscription" | "subscription-pending" | "subscription-inactive" | "no-pin" }
  | { ok: false; reason: "locked"; company: Company; memberName: string; lockedAt: string };

type GetCompanyAccessRow = {
  company_id: string;
  company_name: string;
  company_slug: string;
  company_logo_url: string | null;
  member_role: string;
  agency_id: string | null;
  agency_name: string | null;
  agency_station_id: string | null;
  member_name: string;
  subscription_status: string | null;
  current_period_end: string | null;
  plan_name: string | null;
  has_pin: boolean;
  locked_at: string | null;
  last_activity_at: string;
  lock_timeout_minutes: number;
  session_started_at: string;
};

// Chantier 6 (correctif) — expiration dure : jwt_expiry seul ne suffit
// pas (le SDK rafraîchit silencieusement l'access token via le refresh
// token tant que l'agent reste actif, vérifié en conditions réelles), et
// le natif Supabase équivalent ([auth.sessions] timebox) est un réglage
// de PROJET qui toucherait aussi apps/web — hors de portée de ce
// chantier back-office uniquement. session_started_at (posé par login())
// sert donc d'ancre indépendante du cycle de rafraîchissement du JWT.
const HARD_SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

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

  const company: Company = {
    id: data.company_id,
    name: data.company_name,
    slug: data.company_slug,
    logoUrl: data.company_logo_url,
  };

  // Chantier 6 (correctif) — PRIORITAIRE sur tout le reste (no-pin,
  // locked) : au-delà de 8h depuis la dernière connexion RÉELLE par mot
  // de passe, c'est une vraie déconnexion, pas un simple écran de
  // verrouillage — celui-ci suppose au contraire une session encore
  // valide qu'on ne fait que réaffirmer. redirect() lève une exception
  // interne à Next.js : le reste de cette fonction ne s'exécute jamais
  // dans ce cas, aucun retour normal n'est nécessaire.
  const sessionStartedMs = new Date(data.session_started_at).getTime();
  if (Date.now() - sessionStartedMs > HARD_SESSION_DURATION_MS) {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/connexion");
  }

  // Chantier 6 — vérifié avant le calcul de verrouillage : un compte sans
  // PIN ne pourra jamais se déverrouiller, donc ne peut jamais être
  // considéré "verrouillé" en premier lieu (voir le plan, point 4).
  if (!data.has_pin) {
    return { ok: false, reason: "no-pin" };
  }

  // Toujours dérivé, jamais mis en cache dans une colonne "is_locked" —
  // même philosophie que session_caisse.solde_theorique_fcfa (chantier
  // 4). C'est ce qui garantit le refus même si l'écran a été contourné
  // côté client : un locked_at explicite (posé par lockScreen()) OU une
  // inactivité de plus de lock_timeout_minutes, recalculée à CHAQUE appel
  // de requireCompany() — donc à chaque page/Server Action, sans tâche de
  // fond.
  const timeoutMs = data.lock_timeout_minutes * 60 * 1000;
  const lastActivityMs = new Date(data.last_activity_at).getTime();
  const isLocked = data.locked_at !== null || Date.now() - lastActivityMs > timeoutMs;

  if (isLocked) {
    return {
      ok: false,
      reason: "locked",
      company,
      memberName: data.member_name,
      lockedAt: data.locked_at ?? data.last_activity_at,
    };
  }

  return {
    ok: true,
    user,
    company,
    role: data.member_role as CompanyRole,
    agency: data.agency_id
      ? { id: data.agency_id, name: data.agency_name!, stationId: data.agency_station_id! }
      : null,
    memberName: data.member_name,
    subscription: {
      planName: data.plan_name ?? "—",
      currentPeriodEnd: data.current_period_end,
    },
    lockTimeoutMinutes: data.lock_timeout_minutes,
  };
});

export type CompanyMembership = {
  memberId: string;
  companyId: string;
  agencyId: string | null;
  role: CompanyRole;
  fullName: string | null;
  pinHash: string | null;
};

// Chantier 6 — utilisée UNIQUEMENT par lockActions.ts (lockScreen,
// unlockAsSelf, switchAgent, recordActivity) et la définition initiale du
// PIN : ces actions doivent rester joignables PENDANT que
// requireCompany() refuserait (verrouillé, ou pas encore de PIN) —
// contourne donc délibérément le calcul de verrouillage, exactement comme
// verifySupervisorOnSite contourne délibérément le client de session pour
// une raison de fond similaire (certains flux sont l'exception qui doit
// rester joignable). Ne vérifie PAS l'abonnement — un verrouillage/
// déverrouillage n'a pas besoin d'un abonnement actif pour rester
// cohérent avec lui-même.
export const requireCompanyMembership = cache(async (): Promise<CompanyMembership | null> => {
  const user = await requireUser();

  const { data } = await supabaseAdmin
    .from("company_members")
    .select("id, company_id, agency_id, role, full_name, pin_hash, is_active")
    .eq("user_id", user.sub)
    .maybeSingle<{
      id: string;
      company_id: string;
      agency_id: string | null;
      role: CompanyRole;
      full_name: string | null;
      pin_hash: string | null;
      is_active: boolean;
    }>();

  if (!data || !data.is_active) return null;

  return {
    memberId: data.id,
    companyId: data.company_id,
    agencyId: data.agency_id,
    role: data.role,
    fullName: data.full_name,
    pinHash: data.pin_hash,
  };
});
