import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatFcfa } from "shared";

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

async function getActivePlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase
    .from("subscription_plans")
    .select("id, name, price_fcfa, billing_period")
    .eq("is_active", true)
    .order("price_fcfa", { ascending: true });

  if (error) {
    console.error("Impossible de charger les plans :", error.message);
    return [];
  }

  return (data ?? []) as unknown as SubscriptionPlan[];
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="font-display text-2xl font-extrabold text-foreground">{title}</h2>
      <div className="mt-6 flex flex-col gap-8">{children}</div>
    </section>
  );
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-display text-lg font-bold text-foreground">{title}</h3>
      <div className="mt-2 flex flex-col gap-2 text-muted">{children}</div>
    </div>
  );
}

export default async function AidePage() {
  const plans = await getActivePlans();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="font-display text-3xl font-extrabold text-foreground sm:text-4xl">Aide</h1>
        <p className="mt-2 text-muted">
          Tout ce qu'il faut savoir pour voyager avec GoBus ou déclarer les trajets de votre
          compagnie.
        </p>

        <nav className="mt-6 flex gap-4 border-b border-t border-border py-3 text-sm font-semibold">
          <a href="#voyageurs" className="text-primary hover:underline">
            Voyageurs
          </a>
          <a href="#compagnies" className="text-primary hover:underline">
            Compagnies partenaires
          </a>
        </nav>

        <div className="mt-10 flex flex-col gap-14">
          <Section id="voyageurs" title="Voyageurs">
            <Question title="Comment rechercher et réserver un trajet ?">
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Depuis la page d&apos;accueil, choisissez votre ville de départ, votre
                  destination et la date de votre voyage.
                </li>
                <li>Comparez les trajets disponibles : compagnie, horaire, classe et prix.</li>
                <li>
                  Ouvrez un trajet, indiquez le nombre de passagers et les informations demandées.
                </li>
                <li>Continuez vers le paiement pour confirmer votre réservation.</li>
              </ol>
            </Question>

            <Question title="Quels moyens de paiement sont acceptés ?">
              <p>
                Mobile Money (MTN Mobile Money, Moov Money) et carte bancaire, via FedaPay.
              </p>
              <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
                Pour l&apos;instant, le paiement est <strong>simulé</strong> le temps que
                l&apos;intégration FedaPay soit branchée — aucune transaction réelle n&apos;est
                effectuée.
              </p>
            </Question>

            <Question title="Comment contacter le support ?">
              <p>
                Par email à{" "}
                <a href="mailto:support@gobus.bj" className="font-medium text-primary hover:underline">
                  support@gobus.bj
                </a>
                . Décrivez votre situation (référence de réservation si vous en avez une) pour une
                réponse plus rapide.
              </p>
            </Question>
          </Section>

          <Section id="compagnies" title="Compagnies partenaires">
            <Question title="Comment inscrire ma compagnie ?">
              <p>
                Rendez-vous sur la page{" "}
                <Link href="/partenaires" className="font-medium text-primary hover:underline">
                  Compagnies partenaires
                </Link>
                , choisissez un abonnement, puis créez votre compte (nom de la compagnie, email,
                mot de passe). Une fois le paiement de l&apos;abonnement confirmé, votre accès au
                back-office est activé.
              </p>
            </Question>

            <Question title="Quels sont les plans d'abonnement ?">
              <p>
                Pas de commission sur vos ventes : un abonnement fixe donne accès au back-office
                pour déclarer vos trajets.
              </p>
              {plans.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {plans.map((plan) => (
                    <li key={plan.id} className="flex items-baseline justify-between gap-4">
                      <span className="text-foreground">{plan.name}</span>
                      <span className="font-display font-bold text-foreground">
                        {formatFcfa(plan.price_fcfa)}
                        <span className="text-sm font-medium text-muted">
                          {BILLING_PERIOD_LABELS[plan.billing_period] ?? ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p>
                <Link href="/partenaires" className="font-medium text-primary hover:underline">
                  Voir le détail des plans →
                </Link>
              </p>
            </Question>

            <Question title="Comment déclarer un trajet une fois connectée au back-office ?">
              <p>
                Après connexion, votre tableau de bord liste les trajets déjà déclarés pour votre
                compagnie.
              </p>
              <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
                L&apos;ajout et la modification de trajets directement depuis le back-office
                arrivent bientôt. En attendant, contactez{" "}
                <a href="mailto:support@gobus.bj" className="font-medium text-primary hover:underline">
                  support@gobus.bj
                </a>{" "}
                pour faire déclarer vos trajets.
              </p>
            </Question>
          </Section>
        </div>
      </div>
    </div>
  );
}
