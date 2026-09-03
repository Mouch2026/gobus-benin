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

            <Question title="Quelles sont les conditions de remboursement d'un billet ?">
              <p>
                Deux cas distincts. Si vous annulez vous-même votre réservation : le prix du
                billet vous est remboursé (hors frais de service) tant que vous annulez plus de 30
                minutes avant le départ ; à 30 minutes ou moins, l&apos;annulation reste possible
                mais sans remboursement. Si c&apos;est la compagnie qui annule le trajet : le prix
                du billet vous est remboursé intégralement, quel que soit le délai, et vous en êtes
                informé par e-mail.
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
              <p>
                Commencez par créer vos routes (villes de départ et d&apos;arrivée) dans{" "}
                <strong>Routes</strong>, si elles n&apos;existent pas encore. Puis, dans{" "}
                <strong>Nouveau trajet</strong>, sélectionnez une route existante et renseignez la
                classe, la date et l&apos;heure de départ, le prix et le nombre de places — le
                trajet est immédiatement visible aux voyageurs.
              </p>
            </Question>

            <div className="border-t border-border pt-8">
              <h3 className="font-display text-lg font-bold text-foreground">
                Questions fréquentes
              </h3>
              <div className="mt-6 flex flex-col gap-8">
                <Question title="Comment éviter la survente de billets ?">
                  <p>
                    Vous gardez un contrôle total sur le nombre de places mises en vente pour
                    chaque trajet, directement depuis votre espace back-office. Dès qu&apos;une
                    place est réservée sur [nom du site], elle est immédiatement retirée du
                    nombre disponible.
                  </p>
                </Question>

                <Question title="Comment les billets sont-ils validés ?">
                  <p>
                    Chaque réservation génère un billet numérique avec un code QR unique, que
                    votre équipe peut scanner à l&apos;embarquement pour confirmer l&apos;identité
                    du passager et son trajet.
                  </p>
                </Question>

                <Question title="Comment se déroule la réservation pour le voyageur ?">
                  <p>
                    Le voyageur recherche et compare les trajets disponibles directement sur le
                    site, réserve en ligne, et paie par Mobile Money ou carte bancaire. Le billet
                    lui est immédiatement disponible avec son code QR.
                  </p>
                </Question>

                <Question title="Combien coûte un partenariat ?">
                  <p>
                    [nom du site] fonctionne par abonnement à tarif fixe, pas par commission sur
                    vos ventes — vous gardez l&apos;intégralité du prix que vous fixez pour chaque
                    billet. Voir le détail des plans ci-dessus.
                  </p>
                </Question>

                <Question title="Comment gérer mon inventaire de places ?">
                  <p>
                    Directement depuis votre espace back-office, en temps réel : vous créez vos
                    trajets, fixez le nombre de places disponibles, et ajustez à tout moment.
                  </p>
                </Question>

                <Question title="Pourquoi devenir partenaire ?">
                  <p>
                    Une visibilité supplémentaire auprès des voyageurs qui comparent leurs options
                    de transport en ligne avant de choisir une compagnie, un paiement 100% adapté
                    aux habitudes locales (Mobile Money, carte bancaire), et une mise en ligne de
                    vos trajets sans investissement technique de votre part.
                  </p>
                </Question>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
