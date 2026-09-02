import { requireUser } from "@/lib/supabase/dal";
import { ResetPasswordForm } from "./ResetPasswordForm";

// apps/web n'a pas de proxy.ts (site public, chaque page protégée
// s'auto-protège — voir lib/supabase/dal.ts) : requireUser() ici est donc
// la SEULE couche de protection, pas une défense en profondeur comme côté
// back-office. Sans session valide (établie par /auth/confirm à partir du
// lien reçu par e-mail), redirige déjà vers /compte/connexion — jamais
// spécifique à un scénario "session de recovery" séparé, une session tout
// court suffit.
export default async function ReinitialiserMotDePassePage() {
  await requireUser();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8">
        <div className="mb-6 flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold text-foreground">
            Nouveau mot de passe
          </h1>
        </div>

        <ResetPasswordForm />
      </div>
    </div>
  );
}
