import type { CompanyAccessDenialReason } from "@/lib/supabase/dal";

const MESSAGES: Record<CompanyAccessDenialReason, { title: string; body: string }> = {
  "no-company": {
    title: "Aucune compagnie associée à ce compte",
    body: "Contactez GoBus pour rattacher votre compte à une compagnie.",
  },
  "no-subscription": {
    title: "Choisissez un abonnement pour activer votre compte",
    body: "Aucun abonnement n'est encore associé à votre compagnie.",
  },
  "subscription-pending": {
    title: "Abonnement en attente de paiement",
    body: "Complétez le paiement de votre abonnement pour accéder au back-office.",
  },
  "subscription-inactive": {
    title: "Abonnement inactif",
    body: "Contactez GoBus Bénin pour réactiver votre abonnement.",
  },
};

export function AccessBlockedMessage({ reason }: { reason: CompanyAccessDenialReason }) {
  const { title, body } = MESSAGES[reason];

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">{title}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{body}</p>
      </div>
    </div>
  );
}
