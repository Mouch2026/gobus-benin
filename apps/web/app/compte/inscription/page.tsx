import Link from "next/link";
import { SignupForm } from "./SignupForm";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeRedirectTarget(value: string): string {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return "/";
}

export default async function InscriptionPage(props: PageProps<"/compte/inscription">) {
  const searchParams = await props.searchParams;
  const redirectTo = safeRedirectTarget(firstValue(searchParams.next) ?? "/");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold text-foreground">Créer un compte</h1>
          <p className="text-sm text-muted">
            Un compte GoBus vous permet de réserver et de cumuler des GoBus Points à chaque
            billet payé.
          </p>
        </div>

        <SignupForm redirectTo={redirectTo} />

        <p className="mt-6 text-center text-sm text-muted">
          Déjà un compte ?{" "}
          <Link
            href={`/compte/connexion?next=${encodeURIComponent(redirectTo)}`}
            className="font-semibold text-primary hover:underline"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
