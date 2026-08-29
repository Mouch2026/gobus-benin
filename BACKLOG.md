# GoBus Bénin — Chantiers restants

Liste vivante, à mettre à jour au fil du développement (pas figée à un instant donné).

## En cours
- Aller-retour fonctionnel — schéma atomique posé (booking_groups,
  create_round_trip_booking, simulate_round_trip_payment), code applicatif
  (recherche, sélection retour, paiement) en cours.

## À construire

### Paiement
- Paiement FedaPay réel — remplace les deux flux actuellement simulés
  (billets voyageurs ET abonnement compagnie), en une seule intégration.

### Communication voyageur
- Envoi par e-mail de la confirmation de réservation : facture + billet
  avec QR code (c'est la raison pour laquelle le compte voyageur a été
  rendu obligatoire — l'infrastructure d'envoi d'e-mails n'est pas encore
  construite).

### Communication compagnie
- E-mail de confirmation à la compagnie à chaque vente de billet.
- Récapitulatif mensuel des ventes envoyé à la compagnie.

### Réservation
- Règles de modification/annulation d'une réservation par le voyageur.

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
