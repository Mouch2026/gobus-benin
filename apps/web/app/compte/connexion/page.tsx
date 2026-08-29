import Link from "next/link";
import { LoginForm } from "./LoginForm";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConnexionPage(props: PageProps<"/compte/connexion">) {
  const searchParams = await props.searchParams;
  const redirectTo = firstValue(searchParams.next) ?? "/";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold text-foreground">Connexion</h1>
          <p className="text-sm text-muted">
            Connectez-vous pour réserver et cumuler des GoBus Points.
          </p>
        </div>

        <LoginForm redirectTo={redirectTo} />

        <p className="mt-6 text-center text-sm text-muted">
          Pas encore de compte ?{" "}
          <Link
            href={`/compte/inscription?next=${encodeURIComponent(redirectTo)}`}
            className="font-semibold text-primary hover:underline"
          >
            Créer un compte
          </Link>
        </p>
      </div>
    </div>
  );
}
