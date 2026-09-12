import Link from "next/link";
import { logout } from "../actions";
import { can, type CompanyRole } from "@/lib/permissions";
import type { StationOption } from "@/lib/stations";
import { LiveBeninClock } from "./_live-clock";
import { StationSelect } from "./_station-select";

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
}: {
  company: { name: string; logoUrl: string | null };
  role: CompanyRole;
  memberName: string;
  agencyName: string | null;
  currentTime: string;
  stations: StationOption[];
  selectedStationId: string | null;
}) {
  // Le propriétaire garde le nom de la compagnie en résumé (comme avant) —
  // un employé voit plutôt SON nom, la compagnie apparaissant dans le menu
  // déroulant à la place.
  const summaryLabel = role === "owner" ? company.name : memberName;

  return (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Link href="/" className="flex items-center gap-3">
        <CompanyLogo name={company.name} logoUrl={company.logoUrl} />
        <span className="hidden text-sm text-zinc-500 dark:text-zinc-400 sm:inline">
          Back-office réservation
        </span>
      </Link>

      <div className="flex items-center gap-4">
        <StationSelect stations={stations} selectedStationId={selectedStationId} />
        <span className="hidden text-sm tabular-nums text-zinc-500 dark:text-zinc-400 sm:inline">
          <LiveBeninClock initialTime={currentTime} />
        </span>
        <span className="hidden text-sm text-zinc-500 dark:text-zinc-400 sm:inline">
          {ROLE_LABELS[role]}
          {/* Pour un propriétaire (pas d'agence), on n'affiche que le
              rôle — agencyName est de toute façon toujours null ici. */}
          {agencyName ? ` · ${agencyName}` : ""}
        </span>

        {/* Menu utilisateur : même patron <details>/<summary> sans JS que
            le sous-menu Administration (voir SidebarLinks ci-dessous). */}
        <details className="group relative">
          <summary className="cursor-pointer list-none text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50">
            {summaryLabel} ▾
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
function SidebarLinks({ role }: { role: CompanyRole }) {
  return (
    <>
      <Link href="/" className="rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
        🏠 Dashboard
      </Link>
      <Link
        href="/reservations"
        className="rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        📅 Réservations
      </Link>
      <Link
        href="/clients"
        className="rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        👤 Clients
      </Link>
      <Link
        href="/paiements"
        className="rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        💳 Paiements
      </Link>
      <Link
        href="/voyages"
        className="rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        🚆 Voyages
      </Link>
      <Link
        href="/remboursements"
        className="rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        💰 Remboursements
      </Link>
      <Link
        href="/rapports"
        className="rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800"
      >
        📈 Rapports
      </Link>
      <details className="group">
        <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
          ⚙️ Administration
        </summary>
        <div className="ml-3 mt-1 flex flex-col gap-1 border-l border-zinc-200 pl-3 dark:border-zinc-800">
          <Link
            href="/profil"
            className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Profil
          </Link>
          <Link
            href="/abonnement"
            className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Abonnement
          </Link>
          <Link
            href="/plans-de-bus"
            className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Plans de bus
          </Link>
          <Link
            href="/agences"
            className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Agences
          </Link>
          {can(role, "employees.manage") ? (
            <Link
              href="/employes"
              className="rounded-md px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Employés
            </Link>
          ) : null}
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
  children,
}: {
  company: { name: string; logoUrl: string | null };
  role: CompanyRole;
  memberName: string;
  agencyName: string | null;
  currentTime: string;
  stations: StationOption[];
  selectedStationId: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-600 dark:bg-black dark:text-zinc-400 md:grid md:grid-cols-[220px_1fr] print:grid-cols-1">
      <div className="md:col-span-2 print:hidden">
        <AppHeader
          company={company}
          role={role}
          memberName={memberName}
          agencyName={agencyName}
          currentTime={currentTime}
          stations={stations}
          selectedStationId={selectedStationId}
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
