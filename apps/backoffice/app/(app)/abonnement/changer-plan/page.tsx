import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../../_components";
import { ChangePlanForm } from "./ChangePlanForm";

const BILLING_PERIOD_LABELS: Record<string, string> = {
  monthly: "/mois",
  yearly: "/an",
};

type PlanForConfirmation = {
  id: string;
  name: string;
  price_fcfa: number;
  billing_period: string;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function getPlan(planId: string): Promise<PlanForConfirmation | null> {
  const supabase = await createClient();
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

// Pas encore dans AppRoutes générées par Next (.next/types/routes.d.ts —
// régénérées par next dev/build, pas par tsc seul) : typé ici à la main
// plutôt que via PageProps<'/abonnement/changer-plan'>, même chose que le
// reste de l'App Router pour un Server Component avec searchParams.
export default async function ChangerPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  if (!can(result.role, "subscription.manage")) {
    return (
      <div className="mx-auto max-w-xl px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Cette page est réservée au propriétaire du compte.
        </p>
      </div>
    );
  }

  const resolvedSearchParams = await searchParams;
  const planId = firstValue(resolvedSearchParams.plan);

  const plan = planId ? await getPlan(planId) : null;

  if (!plan) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-8 text-center">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Ce plan n&apos;existe pas ou n&apos;est plus disponible.
        </p>
        <Link href="/abonnement" className="font-medium text-zinc-700 hover:underline dark:text-zinc-300">
          ← Retour à l&apos;abonnement
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-6 py-8">
      <Link href="/abonnement" className="text-sm text-zinc-500 hover:underline dark:text-zinc-400">
        ← Retour à l&apos;abonnement
      </Link>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Changer de plan</h1>

        <div className="mt-4 flex items-center justify-between border-b border-t border-zinc-200 py-4 dark:border-zinc-800">
          <span className="text-zinc-500 dark:text-zinc-400">Plan {plan.name}</span>
          <span className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            {formatFcfa(plan.price_fcfa)}
            <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
              {BILLING_PERIOD_LABELS[plan.billing_period] ?? ""}
            </span>
          </span>
        </div>

        <p className="mt-4 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          Simulation — le vrai paiement (FedaPay) n&apos;est pas encore branché. Ce bouton active le
          nouveau plan directement, sans paiement réel. Effet immédiat : la période en cours
          redémarre à partir d&apos;aujourd&apos;hui, sans calcul au prorata.
        </p>

        <ChangePlanForm planId={plan.id} />
      </div>
    </div>
  );
}
