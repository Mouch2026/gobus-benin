import Link from "next/link";
import { getOptionalUser } from "@/lib/supabase/dal";
import { logout } from "./actions";

function displayName(user: { email?: string; [key: string]: unknown }): string {
  const metadata = user.user_metadata as { full_name?: string } | undefined;
  return metadata?.full_name || user.email || "Mon compte";
}

export async function Navbar() {
  const user = await getOptionalUser();

  return (
    <header className="border-b border-border bg-background px-4 py-4">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
          <Link href="/" className="font-display text-lg font-extrabold text-foreground">
            GoBus Bénin
          </Link>
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

        {user ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-medium text-foreground">{displayName(user)}</span>
            <form action={logout}>
              <button
                type="submit"
                className="text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/compte/connexion"
            className="rounded-xl bg-primary px-4 py-2 font-display text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            Connexion
          </Link>
        )}
      </div>
    </header>
  );
}
