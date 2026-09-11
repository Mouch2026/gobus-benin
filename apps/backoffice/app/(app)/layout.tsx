import { requireCompany } from "@/lib/supabase/dal";
import { AccessBlockedMessage } from "./_components";
import { AppShell } from "./_app-shell";

// Layout partagé par toutes les pages authentifiées (groupe de routes
// (app) — invisible dans l'URL). Ne gère que le CHROME (header+sidebar
// affichés seulement si l'accès est ok) : chaque page en dessous garde
// son propre appel requireCompany() + retour anticipé
// AccessBlockedMessage, exactement comme avant — un layout parent ne peut
// pas empêcher l'exécution de la fonction Server Component d'une page
// enfant en ne rendant simplement pas {children}, donc déléguer
// uniquement au layout n'aurait pas été fiable. requireCompany() est
// mémoïsée par requête (voir dal.ts) : cet appel-ci et celui de la page
// ne coûtent qu'un seul aller-retour Supabase réel.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const result = await requireCompany();

  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  return (
    <AppShell
      company={result.company}
      role={result.role}
      memberName={result.memberName}
      agencyName={result.agency?.name ?? null}
    >
      {children}
    </AppShell>
  );
}
