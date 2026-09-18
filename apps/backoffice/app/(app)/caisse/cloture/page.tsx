import Link from "next/link";
import { requireCompany } from "@/lib/supabase/dal";
import { getOpenSession } from "@/lib/caisse";
import { AccessBlockedMessage } from "../../_components";
import { CloseSessionForm } from "./CloseSessionForm";

// Point de vigilance explicite (voir le plan) : cette page ne doit
// JAMAIS charger ni afficher le solde théorique — ni ici, ni via un
// composant partagé avec /caisse (qui l'affiche, lui, sans problème,
// puisque l'aveuglement ne s'applique qu'à CET écran de saisie précis).
export default async function ClotureCaissePage() {
  const result = await requireCompany();
  if (!result.ok) {
    return <AccessBlockedMessage reason={result.reason} />;
  }

  const session = await getOpenSession(result.user.sub);
  if (!session) {
    return (
      <div className="mx-auto max-w-md px-6 py-8">
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Aucune session de caisse ouverte.
        </p>
        <Link href="/caisse" className="mt-4 inline-block font-medium text-zinc-950 hover:underline dark:text-zinc-50">
          ← Retour à la caisse
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 px-6 py-8">
      <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Clôturer ma session de caisse</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Comptez vous-même le contenu du tiroir avant de saisir le montant — l&apos;écart avec le
        système n&apos;apparaîtra qu&apos;après validation.
      </p>
      <CloseSessionForm />
      <Link href="/caisse" className="font-medium text-zinc-950 hover:underline dark:text-zinc-50">
        ← Retour à la caisse
      </Link>
    </div>
  );
}
