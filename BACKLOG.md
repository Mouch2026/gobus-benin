# GoBus Bénin — Chantiers restants

Liste vivante, à mettre à jour au fil du développement (pas figée à un instant donné).

## À construire

### Paiement
- Paiement FedaPay réel — remplace les deux flux actuellement simulés
  (billets voyageurs ET abonnement compagnie), en une seule intégration.
- Changement de plan d'abonnement (upgrade/downgrade) depuis le
  back-office — actuellement /abonnement est en lecture seule, aucune
  proration ni changement de plan en cours d'abonnement n'est géré.

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
