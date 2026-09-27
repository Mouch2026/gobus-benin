import Link from "next/link";

// Extrait de page.tsx (Dashboard) pour être réutilisé par
// mon-tableau-de-bord — aucun changement de comportement.
export function StatCard({ label, value, href }: { label: string; value: React.ReactNode; href?: string }) {
  const content = (
    <>
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-display text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        {value}
      </span>
    </>
  );

  const className =
    "flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700";

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
