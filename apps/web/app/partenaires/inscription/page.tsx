import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatFcfa } from "shared";
import { SignupForm } from "./SignupForm";

type SubscriptionPlan = {
  id: string;
  name: string;
  price_fcfa: number;
  billing_period: string;
};

const BILLING_PERIOD_LABELS: Record<string, string> = {
  monthly: "/mois",
  yearly: "/an",
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function getActivePlan(planId: string): Promise<SubscriptionPlan | null> {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("id, name, price_fcfa, billing_period")
    .eq("id", planId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger le plan :", error.message);
    return null;
  }

  return data;
}

function InvalidPlanMessage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <p className="max-w-sm rounded-2xl border border-border bg-surface p-6 text-muted">
        Ce plan n&apos;existe pas ou n&apos;est plus disponible.
      </p>
      <Link href="/partenaires" className="font-semibold text-primary hover:underline">
        ← Voir les plans disponibles
      </Link>
    </div>
  );
}

export default async function InscriptionPage(props: PageProps<"/partenaires/inscription">) {
  const searchParams = await props.searchParams;
  const planId = firstValue(searchParams.plan);

  if (!planId) {
    return <InvalidPlanMessage />;
  }

  const plan = await getActivePlan(planId);

  if (!plan) {
    return <InvalidPlanMessage />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-extrabold text-foreground">
            Créer votre compte compagnie
          </h1>
          <p className="mt-2 text-muted">
            Plan <span className="font-semibold text-foreground">{plan.name}</span> —{" "}
            {formatFcfa(plan.price_fcfa)}
            {BILLING_PERIOD_LABELS[plan.billing_period] ?? ""}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-8">
          <SignupForm planId={plan.id} />
        </div>
      </div>
    </div>
  );
}
