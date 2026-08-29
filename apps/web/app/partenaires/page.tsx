import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatFcfa } from "shared";
import { CheckIcon } from "@/lib/icons";

type SubscriptionPlan = {
  id: string;
  name: string;
  price_fcfa: number;
  billing_period: string;
  features: string[];
};

const BILLING_PERIOD_LABELS: Record<string, string> = {
  monthly: "/mois",
  yearly: "/an",
};

async function getActivePlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("id, name, price_fcfa, billing_period, features")
    .eq("is_active", true)
    .order("price_fcfa", { ascending: true });

  if (error) {
    console.error("Impossible de charger les plans :", error.message);
    return [];
  }

  return (data ?? []) as unknown as SubscriptionPlan[];
}

export default async function PartenairesPage() {
  const plans = await getActivePlans();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <section className="border-b border-border bg-foreground px-4 py-16 text-center sm:py-20">
        <span className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-primary">
          GoBus Bénin — Compagnies
        </span>
        <h1 className="mx-auto mt-3 max-w-2xl text-balance font-display text-3xl font-extrabold leading-tight text-on-ink sm:text-4xl">
          Déclarez vos trajets, gardez 100% de votre prix
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-on-ink-muted">
          Pas de commission sur vos ventes : un abonnement fixe pour accéder au
          back-office GoBus et publier vos départs.
        </p>
      </section>

      <section className="mx-auto w-full max-w-4xl px-4 py-16">
        {plans.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-6 text-center text-muted">
            Aucun plan disponible pour le moment. Revenez bientôt.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-8"
              >
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground">{plan.name}</h2>
                  <p className="mt-1 font-display text-3xl font-extrabold text-foreground">
                    {formatFcfa(plan.price_fcfa)}
                    <span className="text-base font-medium text-muted">
                      {BILLING_PERIOD_LABELS[plan.billing_period] ?? ""}
                    </span>
                  </p>
                </div>

                <ul className="flex flex-1 flex-col gap-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-foreground">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary-hover" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={`/partenaires/inscription?plan=${plan.id}`}
                  className="rounded-lg bg-primary px-4 py-2.5 text-center font-display font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
                >
                  Choisir
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
