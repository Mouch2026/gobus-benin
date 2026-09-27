import Link from "next/link";
import type { ReactElement, SVGProps } from "react";

// Extrait de page.tsx (Dashboard) pour être réutilisé par
// mon-tableau-de-bord et /pilotage — aucun changement de comportement
// pour ces deux derniers, icon/accent restent optionnels (opt-in), pas
// de bordure/icône par défaut pour ne pas changer leur rendu existant.

export type StatCardAccent = "blue" | "amber" | "emerald" | "red";

// Mêmes teintes que BOOKING_STATUS_STYLES/NOTIFICATION_LEVEL_STYLES
// (_shared.tsx) : amber (jamais "orange", qui n'existe nulle part
// ailleurs dans ce projet) pour l'attention/l'attente, emerald pour
// l'argent/le confirmé, red pour l'urgent, blue pour le neutre/informatif
// — même vocabulaire de couleurs que le reste du back-office.
const ACCENT_BORDER_CLASSES: Record<StatCardAccent, string> = {
  blue: "border-t-blue-500",
  amber: "border-t-amber-500",
  emerald: "border-t-emerald-500",
  red: "border-t-red-500",
};
const ACCENT_ICON_CLASSES: Record<StatCardAccent, string> = {
  blue: "text-blue-500",
  amber: "text-amber-500",
  emerald: "text-emerald-500",
  red: "text-red-500",
};

type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

export function StatCard({
  label,
  value,
  href,
  icon: Icon,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
  icon?: IconComponent;
  accent?: StatCardAccent;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-zinc-500">{label}</span>
        {Icon ? (
          <Icon className={`h-5 w-5 shrink-0 ${accent ? ACCENT_ICON_CLASSES[accent] : "text-zinc-400"}`} aria-hidden />
        ) : null}
      </div>
      <span className="font-display text-2xl font-semibold text-zinc-950">
        {value}
      </span>
    </>
  );

  const className = `flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-6 transition-colors hover:border-zinc-300 ${
    accent ? `border-t-4 ${ACCENT_BORDER_CLASSES[accent]}` : ""
  }`;

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
