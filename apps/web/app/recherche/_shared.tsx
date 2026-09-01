import type { ReactNode } from "react";
import Link from "next/link";

export const SEAT_CLASS_LABELS: Record<string, string> = {
  standard: "Standard",
  vip: "VIP",
};

export function formatDepartureTime(departureAt: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(departureAt));
}

export function formatDepartureDateTime(departureAt: string): string {
  return new Intl.DateTimeFormat("fr-BJ", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Porto-Novo",
  }).format(new Date(departureAt));
}

export function PageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <main className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h1 className="font-display text-2xl font-extrabold text-foreground">{title}</h1>
          <Link
            href="/"
            className="whitespace-nowrap text-sm font-semibold text-muted transition-colors hover:text-foreground"
          >
            ← Nouvelle recherche
          </Link>
        </div>
        {children}
      </main>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-border bg-surface p-6 text-muted">{children}</p>
  );
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${String(mins).padStart(2, "0")}`;
}

// Sièges/prix/réduction volontairement absents ici — uniquement l'horaire.
export function DurationBadge({ departureAt, arrivalAt }: { departureAt: string; arrivalAt: string }) {
  const minutes = Math.round((new Date(arrivalAt).getTime() - new Date(departureAt).getTime()) / 60_000);
  return (
    <span className="self-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
      {formatDuration(minutes)}
    </span>
  );
}

export function RouteLine({
  origin,
  destination,
  departureLabel,
  arrivalLabel,
}: {
  origin: string;
  destination: string;
  departureLabel?: string;
  arrivalLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-start gap-0.5">
        <span className="font-display text-base font-bold text-foreground">{origin}</span>
        {departureLabel ? <span className="text-xs text-muted">{departureLabel}</span> : null}
      </div>

      <div className="flex flex-1 items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
        <span className="h-px flex-1 bg-[repeating-linear-gradient(to_right,var(--border)_0,var(--border)_4px,transparent_4px,transparent_8px)]" />
        <span className="h-2 w-2 shrink-0 rounded-full bg-foreground" />
      </div>

      <div className="flex flex-col items-end gap-0.5 text-right">
        <span className="font-display text-base font-bold text-foreground">{destination}</span>
        {arrivalLabel ? <span className="text-xs text-muted">{arrivalLabel}</span> : null}
      </div>
    </div>
  );
}
