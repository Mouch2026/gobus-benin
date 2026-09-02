import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default function MotDePasseOubliePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold text-foreground">
            Mot de passe oublié
          </h1>
          <p className="text-sm text-muted">
            Renseignez l&apos;email de votre compte pour recevoir un lien de réinitialisation.
          </p>
        </div>

        <ForgotPasswordForm />

        <Link
          href="/compte/connexion"
          className="mt-6 block text-center text-sm font-semibold text-primary hover:underline"
        >
          ← Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
