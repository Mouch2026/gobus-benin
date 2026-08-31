import Link from "next/link";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export default function MotDePasseOubliePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Mot de passe oublié
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Renseignez l&apos;email de votre compte pour recevoir un lien de réinitialisation.
          </p>
        </div>
        <ForgotPasswordForm />
        <Link
          href="/connexion"
          className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
        >
          ← Retour à la connexion
        </Link>
      </div>
    </div>
  );
}
