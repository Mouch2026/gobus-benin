import Link from "next/link";
import { logout } from "../actions";

// Remplace _navigation.tsx : header + sidebar consolidés en un seul
// composant partagé par app/(app)/layout.tsx, plutôt que chaque page
// répétant son propre <Navigation/> + wrapper <main>.

function AppHeader({ company }: { company: { name: string } }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Link href="/" className="flex items-baseline gap-3">
        {/* Nom du projet en placeholder texte — aucun logo image n'existe
            encore. */}
        <span className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
          GoBus Bénin
        </span>
        <span className="hidden text-sm text-zinc-500 dark:text-zinc-400 sm:inline">
          Back-office réservation
        </span>
      </Link>

      {/* Menu utilisateur : même patron <details>/<summary> sans JS que le
          sous-menu Administration (voir SidebarLinks ci-dessous). */}
      <details className="group relative">
        <summary className="cursor-pointer list-none text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-zinc-50">
          {company.name} ▾
        </summary>
        <div className="absolute right-0 top-full z-10 mt-2 flex w-48 flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
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
    </header>
  );
}

// Extrait de AppShell pour être rendu deux fois (colonne desktop + tiroir
// mobile) sans dupliquer le JSX à la main.
function SidebarLinks() {
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
        </div>
      </details>
    </>
  );
}

export function AppShell({
  company,
  children,
}: {
  company: { name: string };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-600 dark:bg-black dark:text-zinc-400 md:grid md:grid-cols-[220px_1fr]">
      <div className="md:col-span-2">
        <AppHeader company={company} />
      </div>

      {/* Mobile uniquement : tiroir replié par défaut, pousse le contenu
          en dessous à l'ouverture — pas de JS, pas d'overlay à gérer. */}
      <details className="border-b border-zinc-200 dark:border-zinc-800 md:hidden">
        <summary className="cursor-pointer list-none px-6 py-3 text-sm font-medium text-zinc-950 dark:text-zinc-50">
          ☰ Menu
        </summary>
        <nav className="flex flex-col gap-1 px-4 pb-4">
          <SidebarLinks />
        </nav>
      </details>

      {/* Desktop uniquement : colonne fixe toujours visible. */}
      <aside className="hidden border-r border-zinc-200 p-4 dark:border-zinc-800 md:block">
        <nav className="flex flex-col gap-1">
          <SidebarLinks />
        </nav>
      </aside>

      {/* min-w-0 : évite qu'un tableau large (ex. /paiements) ne force la
          piste de grille au-delà du viewport sur mobile. */}
      <main className="min-w-0 px-6 py-8">{children}</main>
    </div>
  );
}
