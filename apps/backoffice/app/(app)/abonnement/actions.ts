"use server";

import { redirect } from "next/navigation";
import { requireCompany } from "@/lib/supabase/dal";
import { requirePermission } from "@/lib/permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logAuditEvent } from "shared/src/lib/auditLog";

export type ChangePlanState = { error: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Un changement de plan est une nouvelle transaction d'abonnement, pas un
// nouveau concept : réutilise exactement le patron de
// apps/web/app/partenaires/paiement/actions.ts::simulatePayment — insert
// subscription_payments en 'pending' PUIS update en 'approved' (jamais
// 'approved' dès l'insert), pour que le trigger déjà en place
// (activate_subscription_on_payment_approved, supabase/migrations/
// 20260829020406_add_subscription_billing.sql) se déclenche sans être
// modifié. Ce trigger écrit déjà subscription_plan_id DEPUIS LE PAIEMENT
// (pas depuis l'abonnement existant), donc gère déjà un changement de
// plan : status='active', nouvelle période pleine (jamais de prorata),
// aucune coexistence de deux plans — company_subscriptions reste UNE
// seule ligne par compagnie, mise à jour en place, jamais dupliquée.
export async function changePlan(_prevState: ChangePlanState, formData: FormData): Promise<ChangePlanState> {
  const access = await requireCompany();
  const guardError = requirePermission(access, "subscription.manage");
  if (guardError) return guardError;
  if (!access.ok) {
    return { error: "Votre session ou votre abonnement ne permet plus cette action." };
  }

  const planId = String(formData.get("planId") ?? "").trim();
  if (!UUID_RE.test(planId)) {
    return { error: "Plan invalide." };
  }

  // Jamais fait confiance à l'id transmis seul : le plan doit exister et
  // être actif (même garde-fou que createEmployee vérifiant l'agence).
  const { data: newPlan } = await supabaseAdmin
    .from("subscription_plans")
    .select("id, name, price_fcfa")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle<{ id: string; name: string; price_fcfa: number }>();

  if (!newPlan) {
    return { error: "Ce plan n'existe pas ou n'est plus disponible." };
  }

  // company_subscriptions : une seule ligne par compagnie (unique(company_id)).
  const { data: subscription } = await supabaseAdmin
    .from("company_subscriptions")
    .select("id, subscription_plan_id, subscription_plans(name)")
    .eq("company_id", access.company.id)
    .maybeSingle<{ id: string; subscription_plan_id: string; subscription_plans: { name: string } | null }>();

  if (!subscription) {
    return { error: "Aucun abonnement trouvé pour votre compagnie." };
  }

  if (subscription.subscription_plan_id === planId) {
    return { error: "Vous êtes déjà sur ce plan." };
  }

  const oldPlanId = subscription.subscription_plan_id;
  const oldPlanName = subscription.subscription_plans?.name ?? null;

  const { data: payment, error: insertError } = await supabaseAdmin
    .from("subscription_payments")
    .insert({
      company_subscription_id: subscription.id,
      subscription_plan_id: newPlan.id,
      amount_fcfa: newPlan.price_fcfa,
      provider: "simulated",
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !payment) {
    console.error("Impossible de créer le paiement de changement de plan :", insertError?.message);
    return { error: "Impossible de changer de plan. Réessayez." };
  }

  const { error: approveError } = await supabaseAdmin
    .from("subscription_payments")
    .update({ status: "approved", paid_at: new Date().toISOString() })
    .eq("id", payment.id);

  if (approveError) {
    console.error("Impossible d'approuver le paiement de changement de plan :", approveError.message);
    return { error: "Impossible de changer de plan. Réessayez." };
  }

  // Chantier audit — événement niveau compagnie, sans réservation ni
  // agence, même forme que session_swap (chantier 6) : aucun changement
  // de schéma nécessaire, audit_logs.booking_id/agency_id sont déjà
  // nullable pour exactement ce cas.
  await logAuditEvent({
    action: "subscription_plan_changed",
    bookingId: null,
    companyId: access.company.id,
    acteurId: access.user.sub,
    agencyId: null,
    payload: {
      old_plan_id: oldPlanId,
      old_plan_name: oldPlanName,
      new_plan_id: newPlan.id,
      new_plan_name: newPlan.name,
      amount_fcfa: newPlan.price_fcfa,
    },
  });

  redirect("/abonnement?plan_changed=1");
}
