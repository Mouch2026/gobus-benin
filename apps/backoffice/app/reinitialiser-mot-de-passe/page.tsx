import { requireUser } from "@/lib/supabase/dal";
import { ResetPasswordForm } from "./ResetPasswordForm";

// Pas dans PUBLIC_PATHS (proxy.ts) : cette page est protégée comme
// n'importe quelle autre — sans session valide (établie par /auth/confirm
// à partir du lien reçu par e-mail), le proxy redirige déjà vers
// /connexion avant que cette page ne s'exécute. requireUser() ici est la
// même défense en profondeur que sur toute autre page protégée de cette
// app (le proxy seul n'est qu'une vérification "optimiste" — voir son
// propre commentaire dans lib/supabase/dal.ts) : jamais spécifique à un
// scénario "session de recovery" séparé, une session tout court suffit.
export default async function ReinitialiserMotDePassePage() {
  await requireUser();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Nouveau mot de passe
          </h1>
        </div>
        <ResetPasswordForm />
      </div>
    </div>
  );
}
