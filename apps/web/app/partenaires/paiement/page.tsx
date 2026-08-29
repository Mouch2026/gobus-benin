import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { formatFcfa } from "shared";
import { simulatePayment } from "./actions";
import { SubmitButton } from "./SubmitButton";

type SubscriptionWithPlan = {
  id: string;
  status: string;
  subscription_plans: { name: string; price_fcfa: number; billing_period: string } | null;
};

const BILLING_PERIOD_LABELS: Record<string, string> = {
  monthly: "/mois",
  yearly: "/an",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function getSubscription(subscriptionId: string): Promise<SubscriptionWithPlan | null> {
  // company_subscriptions n'est lisible que par son propriétaire connecté
  // (RLS is_company_owner) — or personne n'est connecté sur apps/web à ce
  // stade du parcours. On lit donc via service_role, pas le client anon.
  const { data, error } = await supabaseAdmin
    .from("company_subscriptions")
    .select("id, status, subscription_plans(name, price_fcfa, billing_period)")
    .eq("id", subscriptionId)
    .maybeSingle<SubscriptionWithPlan>();

  if (error) {
    console.error("Impossible de charger l'abonnement :", error.message);
    return null;
  }

  return data;
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="max-w-sm rounded-2xl border border-border bg-surface p-6 text-muted">
        {children}
      </p>
      <Link href="/partenaires" className="font-semibold text-primary hover:underline">
        ← Retour aux plans
      </Link>
    </div>
  );
}

export default async function PaiementPage(props: PageProps<"/partenaires/paiement">) {
  const searchParams = await props.searchParams;
  const subscriptionId = firstValue(searchParams.subscription);

  if (!subscriptionId) {
    return <Message>Aucun abonnement à payer.</Message>;
  }

  const subscription = await getSubscription(subscriptionId);

  if (!subscription || !subscription.subscription_plans) {
    return <Message>Cet abonnement n&apos;existe pas.</Message>;
  }

  if (subscription.status === "active") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="max-w-sm rounded-2xl border border-border bg-surface p-6 text-muted">
          Cet abonnement est déjà actif.
        </p>
        <Link
          href={`/partenaires/succes?subscription=${subscriptionId}`}
          className="font-semibold text-primary hover:underline"
        >
          Voir la confirmation →
        </Link>
      </div>
    );
  }

  const plan = subscription.subscription_plans;
  const simulatePaymentForSubscription = simulatePayment.bind(null, subscriptionId);

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <h1 className="font-display text-2xl font-extrabold text-foreground">Paiement</h1>

        <div className="mt-4 flex items-center justify-between border-t border-b border-border py-4">
          <span className="text-muted">Plan {plan.name}</span>
          <span className="font-display text-xl font-extrabold text-foreground">
            {formatFcfa(plan.price_fcfa)}
            <span className="text-sm font-medium text-muted">
              {BILLING_PERIOD_LABELS[plan.billing_period] ?? ""}
            </span>
          </span>
        </div>

        <p className="mt-4 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-muted">
          Simulation — le vrai paiement (FedaPay) n&apos;est pas encore branché. Ce bouton active
          votre abonnement directement, sans paiement réel.
        </p>

        <form action={simulatePaymentForSubscription} className="mt-4">
          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
