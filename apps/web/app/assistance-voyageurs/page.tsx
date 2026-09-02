import Link from "next/link";

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
      <div className="mt-4 flex flex-col gap-3 text-muted">{children}</div>
    </section>
  );
}

export default function AssistanceVoyageursPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="font-display text-3xl font-extrabold text-foreground sm:text-4xl">
          Assistance voyageurs
        </h1>
        <p className="mt-2 text-muted">
          Ce que fait GoBus Bénin, ce qui relève de la compagnie qui opère votre trajet, et
          comment obtenir de l&apos;aide selon votre situation.
        </p>

        <div className="mt-10 flex flex-col gap-12">
          <Section id="notre-role" title="1. Notre rôle">
            <p>
              GoBus Bénin est une plateforme de réservation qui connecte les voyageurs à des
              compagnies de transport indépendantes. Le contrat de transport, et sa bonne
              exécution, relèvent de la compagnie opératrice — pas de GoBus Bénin.
            </p>
            <p>
              Chaque compagnie reste responsable de ses horaires, de son véhicule et de la
              sécurité du trajet.
            </p>
          </Section>

          <Section id="retard-incident" title="2. En cas de retard ou d'incident le jour du départ">
            <p>
              La compagnie qui opère votre trajet reste le seul interlocuteur pour tout ce qui
              concerne la conduite réelle du voyage : retard au départ, changement de dernière
              minute, incident en cours de route.
            </p>
            <p>
              <strong className="text-foreground">À noter honnêtement</strong> : GoBus Bénin
              n&apos;affiche pas encore systématiquement le numéro de contact de la compagnie sur
              votre billet ou votre écran de confirmation — c&apos;est une amélioration en cours.
              En attendant, utilisez les coordonnées que la compagnie vous a communiquées à
              l&apos;achat. Si vous ne parvenez pas à la joindre, contactez le support GoBus Bénin
              (section 6) : nous ferons le lien du mieux possible.
            </p>
          </Section>

          <Section id="retrouver-reservation" title="3. Retrouver ma réservation">
            <p>
              Si vous êtes connecté à votre compte,{" "}
              <Link href="/compte/reservations" className="font-medium text-primary hover:underline">
                Mes réservations
              </Link>{" "}
              liste toutes vos réservations.
            </p>
            <p>
              Sans connexion, ou pour retrouver une réservation précise à partir de sa référence,
              utilisez{" "}
              <Link href="/gerer-ma-reservation" className="font-medium text-primary hover:underline">
                Gérer ma réservation
              </Link>{" "}
              (référence + numéro de téléphone).
            </p>
          </Section>

          <Section id="annulation-modification" title="4. Annulation et modification">
            <p>
              L&apos;annulation d&apos;une réservation confirmée est possible directement depuis
              l&apos;écran de confirmation de votre réservation (accessible via{" "}
              <Link href="/compte/reservations" className="font-medium text-primary hover:underline">
                Mes réservations
              </Link>
              ), tant que le trajet n&apos;est pas déjà parti :
            </p>
            <ul className="ml-5 flex list-disc flex-col gap-2">
              <li>
                Plus de 30 minutes avant le départ : le prix de votre billet vous est remboursé
                (hors frais de service).
              </li>
              <li>
                À 30 minutes ou moins du départ : l&apos;annulation reste possible, mais sans
                remboursement.
              </li>
            </ul>
            <p>
              La <strong className="text-foreground">modification</strong> d&apos;une réservation
              (changer de date ou de trajet) n&apos;est pas encore disponible. Pour ce besoin,
              contactez le support via{" "}
              <Link href="/aide#voyageurs" className="font-medium text-primary hover:underline">
                /aide
              </Link>
              .
            </p>
          </Section>

          <Section id="bagages" title="5. Bagages">
            <p>
              Il n&apos;existe pas, à ce stade, de politique de bagages standardisée entre les
              compagnies présentes sur GoBus Bénin. Les conditions (poids, nombre de bagages,
              objets interdits) sont propres à chaque compagnie — renseignez-vous directement
              auprès d&apos;elle avant votre départ.
            </p>
          </Section>

          <Section id="contact" title="6. Contact support">
            <p>
              Pour toute question ou situation non couverte ci-dessus, le support GoBus Bénin est
              détaillé sur{" "}
              <Link href="/aide#voyageurs" className="font-medium text-primary hover:underline">
                la page Aide
              </Link>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
