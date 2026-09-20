import Link from "next/link";
import { logout } from "../actions";
import { can, type CompanyRole } from "@/lib/permissions";
import type { StationOption } from "@/lib/stations";
import type { CompanyNotification } from "@/lib/notifications";
import { LiveBeninClock } from "./_live-clock";
import { StationSelect } from "./_station-select";
import { NotificationBell } from "./_notification-bell";
import { ActivityTracker } from "./_activity-tracker";

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
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-sm font-bold text-white dark:bg-white dark:text-zinc-950"
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
    <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Link href="/" className="flex min-w-0 items-center gap-3">
        <CompanyLogo name={company.name} logoUrl={company.logoUrl} />
        <span className="hidden truncate text-sm text-zinc-500 dark:text-zinc-400 sm:inline">
          Back-office réservation
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <StationSelect stations={stations} selectedStationId={selectedStationId} />
        <span className="hidden text-sm tabular-nums text-zinc-500 dark:text-zinc-400 sm:inline">
          <LiveBeninClock initialTime={currentTime} />
        </span>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-4">
        {/* Rôle et agence ne sont plus répétés ici : ils vivent dans le
            menu déroulant ci-dessous. La barre ne porte que l'identité,
            sous la forme « <Rôle> : <nom> ». */}
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />

        {/* Menu utilisateur : même patron <details>/<summary> sans JS que
            le sous-menu Administration (voir SidebarLinks ci-dessous). */}
        <details className="group relative">
          <summary className="cursor-pointer list-none truncate text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50">
            {ROLE_LABELS[role]} : {summaryLabel} ▾
          </summary>
          <div className="absolute right-0 top-full z-10 mt-2 flex w-56 flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <div className="px-3 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
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
              className="rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Profil
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}

// Extrait de AppShell pour être rendu deux fois (colonne desktop + tiroir
// mobile) sans dupliquer le JSX à la main.
const SECTION_SUMMARY_CLASSES =
  "cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800";
const SUB_LINK_CLASSES = "rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800";
const SUB_GROUP_CLASSES = "ml-3 mt-1 flex flex-col gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-800";

// Même patron visuel que le badge "Bientôt disponible" de la page
// d'accueil voyageur (apps/web/app/page.tsx, section application mobile)
// — traduit en tokens zinc puisque le back-office n'a pas les tokens
// sémantiques border-border/text-muted de apps/web. Jamais un <Link> mort
// : ces entrées n'ont pas de destination, donc pas d'élément cliquable.
function ComingSoonItem({ label, subtitle }: { label: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-zinc-400 dark:text-zinc-500">{label}</span>
        <span className="inline-flex shrink-0 items-center rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          Bientôt disponible
        </span>
      </div>
      {subtitle ? <span className="text-xs text-zinc-400 dark:text-zinc-500">{subtitle}</span> : null}
    </div>
  );
}

// Un vrai lien, avec une précision en petit texte en dessous — pour
// "Itinéraires" (la création de route est intégrée à la création de
// trajet, jamais une page séparée) et "Paramètres" n'en a pas besoin
// puisqu'il est désactivé (ComingSoonItem suffit).
function SubLinkWithNote({ href, label, note }: { href: string; label: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Link href={href} className={SUB_LINK_CLASSES}>
        {label}
      </Link>
      <span className="px-3 text-xs text-zinc-400 dark:text-zinc-500">{note}</span>
    </div>
  );
}

function SidebarLinks({ role }: { role: CompanyRole }) {
  return (
    <>
      <details className="group">
        <summary className={SECTION_SUMMARY_CLASSES}>📊 Tableau de bord</summary>
        <div className={SUB_GROUP_CLASSES}>
          <Link href="/" className={SUB_LINK_CLASSES}>
            Vue globale
          </Link>
          <ComingSoonItem label="Widgets personnalisables" />
        </div>
      </details>

      <details className="group">
        <summary className={SECTION_SUMMARY_CLASSES}>🚌 Opérations</summary>
        <div className={SUB_GROUP_CLASSES}>
          <Link href="/reservations" className={SUB_LINK_CLASSES}>
            Réservations
          </Link>
          <Link href="/voyages" className={SUB_LINK_CLASSES}>
            Voyages
          </Link>
          {can(role, "supervisorApprovals.manage") ? (
            <Link href="/validations" className={SUB_LINK_CLASSES}>
              Validations
            </Link>
          ) : null}

          <details className="group">
            <summary className={SECTION_SUMMARY_CLASSES}>Chauffeurs</summary>
            <div className={SUB_GROUP_CLASSES}>
              <ComingSoonItem label="Disponibilités" />
              <ComingSoonItem label="Évaluations" />
            </div>
          </details>

          <details className="group">
            <summary className={SECTION_SUMMARY_CLASSES}>Bus</summary>
            <div className={SUB_GROUP_CLASSES}>
              {/* Même page que "Plans de bus" sous Administration — deux
                  contextes de navigation (flotte opérationnelle vs
                  configuration) vers la même gestion de plans de sièges,
                  jamais une gestion de véhicules qui n'existe pas. */}
              <Link href="/plans-de-bus" className={SUB_LINK_CLASSES}>
                Flotte
              </Link>
              <ComingSoonItem label="Maintenance" />
              <ComingSoonItem label="Localisation GPS" />
            </div>
          </details>

          <details className="group">
            <summary className={SECTION_SUMMARY_CLASSES}>Itinéraires</summary>
            <div className={SUB_GROUP_CLASSES}>
              <SubLinkWithNote
                href="/trajets/nouveau"
                label="Création/modification"
                note="La route se crée avec le trajet, jamais séparément."
              />
              <ComingSoonItem label="Optimisation" />
            </div>
          </details>
        </div>
      </details>

      <details className="group">
        <summary className={SECTION_SUMMARY_CLASSES}>💰 Finances</summary>
        <div className={SUB_GROUP_CLASSES}>
          <Link href="/paiements" className={SUB_LINK_CLASSES}>
            Paiements
          </Link>
          <Link href="/remboursements" className={SUB_LINK_CLASSES}>
            Remboursements
          </Link>
          <Link href="/caisse" className={SUB_LINK_CLASSES}>
            Caisse
          </Link>
        </div>
      </details>

      <details className="group">
        <summary className={SECTION_SUMMARY_CLASSES}>👥 Clients &amp; agences</summary>
        <div className={SUB_GROUP_CLASSES}>
          <Link href="/clients" className={SUB_LINK_CLASSES}>
            Clients
          </Link>
          <Link href="/agences" className={SUB_LINK_CLASSES}>
            Agences
          </Link>
          {can(role, "promoCodes.manage") ? (
            <Link href="/codes-promo" className={SUB_LINK_CLASSES}>
              Codes promo
            </Link>
          ) : null}
          <ComingSoonItem label="Programme de fidélité" />
        </div>
      </details>

      <details className="group">
        <summary className={SECTION_SUMMARY_CLASSES}>📜 Rapports &amp; audit</summary>
        <div className={SUB_GROUP_CLASSES}>
          <Link href="/rapports" className={SUB_LINK_CLASSES}>
            Rapports
          </Link>
          {can(role, "auditLog.view") ? (
            <Link href="/audit" className={SUB_LINK_CLASSES}>
              Journal d&apos;audit
            </Link>
          ) : null}

          <details className="group">
            <summary className={SECTION_SUMMARY_CLASSES}>Export</summary>
            <div className={SUB_GROUP_CLASSES}>
              <Link href="/reservations/export" className={SUB_LINK_CLASSES}>
                CSV
              </Link>
              <ComingSoonItem label="Excel" />
              <ComingSoonItem label="PDF" />
            </div>
          </details>
        </div>
      </details>

      <details className="group">
        <summary className={SECTION_SUMMARY_CLASSES}>📢 Communication</summary>
        <div className={SUB_GROUP_CLASSES}>
          {/* Même mécanisme que la cloche du header (_notification-bell.tsx)
              — un seul lien, jamais deux entrées vers la même page. */}
          <Link href="/notifications" className={SUB_LINK_CLASSES}>
            Notifications / Alertes
          </Link>
          <ComingSoonItem label="Messagerie interne" />
        </div>
      </details>

      <details className="group">
        <summary className={SECTION_SUMMARY_CLASSES}>⚙️ Administration</summary>
        <div className={SUB_GROUP_CLASSES}>
          <Link href="/profil" className={SUB_LINK_CLASSES}>
            Profil
          </Link>
          <Link href="/abonnement" className={SUB_LINK_CLASSES}>
            Abonnement
          </Link>
          <Link href="/plans-de-bus" className={SUB_LINK_CLASSES}>
            Plans de bus
          </Link>
          {can(role, "employees.manage") ? (
            <Link href="/employes" className={SUB_LINK_CLASSES}>
              Employés
            </Link>
          ) : null}
          <ComingSoonItem label="Gestion des accès" />
          <ComingSoonItem label="Sauvegardes" />
          <ComingSoonItem label="API & Intégrations" />
          <ComingSoonItem label="Paramètres" subtitle="Langues, devise (XOF)…" />
        </div>
      </details>
    </>
  );
}

export function AppShell({
  company,
  role,
  memberName,
  agencyName,
  currentTime,
  stations,
  selectedStationId,
  notifications,
  unreadCount,
  lockTimeoutMinutes,
  children,
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
  lockTimeoutMinutes: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-600 dark:bg-black dark:text-zinc-400 md:grid md:grid-cols-[220px_1fr] print:grid-cols-1">
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
          en dessous à l'ouverture — pas de JS, pas d'overlay à gérer.
          print:hidden : une page imprimable (ex. billet) n'a jamais
          besoin du chrome de nav, quelle que soit la largeur d'écran au
          moment de l'impression. */}
      <details className="border-b border-zinc-200 dark:border-zinc-800 md:hidden print:hidden">
        <summary className="cursor-pointer list-none px-6 py-3 text-sm font-medium text-zinc-950 dark:text-zinc-50">
          ☰ Menu
        </summary>
        <nav className="flex flex-col gap-1 px-4 pb-4">
          <SidebarLinks role={role} />
        </nav>
      </details>

      {/* Desktop uniquement : colonne fixe toujours visible. */}
      <aside className="hidden border-r border-zinc-200 p-4 dark:border-zinc-800 md:block print:hidden">
        <nav className="flex flex-col gap-1">
          <SidebarLinks role={role} />
        </nav>
      </aside>

      {/* min-w-0 : évite qu'un tableau large (ex. /paiements) ne force la
          piste de grille au-delà du viewport sur mobile. */}
      <main className="min-w-0 px-6 py-8">{children}</main>
    </div>
  );
}
