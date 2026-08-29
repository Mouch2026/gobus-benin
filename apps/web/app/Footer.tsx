import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background px-4 py-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
        <span className="font-display text-sm font-bold text-foreground">GoBus Bénin</span>
        <nav className="flex items-center gap-5 text-sm text-muted">
          <Link href="/" className="hover:text-foreground">
            Accueil
          </Link>
          <Link href="/partenaires" className="hover:text-foreground">
            Compagnies partenaires
          </Link>
          <Link href="/aide" className="hover:text-foreground">
            Aide
          </Link>
        </nav>
      </div>
    </footer>
  );
}
