"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

// router.refresh() : ré-exécute les Server Components de la route
// courante (donc toutes les requêtes du Dashboard) sans navigation
// complète — pas de perte d'état de la sidebar, pas de rechargement du
// document.
export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {isPending ? "Rafraîchissement…" : "🔄 Rafraîchir"}
    </button>
  );
}
