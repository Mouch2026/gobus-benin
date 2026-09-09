# GoBus Bénin — Chantiers restants

Liste vivante, à mettre à jour au fil du développement (pas figée à un instant donné).

## À construire

### Paiement
- Paiement FedaPay réel — remplace les deux flux actuellement simulés
  (billets voyageurs ET abonnement compagnie), en une seule intégration.
- Changement de plan d'abonnement (upgrade/downgrade) depuis le
  back-office — actuellement /abonnement est en lecture seule, aucune
  proration ni changement de plan en cours d'abonnement n'est géré.
- Réclamation atomique du paiement (simulatePayment ET payViaToken) —
  actuellement une simple lecture puis écriture, pas un update ... where
  status = 'pending' returning ... comme pour les avoirs. Deux clics
  rapprochés sur le même paiement pourraient créer deux paiements pour la
  même réservation. À corriger sur les deux flux ensemble pour rester
  cohérent.

### Communication voyageur
- Envoi par e-mail de la confirmation de réservation : facture + billet
  avec QR code (c'est la raison pour laquelle le compte voyageur a été
  rendu obligatoire — l'infrastructure d'envoi d'e-mails n'est pas encore
  construite).
- Alerte immédiate au voyageur en cas de changement de dernière minute
  (panne, changement de bus, retard) — SMS ou notification, distinct de
  la confirmation de réservation classique par e-mail. Urgent une fois
  qu'un vrai incident survient en usage réel, contrairement à la
  confirmation qui peut attendre.
- Canal SMS/WhatsApp pour le lien de paiement (réservations créées par la
  compagnie pour un client) — l'envoi automatique par e-mail existe déjà
  (sendBookingPaymentLinkNotification) ; le lien reste aussi
  consultable/copiable manuellement sur /reservations/[bookingId] en
  secours (panne d'envoi, ou canal alternatif). Deux options pour ajouter
  un canal plus immédiat : SMS via un fournisseur tiers (Twilio, Africa's
  Talking, ou un opérateur local béninois), ou WhatsApp Business API.
  Aucune des deux n'est choisie ni budgétée.

### Communication compagnie
- E-mail de confirmation à la compagnie à chaque vente de billet.
- Récapitulatif mensuel des ventes envoyé à la compagnie.

### Réservation
- Règles de modification/annulation d'une réservation par le voyageur.
- Tarif réduit enfant (moins de 6 ans) avec siège payant — actuellement les
  enfants voyagent gratuitement sans siège par défaut ; un tarif réduit
  avec occupation de siège est possible mais négocié compagnie par
  compagnie selon la réglementation béninoise, pas encore modélisé
  (nécessite une politique de tarif par compagnie).

- Vérifier si un trajet passé à 'cancelled' peut encore recevoir de
  nouvelles réservations entre son annulation et le traitement des
  remboursements — /recherche filtre-t-il déjà les trajets annulés des
  résultats ? Trou théorique de timing, pas encore confirmé comme
  exploitable en pratique.
- Balayage périodique des réservations 'pending' dont le trajet est parti
  sans qu'aucun paiement n'ait jamais été tenté — le nettoyage ajouté aux
  Server Actions de paiement (simulatePayment/simulateRoundTripPayment)
  ne se déclenche qu'au moment où le voyageur clique réellement sur
  payer ; une réservation abandonnée avant cette étape reste 'pending'
  indéfiniment et bloque un siège pour rien. Un mécanisme équivalent au
  sweep des avoirs (lazy + éventuellement pg_cron) réglerait ça.
- Page back-office listant et traitant la file d'attente de remboursement
  des avoirs (vouchers.status = 'refund_pending') — le système d'avoir
  écrit déjà les lignes en base et notifie le voyageur, mais aucune page
  ne permet aujourd'hui de marquer un remboursement comme effectivement
  versé (hors scope du chantier qui a introduit les avoirs).

### Back-office
- Normalisation de la casse sur origin_city/destination_city (routes
  créées à la volée depuis /trajets/nouveau) — actuellement seul un
  trim() est appliqué, "Cotonou" et "cotonou" seraient encore reconnus
  comme deux villes distinctes. À surveiller si ça pose problème en usage
  réel avec plusieurs compagnies.

### Produits
- Application Admin (interne, pas pour les compagnies).
- Application mobile (Expo) — pas commencée.

### Contenu / conformité
- Page mentions légales.
- Remplacer l'adresse support placeholder (support@gobus.bj) par un vrai
  canal (WhatsApp évoqué dans le business plan).
- Mettre à jour la section 7 du business plan (modèle économique) :
  décrit encore la commission par billet, alors que le modèle réel
  implémenté est l'abonnement compagnie sans commission.

### Divers
- Nom définitif du projet toujours à trancher (voir les options déjà
  vérifiées sans conflit : AliGo, AliHan, Alitanou...).
