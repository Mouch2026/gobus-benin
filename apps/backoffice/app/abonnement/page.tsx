import { requireCompany } from "@/lib/supabase/dal";
import { createClient } from "@/lib/supabase/server";
import { formatFcfa } from "shared";
import { AccessBlockedMessage } from "../_components";
import { Navigation } from "../_navigation";
import { formatDepartureDateTime } from "../_shared";

type SubscriptionDetail = {
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  subscription_plans: { name: string; price_fcfa: number; billing_period: string } | null;
};

type SubscriptionPaymentRow = {
  id: string;
  amount_fcfa: number;
  status: string;
  provider: string;
  paid_at: string | null;
  created_at: string;
  subscription_plans: { name: string } | null;
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  pending_payment: "En attente de paiement",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  approved: "Approuvé",
  failed: "Échoué",
  refunded: "Remboursé",
};

const BILLING_PERIOD_LABELS: Record<string, string> = {
  monthly: "/mois",
  yearly: "/an",
};

async function getSubscriptionDetail(companyId: string): Promise<SubscriptionDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_subscriptions")
    .select(
      "status, current_period_start, current_period_end, subscription_plans(name, price_fcfa, billing_period)"
    )
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("Impossible de charger l'abonnement :", error.message);
    return null;
  }

  return data as unknown as SubscriptionDetail | null;
}

async function getPaymentHistory(companyId: string): Promise<SubscriptionPaymentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subscription_payments")
    .select("id, amount_fcfa, status, provider, paid_at, created_at, subscription_plans(name)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Impossible de charger l'historique des paiements :", error.message);
    return [];
  }

  return (data ?? []) as unknown as SubscriptionPaymentRow[];
}

export default async function AbonnementPage() {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const [subscription, history] = await Promise.all([
    getSubscriptionDetail(result.company.id),
    getPaymentHistory(result.company.id),
  ]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <Navigation company={result.company} />

      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-8">
        <section>
          <h1 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Abonnement
          </h1>

          {subscription && subscription.subscription_plans ? (
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between">
                <span className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
                  Plan {subscription.subscription_plans.name}
                </span>
                <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                  {formatFcfa(subscription.subscription_plans.price_fcfa)}
                  <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
                    {BILLING_PERIOD_LABELS[subscription.subscription_plans.billing_period] ?? ""}
                  </span>
                </span>
              </div>
              <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                <span>Statut</span>
                <span>{SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status}</span>
              </div>
              {subscription.current_period_start ? (
                <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                  <span>Période en cours</span>
                  <span>
                    {formatDepartureDateTime(subscription.current_period_start)} →{" "}
                    {subscription.current_period_end
                      ? formatDepartureDateTime(subscription.current_period_end)
                      : "—"}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Aucun abonnement trouvé.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Historique des paiements
          </h2>

          {history.length === 0 ? (
            <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              Aucun paiement enregistré.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Montant</th>
                    <th className="px-4 py-3 font-medium">Statut</th>
                    <th className="px-4 py-3 font-medium">Fournisseur</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-800"
                    >
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {formatDepartureDateTime(payment.paid_at ?? payment.created_at)}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {payment.subscription_plans?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {formatFcfa(payment.amount_fcfa)}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">
                        {payment.provider === "simulated" ? "Simulé" : payment.provider}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
