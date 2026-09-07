import type { ReactNode } from "react";
import Link from "next/link";

const TABS = [
  { href: "/compte/reservations", label: "Mes réservations" },
  { href: "/compte/profil", label: "Profil" },
  { href: "/compte/paiements", label: "Paiements & remboursements" },
  { href: "/compte/notifications", label: "Notifications" },
];

// Distinct de recherche/_shared.tsx#PageShell (propre aux pages de
// recherche/résultats, avec son lien "← Nouvelle recherche" qui n'a pas
// de sens ici) — le chrome commun aux 4 sections de "Mon compte".
export function AccountShell({
  active,
  title,
  children,
}: {
  active: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-2xl">
        <h1 className="mb-4 font-display text-2xl font-extrabold text-foreground">{title}</h1>
        <nav className="mb-6 flex flex-wrap gap-x-5 gap-y-2 border-b border-border pb-3 text-sm font-semibold">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={tab.href === active ? "text-primary" : "text-muted hover:text-foreground"}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
