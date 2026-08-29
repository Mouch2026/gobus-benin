"use server";

import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

type SubscriptionForPayment = {
  id: string;
  status: string;
  subscription_plan_id: string;
  subscription_plans: { price_fcfa: number } | null;
};

// SIMULÉ — à remplacer par une vraie intégration FedaPay (create-payment /
// payment-webhook, voir CLAUDE.md) une fois branchée, pour l'abonnement et
// les billets voyageurs en même temps.
export async function simulatePayment(subscriptionId: string): Promise<void> {
  const { data: subscription } = await supabaseAdmin
    .from("company_subscriptions")
    .select("id, status, subscription_plan_id, subscription_plans(price_fcfa)")
    .eq("id", subscriptionId)
    .maybeSingle<SubscriptionForPayment>();

  if (!subscription || subscription.status !== "pending_payment" || !subscription.subscription_plans) {
    // Pas d'erreur technique : on renvoie sur la page de paiement, qui sait
    // déjà afficher un état clair (introuvable / déjà active).
    redirect(`/partenaires/paiement?subscription=${subscriptionId}`);
  }

  // Inséré en 'pending' PUIS mis à jour en 'approved' — pas 'approved' dès
  // l'insert. Le trigger activate_subscription_on_payment_approved
  // (supabase/migrations/20260829020406_add_subscription_billing.sql) ne se
  // déclenche que sur un UPDATE de `status` (`before update of status`),
  // pas sur un insert : OLD n'existe pas dans ce cas, la comparaison
  // `old.status <> 'approved'` ne peut pas s'évaluer. Ces deux écritures
  // sont invisibles pour l'utilisateur mais nécessaires pour réutiliser le
  // trigger existant tel quel, sans dupliquer sa logique d'activation ici.
  const { data: payment, error: insertError } = await supabaseAdmin
    .from("subscription_payments")
    .insert({
      company_subscription_id: subscriptionId,
      subscription_plan_id: subscription.subscription_plan_id,
      amount_fcfa: subscription.subscription_plans.price_fcfa,
      provider: "simulated",
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !payment) {
    redirect(`/partenaires/paiement?subscription=${subscriptionId}`);
  }

  await supabaseAdmin
    .from("subscription_payments")
    .update({ status: "approved", paid_at: new Date().toISOString() })
    .eq("id", payment.id);

  redirect(`/partenaires/succes?subscription=${subscriptionId}`);
}
