import Link from "next/link";
import { logout } from "./actions";

// Shared across every authenticated page — replaces each page's own
// independent <header>. "Nouveau trajet" is kept as a distinct action
// button (not one of the top-level nav links) since it was the only path
// to /trajets/nouveau before this component existed; dropping it here
// would be a silent regression.
//
// 8 rubriques (chantier "redesign nav back-office") : Dashboard,
// Réservations, Clients, Paiements, Voyages (ex-Trajets, la liste vit
// maintenant sur /voyages — /trajets/[id] et /trajets/nouveau ne bougent
// pas), Remboursements, Rapports (ex-Statistiques), et un sous-menu
// Administration regroupant Profil/Abonnement/Plans de bus (regroupement
// de navigation pur, ces 3 routes ne changent pas d'URL).
//
// Administration est un <details>/<summary> plutôt qu'un menu piloté par
// JS : ce composant reste un Server Component, <details> gère
// l'ouverture/fermeture nativement sans "use client" ni état React.
export function Navigation({ company }: { company: { name: string } }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
      <Link href="/" className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
        {company.name}
      </Link>

      <nav className="flex flex-wrap items-center gap-5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
        <Link href="/" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          🏠 Dashboard
        </Link>
        <Link href="/reservations" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          📅 Réservations
        </Link>
        <Link href="/clients" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          👤 Clients
        </Link>
        <Link href="/paiements" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          💳 Paiements
        </Link>
        <Link href="/voyages" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          🚆 Voyages
        </Link>
        <Link href="/remboursements" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          💰 Remboursements
        </Link>
        <Link href="/rapports" className="hover:text-zinc-950 dark:hover:text-zinc-50">
          📈 Rapports
        </Link>
        <details className="group relative">
          <summary className="cursor-pointer list-none hover:text-zinc-950 dark:hover:text-zinc-50">
            ⚙️ Administration
          </summary>
          <div className="absolute right-0 top-full z-10 mt-2 flex w-44 flex-col gap-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
            <Link
              href="/profil"
              className="rounded-md px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Profil
            </Link>
            <Link
              href="/abonnement"
              className="rounded-md px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Abonnement
            </Link>
            <Link
              href="/plans-de-bus"
              className="rounded-md px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Plans de bus
            </Link>
          </div>
        </details>
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
