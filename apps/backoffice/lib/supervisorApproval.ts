import "server-only";
import { createClient as createIsolatedClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { findExistingUserByEmail } from "@/lib/customers";
import type { CompanyRole } from "./permissions";

// Chantier 3c : validation superviseur (remise agent > 10%, annulation
// guichet < 2h avant départ). Voir le plan pour le raisonnement complet —
// résumé : create_booking_for_company réserve déjà le siège
// atomiquement ; ce qui est différé jusqu'à validation, c'est uniquement
// l'insertion des paiements (remise) ou l'appel à
// cancel_booking_by_company lui-même (annulation).

export const APPROVAL_EXPIRATION_MINUTES = 10;

export type ApprovalActionType = "discount" | "cancellation";
export type CounterPaymentPart = { mode: "mtn_money" | "moov_money" | "card" | "cash"; amountFcfa: number };

export type VerifySupervisorResult =
  | { ok: true; supervisorUserId: string }
  | { ok: false; error: string };

// Vérifie le mot de passe d'UN TIERS (le superviseur), jamais celui de
// l'appelant — n'utilise JAMAIS le client de session de l'agent
// (apps/backoffice/lib/supabase/server.ts) : un signInWithPassword
// réussi dessus remplacerait ses cookies de session par ceux du
// superviseur. Client isolé, persistSession: false, jeté après cet appel.
export async function verifySupervisorOnSite(params: {
  companyId: string;
  agencyId: string;
  email: string;
  password: string;
}): Promise<VerifySupervisorResult> {
  const email = params.email.trim();
  const genericError = "Identifiants superviseur incorrects.";

  if (!email || !params.password) {
    return { ok: false, error: "Merci de renseigner l'email et le mot de passe du superviseur." };
  }

  let supervisorUserId: string | null;
  try {
    supervisorUserId = await findExistingUserByEmail(email);
  } catch (err) {
    console.error("Impossible de résoudre l'email du superviseur :", err);
    return { ok: false, error: genericError };
  }
  if (!supervisorUserId) {
    return { ok: false, error: genericError };
  }

  // Éligibilité vérifiée AVANT tout appel réseau à GoTrue : un compte qui
  // existe mais n'est ni owner ni agency_manager de CETTE agence ne doit
  // jamais faire dépenser une tentative de mot de passe pour rien.
  const { data: member } = await supabaseAdmin
    .from("company_members")
    .select("role, agency_id")
    .eq("user_id", supervisorUserId)
    .eq("company_id", params.companyId)
    .eq("is_active", true)
    .maybeSingle<{ role: CompanyRole; agency_id: string | null }>();

  const eligible =
    !!member &&
    (member.role === "owner" ||
      (member.role === "agency_manager" && member.agency_id === params.agencyId));

  if (!eligible) {
    return { ok: false, error: genericError };
  }

  const isolatedClient = createIsolatedClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { error } = await isolatedClient.auth.signInWithPassword({ email, password: params.password });
  if (error) {
    return { ok: false, error: genericError };
  }

  return { ok: true, supervisorUserId };
}

type DiscountPayload = {
  discountPercent: number;
  discountAmountFcfa: number;
  paymentParts: CounterPaymentPart[];
  voucherId: string | null;
  usePoints: boolean;
};

async function insertApprovalRequest(params: {
  companyId: string;
  agencyId: string;
  requestedBy: string;
  actionType: ApprovalActionType;
  bookingId: string;
  mode: "on_site" | "remote";
  status: "pending" | "approved";
  reviewedBy?: string;
  discount?: DiscountPayload;
}): Promise<{ id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("supervisor_approval_requests")
    .insert({
      company_id: params.companyId,
      agency_id: params.agencyId,
      requested_by: params.requestedBy,
      action_type: params.actionType,
      mode: params.mode,
      status: params.status,
      booking_id: params.bookingId,
      discount_percent: params.discount?.discountPercent ?? null,
      discount_amount_fcfa: params.discount?.discountAmountFcfa ?? null,
      payment_parts: params.discount?.paymentParts ?? null,
      voucher_id: params.discount?.voucherId ?? null,
      use_points: params.discount?.usePoints ?? null,
      reviewed_by: params.reviewedBy ?? null,
      reviewed_at: params.reviewedBy ? new Date().toISOString() : null,
      expires_at: new Date(Date.now() + APPROVAL_EXPIRATION_MINUTES * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Impossible de créer la demande de validation :", error.message);
    return null;
  }
  return data;
}

// mode = 'on_site', déjà résolue (approved) au moment de la création —
// une seule ligne par action gérée, que ce soit tranché immédiatement ou
// après une attente (voir le plan, point 4 — traçabilité unifiée).
export async function createResolvedApprovalRequest(params: {
  companyId: string;
  agencyId: string;
  requestedBy: string;
  actionType: ApprovalActionType;
  bookingId: string;
  reviewedBy: string;
  discount?: DiscountPayload;
}): Promise<{ id: string } | null> {
  return insertApprovalRequest({ ...params, mode: "on_site", status: "approved" });
}

export async function createPendingApprovalRequest(params: {
  companyId: string;
  agencyId: string;
  requestedBy: string;
  actionType: ApprovalActionType;
  bookingId: string;
  discount?: DiscountPayload;
}): Promise<{ id: string } | null> {
  return insertApprovalRequest({ ...params, mode: "remote", status: "pending" });
}

// Réutilise company_notifications (chantier "infrastructure de
// notifications back-office") tel quel — deux lignes car le ciblage
// actuel (target_role + target_agency_id, combinés en ET) ne peut pas
// exprimer "owner OU agency_manager de cette agence" en une seule ligne.
export async function notifySupervisors(params: {
  companyId: string;
  agencyId: string;
  title: string;
  body: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("company_notifications").insert([
    {
      company_id: params.companyId,
      kind: "event",
      type: "supervisor_approval_requested",
      level: "warning",
      title: params.title,
      body: params.body,
      action_href: "/validations",
      target_role: "owner",
      target_agency_id: null,
    },
    {
      company_id: params.companyId,
      kind: "event",
      type: "supervisor_approval_requested",
      level: "warning",
      title: params.title,
      body: params.body,
      action_href: "/validations",
      target_role: "agency_manager",
      target_agency_id: params.agencyId,
    },
  ]);
  if (error) {
    console.error("Impossible de notifier les superviseurs :", error.message);
  }
}

export type ResolvedApprovalRequest = {
  action_type: ApprovalActionType;
  booking_id: string;
  discount_percent: number | null;
  discount_amount_fcfa: number | null;
  payment_parts: CounterPaymentPart[] | null;
  voucher_id: string | null;
  use_points: boolean | null;
};

export type ResolveApprovalRequestResult =
  | { ok: true; request: ResolvedApprovalRequest }
  | { ok: false; error: string };

// Résolution CONDITIONNELLE (where status = 'pending') — même patron que
// la réclamation de quota des codes promo (chantier précédent) : si deux
// superviseurs cliquent en même temps, un seul gagne, l'autre reçoit 0
// ligne plutôt qu'une exception. scopeAgencyId restreint la portée d'un
// agency_manager à sa propre agence ; null = owner, aucune restriction
// au-delà de la compagnie.
export async function resolveApprovalRequest(params: {
  requestId: string;
  decision: "approved" | "rejected";
  reviewerId: string;
  companyId: string;
  scopeAgencyId: string | null;
}): Promise<ResolveApprovalRequestResult> {
  let query = supabaseAdmin
    .from("supervisor_approval_requests")
    .update({ status: params.decision, reviewed_by: params.reviewerId, reviewed_at: new Date().toISOString() })
    .eq("id", params.requestId)
    .eq("status", "pending")
    .eq("company_id", params.companyId);

  if (params.scopeAgencyId) {
    query = query.eq("agency_id", params.scopeAgencyId);
  }

  const { data, error } = await query
    .select("action_type, booking_id, discount_percent, discount_amount_fcfa, payment_parts, voucher_id, use_points")
    .maybeSingle<ResolvedApprovalRequest>();

  if (error) {
    console.error("Impossible de résoudre la demande de validation :", error.message);
    return { ok: false, error: "Impossible de traiter cette demande. Réessayez." };
  }
  if (!data) {
    return { ok: false, error: "Cette demande n'est plus en attente (déjà traitée, ou hors de votre portée)." };
  }
  return { ok: true, request: data };
}

// Sweep paresseux — appelé au chargement de /reservations/[bookingId] et
// de /validations, en complément du pg_cron programmé par la migration
// (même fonction SQL dans les deux cas, jamais de logique dupliquée).
export async function sweepExpiredApprovalRequests(): Promise<void> {
  const { error } = await supabaseAdmin.rpc("expire_stale_supervisor_requests");
  if (error) {
    console.error("Impossible de purger les demandes de validation expirées :", error.message);
  }
}
