# GoBus Bénin

## Stack
- Monorepo npm workspaces : apps/web (Next.js), apps/mobile (Expo/React Native),
  apps/backoffice (Next.js), packages/shared (types + logique métier partagée)
- Backend : Supabase (PostgreSQL, Auth, Row Level Security, Edge Functions)
- Paiements : FedaPay (Mobile Money MTN/Moov, carte bancaire)
- Devise : FCFA (XOF) — toujours des entiers, jamais de décimales

## Commandes
- npm run dev:web / dev:mobile / dev:backoffice
- supabase db push          → appliquer les migrations
- supabase functions deploy <nom>

## Conventions
- TypeScript strict partout
- Tout calcul de prix/commission passe par packages/shared/src/lib/pricing.ts
  — ne jamais dupliquer ce calcul ailleurs
- Une branche Git par fonctionnalité, jamais de commit direct sur main
- RLS activé sur toutes les tables : une compagnie ne voit que ses propres
  trajets et réservations
- Le package interne s'appelle "shared" (pas "@gobus/shared")
- Toute nouvelle table nécessite un GRANT explicite pour anon, authenticated
  ET service_role (Automatically expose new tables est désactivé sur ce
  projet — RLS seul ne suffit pas, PostgREST/Postgres exigent aussi les
  GRANT classiques)
- Toute page apps/backoffice affichant des données scopées à une compagnie
  doit appeler requireCompany() (pas requireUser() seul) — sinon un
  utilisateur sans compagnie associée peut voir une page vide ou cassée au
  lieu du message clair prévu
- Une migration déjà appliquée (visible dans supabase migration list côté
  remote) ne doit JAMAIS être éditée sur place — Supabase suit l'historique
  par nom de fichier (horodatage), pas par contenu ; éditer et recommitter
  un fichier déjà appliqué n'a aucun effet réel tant qu'une nouvelle
  migration (create or replace ...) n'est pas créée avec un horodatage
  postérieur. Toujours vérifier `supabase migration list` avant de modifier
  un fichier de migration existant.
## Où chercher
- Schéma de données  → supabase/migrations/
- Logique de prix    → packages/shared/src/lib/pricing.ts
- Paiement           → supabase/functions/create-payment, payment-webhook
