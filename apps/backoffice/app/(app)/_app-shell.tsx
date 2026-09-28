import Link from "next/link";
import { logout } from "../actions";
import type { CompanyRole } from "@/lib/permissions";
import type { StationOption } from "@/lib/stations";
import type { CompanyNotification } from "@/lib/notifications";
import { LiveBeninClock } from "./_live-clock";
import { StationSelect } from "./_station-select";
import { NotificationBell } from "./_notification-bell";
import { DismissibleDetails } from "./_dismissible-details";
import { ActivityTracker } from "./_activity-tracker";
import { SidebarLinks } from "./_sidebar-nav";
import { CollapsibleSidebar } from "./_collapsible-sidebar";

// Remplace _navigation.tsx : header + sidebar consolidés en un seul
// composant partagé par app/(app)/layout.tsx, plutôt que chaque page
// répétant son propre <Navigation/> + wrapper <main>.

const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Propriétaire",
  agency_manager: "Chef d'agence",
  agent: "Agent",
};

// Repli neutre quand companies.logo_url est absent — même logique que
// CompanyLogo côté apps/web (app/recherche/_shared.tsx) : une pastille
// avec l'initiale du nom, pas un logo générique inventé. Dupliqué plutôt
// que partagé via packages/shared : composant JSX + classes Tailwind
// propres à ce projet Next, pas de la logique métier.
function CompanyLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className="h-9 w-9 shrink-0 rounded-lg object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-sm font-bold text-white"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function AppHeader({
  company,
  role,
  memberName,
  agencyName,
  currentTime,
  stations,
  selectedStationId,
  notifications,
  unreadCount,
}: {
  company: { name: string; logoUrl: string | null };
  role: CompanyRole;
  memberName: string;
  agencyName: string | null;
  currentTime: string;
  stations: StationOption[];
  selectedStationId: string | null;
  notifications: CompanyNotification[];
  unreadCount: number;
}) {
  // Le propriétaire garde le nom de la compagnie en résumé (comme avant) —
  // un employé voit plutôt SON nom, la compagnie apparaissant dans le menu
  // déroulant à la place.
  const summaryLabel = role === "owner" ? company.name : memberName;

  return (
    // Grille 3 colonnes plutôt que justify-between : les colonnes latérales
    // (1fr) absorbent la différence de largeur entre le logo et le menu
    // utilisateur, ce qui centre réellement le bloc du milieu (gare +
    // heure) dans la barre — un simple flex l'aurait décalé selon la
    // longueur du nom affiché à droite.
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-zinc-200 bg-white px-6 py-4">
      <Link href="/" className="flex min-w-0 items-center gap-3">
        <CompanyLogo name={company.name} logoUrl={company.logoUrl} />
        <span className="hidden truncate text-sm text-zinc-500 sm:inline">
          Back-office réservation
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <StationSelect stations={stations} selectedStationId={selectedStationId} />
        <span className="hidden text-sm tabular-nums text-zinc-500 sm:inline">
          <LiveBeninClock initialTime={currentTime} />
        </span>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-4">
        {/* Rôle et agence ne sont plus répétés ici : ils vivent dans le
            menu déroulant ci-dessous. La barre ne porte que l'identité,
            sous la forme « <Rôle> : <nom> ». */}
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />

        {/* Menu utilisateur : même DismissibleDetails que NotificationBell
            — ce menu vit lui aussi dans le layout partagé, jamais démonté
            entre deux pages, donc un <details> natif seul ne se
            refermerait jamais après un clic sur "Profil"/"Se déconnecter"
            ou en dehors. */}
        <DismissibleDetails className="group relative">
          <summary className="cursor-pointer list-none truncate text-sm font-medium text-zinc-700 hover:text-zinc-950">
            {ROLE_LABELS[role]} : {summaryLabel} ▾
          </summary>
          <div className="absolute right-0 top-full z-10 mt-2 flex w-56 flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg">
            <div className="px-3 py-1.5 text-xs text-zinc-500">
              {ROLE_LABELS[role]}
              {agencyName ? ` · ${agencyName}` : ""}
              {role !== "owner" ? (
                <>
                  <br />
                  {company.name}
                </>
              ) : null}
            </div>
            <Link
              href="/profil"
              className="rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
            >
              Profil
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </DismissibleDetails>
      </div>
    </header>
  );
}

export function AppShell({
  company,
  role,
  canViewCompanyWideDashboards,
  memberName,
  agencyName,
  currentTime,
  stations,
  selectedStationId,
  notifications,
  unreadCount,
  lockTimeoutMinutes,
  initialBadgeCounts,
  children,
}: {
  company: { name: string; logoUrl: string | null };
  role: CompanyRole;
  canViewCompanyWideDashboards: boolean;
  memberName: string;
  agencyName: string | null;
  currentTime: string;
  stations: StationOption[];
  selectedStationId: string | null;
  notifications: CompanyNotification[];
  unreadCount: number;
  lockTimeoutMinutes: number;
  initialBadgeCounts: Record<string, number>;
  children: React.ReactNode;
}) {
  return (
    // grid-cols-[auto_1fr] (pas une largeur fixe) : la colonne desktop
    // suit la largeur réelle du <aside> (CollapsibleSidebar, qui pose sa
    // propre largeur via data-collapsed) — ainsi le repli en icônes ne
    // demande aucune coordination avec ce conteneur.
    //
    // content-start (align-content) : sans lui, min-h-screen + align-content
    // par défaut ("normal", qui se comporte comme "stretch" pour des lignes
    // dimensionnées en auto) étire les deux lignes implicites (en-tête,
    // puis sidebar+contenu) pour combler l'espace excédentaire dès que le
    // contenu réel est plus court que 100vh — invisible sur les pages
    // longues, mais gonfle mesurablement la ligne d'en-tête et repousse la
    // seconde ligne plus bas sur une page courte (ex. /notifications sans
    // aucune notification). content-start fige les deux lignes à leur
    // hauteur naturelle, l'éventuel espace en trop reste en bas de page.
    <div className="min-h-screen bg-background text-muted md:grid md:grid-cols-[auto_1fr] content-start print:grid-cols-1">
      {/* Ne rend rien à l'écran — écoute l'activité et déclenche le
          verrouillage/battement de cœur en arrière-plan (chantier 6).
          Monté une seule fois ici : persiste entre navigations côté
          client comme tout layout Next.js, donc l'inactivité se mesure
          en continu sur toute la session, pas par page. */}
      <ActivityTracker lockTimeoutMinutes={lockTimeoutMinutes} />

      <div className="md:col-span-2 print:hidden">
        <AppHeader
          company={company}
          role={role}
          memberName={memberName}
          agencyName={agencyName}
          currentTime={currentTime}
          stations={stations}
          selectedStationId={selectedStationId}
          notifications={notifications}
          unreadCount={unreadCount}
        />
      </div>

      {/* Mobile uniquement : tiroir replié par défaut, pousse le contenu
          en dessous à l'ouverture. DismissibleDetails (même mécanisme que
          la cloche et le menu utilisateur) referme le tiroir après un tap
          sur un lien de navigation — sans ça, comme ce shell n'est jamais
          démonté entre deux pages, le tiroir resterait ouvert par-dessus
          la page suivante. print:hidden : une page imprimable (ex. billet)
          n'a jamais besoin du chrome de nav, quelle que soit la largeur
          d'écran au moment de l'impression. */}
      <DismissibleDetails className="border-b border-sidebar-border bg-sidebar md:hidden print:hidden">
        <summary className="cursor-pointer list-none px-6 py-3 text-sm font-medium text-sidebar-foreground">
          ☰ Menu
        </summary>
        <nav className="flex flex-col gap-1 px-4 pb-4">
          <SidebarLinks role={role} canViewCompanyWideDashboards={canViewCompanyWideDashboards} initialBadgeCounts={initialBadgeCounts} />
        </nav>
      </DismissibleDetails>

      {/* Desktop uniquement : colonne toujours visible, réductible en
          icônes seules (CollapsibleSidebar) — n'affecte jamais le tiroir
          mobile ci-dessus, qui reste un simple <details>. */}
      <CollapsibleSidebar>
        <SidebarLinks role={role} canViewCompanyWideDashboards={canViewCompanyWideDashboards} initialBadgeCounts={initialBadgeCounts} />
      </CollapsibleSidebar>

      {/* min-w-0 : évite qu'un tableau large (ex. /paiements) ne force la
          piste de grille au-delà du viewport sur mobile. */}
      <main className="min-w-0 px-6 py-8">{children}</main>
    </div>
  );
}
