"use client";

import { logPrintRequest } from "./actions";

// print:hidden : ne doit jamais apparaître dans le résultat imprimé
// lui-même, seulement à l'écran avant impression.
export function PrintButton({ bookingId }: { bookingId: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        // Fire-and-forget : le journal d'audit ne doit jamais retarder
        // l'impression elle-même (chantier 5).
        void logPrintRequest(bookingId);
        window.print();
      }}
      className="print:hidden rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
    >
      🖨️ Imprimer
    </button>
  );
}
