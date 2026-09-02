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

export default function ConfidentialitePage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <h1 className="font-display text-3xl font-extrabold text-foreground sm:text-4xl">
          Politique de confidentialité
        </h1>
        <p className="mt-2 text-muted">
          Cette page décrit comment GoBus Bénin collecte et utilise vos données à caractère
          personnel, conformément à la loi n° 2017-20 du 20 avril 2018 portant Code du numérique
          en République du Bénin (Livre V — Protection des données à caractère personnel), sous le
          contrôle de l&apos;Autorité de Protection des Données à caractère Personnel (APDP —{" "}
          <a href="https://apdp.bj" className="text-primary hover:underline">
            apdp.bj
          </a>
          ).
        </p>

        <div className="mt-10 flex flex-col gap-12">
          <Section id="qui-sommes-nous" title="1. Qui nous sommes">
            <p>
              Ce site est édité par <strong className="text-foreground">[Raison sociale de la
              compagnie — à compléter]</strong>, immatriculée au Registre du Commerce et du Crédit
              Mobilier (RCCM) sous le numéro <strong className="text-foreground">[à compléter]</strong>,
              dont le siège social est situé <strong className="text-foreground">[adresse — à
              compléter]</strong>, République du Bénin.
            </p>
            <p>
              GoBus Bénin agit en qualité de responsable du traitement pour les données à
              caractère personnel collectées via ce site et l&apos;application, au sens du Code du
              numérique.
            </p>
          </Section>

          <Section id="donnees-collectees" title="2. Données que nous collectons">
            <p>Selon votre usage du site, nous collectons :</p>
            <ul className="ml-5 flex list-disc flex-col gap-2">
              <li>
                <strong className="text-foreground">Nom et prénom(s)</strong> — nécessaires à la
                création d&apos;un compte voyageur, obligatoire pour réserver.
              </li>
              <li>
                <strong className="text-foreground">Numéro de téléphone</strong> — utilisé comme
                moyen de contact pour votre réservation.
              </li>
              <li>
                <strong className="text-foreground">Adresse e-mail</strong> — identifiant de votre
                compte voyageur, obligatoire pour réserver.
              </li>
              <li>
                <strong className="text-foreground">Informations de paiement</strong> — traitées
                directement par un prestataire de paiement tiers (Mobile Money, carte bancaire).
                GoBus Bénin ne stocke pas vos coordonnées bancaires. L&apos;intégration technique
                avec ce prestataire est en cours de finalisation à la date de publication de cette
                page.
              </li>
              <li>
                <strong className="text-foreground">Noms des passagers et sièges attribués</strong>{" "}
                — nécessaires à l&apos;émission de billets nominatifs pour chaque trajet réservé.
              </li>
              <li>
                <strong className="text-foreground">Solde de points de fidélité (GoBus
                Points)</strong> — dans le cadre du programme de fidélité associé à votre compte.
              </li>
              <li>
                <strong className="text-foreground">Cookies de session</strong> — strictement
                nécessaires au fonctionnement de l&apos;authentification (rester connecté à votre
                compte). Aucun cookie publicitaire ou de suivi tiers.
              </li>
            </ul>
          </Section>

          <Section id="finalites" title="3. Pourquoi nous utilisons ces données">
            <ul className="ml-5 flex list-disc flex-col gap-2">
              <li>Gérer vos réservations et l&apos;émission de vos billets.</li>
              <li>Gérer votre compte voyageur.</li>
              <li>Gérer votre solde et vos avantages au titre du programme GoBus Points.</li>
              <li>
                Communiquer avec vous au sujet de vos réservations — par e-mail actuellement ;
                d&apos;autres canaux (SMS, WhatsApp) pourront être ajoutés à l&apos;avenir.
              </li>
            </ul>
          </Section>

          <Section id="sous-traitants" title="4. Sous-traitants et hébergement">
            <p>
              Certaines de vos données sont hébergées ou traitées par des prestataires techniques
              tiers, agissant comme sous-traitants pour le compte de GoBus Bénin :
            </p>
            <ul className="ml-5 flex list-disc flex-col gap-2">
              <li>
                <strong className="text-foreground">Supabase</strong> — base de données,
                authentification et hébergement de l&apos;application.
              </li>
              <li>
                <strong className="text-foreground">Resend</strong> — envoi des e-mails de
                confirmation et de notification.
              </li>
            </ul>
            <p>
              Ces prestataires peuvent héberger vos données sur des serveurs situés en dehors du
              Bénin. GoBus Bénin s&apos;assure que ces prestataires offrent des garanties de
              sécurité sérieuses ; les modalités contractuelles encadrant ces transferts sont en
              cours de formalisation.
            </p>
          </Section>

          <Section id="droits" title="5. Vos droits">
            <p>
              Conformément au Code du numérique, vous disposez, sur les données vous concernant,
              d&apos;un droit d&apos;accès, d&apos;un droit de rectification et d&apos;un droit
              d&apos;opposition pour motif légitime.
            </p>
            <p>
              Pour exercer l&apos;un de ces droits, contactez-nous à l&apos;adresse indiquée en
              section 7 ci-dessous, en précisant votre identité et votre demande. Une réponse vous
              sera apportée dans les meilleurs délais.
            </p>
          </Section>

          <Section id="apdp" title="6. Déclaration auprès de l'APDP">
            <p>
              La déclaration des traitements décrits sur cette page auprès de l&apos;Autorité de
              Protection des Données à caractère Personnel (APDP) est en cours de préparation et
              n&apos;a pas encore été finalisée à la date de publication de cette page. Cette
              section sera mise à jour dès que la déclaration aura été effectuée.
            </p>
          </Section>

          <Section id="contact" title="7. Contact">
            <p>
              Pour toute question relative à cette politique de confidentialité ou à
              l&apos;exercice de vos droits, contactez-nous à{" "}
              <a href="mailto:support@gobus.bj" className="text-primary hover:underline">
                support@gobus.bj
              </a>{" "}
              <span className="text-sm">(adresse à activer)</span>.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
