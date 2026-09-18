"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getApprovalRequestStatus } from "../actions";

// Bandeau d'attente (mode à distance, remise ET annulation) — interroge
// le statut toutes les ~4s ; dès que ce n'est plus 'pending', router.refresh()
// laisse le composant SERVEUR parent (page.tsx) se re-rendre avec l'état
// réel (réservation confirmée/annulée, ou bouton "Annuler" à nouveau
// disponible) — pas de page ni de logique de résolution ici, purement
// observationnel : la résolution elle-même a déjà eu lieu côté serveur au
// moment où le superviseur a validé/refusé (ou que le sweep a expiré la
// demande).
export function ApprovalWaitingBanner({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const resolvedRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (resolvedRef.current) return;
      const result = await getApprovalRequestStatus(bookingId);
      if (!result || result.status !== "pending") {
        resolvedRef.current = true;
        router.refresh();
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [bookingId, router]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950">
      <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
      <p className="text-amber-900 dark:text-amber-200">
        Validation en attente d&apos;un superviseur. Cette page se met à jour automatiquement.
      </p>
    </div>
  );
}
