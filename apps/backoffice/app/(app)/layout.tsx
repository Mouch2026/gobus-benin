import { requireCompany } from "@/lib/supabase/dal";
import { getBeninTimeString } from "@/lib/benin-time";
import { getActiveStations, getSelectedStation } from "@/lib/station-selection";
import { getCompanyNotifications, getUnreadNotificationCount } from "@/lib/notifications";
import { AccessBlockedMessage } from "./_components";
import { LockScreen } from "./_lock-screen";
import { SetupPinForm } from "./_setup-pin";
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
    // Chantier 6 — ces deux raisons ont un rendu interactif dédié, à la
    // place du message statique : jamais de redirection, l'URL ne change
    // pas (voir dal.ts et le plan pour le raisonnement complet).
    if (result.reason === "locked") {
      return <LockScreen memberName={result.memberName} companyName={result.company.name} />;
    }
    if (result.reason === "no-pin") {
      return <SetupPinForm />;
    }
    return <AccessBlockedMessage reason={result.reason} />;
  }

  // Mémoïsés par requête (React cache()) : les pages filtrées rappellent
  // getSelectedStation() sans second aller-retour, même chose pour la
  // page d'historique et getCompanyNotifications().
  const [stations, selectedStation, notifications, unreadCount] = await Promise.all([
    getActiveStations(),
    getSelectedStation(),
    getCompanyNotifications(),
    getUnreadNotificationCount(),
  ]);

  return (
    <AppShell
      company={result.company}
      role={result.role}
      memberName={result.memberName}
      agencyName={result.agency?.name ?? null}
      currentTime={getBeninTimeString()}
      stations={stations}
      selectedStationId={selectedStation?.id ?? null}
      notifications={notifications}
      unreadCount={unreadCount}
      lockTimeoutMinutes={result.lockTimeoutMinutes}
    >
      {children}
    </AppShell>
  );
}
