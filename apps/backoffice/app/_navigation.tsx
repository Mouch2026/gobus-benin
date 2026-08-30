import Link from "next/link";
import { logout } from "./actions";

// Shared across every authenticated page — replaces each page's own
// independent <header>. "Nouveau trajet" is kept as a distinct action
// button (not one of the 6 plain nav links) since it was the only path to
// /trajets/nouveau before this component existed; dropping it here would
// be a silent regression.
export function Navigation({ company }: { company: { name: string } }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Link href="/" className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
        {company.name}
      </Link>

      <nav className="flex flex-wrap items-center gap-5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
        <Link href="/" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          Trajets
        </Link>
        <Link href="/routes" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          Routes
        </Link>
        <Link href="/plans-de-bus" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          Plans de bus
        </Link>
        <Link href="/abonnement" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          Abonnement
        </Link>
        <Link href="/profil" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          Profil
        </Link>
        <Link href="/statistiques" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          Statistiques
        </Link>
      </nav>

      <div className="flex items-center gap-3">
        <Link
          href="/trajets/nouveau"
          className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          Nouveau trajet
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Se déconnecter
          </button>
        </form>
      </div>
    </header>
  );
}
